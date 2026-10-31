// Credit & debit: money the business still has to pay (debits: a loan from someone, a machine on
// finance) and money still to come in or that could be raised (credits: something to sell, a deposit
// to get back, money owed to it, and its grants). Grants come from the grant applications as they
// are; everything else is an item with the payments made or received towards it.
// Dates are ISO strings ('2026-10-24'), compared as text, and `today` is always passed in.
import { msg } from './i18n'
import { addMonths, daysUntil } from './licences'
// Types only, so the AI tools don't load the grant catalogue.
import type { GrantApplication, GrantStage } from './grants'

export type MoneyDirection = 'debit' | 'credit'
export type MoneyKind = 'loan' | 'finance' | 'sale' | 'deposit' | 'other'
export const KINDS: { id: MoneyKind; label: string }[] = [
  { id: 'loan', label: msg('Loan or debt') },
  { id: 'finance', label: msg('Bought on finance') },
  { id: 'sale', label: msg('Something to sell') },
  { id: 'deposit', label: msg('Deposit') },
  { id: 'other', label: msg('Other') },
]

export interface MoneyPayment {
  id: string
  item_id: string
  paid_on: string
  amount: number
  note: string | null
}

export interface MoneyItem {
  id: string
  direction: MoneyDirection
  kind: MoneyKind
  name: string
  /** Who it's owed to or by. */
  party: string | null
  /** The whole amount. */
  amount: number
  /** What's paid or comes in each time, and how often (months); null: in one go, or whenever. */
  instalment: number | null
  every_months: number | null
  next_due: string | null
  /** Could come in, not agreed yet (credits only). */
  possible: boolean
  /** Paid off, received, or settled some other way. */
  done: boolean
  notes: string | null
  /** A web page about it (the listing of something for sale, the agreement), or null. */
  link: string | null
  payments: MoneyPayment[]
}
export type MoneyItemInput = Partial<Omit<MoneyItem, 'id' | 'payments'>> & { id?: string }

/** A link an item can keep: a web address (http or https), up to 500 characters, as the database checks. */
export const isMoneyLink = (s: string) => /^https?:\/\/[^\s]+$/i.test(s) && s.length <= 500

/** Where a link goes, to show beside it: its site, without "www.". */
export const linkSite = (s: string) => { try { return new URL(s).hostname.replace(/^www\./, '') } catch { return s } }

