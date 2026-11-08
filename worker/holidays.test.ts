// Spain's national holidays on every business's calendar: the right days (Good Friday from Easter, a
// Sunday left to the regions), this year's and next, and never again for a year that has some. And a
// Spanish business's region's, with a national day the region replaced left off.
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addNationalHolidays, businessHolidays, easter, irelandPublicHolidays, spainNationalHolidays } from './holidays'
import { SPAIN_FIESTAS, type FiestasYear } from './regionalHolidays'
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

describe('a Spanish business’s region', () => {
  const NIGHT = new Date('2026-11-07T02:00:00Z')
  const rows = (prefix: string) => db.tables.calendar_events.filter(e => String(e.external_id).startsWith(prefix))
  const dates = (prefix: string) => rows(prefix).map(e => String(e.starts_on)).sort()
  // A year in which Melilla replaces Epifanía with a day of its own, as the law lets a community (none did in 2026 or 2027).
  const replacing: Record<number, FiestasYear> = {
    ...SPAIN_FIESTAS,
    2027: { boe: 'test', rows: [
      ...SPAIN_FIESTAS[2027].rows.map(r => (r[1] === 'Epifanía del Señor' ? [r[0], r[1], r[2], 'AN AR AS IB CN CB CM CL CT EX GA MD MC NC PV RI VC CE'] as const : r)),
      ['07-26', 'Día de prueba', '***', 'ML'],
    ] },
  }

  it('Andalucía: the national days it keeps, and its own (Jueves Santo, the two Mondays) once each: the BOE’s whole list', () => {
    const { national, regional, replaced } = businessHolidays('ES', 'AN', 2026)
    expect(national.days).toEqual(spainNationalHolidays(2026))
    expect(regional).toMatchObject({ prefix: 'es-an', town: 'Andalucía' })
    expect(regional!.days).toEqual([
      { date: '2026-02-28', title: 'Día de Andalucía' }, { date: '2026-04-02', title: 'Jueves Santo' },
      { date: '2026-11-02', title: 'Día siguiente a Todos los Santos' }, { date: '2026-12-07', title: 'Lunes siguiente al Día de la Constitución Española' }])
    expect(replaced).toEqual([])
    expect(new Set([...national.days, ...regional!.days].map(h => h.date)).size).toBe(12)
  })

  it('Cataluña keeps no Jueves Santo; Extremadura 2027 has 11 October instead of the Monday after the Assumption', () => {
    expect(businessHolidays('ES', 'CT', 2026).regional!.days.map(h => h.date)).toEqual(['2026-04-06', '2026-06-24', '2026-09-11', '2026-12-26'])
    expect(businessHolidays('ES', 'EX', 2027).regional!.days).toEqual([
      { date: '2027-03-25', title: 'Jueves Santo' }, { date: '2027-09-08', title: 'Día de Extremadura' }, { date: '2027-10-11', title: 'Sustitución 15 de agosto' }])
  })

  it('a national day its region replaced isn’t one of its days', () => {
    const { national, regional, replaced } = businessHolidays('ES', 'ML', 2027, replacing)
    expect(national.days.map(h => h.date)).not.toContain('2027-01-06')
    expect(replaced).toEqual([{ date: '2027-01-06', title: 'Epifanía del Señor' }])
    expect(regional!.days.map(h => h.date)).toContain('2027-07-26')
    // Everywhere else it's kept.
    expect(businessHolidays('ES', 'AN', 2027, replacing).replaced).toEqual([])
  })

  it('no region, a year not in yet, or Ireland: the national ones only', () => {
    expect(businessHolidays('ES', null, 2026)).toEqual({ national: { prefix: 'es', days: spainNationalHolidays(2026) }, regional: null, replaced: [] })
    expect(businessHolidays('ES', 'AN', 2028)).toEqual({ national: { prefix: 'es', days: spainNationalHolidays(2028) }, regional: null, replaced: [] })
    expect(businessHolidays('ES', 'XX', 2026).regional).toBeNull()
    expect(businessHolidays('IE', 'AN', 2026)).toMatchObject({ national: { prefix: 'ie' }, regional: null })
  })

  it('a new business in Andalucía gets both years’, national and regional, once', async () => {
    db.tables.business[0].region = 'AN'
    expect(await addNationalHolidays(client(), NIGHT)).toBe(8 + 4 + 9 + 3)
    expect(dates('es-an-2027-')).toEqual(['2027-03-01', '2027-03-25', '2027-08-16'])
    expect(rows('es-an-2026-02-28')[0]).toMatchObject({ title: 'Día de Andalucía', category: 'regional', town: 'Andalucía', source: 'import', confirmed: true })
    expect(rows('es-2026-')).toHaveLength(8)
    expect(await addNationalHolidays(client(), new Date('2026-11-08T02:00:00Z'))).toBe(0)
    expect(db.tables.calendar_events).toHaveLength(24)
  })

  it('Easy Beans: its region’s 2026, already there, left alone; 2027’s added', async () => {
    db.tables.business[0].region = 'AN'
    db.tables.calendar_events.push(
      ...spainNationalHolidays(2026).map((h, i) => ({ id: `n${i}`, starts_on: h.date, title: h.title, category: 'national', source: 'import', external_id: `es-${h.date}` })),
      { id: 'a1', starts_on: '2026-02-28', title: 'Día de Andalucía', category: 'regional', town: 'Andalucía', source: 'import', external_id: 'es-an-2026-02-28' })
    expect(await addNationalHolidays(client(), NIGHT)).toBe(9 + 3)
    expect(rows('es-an-2026-')).toHaveLength(1)
  })

  it('a national day the region replaced isn’t added, and goes where it was added before; a past one stays', async () => {
    db.tables.business[0].region = 'ML'
    db.tables.calendar_events.push(
      { id: 'past', starts_on: '2026-01-06', title: 'Epifanía del Señor', category: 'national', source: 'import', external_id: 'es-2026-01-06' },
      { id: 'next', starts_on: '2027-01-06', title: 'Epifanía del Señor', category: 'national', source: 'import', external_id: 'es-2027-01-06' })
    await addNationalHolidays(client(), NIGHT, replacing)
    expect(db.tables.calendar_events.find(e => e.id === 'next')).toBeUndefined()
    expect(db.tables.calendar_events.find(e => e.id === 'past')).toBeDefined()
    expect(dates('es-ml-2027-')).toContain('2027-07-26')
    // A business made that year: its national days without the one replaced.
    db.tables.calendar_events = []
    await addNationalHolidays(client(), NIGHT, replacing)
    expect(dates('es-2027-')).toEqual(spainNationalHolidays(2027).map(h => h.date).filter(d => d !== '2027-01-06'))
  })

  it('a region changed or cleared: the other region’s days go from today on, the past ones stay', async () => {
    db.tables.business[0].region = 'AN'
    await addNationalHolidays(client(), NIGHT)
    db.tables.business[0].region = 'MD'
    await addNationalHolidays(client(), new Date('2026-11-08T02:00:00Z'))
    expect(dates('es-an-')).toEqual(['2026-02-28', '2026-04-02', '2026-11-02'])
    expect(dates('es-md-2027-')).toEqual(['2027-03-19', '2027-03-25', '2027-08-16'])
    // Madrid's 2026, past days and all as a year's national ones are, but not twice: Jueves Santo and
    // 2 November were Andalucía's too, and stay so.
    expect(dates('es-md-2026-')).toEqual(['2026-05-02', '2026-12-07'])
    expect(db.tables.calendar_events.filter(e => e.starts_on === '2026-11-02')).toHaveLength(1)
    db.tables.business[0].region = null
    await addNationalHolidays(client(), new Date('2026-11-09T02:00:00Z'))
    expect(dates('es-md-')).toEqual(['2026-05-02'])
    expect(rows('es-2027-')).toHaveLength(9)
  })
})
