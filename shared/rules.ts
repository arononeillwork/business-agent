// Scheduling checks that mirror Spanish working-time rules (Estatuto de los Trabajadores).
// Pure functions: used by the rota screen, the REST API and the AI connector.
import { businessConfig } from './business.config'
import type { CalendarEvent, OpeningHours, Shift } from './types'
import { dayKey, hmToMinutes, localDate, localTime, minutesBetween } from './time'

export interface RuleLimits {
  breakAfterHours: number
  minBreakMinutes: number
  maxDailyHours: number
  maxWeeklyHours: number
  minRestHours: number
}

export const defaultLimits: RuleLimits = businessConfig.rules

export interface Warning {
  code:
    | 'overlap' | 'no_break' | 'outside_hours' | 'closed_day' | 'holiday'
    | 'no_pay_rate' | 'short_rest' | 'over_daily'
  message: string
}

export const HOLIDAY_CATEGORIES = new Set(['national', 'regional', 'local'])

export const holidayOn = (date: string, events: CalendarEvent[]) =>
  events.find(e => HOLIDAY_CATEGORIES.has(e.category) && e.confirmed &&
    date >= e.starts_on && date <= (e.ends_on ?? e.starts_on))

/** Paid minutes of a scheduled shift (scheduled break treated as unpaid). */
export const shiftPaidMinutes = (s: Pick<Shift, 'starts_at' | 'ends_at' | 'break_minutes'>) =>
  Math.max(0, minutesBetween(s.starts_at, s.ends_at) - s.break_minutes)

export interface ShiftContext {
  shifts: Shift[]              // all shifts in view (any person)
  openingHours: OpeningHours
  events: CalendarEvent[]
  hasPayRate?: (profileId: string) => boolean
  limits?: RuleLimits
}

export function shiftWarnings(shift: Shift, ctx: ShiftContext): Warning[] {
  const limits = ctx.limits ?? defaultLimits
  const out: Warning[] = []
  const date = localDate(shift.starts_at)
  const length = minutesBetween(shift.starts_at, shift.ends_at)

  if (shift.profile_id) {
    const mine = ctx.shifts.filter(s => s.profile_id === shift.profile_id && s.id !== shift.id)
    const overlap = mine.find(s => s.starts_at < shift.ends_at && s.ends_at > shift.starts_at)
    if (overlap) {
      out.push({ code: 'overlap', message: `Overlaps another shift (${localTime(overlap.starts_at)}–${localTime(overlap.ends_at)})` })
    }
    const before = mine
      .filter(s => s.ends_at <= shift.starts_at)
      .sort((a, b) => b.ends_at.localeCompare(a.ends_at))[0]
    if (before) {
      const rest = minutesBetween(before.ends_at, shift.starts_at)
      if (rest < limits.minRestHours * 60) {
        out.push({ code: 'short_rest', message: `Only ${Math.floor(rest / 60)}h rest since last shift (min ${limits.minRestHours}h)` })
      }
    }
    if (ctx.hasPayRate && !ctx.hasPayRate(shift.profile_id)) {
      out.push({ code: 'no_pay_rate', message: 'No pay rate set' })
    }
  }

  if (length > limits.breakAfterHours * 60 && shift.break_minutes < limits.minBreakMinutes) {
    out.push({ code: 'no_break', message: `Over ${limits.breakAfterHours}h without a ${limits.minBreakMinutes}-min break` })
  }
  if (shiftPaidMinutes(shift) > limits.maxDailyHours * 60) {
    out.push({ code: 'over_daily', message: `Over ${limits.maxDailyHours}h of work in a day` })
  }

  const hours = ctx.openingHours[dayKey(date)]
  if (!hours) {
    out.push({ code: 'closed_day', message: 'The café is closed that day' })
  } else {
    const start = hmToMinutes(localTime(shift.starts_at))
    const endDate = localDate(shift.ends_at)
    const end = endDate > date ? 24 * 60 : hmToMinutes(localTime(shift.ends_at))
    // Allow 60 min before opening (setup) and 60 min after close (cleanup).
    if (start < hmToMinutes(hours.open) - 60 || end > hmToMinutes(hours.close) + 60) {
      out.push({ code: 'outside_hours', message: `Outside opening hours (${hours.open}–${hours.close})` })
    }
  }

  const holiday = holidayOn(date, ctx.events)
  if (holiday) out.push({ code: 'holiday', message: `Holiday: ${holiday.title}` })

  return out
}

export interface WeeklyCheck {
  paidMinutes: number
  daysWorked: number
  warnings: string[]
}

/** Per-person weekly checks: 40h average and 1.5 days' weekly rest. */
export function weeklyCheck(shifts: Shift[], limits: RuleLimits = defaultLimits): WeeklyCheck {
  const paidMinutes = shifts.reduce((sum, s) => sum + shiftPaidMinutes(s), 0)
  const days = new Set(shifts.map(s => localDate(s.starts_at)))
  const warnings: string[] = []
  if (paidMinutes > limits.maxWeeklyHours * 60) warnings.push(`Over ${limits.maxWeeklyHours}h this week`)
  if (days.size >= 7) warnings.push('No weekly rest day')
  else if (days.size === 6) warnings.push('Check weekly rest (1.5 days)')
  return { paidMinutes, daysWorked: days.size, warnings }
}

export interface CoverageSegment {
  from: string   // HH:mm
  to: string
  staff: number
  level: 'none' | 'thin' | 'ok'
}

/**
 * Coverage across opening hours for one day in 30-minute slots.
 * 'none' = open with nobody on; 'thin' = one person during peak.
 */
export function dayCoverage(date: string, shifts: Shift[], openingHours: OpeningHours,
  peak = businessConfig.rules.peak): CoverageSegment[] {
  const hours = openingHours[dayKey(date)]
  if (!hours) return []
  const open = hmToMinutes(hours.open)
  const close = hmToMinutes(hours.close)
  const peakStart = hmToMinutes(peak.start)
  const peakEnd = hmToMinutes(peak.end)
  const day = shifts.filter(s => s.profile_id && localDate(s.starts_at) === date)
  const ranges = day.map(s => [hmToMinutes(localTime(s.starts_at)),
    localDate(s.ends_at) > date ? 24 * 60 : hmToMinutes(localTime(s.ends_at))])

  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const segments: CoverageSegment[] = []
  for (let t = open; t < close; t += 30) {
    const slotEnd = Math.min(t + 30, close)
    const staff = ranges.filter(([a, b]) => a < slotEnd && b > t).length
    const inPeak = t < peakEnd && slotEnd > peakStart
    const level = staff === 0 ? 'none' : staff === 1 && inPeak ? 'thin' : 'ok'
    const last = segments[segments.length - 1]
    if (last && last.level === level && last.staff === staff) last.to = hm(slotEnd)
    else segments.push({ from: hm(t), to: hm(slotEnd), staff, level })
  }
  return segments
}
