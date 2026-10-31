// What it costs to run the business each day: the running costs on Finances spread over the days it
// opens, plus the team that day from the rota (each person's paid hours × their pay rate × the
// employer's multiplier). That's the day's breakeven: Sales draws it as a line over the takings, the
// staff kitty takes its share of what's taken above it, and Finances' Staff wages opens the rota's
// hours and cost. Where the rota can't be costed (nobody on it yet, or someone on it with no pay rate),
// the team comes from the Staff wages estimate on Finances instead, so wages are never counted twice.
import { DAY_KEYS, type Expense, type OpeningHours, type Shift } from './types'
import { shiftPaidMinutes } from './rules'
import { addDays, localDate } from './time'

/**
 * The rates the team is paid at (Rota, Staff wages, Profit & loss, Timecards): with owner pay off, the
 * owners' hours cost nothing, set or not. Breakeven doesn't use this: it counts everyone at their rate.
 */
export function payrollRates(rates: Map<string, number>, people: { id: string; role: string; can_see_pay: boolean }[], ownerPay: boolean) {
  if (ownerPay) return rates
  const out = new Map(rates)
  for (const p of people) if (isOwner(p)) out.set(p.id, 0)
  return out
}

/** The owners: admins with pay access (whose pay owner pay turns on and off). */
export const isOwner = (p: { role: string; can_see_pay: boolean }) => p.role === 'admin' && p.can_see_pay

/**
 * What owner pay off takes off the month's running costs on Finances: the owners' pay for their hours on
 * the month's rota (`owners`, at their rates), no more than the counted wages line holds. The Staff
 * wages line holds the whole team's pay, owners included; with owner pay on, nothing comes off.
 */
export function ownersPayOff(ownerPay: boolean, owners: number, wages: number) {
  if (ownerPay) return 0
  return Math.round(Math.min(Math.max(0, owners), Math.max(0, wages)) * 100) / 100
}

/** The usual open days in a month when the opening hours don't say (six days a week). */
export const OPEN_DAYS_PER_MONTH = 26
const WEEKS_PER_MONTH = 52 / 12

/** The Finances line for the team's pay: the People category (as Profit & loss reads it), or a name that says wages. */
export const isWagesExpense = (e: Pick<Expense, 'name' | 'category'>) =>
  e.category === 'People' || /wage|salar|staff pay|nómina|nomina|sueldo/i.test(e.name)

/** Is the business open on that date (YYYY-MM-DD), by its weekly opening hours? Open every day when none are set. */
export function openOn(date: string, hours: OpeningHours | null | undefined) {
  if (!hours || !Object.keys(hours).length) return true
  const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7
  return !!hours[DAY_KEYS[dow]]
}

/** Open days in an average month, from the opening hours (26 when they don't say). */
export function openDaysPerMonth(hours: OpeningHours | null | undefined) {
  if (!hours || !Object.keys(hours).length) return OPEN_DAYS_PER_MONTH
  const days = DAY_KEYS.filter(k => !!hours[k]).length
  return days ? Math.round(days * WEEKS_PER_MONTH * 10) / 10 : OPEN_DAYS_PER_MONTH
}

/** The month's running costs, without and with the team's wages estimate (only expenses that are counted). */
export function monthlyCosts(expenses: Pick<Expense, 'name' | 'category' | 'amount' | 'active'>[]) {
  const counted = expenses.filter(e => e.active)
  const wages = counted.filter(isWagesExpense).reduce((s, e) => s + Number(e.amount), 0)
  const total = counted.reduce((s, e) => s + Number(e.amount), 0)
  return { fixed: total - wages, wages, total }
}

export interface PersonDay { id: string; minutes: number; rate: number | null; cost: number }

/** The team on the rota that day: each person's paid minutes and cost (null rate: none set on Team). */
export function rotaDay(shifts: Pick<Shift, 'profile_id' | 'starts_at' | 'ends_at' | 'break_minutes' | 'status'>[], date: string,
  rates: Map<string, number>, multiplier = 1): PersonDay[] {
  const by = new Map<string, PersonDay>()
  for (const s of shifts) {
    if (s.status !== 'published' || !s.profile_id || localDate(s.starts_at) !== date) continue
    const rate = rates.has(s.profile_id) ? rates.get(s.profile_id)! : null
    const row = by.get(s.profile_id) ?? { id: s.profile_id, minutes: 0, rate, cost: 0 }
    const minutes = shiftPaidMinutes(s)
    row.minutes += minutes
    row.cost += rate === null ? 0 : minutes / 60 * rate * multiplier
    by.set(s.profile_id, row)
  }
  return [...by.values()]
}

