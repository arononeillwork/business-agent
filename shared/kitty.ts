// Staff kitty: a share of each month's profit (and anything else put in: the tips jar, a bonus)
// saved up for the team's goals, the Christmas party or a pair of Ray-Bans for the café. The jars
// fill in order, the first until it's full, then the next; buying one takes what it cost out.
// The database has the same rules (migration …_staff_kitty.sql).
import { msg } from './i18n'

export type GoalIcon = 'party' | 'sunglasses' | 'dinner' | 'trip' | 'gift' | 'equipment' | 'other'
export const GOAL_ICONS: { id: GoalIcon; label: string }[] = [
  { id: 'party', label: msg('A party') }, { id: 'sunglasses', label: msg('Sunglasses') }, { id: 'dinner', label: msg('A meal out') },
  { id: 'trip', label: msg('A trip') }, { id: 'gift', label: msg('A present') }, { id: 'equipment', label: msg('Something for the café') },
  { id: 'other', label: msg('Something else') },
]

export interface KittyGoal {
  id: string
  name: string
  icon: GoalIcon
  target: number
  /** When it's wanted by, if there's a date. */
  due_on: string | null
  /** The order the jars fill in. */
  sort: number
  link: string | null
  notes: string | null
  /** Bought: what it cost (taken out of the kitty) and when. */
  spent: number | null
  bought_on: string | null
  created_at: string
}
export type KittyGoalInput = Partial<Omit<KittyGoal, 'id' | 'created_at'>> & { id?: string }

/** profit: a month's share of profit; top_up: anything else put in; adjust: a correction (it can take some out). */
export type KittyEntryKind = 'profit' | 'top_up' | 'adjust'
export interface KittyEntry {
  id: string
  kind: KittyEntryKind
  /** A profit share: the month it's from (YYYY-MM-01) and the share it was. */
  month: string | null
  percent: number | null
  amount: number
  note: string | null
  created_at: string
}
export type KittyEntryInput = Omit<KittyEntry, 'id' | 'created_at'>

export interface KittySettings { profit_percent: number }

const round2 = (n: number) => Math.round(n * 100) / 100

/** What's in the kitty: everything put in, less what's been bought. */
export const kittyBalance = (entries: Pick<KittyEntry, 'amount'>[], goals: Pick<KittyGoal, 'spent'>[]) =>
  round2(entries.reduce((a, e) => a + e.amount, 0) - goals.reduce((a, g) => a + (g.spent ?? 0), 0))

/** A month's share of profit: nothing from a month that made a loss. */
export const profitShare = (profit: number, percent: number) => (profit > 0 ? round2(profit * percent / 100) : 0)

export interface Jar {
  goal: KittyGoal
  /** What's in its jar (for a bought goal, what it cost). */
  saved: number
  /** 0 to 1. */
  share: number
  full: boolean
  bought: boolean
}

/** The goals still to buy in their order, each filled from the kitty in turn; the bought ones after, newest first. */
export function fillJars(goals: KittyGoal[], balance: number): Jar[] {
  let left = Math.max(0, balance)
  const open = goals.filter(g => !g.bought_on).sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at)).map(goal => {
    const saved = round2(Math.min(goal.target, left))
    left = round2(left - saved)
    return { goal, saved, share: goal.target > 0 ? saved / goal.target : 0, full: saved >= goal.target, bought: false }
  })
  const bought = goals.filter(g => g.bought_on).sort((a, b) => b.bought_on!.localeCompare(a.bought_on!))
    .map(goal => ({ goal, saved: goal.spent ?? 0, share: 1, full: true, bought: true }))
  return [...open, ...bought]
}

const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`
/** The month (YYYY-MM) `n` months on from another. */
export const addMonths = (ym: string, n: number) => fromIndex(monthIndex(ym) + n)

/** Which month an entry counts for: a profit share its own month, anything else the month it was put in. */
const entryMonth = (e: Pick<KittyEntry, 'kind' | 'month' | 'created_at'>) => (e.kind === 'profit' && e.month ? e.month : e.created_at).slice(0, 7)

/**
 * What goes in a month, on average, over the last `n` whole months before `today` (or the whole
 * months since the first money went in, when that's fewer). Adjustments aren't income.
 */
export function monthlyPace(entries: Pick<KittyEntry, 'kind' | 'month' | 'amount' | 'created_at'>[], today: string, n = 3): number {
  const now = monthIndex(today.slice(0, 7))
  const income = entries.filter(e => e.kind !== 'adjust' && e.amount > 0 && monthIndex(entryMonth(e)) < now)
  if (!income.length) return 0
  const first = Math.min(...income.map(e => monthIndex(entryMonth(e))))
  const months = Math.max(1, Math.min(n, now - first))
  const total = income.filter(e => monthIndex(entryMonth(e)) >= now - months).reduce((a, e) => a + e.amount, 0)
  return round2(total / months)
}

export interface Forecast {
  /** Months until it's full at this pace (0: it's full now); null when nothing is going in. */
  months: number | null
  /** The month it's full (YYYY-MM). */
  by: string | null
  /** With a date: whether that's in time, and what it would take a month to get there. */
  inTime: boolean | null
  perMonth: number | null
}

/**
 * When each goal still to buy is full, at `pace` a month, filling in order. A month's money goes in
 * once the month is over, so a goal wanted in December gets November's and October's.
 */
export function forecast(jars: Jar[], pace: number, today: string): Map<string, Forecast> {
  const out = new Map<string, Forecast>()
  const thisMonth = today.slice(0, 7)
  let needed = 0
  for (const j of jars.filter(x => !x.bought)) {
    needed = round2(needed + j.goal.target - j.saved)
    const months = j.full ? 0 : pace > 0 ? Math.ceil(needed / pace - 1e-9) : null
    const due = j.goal.due_on?.slice(0, 7) ?? null
    const until = due ? Math.max(0, monthIndex(due) - monthIndex(thisMonth)) : null
    out.set(j.goal.id, {
      months, by: months === null ? null : addMonths(thisMonth, months),
      inTime: until === null ? null : months !== null && months <= until,
      perMonth: until === null || j.full ? null : until > 0 ? round2(needed / until) : null,
    })
  }
  return out
}

/** Months (YYYY-MM) from a list whose share of profit hasn't gone in yet. */
export const monthsNotPaidIn = (months: string[], entries: Pick<KittyEntry, 'kind' | 'month'>[]) =>
  months.filter(m => !entries.some(e => e.kind === 'profit' && e.month?.slice(0, 7) === m))

/** Things a café team saves up for, to add in one press (named in the person's language). */
export const KITTY_IDEAS: { name: string; icon: GoalIcon; target: number }[] = [
  { name: msg('Christmas party'), icon: 'party', target: 500 },
  { name: msg('Ray-Ban sunglasses for the café'), icon: 'sunglasses', target: 160 },
  { name: msg('Team dinner'), icon: 'dinner', target: 250 },
  { name: msg('A day out together'), icon: 'trip', target: 400 },
  { name: msg('Latte art course'), icon: 'equipment', target: 240 },
  { name: msg('Summer barbecue'), icon: 'party', target: 300 },
]
