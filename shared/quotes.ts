// Quotes & estimates: what the business offers to do for a price (catering for an event, coffee for
// an office, a job), line by line with its IVA, until it's accepted, declined or runs out. A quote
// can come from an enquiry (Leads & enquiries) and, once accepted, go to Invoices as a sales
// invoice to issue. The app keeps quotes; issuing the invoice needs invoicing software (Verifactu).
import { msg } from './i18n'
import type { Customer } from './types'

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'
export const QUOTE_STATUSES: { id: QuoteStatus; label: string }[] = [
  { id: 'draft', label: msg('Draft') }, { id: 'sent', label: msg('Sent') }, { id: 'accepted', label: msg('Accepted') },
  { id: 'declined', label: msg('Declined') }, { id: 'expired', label: msg('Expired') },
]
export const quoteStatusLabel = (s: QuoteStatus) => QUOTE_STATUSES.find(x => x.id === s)!.label

/** Spain's IVA rates: general, reduced (food and drink served, most hospitality), super-reduced, none. */
export const VAT_RATES = [21, 10, 4, 0]
/** Days a quote holds unless changed. */
export const DEFAULT_VALID_DAYS = 30

export interface QuoteLine {
  description: string
  quantity: number
  /** One, without IVA. */
  unit_price: number
  vat_rate: number
}

export interface Quote {
  id: string
  /** Q-2026-001: given by the database, one after another each year. */
  number: string
  customer_id: string | null
  enquiry_id: string | null
  title: string
  status: QuoteStatus
  issued_on: string | null
  valid_until: string | null
  lines: QuoteLine[]
  /** Off every line before IVA (0–100). */
  discount_pct: number
  /** Shown on the quote: what's included, deposit, how to accept. */
  terms: string | null
  /** Only for the team. */
  notes: string | null
  /** Worked out from the lines (by the database too). */
  net: number
  vat: number
  total: number
  /** The sales invoice it went to (Invoices), once accepted. */
  invoice_id: string | null
  created_at: string
  customer?: Pick<Customer, 'first_name' | 'last_name' | 'company' | 'email' | 'phone'> | null
}
export type QuoteInput = Partial<Omit<Quote, 'id' | 'number' | 'net' | 'vat' | 'total' | 'customer' | 'created_at'>> & { id?: string; title: string }

const round2 = (n: number) => Math.round(n * 100) / 100

/** A line before IVA and the discount. */
export const lineNet = (l: Pick<QuoteLine, 'quantity' | 'unit_price'>) => round2(l.quantity * l.unit_price)

export interface QuoteTotals { net: number; vat: number; total: number; byRate: { rate: number; net: number; vat: number }[] }

/** What it comes to: each line less the discount, the IVA at each line's rate, and the total. Same sums as the database. */
export function totals(lines: QuoteLine[], discountPct = 0): QuoteTotals {
  const rates = new Map<number, number>()
  for (const l of lines) {
    const net = round2(lineNet(l) * (1 - discountPct / 100))
    rates.set(l.vat_rate, round2((rates.get(l.vat_rate) ?? 0) + net))
  }
  const byRate = [...rates].sort((a, b) => b[0] - a[0]).map(([rate, net]) => ({ rate, net, vat: round2(net * rate / 100) }))
  const net = round2(byRate.reduce((s, r) => s + r.net, 0))
  const vat = round2(byRate.reduce((s, r) => s + r.vat, 0))
  return { net, vat, total: round2(net + vat), byRate }
}

/** A sent quote past its last day counts as expired, whatever was saved. */
export function statusOn(q: Pick<Quote, 'status' | 'valid_until'>, today: string): QuoteStatus {
  return q.status === 'sent' && q.valid_until && q.valid_until < today ? 'expired' : q.status
}

/** A line nobody can quote: no words, no amount, or a negative one. */
export function lineProblem(l: QuoteLine): string | null {
  if (!l.description.trim()) return msg('Every line needs a description')
  if (!(l.quantity > 0)) return msg('Quantities are more than 0')
  if (!(l.unit_price >= 0)) return msg('Prices can’t be below 0')
  if (!VAT_RATES.includes(l.vat_rate)) return msg('Pick one of the IVA rates')
  return null
}
