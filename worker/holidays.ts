// Each business's public holidays on its calendar (Spain's or Ireland's, by business.country), so the
// rota, holiday pay and the holiday reminders know them from the first day. Easy Beans' were seeded by
// hand once; a business made since started with none. Each night, a business gets this year's and next
// year's, unless it already has some of that year's (so one an owner deleted isn't put back).
//
// Spain: the days that are holidays everywhere in Spain. One that falls on a Sunday is left out: each
// region decides whether to move it to the Monday, as it does its own holidays. A business with a region
// (business.region) also gets that region's, from the Ministry of Labour's list in the BOE
// (worker/regionalHolidays.ts), and of the national days only those its region keeps. Its town's two
// local days the owner adds on the Calendar (Easy Beans' seed has Marbella's).
// Ireland: the ten public holidays (Organisation of Working Time Act 1997, as amended for St Brigid's
// Day), on their own dates; one on a weekend still gives staff a day's pay or a day off, but no other day
// becomes the holiday.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSpanishRegion, spanishRegion } from '../shared/regions.ts'
import { regionFiestas, SPAIN_FIESTAS, type FiestasYear } from './regionalHolidays.ts'

export interface Holiday { date: string; title: string }

/** Easter Sunday (Gregorian), as YYYY-MM-DD. */
export function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const sunday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() === 0

/** The national holidays of a year, in date order, named as the BOE names them. */
export function spainNationalHolidays(year: number): Holiday[] {
  const days: Holiday[] = [
    { date: `${year}-01-01`, title: 'Año Nuevo' },
    { date: `${year}-01-06`, title: 'Epifanía del Señor' },
    { date: shift(easter(year), -2), title: 'Viernes Santo' },
    { date: `${year}-05-01`, title: 'Fiesta del Trabajo' },
    { date: `${year}-08-15`, title: 'Asunción de la Virgen' },
    { date: `${year}-10-12`, title: 'Fiesta Nacional de España' },
    { date: `${year}-11-01`, title: 'Todos los Santos' },
    { date: `${year}-12-06`, title: 'Día de la Constitución Española' },
    { date: `${year}-12-08`, title: 'Inmaculada Concepción' },
    { date: `${year}-12-25`, title: 'Natividad del Señor' },
  ]
  return days.filter(d => !sunday(d.date)).sort((x, y) => x.date.localeCompare(y.date))
}

const mondays = (year: number, month: number) => {
  const out: string[] = []
  for (let d = 1; d <= 31; d++) {
    const date = new Date(Date.UTC(year, month - 1, d))
    if (date.getUTCMonth() !== month - 1) break
    if (date.getUTCDay() === 1) out.push(date.toISOString().slice(0, 10))
  }
  return out
}

/** Ireland's ten public holidays of a year, in date order. */
export function irelandPublicHolidays(year: number): Holiday[] {
  // St Brigid's Day: the first Monday in February, or 1 February when that's a Friday.
  const feb1 = `${year}-02-01`
  const brigid = new Date(`${feb1}T12:00:00Z`).getUTCDay() === 5 ? feb1 : mondays(year, 2)[0]
  const days: Holiday[] = [
    { date: `${year}-01-01`, title: 'New Year’s Day' },
    { date: brigid, title: 'St Brigid’s Day' },
    { date: `${year}-03-17`, title: 'St Patrick’s Day' },
    { date: shift(easter(year), 1), title: 'Easter Monday' },
    { date: mondays(year, 5)[0], title: 'May bank holiday' },
    { date: mondays(year, 6)[0], title: 'June bank holiday' },
    { date: mondays(year, 8)[0], title: 'August bank holiday' },
    { date: mondays(year, 10).at(-1)!, title: 'October bank holiday' },
    { date: `${year}-12-25`, title: 'Christmas Day' },
    { date: `${year}-12-26`, title: 'St Stephen’s Day' },
  ]
  return days.sort((x, y) => x.date.localeCompare(y.date))
}

/** A country's national holidays of a year, and the prefix their calendar rows carry. */
export const nationalHolidays = (country: string | null | undefined, year: number) =>
  country === 'IE' ? { prefix: 'ie', days: irelandPublicHolidays(year) } : { prefix: 'es', days: spainNationalHolidays(year) }

