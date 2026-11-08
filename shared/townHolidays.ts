// A Spanish town's two local holidays a year (fiestas locales). Each town hall picks its two and each
// community's bulletin publishes them (Andalucía's in the BOJA): about 8,000 towns and no national list,
// so the app asks for them rather than importing them. A business in Spain says its town (business.town,
// the town_holidays migration) at sign-up or on Business, and an admin adds each year's two days in one
// go (Business → Local holidays, or the prompt on Today). They go on the calendar as local holidays whose
// ids start local- (local-2027-06-11): the nightly import of the national and regional days
// (worker/holidays.ts) never touches them, and adds none of its own on their dates.
//
// A year whose days aren't in is asked for: this year's at any time, next year's from December. Admins
// get one notification for it (remindTownHolidays in worker/holidays.ts) and a prompt on Today until
// they're added or put off for that year. Ireland has no local holidays.
import { msg } from './i18n.ts'

/** How a town holiday's calendar id starts, whoever added it. */
export const TOWN_HOLIDAY_PREFIX = 'local-'
export const townHolidayId = (date: string) => `${TOWN_HOLIDAY_PREFIX}${date}`
/** What the calendar calls one that had no name of its own. */
export const TOWN_HOLIDAY_TITLE = 'Fiesta local'

type Day = { category: string; external_id?: string | null; starts_on: string; town?: string | null }

/** One of the town's local holidays, as added for a year (not any local holiday added by hand). */
export const isTownHoliday = (e: Pick<Day, 'category' | 'external_id'>) =>
  e.category === 'local' && !!e.external_id?.startsWith(TOWN_HOLIDAY_PREFIX)

/** The same town, whatever its capitals and spaces. */
export const sameTown = (a: string | null | undefined, b: string | null | undefined) =>
  !!a?.trim() && !!b?.trim() && a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es')

/** The years whose local holidays are asked for on a day (YYYY-MM-DD): this one, and from December the next. */
export function townHolidayYears(today: string): number[] {
  const year = Number(today.slice(0, 4))
  return today.slice(5, 7) === '12' ? [year, year + 1] : [year]
}

/** The years an admin can set on a day: this one and the next. */
export const townHolidayYearsToSet = (today: string) => [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]

/** Of the years asked for on a day, those without this town's days on the calendar. No town: none. */
export function townHolidaysMissing(today: string, town: string | null | undefined, days: readonly Day[]): number[] {
  if (!town?.trim()) return []
  const set = new Set(days.filter(d => isTownHoliday(d) && sameTown(d.town, town)).map(d => Number(d.starts_on.slice(0, 4))))
  return townHolidayYears(today).filter(y => !set.has(y))
}

/** Of the years missing, those its admins haven't been told about for this town yet (`told`: the notifications' data). */
export const townHolidaysToTell = (missing: readonly number[], town: string, told: readonly { year?: number | string | null; town?: string | null }[]) =>
  missing.filter(y => !told.some(n => Number(n.year) === y && sameTown(n.town, town)))

/**
 * What's wrong with the two days typed for a year, or null: both given, different, in that year, and
 * neither a public holiday already (`holidays`: the calendar's, of which national and regional count).
 * `text` takes {year}, {date} and {name}.
 */
export function townHolidaysProblem(year: number, dates: readonly string[], holidays: readonly (Pick<Day, 'category' | 'starts_on'> & { title: string })[] = []):
  { text: string; holiday?: { date: string; name: string } } | null {
  if (dates.length !== 2 || dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d))) return { text: msg('Pick both days') }
  if (dates.some(d => Number(d.slice(0, 4)) !== year)) return { text: msg('Both days must be in {year}') }
  if (dates[0] === dates[1]) return { text: msg('Pick two different days') }
  const clash = [...holidays].sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    .find(h => (h.category === 'national' || h.category === 'regional') && dates.includes(h.starts_on))
  if (clash) return { text: msg('{date} is already a holiday: {name}'), holiday: { date: clash.starts_on, name: clash.title } }
  return null
}

/** The reminder's title, in English as notifications are written (shared/pushText.ts says it in Spanish). */
export const townHolidaysTitle = (town: string, year: number) => `Add ${town.trim()}’s local holidays for ${year}`
export const TOWN_HOLIDAYS_TITLE = msg('Add {town}’s local holidays for {year}')
export const TOWN_HOLIDAYS_BODY = msg('Its town hall sets two days off each year. Add them so the rota and holiday pay know them.')
/** Where the reminder opens: the Business page, that year's two days asked for. */
export const townHolidaysLink = (year: number) => `/business?local-holidays=${year}`
