// Each business's national public holidays on its calendar (Spain's or Ireland's, by business.country),
// so the rota, holiday pay and the holiday reminders know them from the first day. Easy Beans' were
// seeded by hand once; a business made since started with none. Each night, a business gets this year's
// and next year's, unless it already has some of that year's (so one an owner deleted isn't put back).
//
// Spain: the days that are holidays everywhere in Spain. One that falls on a Sunday is left out: each
// region decides whether to move it to the Monday, as it does its own holidays, which the owner adds on
// the Calendar (Easy Beans' seed has Andalucía's and Marbella's).
// Ireland: the ten public holidays (Organisation of Working Time Act 1997, as amended for St Brigid's
// Day), on their own dates; one on a weekend still gives staff a day's pay or a day off, but no other day
// becomes the holiday.
import type { SupabaseClient } from '@supabase/supabase-js'

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

/** This year's and next year's national holidays onto the business's calendar, where it has none of that year's yet. */
export async function addNationalHolidays(db: SupabaseClient, now = new Date()): Promise<number> {
  const { data: biz } = await db.from('business').select('country').maybeSingle()
  const country = (biz as { country?: string } | null)?.country
  let added = 0
  for (const year of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
    const { prefix, days } = nationalHolidays(country, year)
    const { data, error } = await db.from('calendar_events').select('id').eq('source', 'import').like('external_id', `${prefix}-${year}-%`).limit(1)
    if (error) throw new Error(error.message)
    if (data?.length) continue
    const rows = days.map(h => ({
      starts_on: h.date, title: h.title, category: 'national', source: 'import', external_id: `${prefix}-${h.date}`, confirmed: true,
    }))
    const { error: insertError } = await db.from('calendar_events').insert(rows)
    if (insertError) throw new Error(insertError.message)
    added += rows.length
  }
  return added
}