export interface DayCost {
  date: string
  open: boolean
  /** The running costs without wages, spread over the open days. */
  fixed: number
  /** The team that day. */
  team: number
  /** Where `team` came from: the rota costed, the Finances wages estimate, or nothing (closed, no estimate). */
  teamFrom: 'rota' | 'estimate' | 'none'
  /** Breakeven: fixed + team. */
  total: number
  /** Hours on the rota that day. */
  hours: number
  people: PersonDay[]
  /** People on the rota that day without a pay rate. */
  unpriced: string[]
}

export interface DailyCostInput {
  expenses: Pick<Expense, 'name' | 'category' | 'amount' | 'active'>[]
  shifts: Pick<Shift, 'profile_id' | 'starts_at' | 'ends_at' | 'break_minutes' | 'status'>[]
  rates: Map<string, number>
  multiplier?: number
  openingHours?: OpeningHours | null
}

/**
 * The cost of running the business on each date from `from` to `to`. A day with people on the rota is
 * costed from it when they all have a pay rate; otherwise (and on open days with nobody on the rota)
 * the Finances wages estimate per open day stands in for the team. Closed days cost nothing.
 */
export function dailyCosts(from: string, to: string, input: DailyCostInput): DayCost[] {
  const perMonth = openDaysPerMonth(input.openingHours)
  const month = monthlyCosts(input.expenses)
  const fixedPerDay = month.fixed / perMonth
  const wagesPerDay = month.wages / perMonth
  const out: DayCost[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const people = rotaDay(input.shifts, date, input.rates, input.multiplier ?? 1)
    const open = openOn(date, input.openingHours) || people.length > 0
    const unpriced = people.filter(p => p.rate === null).map(p => p.id)
    const rota = people.length > 0 && !unpriced.length
    const team = !open ? 0 : rota ? people.reduce((s, p) => s + p.cost, 0) : wagesPerDay
    const fixed = open ? fixedPerDay : 0
    out.push({
      date, open, fixed, team, total: fixed + team, teamFrom: !open ? 'none' : rota ? 'rota' : wagesPerDay > 0 ? 'estimate' : 'none',
      hours: people.reduce((s, p) => s + p.minutes, 0) / 60, people, unpriced,
    })
  }
  return out
}

/**
 * The team on the rota for a whole month (YYYY-MM): hours and cost per person, and in total. `complete`
 * is true when everyone on it has a pay rate, so the cost can stand in for the Staff wages estimate.
 */
export function rotaMonth(month: string, input: Pick<DailyCostInput, 'shifts' | 'rates' | 'multiplier'>) {
  const first = `${month}-01`
  const next = addDays(`${month}-28`, 4).slice(0, 7)
  const last = addDays(`${next}-01`, -1)
  const people = new Map<string, PersonDay>()
  const days: { date: string; minutes: number; cost: number }[] = []
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const day = rotaDay(input.shifts, date, input.rates, input.multiplier ?? 1)
    days.push({ date, minutes: day.reduce((s, p) => s + p.minutes, 0), cost: day.reduce((s, p) => s + p.cost, 0) })
    for (const p of day) {
      const row = people.get(p.id) ?? { id: p.id, minutes: 0, rate: p.rate, cost: 0 }
      row.minutes += p.minutes
      row.cost += p.cost
      people.set(p.id, row)
    }
  }
  const list = [...people.values()].sort((a, b) => b.minutes - a.minutes)
  return {
    people: list, days,
    hours: list.reduce((s, p) => s + p.minutes, 0) / 60,
    cost: list.reduce((s, p) => s + p.cost, 0),
    unpriced: list.filter(p => p.rate === null).map(p => p.id),
    complete: list.length > 0 && list.every(p => p.rate !== null),
  }
}

/** The staff kitty's share: 10% of what's taken above the day's breakeven. */
export const KITTY_SHARE_OVER_BREAKEVEN = 0.1

/** Each day's takings above its breakeven, and the kitty's share of it (nothing on a day below it). */
export function overBreakeven(days: { date: string; takings: number }[], costs: DayCost[], share = KITTY_SHARE_OVER_BREAKEVEN) {
  const cost = new Map(costs.map(c => [c.date, c.total]))
  const rows = days.map(d => {
    const breakeven = cost.get(d.date) ?? 0
    const over = Math.max(0, d.takings - breakeven)
    return { date: d.date, takings: d.takings, breakeven, over, share: over * share }
  })
  return {
    rows,
    takings: rows.reduce((s, r) => s + r.takings, 0),
    breakeven: rows.reduce((s, r) => s + r.breakeven, 0),
    over: rows.reduce((s, r) => s + r.over, 0),
    share: rows.reduce((s, r) => s + r.share, 0),
    daysOver: rows.filter(r => r.over > 0).length,
  }
}
