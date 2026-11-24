// Dashboards → the Sales template: what the till says about selling, from figures the app already
// reads (the takings day by day and hour by hour, Square's items, who took each payment in Square,
// and the rewards on Sales reps & rewards). Pure functions, so the widgets and the tests agree.
import { between, weekdayAverages } from './insights'
import type { RepReward, SalesRep } from './reps'
import { addDays, dayKey } from './time'
import type { SalesDay, SalesItem } from './types'

const round = (n: number) => Math.round(n * 100) / 100
const gross = (days: SalesDay[]) => round(days.reduce((s, d) => s + d.gross, 0))

/** Where a period still going is heading: taken so far, what the days left usually add, and the two together. */
export interface SalesPace {
  soFar: number
  /** What today still usually adds (a usual day of its kind, less what's been taken), and each day after it to the end. */
  toCome: number
  total: number
  /** Days after today to the period's end. */
  daysLeft: number
}

/**
 * Where a period from `from` to `end` is heading on `today`: what it's taken so far, and for each day left an
 * average day of its kind (`history`: the days before today, usually the last eight weeks; a day of the week
 * the place doesn't trade adds nothing). Today counts as a usual day of its kind, or what's been taken if more.
 * A period that's over is what it took.
 */
export function salesPace(days: SalesDay[], history: SalesDay[], from: string, end: string, today: string): SalesPace {
  const usual = new Map(weekdayAverages(history.filter(d => d.date < today)).map(w => [w.day, w.average]))
  const last = end < today ? end : today
  const soFar = gross(between(days, from, last))
  if (end < today || from > today) return { soFar, toCome: 0, total: soFar, daysLeft: 0 }
  const takenToday = days.find(d => d.date === today)?.gross ?? 0
  let toCome = Math.max(0, (usual.get(dayKey(today)) ?? 0) - takenToday), daysLeft = 0
  for (let d = addDays(today, 1); d <= end; d = addDays(d, 1)) { toCome += usual.get(dayKey(d)) ?? 0; daysLeft++ }
  return { soFar, toCome: round(toCome), total: round(soFar + toCome), daysLeft }
}

/** A part as a whole percentage of the whole (refunds of the takings), or null with nothing to compare. */
export const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round(part / whole * 100) : null)

/** What sold most by how many (Square's items), the bigger seller first when two sold as many. */
export const mostSold = (items: SalesItem[], n = 6) => [...items].filter(i => i.quantity > 0)
  .sort((a, b) => b.quantity - a.quantity || b.gross - a.gross || a.name.localeCompare(b.name)).slice(0, n)

/** One rep's rewards in a period: what they earned and how many times. */
export interface RepStanding { rep: SalesRep; earned: number; rewards: number }

/**
 * The reps who brought most from `from` to `to`, as the monthly leaderboard on Sales reps & rewards counts them
 * (what they earned, approved or waiting; turned down doesn't count), over the dashboard's period. Reps with
 * nothing in it aren't on it.
 */
export function repsBetween(reps: SalesRep[], rewards: RepReward[], from: string, to: string): RepStanding[] {
  return reps.map(rep => {
    const mine = rewards.filter(r => r.rep_id === rep.id && r.kind === 'earn' && r.status !== 'rejected' && r.occurred_on >= from && r.occurred_on <= to)
    return { rep, earned: round(mine.reduce((a, r) => a + r.amount, 0)), rewards: mine.length }
  }).filter(s => s.rewards > 0).sort((a, b) => b.earned - a.earned || b.rewards - a.rewards || a.rep.name.localeCompare(b.rep.name))
}