/**
 * A business's holidays of a year, by its country and, in Spain, its region: the national days it keeps,
 * its region's other days under their own prefix (es-an for Andalucía), and the national days its region
 * replaced with one of its own, which it doesn't get. No region, or a year whose list isn't in yet: the
 * national ones, as for every business.
 */
export function businessHolidays(country: string | null | undefined, region: string | null | undefined, year: number,
  fiestas: Record<number, FiestasYear> = SPAIN_FIESTAS) {
  const national = nationalHolidays(country, year)
  const where = businessRegion(country, region)
  const own = where ? regionFiestas(where.code, year, fiestas) : null
  if (!where || !own) return { national, regional: null, replaced: [] as Holiday[] }
  const kept = new Set(own.map(h => h.date)), everywhere = new Set(national.days.map(h => h.date))
  return {
    national: { prefix: national.prefix, days: national.days.filter(h => kept.has(h.date)) },
    regional: { prefix: where.prefix, town: where.local, days: own.filter(h => !everywhere.has(h.date)) },
    replaced: national.days.filter(h => !kept.has(h.date)),
  }
}

/** A Spanish business's region, and the prefix its holidays' calendar rows carry (es-an); none in Ireland. */
function businessRegion(country: string | null | undefined, region: string | null | undefined) {
  const where = country !== 'IE' && isSpanishRegion(region) ? spanishRegion(region) : null
  return where && { ...where, prefix: `es-${where.code.toLowerCase()}` }
}

/**
 * This year's and next year's holidays onto the business's calendar, where it has none of that year's yet:
 * the national ones and, in Spain, its region's. From today on, what its region doesn't keep goes: a
 * national day it replaced, and another region's days (its region was changed or cleared). What's past
 * stays as it was, since the timecards were paid on it, and a region's day isn't added a second time
 * on a date one of those already has.
 */
export async function addNationalHolidays(db: SupabaseClient, now = new Date(), fiestas: Record<number, FiestasYear> = SPAIN_FIESTAS): Promise<number> {
  const { data: biz } = await db.from('business').select('country, region').maybeSingle()
  const { country, region } = (biz ?? {}) as { country?: string; region?: string | null }
  const today = now.toISOString().slice(0, 10)
  const years = [now.getUTCFullYear(), now.getUTCFullYear() + 1].map(year => ({ year, ...businessHolidays(country, region, year, fiestas) }))
  const prefix = years[0].national.prefix
  // The holidays it was given already, these two years.
  const { data, error } = await db.from('calendar_events').select('id, external_id, starts_on').eq('source', 'import')
    .gte('starts_on', `${years[0].year}-01-01`).like('external_id', `${prefix}-%`)
  if (error) throw new Error(error.message)
  const given = (data ?? []) as { id: string | number; external_id: string; starts_on: string }[]
  const own = businessRegion(country, region)?.prefix
  const replaced = new Set(years.flatMap(y => y.replaced.map(h => `${prefix}-${h.date}`)))
  const stale = given.filter(e => {
    if (e.starts_on < today || country === 'IE') return false
    const regional = /^es-[a-z]{2}(?=-\d{4}-)/.exec(e.external_id)?.[0]
    return regional ? regional !== own : replaced.has(e.external_id)
  })
  const kept = given.filter(e => !stale.includes(e))
  const taken = new Set(kept.map(e => e.starts_on))
  const has = (p: string, year: number) => given.some(e => e.external_id.startsWith(`${p}-${year}-`))
  const row = (p: string, category: 'national' | 'regional', town: string | null) => (h: Holiday) => ({
    starts_on: h.date, title: h.title, category, town, source: 'import', external_id: `${p}-${h.date}`, confirmed: true,
  })
  const rows = years.flatMap(({ year, national, regional }) => [
    ...(has(national.prefix, year) ? [] : national.days.map(row(national.prefix, 'national', null))),
    ...(!regional || has(regional.prefix, year) ? [] : regional.days.filter(h => !taken.has(h.date)).map(row(regional.prefix, 'regional', regional.town))),
  ])
  if (rows.length) {
    const { error: insertError } = await db.from('calendar_events').insert(rows)
    if (insertError) throw new Error(insertError.message)
  }
  if (stale.length) {
    const { error: deleteError } = await db.from('calendar_events').delete().in('id', stale.map(e => e.id))
    if (deleteError) throw new Error(deleteError.message)
  }
  return rows.length
}
