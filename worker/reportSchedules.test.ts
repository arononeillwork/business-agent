// Scheduled reports: due ones go by themselves each minute, once, from the connected mailbox, one email each,
// written from what whoever last changed them can see, in their language. The database's rules are proven in
// supabase/tests/zz_y_report_schedules.test.sql.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { sayIn, sendDueReports } from './reportSchedules'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import { REPORTS, REPORT_PERIODS, reportRange } from '../shared/reports'
import { reportMail, reportSections, type Say } from '../shared/reportSections'
import { UNITS } from '../shared/stock'
import spanish from '../src/i18n/es/reports'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret', MS_CLIENT_ID: 'ms-id', MS_CLIENT_SECRET: 'ms-secret',
} as unknown as Env
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

let db: FakeSupabase
let apis: FakeProviders
beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

async function connectOutlook() {
  const headers = { authorization: 'Bearer admin-token', 'content-type': 'application/json' }
  const start = await integrations.request(`${APP}/api/integrations/connect/outlook/start`, { method: 'POST', headers, body: '{}' }, env, ctx())
  const auth = new URL((await start.json() as { url: string }).url)
  await integrations.request(`${APP}/api/integrations/microsoft/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`, {}, env, ctx())
}

// Monday 5 October 2026, 08:00:30 in Madrid.
const MONDAY_8 = Date.parse('2026-10-05T06:00:30Z')
const schedule = (x: Record<string, unknown> = {}) => ({
  id: 'rs-1', name: 'Monday stock and jobs', kinds: ['stock', 'jobs'], period: 'last_week', team: ['staff-1'], contacts: [], emails: ['lola@gestoria.es'],
  frequency: 'weekly', weekdays: [1], month_day: null, send_at: '08:00:00', language: 'en', active: true, last_sent_at: null, last_error: null,
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', updated_by: 'admin-1', ...x,
})
const row = () => db.table('report_schedules')[0]

describe('scheduled reports', () => {
  beforeEach(() => {
    db.tables.stock_items = [{ id: 'i1', name: 'Oat milk (barista)', unit: 'l', on_hand: 4, reorder_at: 10, supplier_id: 'sup-1', cost_per_unit: 1.2, active: true }]
    db.tables.suppliers = [{ id: 'sup-1', name: 'Lácteos del Sur' }]
    db.tables.todos = [{ id: 't1', title: 'Fix the terrace awning', assignee_id: 'staff-1', done: false, status: 'todo', done_at: null, starred: true, pinned: false, position: 1 }]
  })

  it('goes at its time, once, from the mailbox, one email each, written from the figures', async () => {
    await connectOutlook()
    db.tables.report_schedules = [schedule()]
    const before = apis.microsoft.sent.length
    // Not yet at 07:59 in Madrid.
    expect(await sendDueReports(env, 1, Date.parse('2026-10-05T05:59:00Z'))).toBe(0)
    expect(await sendDueReports(env, 1, MONDAY_8)).toBe(1)
    const sent = apis.microsoft.sent.slice(before)
    expect(sent.map(m => m.to)).toEqual(['julio@example.com', 'lola@gestoria.es'])
    expect(sent[0].subject).toBe('Easy Beans report · Last week (28 Sep – 4 Oct 2026)')
    expect(row()).toMatchObject({ last_sent_at: '2026-10-05T06:00:00.000Z', last_error: null })
    // The next minute: already sent for 08:00.
    expect(await sendDueReports(env, 1, MONDAY_8 + 60_000)).toBe(0)
    expect(apis.microsoft.sent.length).toBe(before + 2)
  })

  it('says why it didn’t go: no mailbox, or whoever last changed it is no longer an admin', async () => {
    db.tables.report_schedules = [schedule()]
    await sendDueReports(env, 1, MONDAY_8)
    expect(row().last_error).toMatch(/No mailbox connected/)
    // Not sent for that time again, even once a mailbox is there (it waits for next Monday).
    await connectOutlook()
    expect(await sendDueReports(env, 1, MONDAY_8 + 60_000)).toBe(0)

    db.tables.report_schedules = [schedule({ id: 'rs-2', updated_by: 'admin-gone' })]
    await sendDueReports(env, 1, MONDAY_8)
    expect(row().last_error).toMatch(/no longer an admin/)
  })

  it('leaves out what whoever last changed it can’t see: no takings for a shop manager', async () => {
    await connectOutlook()
    db.tables.report_schedules = [schedule({ kinds: ['takings'], updated_by: 'admin-2' })]
    await sendDueReports(env, 1, MONDAY_8)
    expect(row().last_error).toMatch(/None of its reports can be sent/)
  })
})

