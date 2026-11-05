// The Today page's short cards: today's takings against the day's breakeven (what's come in so far,
// hour by hour from opening, how far that is towards what the day costs to run: shared/dailyCost.ts,
// and when it got there), and the jobs to do first. The till's hours are the business's own (0 =
// midnight to 1:00).
import type { Todo } from './types'

export interface TakingsPoint {
  /** Hours since midnight: 9.5 is half past nine. */
  at: number
  /** Taken from opening up to then. */
  total: number
}

export interface TakingsSoFar {
  /** Taken so far today. */
  takings: number
  /** The running total through the day, from opening (0) to now; empty when the till doesn't give hours. */
  points: TakingsPoint[]
  /** The day's span on the chart, in hours since midnight: the opening hours, or the hours with sales. */
  from: number
  to: number
  /** The day's breakeven (what it costs to run), and how far the takings are towards it (1: there). */
  breakeven: number
  share: number | null
  /** Taken above breakeven (0 below it), and how far short of it (0 once there). */
  over: number
  short: number
  /** The hour the takings reached breakeven ("13:00"), or null: not yet. */
  reachedAt: string | null
}

const hourOf = (hhmm: string | undefined | null) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '')
  return m ? Number(m[1]) + Number(m[2]) / 60 : null
}
const pad = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:00`
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Today so far. `now` is hours since midnight (14.25 for 14:15); `hours` is the open hours ("08:00",
 * "18:00"), when the business opens today. Only hours up to now count, so a till that reports the
 * whole day at once still reads as the day so far; without hours, the day's total is all there is.
 */
export function takingsSoFar(day: { gross: number; hours?: number[] } | undefined, breakeven: number, now: number,
  hours?: { open?: string; close?: string } | null): TakingsSoFar {
  const byHour = day?.hours ?? []
  const sold = byHour.map((v, h) => ({ v, h })).filter(x => x.v > 0 && x.h <= now)
  const open = hourOf(hours?.open), close = hourOf(hours?.close)
  // The chart's day: the opening hours, stretched to any sales outside them.
  let from = open ?? (sold.length ? sold[0].h : 8)
  let to = close !== null && open !== null && close > open ? close : Math.max(from + 1, sold.length ? sold[sold.length - 1].h + 1 : 18)
  if (sold.length) { from = Math.min(from, sold[0].h); to = Math.max(to, sold[sold.length - 1].h + 1) }
  from = Math.floor(from)
  to = Math.ceil(to)

  const points: TakingsPoint[] = []
  let takings = day?.gross ?? 0
  if (byHour.length) {
    let total = 0
    const end = Math.min(now, to)
    if (end >= from) {
      points.push({ at: from, total: 0 })
      for (let h = from; h < end; h++) {
        total += byHour[h] ?? 0
        points.push({ at: Math.min(h + 1, end), total: round2(total) })
      }
    }
    takings = round2(byHour.reduce((s, v, h) => (h <= now ? s + v : s), 0))
  }
  const share = breakeven > 0 ? takings / breakeven : null
  const reached = breakeven > 0 ? points.find(p => p.total >= breakeven) : undefined
  return {
    takings, points, from, to, breakeven: round2(breakeven), share,
    over: round2(Math.max(0, takings - breakeven)), short: round2(Math.max(0, breakeven - takings)),
    reachedAt: reached ? pad(Math.ceil(reached.at)) : null,
  }
}

/**
 * The jobs to do first, `n` of them: pinned, then starred, then those being done, each in the To Do
 * List's own order. Done ones never.
 */
export function topJobs<T extends Pick<Todo, 'done' | 'pinned' | 'starred' | 'status' | 'position'>>(todos: T[], n = 3): T[] {
  const rank = (x: T) => (x.pinned ? 0 : x.starred ? 1 : x.status === 'doing' ? 2 : 3)
  return todos.filter(x => !x.done).sort((a, b) => rank(a) - rank(b) || a.position - b.position).slice(0, n)
}

/**
 * What's low, the most urgent first: none left, then the furthest below its own reorder level (so 2 of
 * 10 bags comes before 300 of 500 lids, whatever the units), then by name.
 */
export function lowestFirst<T extends { name: string; on_hand: number; reorder_at: number | null }>(items: T[]): T[] {
  const share = (i: T) => (i.on_hand <= 0 ? -1 : i.reorder_at && i.reorder_at > 0 ? i.on_hand / i.reorder_at : 1)
  return [...items].sort((a, b) => share(a) - share(b) || a.name.localeCompare(b.name))
}
