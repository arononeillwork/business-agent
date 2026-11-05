// Leaderboard (Team section): the team side by side for a week or a month. Clock-ins come from the
// timecards against the rota (on time is within 5 minutes of the shift's start, as Late starts on
// Dashboards), worked out by the database (public.team_leaderboard(), the `team_leaderboard`
// migration) so everyone sees the board without seeing each other's timecards. Sales come from Square:
// each payment says which Square team member took it, and each person is linked to theirs
// (shared/squareTeam.ts). Pure functions, so the page, the tests, the demo and the AI tools agree.
import { msg } from './i18n'
import { addDays, weekStart } from './time'

/** Minutes after a shift's start that still count as on time (Late starts on Dashboards uses the same). */
export const ON_TIME_GRACE_MINUTES = 5

export type LeaderPeriod = 'week' | 'last_week' | 'month' | 'last_month'
export const LEADER_PERIODS: { id: LeaderPeriod; label: string }[] = [
  { id: 'week', label: msg('This week') },
  { id: 'last_week', label: msg('Last week') },
  { id: 'month', label: msg('This month') },
  { id: 'last_month', label: msg('Last month') },
]
export const isLeaderPeriod = (x: unknown): x is LeaderPeriod => LEADER_PERIODS.some(p => p.id === x)

/** The days a period covers (inclusive), up to today for the one still going. */
export function periodRange(period: LeaderPeriod, day: string): { from: string; to: string } {
  if (period === 'week') return { from: weekStart(day), to: day }
  if (period === 'last_week') return { from: addDays(weekStart(day), -7), to: addDays(weekStart(day), -1) }
  const first = `${day.slice(0, 7)}-01`
  if (period === 'month') return { from: first, to: day }
  const lastMonthEnd = addDays(first, -1)
  return { from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd }
}

/** One person's clock-ins in the period, as public.team_leaderboard() gives them. */
export interface ClockStats {
  profile_id: string
  /** Times they clocked in. */
  clock_ins: number
  /** Of those, for a shift on the rota (the ones that can be on time or late). */
  on_shift: number
  on_time: number
  late: number
  /** Paid minutes on finished timecards. */
  minutes: number
  /** Days they clocked in. */
  days: number
  /** Their clock-ins for a shift in order, "o" on time and "l" late: the streaks come from it. */
  starts: string
  /** Daily checklist items they ticked. */
  ticks: number
}

/** One person's sales at the till (Square). `gross` only for owners (admins with pay access). */
export interface SalesStats { profile_id: string; sales: number; gross: number | null }

export type TillStatus = 'ok' | 'not_connected' | 'reconnect' | 'no_links' | 'plan'
/** Who sold most, from Square: a status other than ok says why there's nothing to show. */
export interface TillBoard {
  status: TillStatus
  people: SalesStats[]
  /** Sales taken by someone in Square nobody here is linked to (or by nobody signed in). */
  unlinked: { sales: number; gross: number | null }
  currency: string
  fetched_at: string | null
}
export const emptyTill = (status: TillStatus): TillBoard => ({ status, people: [], unlinked: { sales: 0, gross: null }, currency: 'EUR', fetched_at: null })

/** On time out of the clock-ins for a shift (0–1); null without any. */
export const onTimeRate = (s: Pick<ClockStats, 'on_shift' | 'on_time'>) => (s.on_shift ? s.on_time / s.on_shift : null)

