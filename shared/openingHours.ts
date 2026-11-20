// A day that closes for a break (09:00–14:00 and 17:00–20:00) keeps its first opening and last closing
// time as `open` and `close`, so whatever only needs the day's span (the rota, costs, offers) reads it as
// before, and the break between. Google Maps, the website and the hours people see get both parts.
import { msg } from './i18n'
import type { DayHours } from './types'

export interface Period { open: string; close: string }

const pad = (t: string) => t.slice(0, 5).padStart(5, '0')

/** The break, when it sits inside the day (after opening, before closing). */
export function breakOf(h: DayHours | null | undefined): { from: string; to: string } | null {
  const b = h?.break
  if (!h || !b?.from || !b.to) return null
  const [open, from, to, close] = [h.open, b.from, b.to, h.close].map(pad)
  return open < from && from < to && to < close ? { from: b.from, to: b.to } : null
}

/** When it's open that day: one stretch, or two around its break. */
export function periodsOf(h: DayHours | null | undefined): Period[] {
  if (!h) return []
  const b = breakOf(h)
  return b ? [{ open: h.open, close: b.from }, { open: b.to, close: h.close }] : [{ open: h.open, close: h.close }]
}

/** A day from the stretches it's open (Google Maps, a website): the first and last, and the gap after the first. */
export function fromPeriods(periods: Period[]): DayHours | null {
  const ps = [...periods].sort((a, b) => pad(a.open).localeCompare(pad(b.open)))
  if (!ps.length) return null
  const day: DayHours = { open: ps[0].open, close: ps[ps.length - 1].close }
  if (ps.length > 1 && pad(ps[0].close) < pad(ps[1].open)) day.break = { from: ps[0].close, to: ps[1].open }
  return day
}

/** "09:00–14:00, 17:00–20:00", or "09:00–20:00" without a break. */
export const hoursLabel = (h: DayHours, between = ', ') => periodsOf(h).map(p => `${p.open}–${p.close}`).join(between)

/** The same hours, written either way ("8:00" and "08:00" match). */
export const hoursKey = (h: DayHours | null | undefined) => (h ? periodsOf(h).map(p => `${pad(p.open)}-${pad(p.close)}`).join(',') : 'closed')

/** What's wrong with a day as typed, for the Opening hours page; null when it's fine. */
export function hoursProblem(h: DayHours | null | undefined): string | null {
  if (!h) return null
  if (pad(h.close) <= pad(h.open)) return msg('Closing time must be after opening time.')
  if (h.break && !breakOf(h)) return msg('The break must start after opening and end before closing.')
  return null
}
