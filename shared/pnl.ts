// Profit and loss, month by month, from what the app already knows: takings from the till (net of
// refunds and IVA), the running costs on Finances, what the team cost from timecards (or the rota
// where there are no timecards yet) with the employer's Social Security on top, and one-off lines
// the admin adds. It's an estimate to run the business by, not the accounts the gestoría files.
import { msg } from './i18n'
import { shiftPaidMinutes } from './rules'
import { localDate } from './time'
import type { Expense, SalesDay, Shift, TimeEntry } from './types'

/** Spanish IVA on food and drink served in a café or restaurant. */
export const DEFAULT_VAT_RATE = 10

/** The P&L's own settings (pnl_settings). */
export interface PnlSettings { vat_rate: number }

/** A one-off income or cost the till and Finances don't know about (pnl_lines): a grant paid, a repair. */
export interface PnlLine {
  id: string
  /** First of the month it belongs to (YYYY-MM-01). */
  month: string
  kind: 'income' | 'cost'
  /** A Finances category for costs (Stock and Supplies count as cost of sales); free text for income. */
  category: string | null
  label: string
  amount: number
  notes: string | null
}
export type PnlLineInput = Omit<PnlLine, 'id' | 'notes'> & { id?: string; notes?: string | null }

/** Finances categories that are the cost of what's sold, rather than running costs. */
export const COST_OF_SALES = ['Stock', 'Supplies']
/** The Finances category for the team: an estimate used only where the app has no timecards or rota. */
export const PEOPLE = 'People'

export type PnlSection = 'income' | 'cost_of_sales' | 'gross' | 'team' | 'running' | 'operating'
export interface PnlRow {
  key: string
  label: string
  section: PnlSection
  /** heading: a section's name; line: one amount; subtotal: a section added up; result: a profit; margin: a profit as % of income. */
  kind: 'heading' | 'line' | 'subtotal' | 'result' | 'margin'
  /** One per month (margins as a percentage; null where there's no income). */
  values: (number | null)[]
  total: number | null
  /** Where the figure comes from, in words. */
  note?: string
}

export interface PnlInput {
  /** The months to show, as YYYY-MM, in order. */
  months: string[]
  /** Today (YYYY-MM-DD): this month counts only so far; later days and months count nothing. */
  today: string
  /** The first day the business traded (YYYY-MM-DD): running costs count from then. Null: from the first month shown. */
  opened: string | null
  vatRate: number
  /** settings.employer_cost_multiplier: 1.315 = Social Security of 31.5% on top of pay. */
  employerMultiplier: number
  takings: Pick<SalesDay, 'date' | 'gross' | 'refunds'>[]
  expenses: (Pick<Expense, 'name' | 'amount' | 'category' | 'active'> & { frequency?: string | null })[]
  entries: Pick<TimeEntry, 'profile_id' | 'work_date' | 'paid_minutes'>[]
  shifts: Pick<Shift, 'profile_id' | 'starts_at' | 'ends_at' | 'break_minutes' | 'status'>[]
  /** Current hourly rate per person. */
  rates: Map<string, number>
  lines: Pick<PnlLine, 'month' | 'kind' | 'category' | 'label' | 'amount'>[]
}

export interface Pnl {
  months: string[]
  rows: PnlRow[]
  income: number[]
  grossProfit: number[]
  operatingProfit: number[]
  totals: { income: number; grossProfit: number; operatingProfit: number; grossMargin: number | null; operatingMargin: number | null }
  /** What the till took with IVA (less refunds), for the note under the takings. */
  takingsWithVat: number
  /** Months that count only part of the month (this month, or the month the business opened). */
  partial: string[]
}

const round = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => round(xs.reduce((a, b) => a + b, 0))
const pad = (n: number) => String(n).padStart(2, '0')
export const daysInMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()

/** An amount as a month's worth: weekly × 52 / 12, yearly / 12 (Finances keeps monthly amounts). */
export function monthlyAmount(amount: number, frequency?: string | null) {
  if (frequency === 'weekly') return amount * 52 / 12
  if (frequency === 'yearly' || frequency === 'annual') return amount / 12
  if (frequency === 'quarterly') return amount / 3
  return amount
}

/** The months from one to another, inclusive (YYYY-MM). */
export function monthsBetween(from: string, to: string) {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`)
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

/** The same months a year earlier. */
export const yearBefore = (months: string[]) => months.map(m => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`)