/** The longest run of on-time starts. */
export function longestStreak(starts: string) {
  let best = 0, run = 0
  for (const c of starts) {
    run = c === 'o' ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

/** On-time starts in a row up to the latest one. */
export function currentStreak(starts: string) {
  const m = /o*$/.exec(starts)
  return m ? m[0].length : 0
}

export type Board = 'on_time' | 'streak' | 'hours' | 'sales' | 'checklists'
export const BOARDS: { id: Board; label: string; hint: string }[] = [
  { id: 'on_time', label: msg('On time'), hint: msg('Clocked in within 5 minutes of the shift starting') },
  { id: 'streak', label: msg('On-time streak'), hint: msg('The most shifts in a row started on time') },
  { id: 'hours', label: msg('Hours worked'), hint: msg('Paid hours on the timecards') },
  { id: 'sales', label: msg('Most sales'), hint: msg('Sales rung up at the till under their Square login') },
  { id: 'checklists', label: msg('Checklist items'), hint: msg('Daily checklist items ticked off') },
]

export interface Standing {
  profile_id: string
  /** 1 for the best; people level on the figure share a place (1, 1, 3). */
  rank: number
  /** What it's ranked on: the on-time share (0–1), a streak, hours, sales or ticks. */
  value: number
  /** A second figure to show beside it: on-time starts out of shifts, days worked, the till's takings (owners). */
  detail: { on_time?: number; on_shift?: number; days?: number; gross?: number | null; late?: number }
}

/**
 * Places, best first, by `value` and then each of `then` (higher is better): people level on all of them
 * share a place, and the next is after all of them (1, 1, 3).
 */
export function ranked<T extends { value: number }>(rows: T[], then: (r: T) => number[] = () => []): (T & { rank: number })[] {
  const keys = (r: T) => [r.value, ...then(r)]
  const cmp = (a: T, b: T) => {
    const x = keys(a), y = keys(b)
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]
    return 0
  }
  const sorted = [...rows].sort(cmp)
  let rank = 0
  return sorted.map((r, i) => {
    if (i === 0 || cmp(r, sorted[i - 1]) !== 0) rank = i + 1
    return { ...r, rank }
  })
}

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places

/**
 * One board's standings. Only people with something on it: a clock-in for a shift (on time, streak),
 * hours, a sale or a tick. On time: the share on time, then how many were, then the longest streak.
 * Sales: how many, then (for owners, who see them) how much.
 */
export function standings(board: Board, clock: ClockStats[], till: SalesStats[] = []): Standing[] {
  switch (board) {
    case 'on_time': {
      const rows = clock.filter(s => s.on_shift > 0).map(s => ({ profile_id: s.profile_id, value: round(onTimeRate(s)!, 4), s,
        detail: { on_time: s.on_time, on_shift: s.on_shift, late: s.late } }))
      return ranked(rows, r => [r.s.on_time, longestStreak(r.s.starts)]).map(({ s: _s, ...r }) => r)
    }
    case 'streak':
      return ranked(clock.filter(s => longestStreak(s.starts) > 0).map(s => ({ profile_id: s.profile_id, value: longestStreak(s.starts), detail: { on_shift: s.on_shift } })))
    case 'hours':
      return ranked(clock.filter(s => s.minutes > 0).map(s => ({ profile_id: s.profile_id, value: round(s.minutes / 60), detail: { days: s.days } })))
    case 'checklists':
      return ranked(clock.filter(s => s.ticks > 0).map(s => ({ profile_id: s.profile_id, value: s.ticks, detail: {} })))
    case 'sales':
      return ranked(till.filter(s => s.sales > 0).map(s => ({ profile_id: s.profile_id, value: s.sales, detail: { gross: s.gross } })),
        r => [r.detail.gross ?? 0])
  }
}

/** The top of each board (for the cards at the top of the page and the AI tools): who leads, or nobody yet. */
export function leaders(clock: ClockStats[], till: SalesStats[] = []): Partial<Record<Board, Standing[]>> {
  const out: Partial<Record<Board, Standing[]>> = {}
  for (const b of BOARDS) {
    const top = standings(b.id, clock, till).filter(s => s.rank === 1)
    if (top.length) out[b.id] = top
  }
  return out
}

/** A person's own line across the boards: their place on each (null: not on it). */
export function myPlaces(profileId: string, clock: ClockStats[], till: SalesStats[] = []): Record<Board, number | null> {
  return Object.fromEntries(BOARDS.map(b => [b.id, standings(b.id, clock, till).find(s => s.profile_id === profileId)?.rank ?? null])) as Record<Board, number | null>
}

/** The clock-in figures for a set of timecards and shifts (the demo; the database does the same in SQL). */
export function clockStats(
  entries: { profile_id: string; shift_id: string | null; clock_in: string; clock_out: string | null; paid_minutes: number; work_date: string }[],
  shifts: { id: string; starts_at: string }[],
  ticks: { done_by: string | null; day: string }[] = [],
  from: string, to: string,
): ClockStats[] {
  const starts = new Map(shifts.map(s => [s.id, Date.parse(s.starts_at)]))
  const by = new Map<string, ClockStats>()
  const get = (id: string) => {
    let s = by.get(id)
    if (!s) by.set(id, s = { profile_id: id, clock_ins: 0, on_shift: 0, on_time: 0, late: 0, minutes: 0, days: 0, starts: '', ticks: 0 })
    return s
  }
  const days = new Map<string, Set<string>>()
  for (const e of [...entries].filter(e => e.work_date >= from && e.work_date <= to).sort((a, b) => a.clock_in.localeCompare(b.clock_in))) {
    const s = get(e.profile_id)
    s.clock_ins++
    if (e.clock_out) s.minutes += e.paid_minutes
    days.set(e.profile_id, (days.get(e.profile_id) ?? new Set()).add(e.work_date))
    const start = e.shift_id ? starts.get(e.shift_id) : undefined
    if (start === undefined) continue
    s.on_shift++
    const late = Date.parse(e.clock_in) - start > ON_TIME_GRACE_MINUTES * 60_000
    if (late) s.late++
    else s.on_time++
    s.starts += late ? 'l' : 'o'
  }
  for (const [id, d] of days) get(id).days = d.size
  for (const t of ticks) if (t.done_by && t.day >= from && t.day <= to) get(t.done_by).ticks++
  return [...by.values()]
}
