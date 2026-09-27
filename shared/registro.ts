// Registro de jornada (Spain, art. 34.9 Estatuto de los Trabajadores): the daily start and end of
// each person's working day, kept 4 years and given to the worker, their representatives and the
// labour inspectorate on request. This builds the monthly sheet the app prints (or saves as PDF).
import type { TimeEntry } from './types'
import { addDays, localTime } from './time'

export interface RegistroLine { entry_id: string; start: string; end: string | null; break_minutes: number; worked_minutes: number; edited: boolean }
export interface RegistroDay { date: string; lines: RegistroLine[]; worked_minutes: number }
export interface RegistroMonth { month: string; days: RegistroDay[]; worked_minutes: number; days_worked: number; open_entries: number }

/** Every day of the month (YYYY-MM) for one person, with each clock-in/out and the hours worked. */
export function registroMonth(entries: TimeEntry[], profileId: string, month: string): RegistroMonth {
  const first = `${month}-01`
  const days: RegistroDay[] = []
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) days.push({ date: d, lines: [], worked_minutes: 0 })
  const byDate = new Map(days.map(d => [d.date, d]))
  let open = 0
  for (const e of [...entries].filter(e => e.profile_id === profileId).sort((a, b) => a.clock_in.localeCompare(b.clock_in))) {
    const day = byDate.get(e.work_date)
    if (!day) continue
    if (!e.clock_out) open++
    const worked = e.clock_out ? e.paid_minutes : 0
    day.lines.push({
      entry_id: e.id, start: localTime(e.clock_in), end: e.clock_out ? localTime(e.clock_out) : null,
      break_minutes: e.break_minutes, worked_minutes: worked, edited: e.flags.includes('edited') || e.source === 'manual',
    })
    day.worked_minutes += worked
  }
  return {
    month, days, open_entries: open,
    worked_minutes: days.reduce((s, d) => s + d.worked_minutes, 0),
    days_worked: days.filter(d => d.lines.length > 0).length,
  }
}

/** "2026-09" → "2026-09-01T00:00…" bounds in UTC ISO for fetching (with a day's margin each side). */
export function monthRange(month: string) {
  const first = `${month}-01`
  let last = first
  while (addDays(last, 1).startsWith(month)) last = addDays(last, 1)
  return { first, last, fromIso: `${addDays(first, -1)}T00:00:00Z`, toIso: `${addDays(last, 2)}T00:00:00Z` }
}
