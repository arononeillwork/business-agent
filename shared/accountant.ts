// The Accountant dashboard (Dashboards): what a café's gestoría or accountant asks for each month and
// quarter, from what the app already has. The takings net of refunds, the period's profit and loss
// (shared/pnl.ts, over exactly the period's days), the VAT charged on the takings and the sales invoices
// against the VAT on the invoices received, the invoices still to pay, the expenses owed back to the team
// (shared/claims.ts), the monthly running costs (Finances) and the returns coming up (shared/tax.ts).
// Estimates to work from, worked out the way the pages do: the filed figures are the gestoría's.
import { buildPnl, monthlyAmount, monthsBetween, type Pnl, type PnlInput } from './pnl'
import { isOpen, isOverdue, type Invoice } from './invoices'
import { overdue, upcoming, type Filing, type FilingRecord } from './tax'
import type { ClaimStatus } from './claims'
import { msg } from './i18n'
import { localDate } from './time'
import type { Expense, SalesDay } from './types'

const round = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => round(xs.reduce((a, b) => a + b, 0))

/** The VAT inside an amount that includes it, at a rate (10: 10%). */
export const vatIn = (withVat: number, rate: number) => round(withVat - withVat / (1 + Math.max(0, rate) / 100))

export interface NetTakings {
  /** What the till took (tips aren't in it), what was refunded, and what that leaves. */
  gross: number
  refunds: number
  net: number
  /** The net split at the VAT rate: without VAT, and the VAT in it. */
  withoutVat: number
  vat: number
  payments: number
}

/** The takings from one day to another (inclusive), net of refunds, and the VAT in them at `rate`. */
export function netTakings(days: Pick<SalesDay, 'date' | 'gross' | 'refunds' | 'payments'>[], from: string, to: string, rate: number): NetTakings {
  const within = days.filter(d => d.date >= from && d.date <= to)
  const gross = sum(within.map(d => d.gross)), refunds = sum(within.map(d => d.refunds ?? 0))
  const net = round(gross - refunds), vat = vatIn(net, rate)
  return { gross, refunds, net, withoutVat: round(net - vat), vat, payments: within.reduce((a, d) => a + d.payments, 0) }
}

type VatInvoice = Pick<Invoice, 'direction' | 'status' | 'issued_on' | 'net' | 'vat' | 'total'>

/** The VAT on an invoice: as written on it, or its total less its net; null when neither is known. */
export function invoiceVat(i: Pick<Invoice, 'net' | 'vat' | 'total'>): number | null {
  if (i.vat !== null && i.vat !== undefined) return Number(i.vat)
  if (i.total !== null && i.total !== undefined && i.net !== null && i.net !== undefined) return round(Number(i.total) - Number(i.net))
  return null
}

export interface VatSummary {
  /** VAT charged: on the takings (at the rate), and on the sales invoices issued in the period. */
  onTakings: number
  onSales: number
  /** VAT paid: on the invoices received, issued in the period. */
  onPurchases: number
  /** What's charged less what's paid: to pay when above nothing, to claim back (or carry forward) below. */
  balance: number
  /** The invoices in the period it counted, and those it couldn't (no VAT or net on them yet). */
  invoices: number
  missing: number
}

/**
 * The period's VAT, as the quarterly return (Spain's modelo 303, Ireland's VAT3) adds it up: what was charged on
 * the takings and the sales invoices, less what was paid on the invoices received. Invoices count by the day they
 * were issued; cancelled ones don't count.
 */
export function vatSummary(o: { takings: number; rate: number; invoices: VatInvoice[]; from: string; to: string }): VatSummary {
  const inPeriod = o.invoices.filter(i => i.status !== 'cancelled' && !!i.issued_on && i.issued_on >= o.from && i.issued_on <= o.to)
  const known = inPeriod.map(i => ({ i, vat: invoiceVat(i) }))
  const of = (direction: Invoice['direction']) => sum(known.filter(x => x.i.direction === direction && x.vat !== null).map(x => x.vat!))
  const onTakings = vatIn(o.takings, o.rate), onSales = of('out'), onPurchases = of('in')
  return { onTakings, onSales, onPurchases, balance: round(onTakings + onSales - onPurchases), invoices: inPeriod.length, missing: known.filter(x => x.vat === null).length }
}

/**
 * The profit and loss over exactly a period's days (buildPnl counts whole months): the takings, the team and the
 * rota in it, the running costs for the share of each month it covers, and the one-off lines of its months.
 * Days after `today` count nothing.
 */
export function periodPnl(input: Omit<PnlInput, 'months' | 'today' | 'opened'>, from: string, to: string, today: string): Pnl {
  const last = to < today ? to : today
  const within = (d: string) => d >= from && d <= last
  return buildPnl({
    ...input, months: last < from ? [] : monthsBetween(from.slice(0, 7), last.slice(0, 7)), today: last, opened: from,
    takings: input.takings.filter(d => within(d.date)),
    entries: input.entries.filter(e => within(e.work_date)),
    shifts: input.shifts.filter(s => within(localDate(s.starts_at))),
  })
}

