// The Licences and Documents tools for AI assistants: reading licences with their status and document,
// adding one from a preset with its Drive link, marking one renewed, and searching kept documents.
// The SQL rules are proven in the licences migration's database tests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOLS, runTool, toolsFor } from './tools'
import { serviceClient, type Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { addDays, today } from '../shared/time'
import type { Profile } from '../shared/types'

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' } as unknown as Env
const admin = { id: 'u-admin', full_name: 'Aron', role: 'admin', active: true, can_see_pay: true } as Profile
const employee = { id: 'u-staff', full_name: 'Julio', role: 'employee', active: true, can_see_pay: false } as Profile
const partner = (access: Profile['partner_access']) => ({ id: 'u-partner', full_name: 'Laura', role: 'partner', active: true, partner_access: access }) as Profile

let db: FakeSupabase
const run = (name: string, args: unknown, me = admin) => runTool(TOOLS.find(t => t.name === name)!, { sb: serviceClient(env), me }, args)
const licence = (l: Row): Row => ({ category: 'permit', issuer: null, reference: null, holder: null, starts_on: null, expires_on: null, renew_every_months: null,
  auto_renews: false, cost: null, reminder_days: 30, document_id: null, link: null, notes: null, active: true, ...l })
const DRIVE = 'https://drive.google.com/file/d/1A7sMhYrPUynoWWhNOp0P3Jhft4pyFLvU/view'

beforeEach(() => {
  db = new FakeSupabase()
  db.tables.licences = [
    licence({ id: 'terraza', name: 'Licencia de terraza (ocupación de vía pública)', issuer: 'Ayuntamiento', expires_on: addDays(today(), 10), renew_every_months: 12, cost: '480.00' }),
    licence({ id: 'apertura', name: 'Licencia de apertura / actividad', issuer: 'Ayuntamiento', document_id: 'doc-apertura' }),
    licence({ id: 'old', name: 'Old insurance', category: 'insurance', active: false }),
  ]
  db.tables.tax_documents = [
    { id: 'doc-apertura', name: 'Licencia apertura.pdf', kind: 'other', year: 2026, quarter: null, folder: ['Documents', 'Licences'], link: 'https://drive.google.com/file/d/ap/view',
      notes: null, title: null, tags: ['ayuntamiento'], expires_on: null, uploaded_at: '2026-04-01T10:00:00Z' },
    { id: 'doc-seguro', name: 'Poliza RC 2026.pdf', kind: 'contract', year: 2026, quarter: null, folder: ['Documents', 'Insurance'], link: 'https://drive.google.com/file/d/rc/view',
      notes: 'Mapfre', title: 'Seguro RC', tags: ['seguro'], expires_on: '2027-04-01', uploaded_at: '2026-04-02T10:00:00Z' },
  ]
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('Licences and documents: the AI tools', () => {
  it('reads licences, soonest to renew first, with their document, the yearly cost and the usual ones missing', async () => {
    const out = await run('list_licences', {}) as { licences: Row[]; cost_eur_a_year: number; usual_ones_not_on_file: Row[] }
    expect(out.licences.map(l => [l.name, l.status])).toEqual([
      ['Licencia de terraza (ocupación de vía pública)', 'renew soon'],
      ['Licencia de apertura / actividad', 'doesn’t run out'],
    ])
    expect(out.licences[0]).toMatchObject({ days_left: 10, cost_eur: 480 })
    expect(out.licences[1].document).toEqual({ name: 'Licencia apertura.pdf', link: 'https://drive.google.com/file/d/ap/view' })
    expect(out.cost_eur_a_year).toBe(480)
    const missing = out.usual_ones_not_on_file.map(p => p.preset)
    expect(missing).toContain('sgae')
    expect(missing).not.toContain('terraza')
    expect(missing).not.toContain('apertura')
  })

  it('adds SGAE from its preset with the Drive link of its document', async () => {
    const out = await run('save_licence', { preset: 'sgae', reference: 'B27576347', link: DRIVE, expires_on: '2027-06-15', auto_renews: true }) as { added: Row }
    expect(out.added).toMatchObject({ name: 'SGAE (música ambiente)', category: 'music', issuer: 'SGAE', renews_every_months: 12, reference: 'B27576347',
      link: DRIVE, auto_renews: true, status: 'up to date' })
    expect(db.table('licences')).toHaveLength(4)
    await expect(run('save_licence', { preset: 'sgae' })).rejects.toThrow(/already on file/)
  })

  it('changes one found by name, and moves its last day on a period when renewed', async () => {
    const before = String(db.table('licences').find(l => l.id === 'terraza')!.expires_on)
    const out = await run('save_licence', { licence: 'terraza', renewed: true, reference: 'EXP-2026/88' }) as { updated: Row }
    expect(out.updated).toMatchObject({ reference: 'EXP-2026/88', status: 'up to date' })
    expect(Number(String(out.updated.expires_on).slice(0, 4))).toBe(Number(before.slice(0, 4)) + 1)
    await expect(run('save_licence', { licence: 'licencia' })).rejects.toThrow(/matches several/)
    await expect(run('save_licence', { licence: 'apertura', renewed: true })).rejects.toThrow(/how often it renews/)
    await expect(run('save_licence', { licence: 'nope' })).rejects.toThrow(/No licence matches/)
  })

  it('finds kept documents by words, with what they belong to', async () => {
    const out = await run('find_documents', { q: 'seguro' }) as { found: number; documents: Row[] }
    expect(out.found).toBe(1)
    expect(out.documents[0]).toMatchObject({ name: 'Poliza RC 2026.pdf', folder: 'Documents/Insurance', expires_on: '2027-04-01', belongs_to: 'none' })
    const lic = await run('find_documents', { q: 'apertura' }) as { documents: Row[] }
    expect(lic.documents[0]).toMatchObject({ belongs_to: 'licence', licences: ['Licencia de apertura / actividad'] })
  })

  it('is for admins; a gestoría with finances access reads; employees don’t get it', async () => {
    const names = (me: Profile) => toolsFor(me).map(t => t.name).filter(n => ['list_licences', 'save_licence', 'find_documents'].includes(n))
    expect(names(admin)).toEqual(['list_licences', 'save_licence', 'find_documents'])
    expect(names(employee)).toEqual([])
    expect(names(partner(['finances']))).toEqual(['list_licences', 'find_documents'])
    await expect(run('list_licences', {}, employee)).rejects.toThrow('Only admins can do that')
  })
})
