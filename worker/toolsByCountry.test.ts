// The AI tools for a business in Ireland: its dates and times are Dublin's, whatever the Worker did just before
// (a shift "09:00" is 09:00 in Dublin, not in Madrid), the rota's warnings are its own rules (a break after 4½
// hours), and a phone typed the Irish way is an Irish number. A business in Spain keeps Madrid's, its rules
// and its numbers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOLS, countryOf, runTool } from './tools'
import { CONTACT_TOOLS } from './contactTools'
import { serviceClient, type Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { localTime, zonedIso } from '../shared/time'
import type { Profile } from '../shared/types'

const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
} as unknown as Env
const admin = { id: 'admin-1', full_name: 'Aron', role: 'admin', active: true, can_see_pay: true } as Profile
// Tuesday 3 November 2026: Dublin is on UTC, Madrid an hour ahead.
const NOW = Date.parse('2026-11-03T10:15:00Z')

let db: FakeSupabase
const tool = (name: string) => [...TOOLS, ...CONTACT_TOOLS].find(t => t.name === name)!
const run = (name: string, args: unknown, timeZone?: string) => runTool(tool(name), { sb: serviceClient(env), me: admin, timeZone }, args)
const inIreland = () => {
  Object.assign(db.tables.business[0], { name: 'The Coffee Dock', country: 'IE', timezone: 'Europe/Dublin' })
  // Ireland's working-time rules, as a new business there starts with them (the country migration).
  Object.assign(db.tables.settings[0], { break_after_hours: 4.5, min_break_minutes: 15, max_daily_hours: 13, max_weekly_hours: 48, min_rest_hours: 11 })
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  db = new FakeSupabase()
  // Spain's, as the database has them for a business there.
  Object.assign(db.tables.settings[0], { break_after_hours: 6, min_break_minutes: 15, max_daily_hours: 9, max_weekly_hours: 40, min_rest_hours: 12 })
  const open = { open: '08:00', close: '20:00' }
  db.tables.business[0].opening_hours = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: open }
  db.tables.shifts = []
  db.tables.positions = []
  db.tables.calendar_events = []
  db.tables.business_contacts = []
  db.tables.contractors = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('the AI tools, by the business’s country', () => {
  it('put a shift at the business’s own time: Dublin’s in Ireland, Madrid’s in Spain', async () => {
    const shift = { person: 'Julio', date: '2026-11-04', start: '09:00', end: '14:00' }
    let out = await run('create_shift', shift) as { shift: { start: string; end: string } }
    expect(db.table('shifts')[0]).toMatchObject({ starts_at: '2026-11-04T08:00:00.000Z', ends_at: '2026-11-04T13:00:00.000Z' })
    expect(out.shift).toMatchObject({ start: '09:00', end: '14:00' })
    inIreland()
    out = await run('create_shift', shift) as { shift: { start: string; end: string } }
    expect(db.table('shifts')[1]).toMatchObject({ starts_at: '2026-11-04T09:00:00.000Z', ends_at: '2026-11-04T14:00:00.000Z' })
    expect(out.shift).toMatchObject({ start: '09:00', end: '14:00' })
    // And outside a tool, the Worker's own time is as it was.
    expect(localTime('2026-11-04T09:00:00.000Z')).toBe('10:00')
  })

  it('keep each business’s time zone while others run alongside', async () => {
    const at = (tz: string) => run('whoami', {}, tz).then(() => zonedIso('2026-11-04', '09:00'))
    // Outside the runs, the Worker's own; each run in its own, side by side.
    const seen: string[] = []
    const probe = { ...tool('whoami'), run: async () => { await Promise.resolve(); seen.push(zonedIso('2026-11-04', '09:00')); return null } }
    await Promise.all([
      runTool(probe, { sb: serviceClient(env), me: admin, timeZone: 'Europe/Dublin' }, {}),
      runTool(probe, { sb: serviceClient(env), me: admin, timeZone: 'Europe/Madrid' }, {}),
    ])
    expect(seen.sort()).toEqual(['2026-11-04T08:00:00.000Z', '2026-11-04T09:00:00.000Z'])
    expect(await at('Europe/Dublin')).toBe('2026-11-04T08:00:00.000Z')
  })

  it('warn about the rota by the business’s own rules: a break after 4½ hours in Ireland, 6 in Spain', async () => {
    const shift = { person: 'Julio', date: '2026-11-04', start: '09:00', end: '14:00' }
    const warnings = async () => ((await run('create_shift', shift)) as { shift: { warnings: string[] } }).shift.warnings
    expect(await warnings()).toEqual([])
    db.tables.shifts = []
    inIreland()
    expect((await warnings()).join(' ')).toMatch(/break/i)
  })

  it('take a phone typed without its country code as the business’s country’s, and say its example', async () => {
    expect(await countryOf(serviceClient(env))).toBe('ES')
    await run('save_contact', { name: 'Miguel', phone: '632 042 132' })
    expect(db.table('business_contacts')[0]).toMatchObject({ phone: '+34 632 042 132' })
    await expect(run('save_contractor', { name: 'Ciara', phone: '087 123 4567' })).rejects.toThrow('like +34 600 000 000')
    inIreland()
    expect(await countryOf(serviceClient(env))).toBe('IE')
    await run('save_contact', { name: 'Seán', phone: '087 123 4567' })
    expect(db.table('business_contacts')[1]).toMatchObject({ phone: '+353 87 123 4567' })
    await run('save_contractor', { name: 'Ciara', phone: '087 123 4567' })
    expect(db.table('contractors')[0]).toMatchObject({ phone: '+353 87 123 4567' })
    await expect(run('save_contact', { name: 'Róisín', phone: '12345678' })).rejects.toThrow('like +353 87 123 4567')
  })
})