export const paidSoFar = (payments: Pick<MoneyPayment, 'amount'>[]) => Math.round(payments.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100

/**
 * What a payment does (mirrors credit_debit_payment_made() in the database): money that has come in is
 * agreed, so no longer "possible"; once everything is paid it's done and nothing more is due; otherwise
 * a repeating one moves on a period, when the payment is for this period (no more than one period
 * before the date, or late). An older one leaves the date. A settled item doesn't change.
 */
export function afterPayment(item: Pick<MoneyItem, 'amount' | 'every_months' | 'next_due' | 'done' | 'possible'>, paid: number, paidOn: string)
  : Pick<MoneyItem, 'next_due' | 'done' | 'possible'> {
  if (item.done) return { next_due: item.next_due, done: true, possible: item.possible }
  if (paid >= item.amount) return { next_due: null, done: true, possible: false }
  if (item.every_months && item.next_due && paidOn >= addMonths(item.next_due, -item.every_months)) {
    return { next_due: addMonths(item.next_due, item.every_months), done: false, possible: false }
  }
  return { next_due: item.next_due, done: false, possible: false }
}

/** One line on the page: an item, or a grant application. */
export interface MoneyLine {
  key: string
  direction: MoneyDirection
  kind: MoneyKind | 'grant'
  name: string
  party: string | null
  /** The whole amount (a grant's awarded amount once awarded, what was asked for before; null when not known yet). */
  amount: number | null
  /** Paid or received so far. */
  settled: number
  /** Still to pay or to come in (0 once done). */
  left: number
  instalment: number | null
  every_months: number | null
  next_due: string | null
  possible: boolean
  done: boolean
  item?: MoneyItem
  grant?: GrantApplication
}

export function itemLine(item: MoneyItem): MoneyLine {
  const settled = paidSoFar(item.payments)
  const done = item.done || settled >= item.amount
  return {
    key: item.id, direction: item.direction, kind: item.kind, name: item.name, party: item.party, amount: item.amount, settled,
    left: done ? 0 : Math.round((item.amount - settled) * 100) / 100, instalment: item.instalment, every_months: item.every_months,
    next_due: done ? null : item.next_due, possible: item.direction === 'credit' && item.possible, done, item,
  }
}

/** Stages where the money isn't agreed yet: it's what the business could get. */
const NOT_AWARDED: GrantStage[] = ['interested', 'gathering', 'submitted', 'info_requested']

/**
 * A grant as money coming in: what was asked for while it's being applied for (possible), what was
 * awarded once it is, less what's been received. Rejected grants bring nothing in, so they're left out.
 */
export function grantLine(a: GrantApplication): MoneyLine | null {
  if (a.stage === 'rejected') return null
  const possible = NOT_AWARDED.includes(a.stage)
  const amount = possible ? (a.amount_requested ?? a.amount_awarded) : (a.amount_awarded ?? a.amount_requested)
  const settled = a.amount_received ?? 0
  const done = a.stage === 'closed' || (!possible && amount != null && settled >= amount)
  return {
    key: `grant:${a.id}`, direction: 'credit', kind: 'grant', name: a.grant_name, party: null, amount, settled,
    left: done || amount == null ? 0 : Math.max(0, Math.round((amount - settled) * 100) / 100),
    instalment: null, every_months: null, next_due: null, possible, done, grant: a,
  }
}

/** Every line: the items, then the grants. */
export const moneyLines = (items: MoneyItem[], grants: GrantApplication[]) =>
  [...items.map(itemLine), ...grants.map(grantLine).filter((l): l is MoneyLine => !!l)]

export type MoneyStatus = 'done' | 'overdue' | 'due' | 'possible' | 'open'
export const STATUS_LABEL: Record<MoneyStatus, string> = {
  done: msg('Settled'), overdue: msg('Overdue'), due: msg('Due soon'), possible: msg('Could raise'), open: msg('Ongoing'),
}
/** Days before its date that a payment shows as due soon. */
export const DUE_SOON_DAYS = 7

export function statusOf(l: Pick<MoneyLine, 'done' | 'next_due' | 'possible'>, today: string): MoneyStatus {
  if (l.done) return 'done'
  if (l.next_due && l.next_due < today) return 'overdue'
  if (l.next_due && daysUntil(today, l.next_due) <= DUE_SOON_DAYS) return 'due'
  return l.possible ? 'possible' : 'open'
}

/** The headline figures: still to pay, paid out a month, coming in, and what could be raised. */
export function totals(lines: MoneyLine[]) {
  const open = lines.filter(l => !l.done)
  const sum = (ls: MoneyLine[]) => Math.round(ls.reduce((s, l) => s + l.left, 0) * 100) / 100
  const debts = open.filter(l => l.direction === 'debit')
  return {
    toPay: sum(debts),
    // Each repeating payment as a month's share (a quarterly €300 is €100 a month), never more than what's left.
    monthly: Math.round(debts.filter(l => l.instalment && l.every_months).reduce((s, l) => s + Math.min(l.instalment!, l.left) / l.every_months!, 0) * 100) / 100,
    comingIn: sum(open.filter(l => l.direction === 'credit' && !l.possible)),
    couldRaise: sum(open.filter(l => l.direction === 'credit' && l.possible)),
  }
}

/** What a payment is likely to be: the usual instalment, or what's left when that's less (or there's no instalment). */
export const suggestedPayment = (l: Pick<MoneyLine, 'instalment' | 'left'>) => (l.instalment && l.instalment < l.left ? l.instalment : l.left)

export const everyLabel = (months: number | null) =>
  !months ? msg('In one go') : months === 1 ? msg('Every month') : months === 3 ? msg('Every 3 months') : months === 6 ? msg('Every 6 months')
    : months === 12 ? msg('Every year') : msg('Every {n} months')