/** How much of a month counts: the days traded and gone by (today included), out of the month's days. */
function share(month: string, today: string, opened: string | null) {
  const days = daysInMonth(month)
  const first = opened && opened.slice(0, 7) === month ? Number(opened.slice(8, 10)) : 1
  if (opened && opened.slice(0, 7) > month) return 0
  const last = today.slice(0, 7) === month ? Number(today.slice(8, 10)) : today.slice(0, 7) < month ? 0 : days
  return Math.max(0, last - first + 1) / days
}

/**
 * What the team cost each month: paid hours × rate × the employer's multiplier, from timecards,
 * and from published past shifts on days without timecards. `firstDay` is the first day with any.
 */
export function teamCost(input: Pick<PnlInput, 'entries' | 'shifts' | 'rates' | 'today'>) {
  const pay = new Map<string, { pay: number; fromRota: boolean; firstDay: string }>()
  const add = (date: string, amount: number, rota: boolean) => {
    const m = date.slice(0, 7)
    const row = pay.get(m) ?? { pay: 0, fromRota: false, firstDay: date }
    row.pay += amount
    row.fromRota ||= rota
    if (date < row.firstDay) row.firstDay = date
    pay.set(m, row)
  }
  const clocked = new Set(input.entries.map(e => `${e.profile_id}:${e.work_date}`))
  for (const e of input.entries) add(e.work_date, e.paid_minutes / 60 * (input.rates.get(e.profile_id) ?? 0), false)
  for (const s of input.shifts) {
    const date = localDate(s.starts_at)
    if (s.status !== 'published' || !s.profile_id || date > input.today || clocked.has(`${s.profile_id}:${date}`)) continue
    add(date, shiftPaidMinutes(s) / 60 * (input.rates.get(s.profile_id) ?? 0), true)
  }
  return pay
}

