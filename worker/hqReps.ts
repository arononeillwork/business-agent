// Business Agent's own reps (the hq_reps migration, docs/REPS_PLAN.md). A business that signed up with
// a rep's code is on HQ's list; what it pays for its plan, from Stripe, becomes that rep's commission on
// HQ's ledger, and a refund (or a dispute lost) takes it back. The database works the amounts out from
// HQ's own list, holds each line 30 days and counts each invoice once (record_rep_commission,
// reverse_rep_commission), so these only pass on what Stripe says.
import { businessDb, type Env } from './supabase'

/** The parts of a Stripe invoice (API 2024-06-20) the commission needs. */
export interface StripeInvoice {
  id: string
  customer: string | null
  /** Cents actually paid (after any credit on the customer's balance, such as a free month). */
  amount_paid: number
  /** Cents, with tax. */
  total: number
  total_excluding_tax?: number | null
  tax?: number | null
  status_transitions?: { paid_at?: number | null } | null
  lines?: { data: { price?: { recurring?: { interval?: string | null } | null } | null }[] } | null
}

/** The parts of a Stripe charge a refund needs. */
export interface StripeCharge {
  id: string
  customer: string | null
  invoice: string | null
  amount: number
  amount_refunded: number
}

/**
 * What a paid invoice counts for: the euros paid without IVA and how many months of the plan it was
 * for (12 for a year). Null when it earns nothing: nothing paid (a trial, a free month), or no plan on
 * it (pay-per-use billed on its own).
 */
export function invoiceCommission(inv: StripeInvoice): { amount: number; months: number; paidAt: string } | null {
  const plan = inv.lines?.data.find(l => l.price?.recurring?.interval)
  if (!plan || !(inv.amount_paid > 0) || !(inv.total > 0)) return null
  const withoutTax = inv.total_excluding_tax ?? inv.total - (inv.tax ?? 0)
  const amount = Math.round((inv.amount_paid * withoutTax) / inv.total) / 100
  if (!(amount > 0)) return null
  const paid = inv.status_transitions?.paid_at
  return {
    amount,
    months: plan.price!.recurring!.interval === 'year' ? 12 : 1,
    paidAt: (paid ? new Date(paid * 1000) : new Date()).toISOString(),
  }
}

/** How much of a charge has been given back so far, 0 to 1. */
export const refundShare = (ch: StripeCharge) => (ch.amount > 0 ? Math.min(1, Math.max(0, ch.amount_refunded / ch.amount)) : 0)

/** A business paid an invoice: its rep's lines on HQ's ledger, if a rep introduced it. Returns how many. */
export async function recordCommission(env: Env, businessId: number, inv: StripeInvoice): Promise<number> {
  const c = invoiceCommission(inv)
  if (!c) return 0
  const { data, error } = await businessDb(env, businessId).rpc('record_rep_commission', {
    p_invoice: inv.id, p_amount: c.amount, p_months: c.months, p_paid_at: c.paidAt })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

/** Part or all of a business's invoice was given back: its rep's lines for it follow. Returns how many changed. */
export async function reverseCommission(env: Env, businessId: number, invoice: string, share: number): Promise<number> {
  if (!/^in_\w+$/.test(invoice) || !(share > 0)) return 0
  const { data, error } = await businessDb(env, businessId).rpc('reverse_rep_commission', { p_invoice: invoice, p_share: Math.min(1, share) })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}