export interface PnlFigures {
  /** Takings without VAT, and any one-off income on top. */
  takings: number
  otherIncome: number
  costOfSales: number
  grossProfit: number
  team: number
  running: number
  operatingProfit: number
  /** The operating profit as % of the income; null with no income. */
  margin: number | null
  /** The team: pay, the employer's Social Security (Ireland: PRSI), and Finances' wages estimate for days without hours. */
  pay: number
  social: number
  estimate: number
  /** Where the pay comes from, in words (msg). */
  payNote: string | null
}

/** The P&L's totals, as the dashboard shows them. */
export function pnlFigures(p: Pnl): PnlFigures {
  const total = (key: string) => p.rows.find(r => r.key === key)?.total ?? 0
  const takings = total('takings')
  return {
    takings, otherIncome: round(p.totals.income - takings), costOfSales: total('cost-of-sales-total'), grossProfit: p.totals.grossProfit,
    team: total('team-total'), running: total('running-total'), operatingProfit: p.totals.operatingProfit, margin: p.totals.operatingMargin,
    pay: total('team-pay'), social: total('team-social'), estimate: total('team-estimate'), payNote: p.rows.find(r => r.key === 'team-pay')?.note ?? null,
  }
}

export interface InvoicesDue<I> {
  /** Received and not paid yet (to check, to pay or disputed), and of those, the ones past their due day. */
  toPay: { count: number; total: number }
  overdue: { count: number; total: number }
  /** Sent to customers and not paid yet. */
  owed: { count: number; total: number }
  /** The ones received still to pay: overdue first, then by due day (no due day last). */
  next: I[]
}

type DueInvoice = Pick<Invoice, 'direction' | 'status' | 'due_on' | 'total'>

/** What's still to pay on the invoices received, what's overdue, and what customers still owe on the ones sent. */
export function invoicesDue<I extends DueInvoice>(invoices: I[], today: string): InvoicesDue<I> {
  const tally = (xs: I[]) => ({ count: xs.length, total: sum(xs.map(i => Number(i.total ?? 0))) })
  const open = invoices.filter(i => i.direction === 'in' && isOpen(i))
  return {
    toPay: tally(open), overdue: tally(open.filter(i => isOverdue(i, today))),
    owed: tally(invoices.filter(i => i.direction === 'out' && isOpen(i))),
    next: [...open].sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999')),
  }
}

/** The running costs on Finances as a month's worth (weekly, quarterly and yearly ones too), and by category, biggest first. */
export function runningCosts(expenses: (Pick<Expense, 'amount' | 'category' | 'active'> & { frequency?: string | null })[]) {
  const by = new Map<string, number>()
  const counted = expenses.filter(e => e.active)
  for (const e of counted) {
    const c = e.category?.trim() || msg('Uncategorised')
    by.set(c, (by.get(c) ?? 0) + monthlyAmount(Number(e.amount), e.frequency))
  }
  return {
    monthly: sum([...by.values()]), count: counted.length,
    categories: [...by].map(([name, amount]) => ({ name, amount: round(amount) })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)),
  }
}

type Claim = { profile_id: string; status: ClaimStatus; amount: number; paid_on: string | null }

/** The expenses to approve, those approved and owed back (and to whom, most first), and what was paid back in the period. */
export function claimsOwed(claims: Claim[], from: string, to: string) {
  const owed = claims.filter(c => c.status === 'approved')
  const people = new Map<string, number>()
  for (const c of owed) people.set(c.profile_id, (people.get(c.profile_id) ?? 0) + Number(c.amount))
  const waiting = claims.filter(c => c.status === 'submitted')
  return {
    toPayBack: sum(owed.map(c => Number(c.amount))),
    toApprove: { count: waiting.length, total: sum(waiting.map(c => Number(c.amount))) },
    people: [...people].map(([profile_id, amount]) => ({ profile_id, amount: round(amount) })).sort((a, b) => b.amount - a.amount),
    paidBack: sum(claims.filter(c => c.status === 'paid' && !!c.paid_on && c.paid_on >= from && c.paid_on <= to).map(c => Number(c.amount))),
  }
}

/**
 * The returns coming up and the ones overdue, from this year's and last year's (last year's last quarter and
 * year summaries fall due in this one). Overdue counts this year's only, as Tax does: last year's are the Tax
 * page's to sort out, under that year.
 */
export function returnsDue(filings: Filing[], records: FilingRecord[], today: string) {
  const year = Number(today.slice(0, 4))
  return { next: upcoming(filings, records, today), overdue: overdue(filings.filter(f => f.year === year), records, today) }
}