describe('the reports in Spanish (for schedules set up in Spanish)', () => {
  it('has the Spanish for every line, heading, period and unit the Worker writes', () => {
    const missing = new Set<string>()
    const es = sayIn('es')
    // Units written the same in every language (kg, l) aren't translated.
    const known = (text: string) => text in spanish || ['kg', 'g', 'l', 'ml'].includes(text) || !/\p{L}/u.test(text)
    const checking: Say = {
      t: (text, vars) => { if (!known(text)) missing.add(text); return es.t(text, vars) },
      tn: (n, one, many, vars) => { for (const w of [one, many]) if (!known(w)) missing.add(w); return es.tn(n, one, many, vars) },
    }
    const range = reportRange('last_week', '2026-10-05')
    const sections = reportSections(REPORTS.map(r => r.kind), {
      range, until: range.to,
      sales: { days: [{ date: '2026-09-28', gross: 500, tips: 0, refunds: 4, payments: 60 }, { date: '2026-09-21', gross: 400, tips: 0, refunds: 0, payments: 50 }] },
      costs: [{ date: '2026-09-28', open: true, fixed: 200, team: 100, total: 300, teamFrom: 'rota', hours: 8, people: [], unpriced: [] }],
      items: { items: [{ name: 'Flat white', quantity: 40, gross: 128 }] },
      entries: [{ profile_id: 'p1', paid_minutes: 480 } as never], rates: new Map([['p1', 10]]), multiplier: 1.3,
      stock: [{ id: 'i1', name: 'Oat milk', unit: 'l', on_hand: 4, reorder_at: 10, supplier_id: null, cost_per_unit: 1.2, active: true } as never],
      suppliers: [], moves: [{ item_id: 'i1', reason: 'waste', change: -2, at: '2026-09-29T10:00:00Z', undone_at: null } as never],
      fresh: [{ name: 'Banana bread', quantity: 10, made_at: '2026-09-29T07:00:00Z', cleared: 'sold' } as never, { name: 'Brownies', quantity: null, made_at: '2026-09-29T07:00:00Z', cleared: 'binned' } as never],
      todos: [{ id: 't', title: 'Fix it', done: false, status: 'todo', starred: false, pinned: false, position: 0, assignee_id: null } as never],
      name: () => 'Julio', canSeeFinances: true,
    }, checking, { money: n => `€${n}`, number: String, when: () => 'lun 29 sept', unit: u => checking.t(UNITS.find(x => x.id === u)!.label), date: iso => iso.slice(0, 10) })
    // And with nothing to say (no till, nothing low, no timecards, nothing sold).
    reportSections(['takings', 'best_sellers', 'team', 'stock'], { range, until: range.to, sales: null, items: { items: null }, entries: [], stock: [],
      name: () => '', canSeeFinances: false }, checking, { money: String, number: String, when: String, unit: String, date: iso => iso })
    reportSections(['best_sellers'], { range, until: range.to, items: { items: [] }, name: () => '', canSeeFinances: false }, checking,
      { money: String, number: String, when: String, unit: String, date: iso => iso })
    reportMail({ business: 'Easy Beans', period: checking.t(REPORT_PERIODS[3].label), dates: '', sender: 'Aron', sections, schedule: 'Lunes' }, checking)
    reportMail({ business: 'Easy Beans', period: '', dates: '', sender: 'Aron', sections }, checking)
    for (const p of REPORT_PERIODS) checking.t(p.label)
    for (const u of UNITS) checking.t(u.label)
    expect([...missing], 'Add these to src/i18n/es/reports.ts').toEqual([])
    expect(sections.map(s => s.title)).toEqual(['Ingresos y umbral de rentabilidad', 'Lo más vendido', 'Horas del equipo', 'Quedan pocos', 'Desperdicio', 'Recién hecho',
      'Tareas pendientes'])
  })
})