/** The statement, month by month, with a total for the months shown. */
export function buildPnl(input: PnlInput): Pnl {
  const { months } = input
  const vat = 1 + Math.max(0, input.vatRate) / 100
  const mult = Math.max(1, input.employerMultiplier || 1)
  const shares = months.map(m => share(m, input.today, input.opened))
  const zero = () => months.map(() => 0)
  const rows: PnlRow[] = []
  const line = (key: string, label: string, section: PnlSection, values: number[], note?: string) => {
    const r: PnlRow = { key, label, section, kind: 'line', values: values.map(round), total: sum(values), note }
    rows.push(r)
    return r
  }
  const heading = (section: PnlSection, label: string) => rows.push({ key: `${section}-heading`, label, section, kind: 'heading', values: months.map(() => null), total: null })
  const subtotal = (key: string, label: string, section: PnlSection, values: number[]) =>
    rows.push({ key, label, section, kind: section === 'gross' || section === 'operating' ? 'result' : 'subtotal', values: values.map(round), total: sum(values) })
  const margin = (key: string, section: PnlSection, profit: number[], income: number[]) => rows.push({
    key, label: msg('Margin'), section, kind: 'margin',
    values: profit.map((p, i) => (income[i] > 0 ? Math.round(p / income[i] * 1000) / 10 : null)),
    total: sum(income) > 0 ? Math.round(sum(profit) / sum(income) * 1000) / 10 : null,
  })
  const add = (a: number[], b: number[]) => a.map((x, i) => x + b[i])
  const minus = (a: number[], b: number[]) => a.map((x, i) => x - b[i])
  const monthOf = (l: { month: string }) => months.indexOf(l.month.slice(0, 7))

  // Income: what the till took, less refunds and IVA; then one-off income by label.
  heading('income', msg('Income'))
  const takings = zero(), gross = zero()
  for (const d of input.takings) {
    const i = months.indexOf(d.date.slice(0, 7))
    if (i < 0 || d.date > input.today) continue
    gross[i] += d.gross - (d.refunds ?? 0)
    takings[i] += (d.gross - (d.refunds ?? 0)) / vat
  }
  line('takings', msg('Takings, without IVA'), 'income', takings, msg('From the till, less refunds'))
  let income = takings
  const oneOff = (kind: 'income' | 'cost', where: (l: PnlInput['lines'][number]) => boolean) => {
    const by = new Map<string, number[]>()
    for (const l of input.lines) {
      const i = monthOf(l)
      if (l.kind !== kind || i < 0 || !where(l)) continue
      const v = by.get(l.label) ?? zero()
      v[i] += Number(l.amount)
      by.set(l.label, v)
    }
    return [...by].sort(([a], [b]) => a.localeCompare(b))
  }
  for (const [label, v] of oneOff('income', () => true)) { line(`income:${label}`, label, 'income', v); income = add(income, v) }
  subtotal('income-total', msg('Total income'), 'income', income)

  // Running costs from Finances, by category, for the part of each month the business traded.
  const byCategory = new Map<string, number>()
  for (const e of input.expenses) {
    if (!e.active) continue
    const c = e.category?.trim() || msg('Uncategorised')
    byCategory.set(c, (byCategory.get(c) ?? 0) + monthlyAmount(Number(e.amount), e.frequency))
  }
  const recurring = (c: string) => shares.map(s => (byCategory.get(c) ?? 0) * s)
  const expenseNote = msg('From Finances')
  const costLines = (section: PnlSection, cats: string[], isCat: (c: string | null) => boolean) => {
    let total = zero()
    for (const c of cats) { const v = recurring(c); line(`${section}:${c}`, c, section, v, expenseNote); total = add(total, v) }
    for (const [label, v] of oneOff('cost', l => isCat(l.category))) { line(`${section}:one-off:${label}`, label, section, v); total = add(total, v) }
    return total
  }
  const isCostOfSales = (c: string | null) => !!c && COST_OF_SALES.includes(c)

  heading('cost_of_sales', msg('Cost of sales'))
  const cos = costLines('cost_of_sales', COST_OF_SALES.filter(c => byCategory.has(c)), isCostOfSales)
  subtotal('cost-of-sales-total', msg('Total cost of sales'), 'cost_of_sales', cos)
  const grossProfit = minus(income, cos)
  subtotal('gross-profit', msg('Gross profit'), 'gross', grossProfit)
  margin('gross-margin', 'gross', grossProfit, income)

  // The team: timecards (or the rota) with Social Security on top. Days before the app has any
  // hours for a month take Finances' People estimate instead, so wages are never counted twice.
  heading('team', msg('Team'))
  const cost = teamCost(input)
  const pay = zero(), social = zero(), estimate = zero()
  let rota = false
  months.forEach((m, i) => {
    const c = cost.get(m)
    const people = byCategory.get(PEOPLE) ?? 0
    if (c) {
      pay[i] = c.pay
      social[i] = c.pay * (mult - 1)
      rota ||= c.fromRota
      // The part of the month before the first day with hours, as the People estimate.
      const before = share(m, addDay(c.firstDay, -1), input.opened)
      estimate[i] = people * before
    } else estimate[i] = people * shares[i]
  })
  line('team-pay', msg('Pay'), 'team', pay, rota ? msg('From timecards, and the rota where there are none yet') : msg('From timecards'))
  line('team-social', msg('Employer’s Social Security'), 'team', social)
  if (estimate.some(v => v > 0)) line('team-estimate', msg('Wages estimate from Finances'), 'team', estimate, msg('For days without timecards or rota'))
  let team = add(add(pay, social), estimate)
  for (const [label, v] of oneOff('cost', l => l.category === PEOPLE)) { line(`team:one-off:${label}`, label, 'team', v); team = add(team, v) }
  subtotal('team-total', msg('Total team'), 'team', team)

  heading('running', msg('Running costs'))
  const runningCats = [...byCategory.keys()].filter(c => !COST_OF_SALES.includes(c) && c !== PEOPLE).sort((a, b) => a.localeCompare(b))
  const running = costLines('running', runningCats, c => !isCostOfSales(c) && c !== PEOPLE)
  subtotal('running-total', msg('Total running costs'), 'running', running)

  const operatingProfit = minus(minus(grossProfit, team), running)
  subtotal('operating-profit', msg('Operating profit'), 'operating', operatingProfit)
  margin('operating-margin', 'operating', operatingProfit, income)

  const totalIncome = sum(income)
  return {
    months, rows,
    income: income.map(round), grossProfit: grossProfit.map(round), operatingProfit: operatingProfit.map(round),
    totals: {
      income: totalIncome, grossProfit: sum(grossProfit), operatingProfit: sum(operatingProfit),
      grossMargin: totalIncome > 0 ? Math.round(sum(grossProfit) / totalIncome * 1000) / 10 : null,
      operatingMargin: totalIncome > 0 ? Math.round(sum(operatingProfit) / totalIncome * 1000) / 10 : null,
    },
    takingsWithVat: sum(gross),
    partial: months.filter((_, i) => shares[i] > 0 && shares[i] < 1),
  }
}

const addDay = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
