import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { addDays as addDaysFns, parseISO, type Locale } from 'date-fns'
import { businessConfig } from './business.config'
import type { DayKey } from './types'
import { DAY_KEYS } from './types'

/**
 * The business's time zone: shifts, clock-ins and opening hours are in it. The app sets it when the
 * business loads (setBusinessTimeZone), so a business in Ireland works in Dublin time; the Worker, which
 * serves every business, passes each one's own where it matters.
 */
export let TZ: string = businessConfig.timezone
export function setBusinessTimeZone(tz: string | null | undefined) {
  if (isTimeZone(tz)) TZ = tz
}

/**
 * The Worker serves every business at once, so it can't set TZ: what it does for one business (an AI tool's
 * run) says that business's time zone for the request in hand instead (worker/zone.ts), and the helpers
 * below use it. In the app there is none, and it's TZ.
 */
let requestZone: () => string | undefined = () => undefined
export function zoneFromRequest(f: () => string | undefined) { requestZone = f }
/** The business's time zone for what's being done now: the request's (the Worker), else TZ (the app). */
export const businessTz = () => requestZone() ?? TZ

/** yyyy-MM-dd of an instant, in business time (or the time zone given). */
export const localDate = (iso: string | Date, tz = businessTz()) => formatInTimeZone(iso, tz, 'yyyy-MM-dd')

/** HH:mm of an instant, in business time (24-hour, as used in Spain), or the time zone given. */
export const localTime = (iso: string | Date, tz = businessTz()) => formatInTimeZone(iso, tz, 'HH:mm')

// Month and day names follow the person's language (set by the app; the Worker always writes English).
let dateLocale: Locale | undefined
export function setDateLocale(locale: Locale | undefined) { dateLocale = locale }

export const formatLocal = (iso: string | Date, pattern: string, tz = businessTz()) => formatInTimeZone(iso, tz, pattern, { locale: dateLocale })

/** Instant (ISO, UTC) for a local date and HH:mm, in business time or the time zone given. */
export const zonedIso = (date: string, time: string, tz = businessTz()) =>
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

export const today = (tz = businessTz()) => localDate(new Date(), tz)

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
/** The decimal mark someone has until they choose one: Ireland's point in a business there, else Spain's comma. */
export const defaultNumberFormat = (country?: string | null): NumberFormat => (country === 'IE' ? 'point' : 'comma')
/**
 * Switch the decimal mark for everything formatted from here on: the signed-in person's choice, or, when
 * they haven't made one, their business's country's (defaultNumberFormat).
 */
export function setNumberFormat(chosen?: NumberFormat, country?: string | null) {
  const f = chosen ?? defaultNumberFormat(country)
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

/** The decimal mark on screen now (setNumberFormat). */
export const currentNumberFormat = () => current
/**
 * The decimal mark someone reads: the one they chose (My account → Appearance), else their business's
 * country's. For what's written for someone away from the screen (the Worker's notifications, emails and
 * assistant), which writes for every business at once and so never calls setNumberFormat.
 */
export const numberFormatOf = (chosen?: NumberFormat | null, country?: string | null): NumberFormat => chosen ?? defaultNumberFormat(country)
/** A plain number in a given decimal style, whatever the screen's: "8,4" or "8.4". Up to two decimals, or exactly `decimals` ("12,50"). */
export const formatNumberAs = (n: number, f: NumberFormat, decimals?: number) =>
  new Intl.NumberFormat(LOCALES[f], { minimumFractionDigits: decimals ?? 0, maximumFractionDigits: decimals ?? 2, useGrouping: 'always' }).format(n)
/**
 * Money in a sentence, in a given decimal style, the way each country writes it: Ireland's "€15.00", Spain's
 * "15,00 €" (on screen the sign goes first either way: formatMoneyAs). `whole` leaves the cents off a whole
 * amount ("€25", "45 €"). For the Worker's messages, a supplier's order and a menu image's prices.
 */
export function moneyText(n: number, f: NumberFormat, { whole = false } = {}): string {
  const amount = formatNumberAs(Math.abs(n), f, whole && Number.isInteger(n) ? 0 : 2)
  const symbol = currencySymbol()
  const sign = n < 0 ? '-' : ''
  return f === 'point' ? `${sign}${symbol}${/\p{L}$/u.test(symbol) ? '\u00a0' : ''}${amount}` : `${sign}${amount} ${symbol}`
}
