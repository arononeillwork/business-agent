// Spain's national holidays on every business's calendar: the right days (Good Friday from Easter, a
// Sunday left to the regions), this year's and next, and never again for a year that has some.
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addNationalHolidays, easter, irelandPublicHolidays, spainNationalHolidays } from './holidays'
import { FakeSupabase } from './test/fakeSupabase'

let db: FakeSupabase
beforeEach(() => {
  db = new FakeSupabase()
  db.tables.calendar_events = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return db.handle(url, init) ?? new Response('not found', { status: 404 })
  }))
})
afterEach(() => vi.unstubAllGlobals())
const client = () => createClient(db.url, 'service-key', { auth: { persistSession: false } })

describe('national holidays', () => {
  it('finds Easter', () => {
    expect([2025, 2026, 2027, 2028].map(easter)).toEqual(['2025-04-20', '2026-04-05', '2027-03-28', '2028-04-16'])
  })

  it('2026: the eight Easy Beans’ calendar has (All Saints and Constitution Day fall on a Sunday); 2027 loses the Assumption the same way', () => {
    expect(spainNationalHolidays(2026).map(h => h.date)).toEqual([
      '2026-01-01', '2026-01-06', '2026-04-03', '2026-05-01', '2026-08-15', '2026-10-12', '2026-12-08', '2026-12-25'])
    expect(spainNationalHolidays(2027).map(h => h.date)).toEqual([
      '2027-01-01', '2027-01-06', '2027-03-26', '2027-05-01', '2027-10-12', '2027-11-01', '2027-12-06', '2027-12-08', '2027-12-25'])
  })

  it('Ireland: its ten public holidays, the Mondays worked out and St Brigid’s on 1 February when that’s a Friday', () => {
    expect(irelandPublicHolidays(2026).map(h => h.date)).toEqual([
      '2026-01-01', '2026-02-02', '2026-03-17', '2026-04-06', '2026-05-04', '2026-06-01', '2026-08-03', '2026-10-26', '2026-12-25', '2026-12-26'])
    expect(irelandPublicHolidays(2026).map(h => h.title)).toContain('St Brigid’s Day')
    expect(irelandPublicHolidays(2027)[1]).toEqual({ date: '2027-02-01', title: 'St Brigid’s Day' })
    expect(irelandPublicHolidays(2030)[1].date).toBe('2030-02-01')
  })

  it('an Irish business gets Ireland’s, not Spain’s', async () => {
    db.tables.business[0].country = 'IE'
    expect(await addNationalHolidays(client(), new Date('2026-11-07T02:00:00Z'))).toBe(20)
    expect(db.tables.calendar_events.every(e => String(e.external_id).startsWith('ie-'))).toBe(true)
    expect(db.tables.calendar_events.find(e => e.starts_on === '2026-03-17')).toMatchObject({ title: 'St Patrick’s Day', category: 'national' })
  })

  it('go onto a business’s calendar for this year and next, once, and a year with some is left alone', async () => {
    db.tables.calendar_events.push({ id: 'e1', starts_on: '2026-01-01', title: 'Año Nuevo', category: 'national', source: 'import', external_id: 'es-2026-01-01' })
    const added = await addNationalHolidays(client(), new Date('2026-11-07T02:00:00Z'))
    expect(added).toBe(9)
    const next = db.tables.calendar_events.filter(e => String(e.external_id).startsWith('es-2027-'))
    expect(next.map(e => e.starts_on)).toEqual(spainNationalHolidays(2027).map(h => h.date))
    expect(next[0]).toMatchObject({ title: 'Año Nuevo', category: 'national', source: 'import', confirmed: true })
    // 2026 already had one: nothing added for it.
    expect(db.tables.calendar_events.filter(e => String(e.external_id).startsWith('es-2026-'))).toHaveLength(1)
    expect(await addNationalHolidays(client(), new Date('2026-11-08T02:00:00Z'))).toBe(0)
  })
})
