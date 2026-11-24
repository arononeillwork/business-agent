// Repeating the rota (Rota → Repeat week): a week's shifts copied onto the weeks after it, either for a
// few weeks or kept going as a continuous rota, filled on every night to the end of the fourth week after
// this one. The database does it (the `repeating_rota` migration); this is the same, for the demo and for
// what the Rota page says before it's done.
import { addDays, localDate, localTime, weekStart, zonedIso } from './time'
import type { Shift } from './types'

/** A continuous rota is kept filled to the end of this many weeks after this one. */
export const WEEKS_AHEAD = 4
/** A copy goes onto at most this many weeks. */
export const MAX_REPEAT_WEEKS = 12

/** The continuous rota, while there is one: the Monday of the week it repeats, and how far it's filled. */
export interface RotaRepeat { source_week: string; filled_until: string; updated_at: string }
/** What a copy did: shifts added and replaced, left off for time off and for days the business is closed,
 *  and the last day it went onto. */
export interface RepeatResult { added: number; removed: number; away: number; closed: number; until: string }

/** A week's shift as a day of the week (1 Monday … 7 Sunday) and times of day. */
export interface WeekShift {
  weekday: number
  starts: string
  ends: string
  profile_id: string | null
  position_id: number | null
  break_minutes: number
  note: string | null
}

export const isoWeekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7

/** How far a continuous rota is kept filled: the Sunday that ends the fourth week after this one. */
export const filledAhead = (todayDate: string) => addDays(weekStart(todayDate), 7 * (WEEKS_AHEAD + 1) - 1)

/** The last day a copy of the week starting `monday` goes onto: `weeks` weeks, or (continuous, `weeks`
 *  null) to the end of the fourth week after this one, and at least the week after it. */
export function repeatUntil(monday: string, weeks: number | null, todayDate: string): string {
  if (weeks !== null) return addDays(monday, 7 * (weeks + 1) - 1)
  const after = addDays(monday, 13)
  const ahead = filledAhead(todayDate)
  return ahead > after ? ahead : after
}

export const asWeekShift = (s: Shift): WeekShift => ({
  weekday: isoWeekday(localDate(s.starts_at)), starts: localTime(s.starts_at), ends: localTime(s.ends_at),
  profile_id: s.profile_id, position_id: s.position_id, break_minutes: s.break_minutes, note: s.note,
})

/** The shift a week's shift makes on a day; one ending at or before it starts ends the next day. */
export const shiftOn = (w: WeekShift, day: string): Omit<Shift, 'id' | 'status'> => ({
  profile_id: w.profile_id, position_id: w.position_id, break_minutes: w.break_minutes, note: w.note,
  starts_at: zonedIso(day, w.starts),
  ends_at: w.ends <= w.starts ? zonedIso(addDays(day, 1), w.ends) : zonedIso(day, w.ends),
})

export interface AddContext {
  now: string
  shifts: Pick<Shift, 'profile_id' | 'starts_at' | 'ends_at'>[]
  /** The business is closed that day besides its weekly hours (shared/closures.ts). */
  closed: (day: string) => boolean
  /** Still on the team and on the rota. */
  onRota: (profileId: string) => boolean
  /** Approved time off that day. */
  away: (profileId: string, day: string) => boolean
}

/** Whether a shift goes onto the rota, as the database decides: not if it would have started already, the
 *  business is closed that day, its person has left or is off the rota or away that day, or they (or, for
 *  an open shift, one at the same times) are on already then. */
export function addable(s: Omit<Shift, 'id' | 'status'>, day: string, c: AddContext): 'added' | 'past' | 'closed' | 'off' | 'away' | 'busy' {
  if (new Date(s.starts_at) <= new Date(c.now)) return 'past'
  if (c.closed(day)) return 'closed'
  const at = (iso: string) => new Date(iso).getTime()
  if (s.profile_id) {
    if (!c.onRota(s.profile_id)) return 'off'
    if (c.away(s.profile_id, day)) return 'away'
    if (c.shifts.some(x => x.profile_id === s.profile_id && at(x.starts_at) < at(s.ends_at) && at(x.ends_at) > at(s.starts_at))) return 'busy'
  } else if (c.shifts.some(x => !x.profile_id && at(x.starts_at) === at(s.starts_at) && at(x.ends_at) === at(s.ends_at))) {
    return 'busy'
  }
  return 'added'
}
