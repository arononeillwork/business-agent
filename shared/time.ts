import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { addDays as addDaysFns, parseISO } from 'date-fns'
import { businessConfig } from './business.config'
import type { DayKey } from './types'
import { DAY_KEYS } from './types'

export const TZ = businessConfig.timezone

/** yyyy-MM-dd of an instant, in business time. */
export const localDate = (iso: string | Date) => formatInTimeZone(iso, TZ, 'yyyy-MM-dd')

/** HH:mm of an instant, in business time (24-hour, as used in Spain). */
export const localTime = (iso: string | Date) => formatInTimeZone(iso, TZ, 'HH:mm')

export const formatLocal = (iso: string | Date, pattern: string) => formatInTimeZone(iso, TZ, pattern)

/** Instant (ISO, UTC) for a business-local date and HH:mm. */
export const zonedIso = (date: string, time: string) =>
  fromZonedTime(`${date}T${time}:00`, TZ).toISOString()

export const addDays = (date: string, days: number) =>
  formatInTimeZone(addDaysFns(parseISO(`${date}T12:00:00Z`), days), 'UTC', 'yyyy-MM-dd')

/** Monday of the week containing `date` (yyyy-MM-dd). */
export const weekStart = (date: string) => {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(date, -((dow + 6) % 7))
}

export const today = () => localDate(new Date())

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

/** How each person likes decimals shown: "843,44 €" (comma, the Spanish way) or "€843.44" (point). */
export type NumberFormat = 'comma' | 'point'
const LOCALES: Record<NumberFormat, string> = { comma: businessConfig.locale, point: 'en-IE' }
let currency: string = businessConfig.currency
const money = (f: NumberFormat) => new Intl.NumberFormat(LOCALES[f], { style: 'currency', currency, currencyDisplay: 'narrowSymbol', useGrouping: 'always' })
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
