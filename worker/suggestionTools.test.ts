// The Customer suggestions tools for AI assistants: reading the sections with their counters, adding an idea
// into the section that already says the same thing (or a new one), and sorting ideas. The database's rule
// is proven in supabase/tests/zz_y_customer_suggestions.test.sql.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOLS, runTool, toolsFor } from './tools'
import { serviceClient, type Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import type { Profile } from '../shared/types'

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' } as unknown as Env
const owner = { id: 'u-owner', full_name: 'Aron', role: 'admin', active: true, can_see_pay: true } as Profile
const employee = { id: 'u-staff', full_name: 'Julio', role: 'employee', active: true, can_see_pay: false } as Profile
const partner = { id: 'u-partner', full_name: 'Laura', role: 'partner', active: true, partner_access: ['finances', 'payroll'] } as Profile

let db: FakeSupabase
const run = (name: string, args: unknown, me = owner) => runTool(TOOLS.find(t => t.name === name)!, { sb: serviceClient(env), me }, args)

interface Listed {
  total: number
  sections: { section_id: string; section: string; count: number; ideas: { id: string; text: string }[] }[]
  not_sorted_yet: { id: string; text: string }[]
  note?: string
}

beforeEach(() => {
  db = new FakeSupabase()
  db.tables.suggestion_groups = [
    { id: 'g-oat', name: 'Oat milk at no extra cost', created_at: '2026-11-01T10:00:00Z' },
    { id: 'g-early', name: 'Open earlier on weekdays', created_at: '2026-11-02T10:00:00Z' },
  ]
  const idea = (id: string, text: string, heard_on: string, group_id: string | null) =>
    ({ id, text, customer: null, source: null, heard_on, group_id, created_at: `${heard_on}T10:00:00Z` })
  db.tables.customer_suggestions = [
    idea('s1', 'Oat milk shouldn’t cost extra', '2026-11-01', 'g-oat'),
    idea('s2', 'Why is oat milk 50 cents more?', '2026-11-05', 'g-oat'),
    idea('s3', 'Open at 7:30 please', '2026-11-03', 'g-early'),
    idea('s4', 'Water bowl for dogs', '2026-11-06', null),
  ]
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('customer suggestion tools', () => {
  it('are the team’s: an employee has them, a partner none', () => {
    const names = (me: Profile) => toolsFor(me).map(t => t.name).filter(n => n.includes('customer_suggestion'))
    expect(names(employee)).toEqual(['list_customer_suggestions', 'add_customer_suggestion', 'sort_customer_suggestions'])
    expect(names(partner)).toEqual([])
  })

  it('lists the sections, the most asked for first, with their counters, then the ideas not sorted yet', async () => {
    const out = await run('list_customer_suggestions', {}) as Listed
    expect(out.total).toBe(4)
    expect(out.sections.map(s => [s.section, s.count])).toEqual([['Oat milk at no extra cost', 2], ['Open earlier on weekdays', 1]])
    expect(out.sections[0].ideas.map(i => i.id)).toEqual(['s2', 's1'])
    expect(out.not_sorted_yet.map(i => i.text)).toEqual(['Water bowl for dogs'])

    const oat = await run('list_customer_suggestions', { search: 'OAT' }) as Listed
    expect(oat.sections.map(s => s.section)).toEqual(['Oat milk at no extra cost'])
    expect(oat.not_sorted_yet).toEqual([])
    const none = await run('list_customer_suggestions', { search: 'parking' }) as Listed
    expect(none.note).toMatch(/Nothing mentions "parking"\. Sections: Oat milk at no extra cost, Open earlier on weekdays/)
  })

  it('adds an idea to the section that says the same thing, and its counter goes up', async () => {
    const out = await run('add_customer_suggestion', { text: '  Free oat milk  please ', section: 'oat milk at no extra cost', customer: 'Lucía', source: 'At the counter', heard_on: '2026-11-17' }, employee)
    expect(out).toMatchObject({ added: { text: 'Free oat milk please', customer: 'Lucía', source: 'At the counter', heard_on: '2026-11-17' }, section: 'Oat milk at no extra cost', section_count: 3 })
    expect(db.table('customer_suggestions').find(r => r.text === 'Free oat milk please')).toMatchObject({ group_id: 'g-oat' })
  })

  it('an idea added without a day is heard today, the business’s day (past midnight in Madrid, still yesterday in UTC)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-21T23:30:00Z'))
    try {
      const out = await run('add_customer_suggestion', { text: 'Decaf oat flat white', source: 'word of mouth' }, employee) as { added: { heard_on: string; source: string } }
      expect(out.added).toMatchObject({ heard_on: '2026-11-22', source: 'Word of mouth' })
      // A business in Dublin is an hour behind: still the 21st there.
      db.tables.business = [{ id: 1, name: 'The Daily Grind', timezone: 'Europe/Dublin' }]
      const dublin = await run('add_customer_suggestion', { text: 'Scones on Sundays' }, employee) as { added: { heard_on: string; source: string | null } }
      expect(dublin.added).toMatchObject({ heard_on: '2026-11-21', source: null })
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts a section for a new idea, or leaves it not sorted yet', async () => {
    const started = await run('add_customer_suggestion', { text: 'Sunday brunch with eggs', section: 'Sunday brunch' }) as { section: string; started_section: boolean; section_count: number }
    expect(started).toMatchObject({ section: 'Sunday brunch', started_section: true, section_count: 1 })
    expect(db.table('suggestion_groups').map(g => g.name)).toContain('Sunday brunch')

    const loose = await run('add_customer_suggestion', { text: 'Card payments under €5' }) as { section: null; note: string }
    expect(loose.section).toBeNull()
    expect(loose.note).toMatch(/not sorted yet/)
    expect(db.table('customer_suggestions').find(r => r.text === 'Card payments under €5')?.group_id).toBeNull()
    await expect(run('add_customer_suggestion', { text: '   ' })).rejects.toThrow('Write the idea')
  })

  it('sorts ideas into a section (renaming it), merges two, and puts one back', async () => {
    const out = await run('sort_customer_suggestions', { ids: ['s4', 's3'], section: 'Open earlier', rename: 'Open earlier, and dogs welcome' })
    expect(out).toMatchObject({ moved: 2, section: 'Open earlier, and dogs welcome', section_count: 2 })
    // Merge: every idea of one into the other.
    await run('sort_customer_suggestions', { ids: ['s3', 's4'], section: 'g-oat' })
    const listed = await run('list_customer_suggestions', {}) as Listed
    expect(listed.sections.map(s => [s.section, s.count])).toEqual([['Oat milk at no extra cost', 4], ['Open earlier, and dogs welcome', 0]])
    await run('sort_customer_suggestions', { ids: ['s4'], section: null })
    expect(db.table('customer_suggestions').find(r => r.id === 's4')?.group_id).toBeNull()
    await expect(run('sort_customer_suggestions', { ids: ['nope'], section: null })).rejects.toThrow(/No idea nope/)
    await expect(run('sort_customer_suggestions', { ids: ['s1'], section: null, rename: 'X' })).rejects.toThrow(/Name the section/)
  })
})
