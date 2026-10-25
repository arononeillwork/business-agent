import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { addDays as addDaysFns, parseISO, type Locale } from 'date-fns'
import { businessConfig } from './business.config'
import type { DayKey } from './types'
import { DAY_KEYS } from './types'

export const TZ = businessConfig.timezone

/** yyyy-MM-dd of an instant, in business time (or the time zone given). */
export const localDate = (iso: string | Date, tz = TZ) => formatInTimeZone(iso, tz, 'yyyy-MM-dd')

/** HH:mm of an instant, in business time (24-hour, as used in Spain), or the time zone given. */
export const localTime = (iso: string | Date, tz = TZ) => formatInTimeZone(iso, tz, 'HH:mm')

// Month and day names follow the person's language (set by the app; the Worker always writes English).
let dateLocale: Locale | undefined
export function setDateLocale(locale: Locale | undefined) { dateLocale = locale }

export const formatLocal = (iso: string | Date, pattern: string, tz = TZ) => formatInTimeZone(iso, tz, pattern, { locale: dateLocale })

/** Instant (ISO, UTC) for a local date and HH:mm, in business time or the time zone given. */
export const zonedIso = (date: string, time: string, tz = TZ) =>
  fromZonedTime(`${date}T${time}:00`, tz).toISOString()

/** Whether this runtime knows the time zone (an IANA name such as "Europe/London"). */
export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false }
}

// The person's own time zone (My account → Time zone): the Social planner plans and shows posts in it.
// Shifts, timecards and the rest stay in the café's time.
let ownTz: string = TZ
/** Set from the signed-in person's preferences; unknown or unset falls back to the business's time zone. */
export function setOwnTimeZone(tz?: string | null, fallback: string = TZ) {
  ownTz = isTimeZone(tz) ? tz : isTimeZone(fallback) ? fallback : TZ
}
export const ownTimeZone = () => ownTz

/** "Madrid" for Europe/Madrid, "New York" for America/New_York. */
export const zoneCity = (tz: string) => (tz.split('/').pop() ?? tz).replace(/_/g, ' ')

/** "GMT+2" for Europe/Madrid in summer: the zone's offset from UTC at that instant. */
export const zoneOffset = (tz: string, at: Date = new Date()) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? ''

export const addDays = (date: string, days: number) =>
  formatInTimeZone(addDaysFns(parseISO(`${date}T12:00:00Z`), days), 'UTC', 'yyyy-MM-dd')

/** Monday of the week containing `date` (yyyy-MM-dd). */
export const weekStart = (date: string) => {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(date, -((dow + 6) % 7))
}

export const today = (tz = TZ) => localDate(new Date(), tz)

export const dayKey = (date: string): DayKey =>
  DAY_KEYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7]

export const weekDates = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i))

export const minutesBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)

/** HH:mm → minutes since midnight. */
export const hmToMinutes = (hm: string) => {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

export const formatDuration = (minutes: number) => {
  const sign = minutes < 0 ? '-' : ''
  const m = Math.abs(Math.round(minutes))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${sign}${r}m`
  return r === 0 ? `${sign}${h}h` : `${sign}${h}h ${String(r).padStart(2, '0')}m`
}

/** How each person likes decimals shown: "€843,44" (comma, the Spanish way) or "€843.44" (point). */
export type NumberFormat = 'comma' | 'point'
const LOCALES: Record<NumberFormat, string> = { comma: businessConfig.locale, point: 'en-IE' }
let currency: string = businessConfig.currency
/** The currency symbol always goes in front of the amount ("€843,44", "-€12,50"), whichever decimal mark is used. */
const money = (f: NumberFormat) => {
  const nf = new Intl.NumberFormat(LOCALES[f], { style: 'currency', currency, currencyDisplay: 'narrowSymbol', useGrouping: 'always' })
  return { format: (n: number) => {
    const parts = nf.formatToParts(n)
    const symbol = parts.find(p => p.type === 'currency')?.value ?? ''
    const sign = parts.filter(p => p.type === 'minusSign' || p.type === 'plusSign').map(p => p.value).join('')
    const digits = parts.filter(p => !['currency', 'literal', 'minusSign', 'plusSign'].includes(p.type)).map(p => p.value).join('')
    // A code rather than a sign (CHF, kr) keeps a space before the number.
    return `${sign}${symbol}${/\p{L}$/u.test(symbol) ? '\u00a0' : ''}${digits}`
  } }
}
let eur = money('comma')
let decimal = new Intl.NumberFormat(LOCALES.comma, { maximumFractionDigits: 2, useGrouping: 'always' })
let current: NumberFormat = 'comma'
/** Switch the decimal mark for everything formatted from here on (set from the signed-in person's preferences). */
export function setNumberFormat(f: NumberFormat = 'comma') {
  if (f === current) return
  current = f
  eur = money(f)
  decimal = new Intl.NumberFormat(LOCALES[f], { maximumFractionDigits: 2, useGrouping: 'always' })
}
/** The business's currency (ISO code). Unknown codes fall back to the euro. */
export function setCurrency(code: string = businessConfig.currency) {
  if (code === currency) return
  try { new Intl.NumberFormat('en', { style: 'currency', currency: code }) } catch { code = businessConfig.currency }
  currency = code
  eur = money(current)
}
/** The symbol for the current currency, e.g. "€" or "£". */
export const currencySymbol = () => new Intl.NumberFormat(LOCALES[current], { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
  .formatToParts(0).find(p => p.type === 'currency')?.value ?? currency
export const formatMoney = (n: number) => eur.format(n)
/** An amount in a given decimal style (for showing the choices side by side). */
export const formatMoneyAs = (n: number, f: NumberFormat) => money(f).format(n)
/** A plain number with up to two decimals and thousands grouping, in the person's chosen style. */
export const formatNumber = (n: number) => decimal.format(n)
