// Expenses: what someone on the team spent for the business (parking, a supplier run,
// supplies bought in a hurry) or drove for it in their own car, sent for an admin to approve and
// pay back. Not the running costs (Finances): those are the business's own monthly bills.
import { msg } from './i18n'

export type ClaimKind = 'expense' | 'mileage'
export type ClaimStatus = 'submitted' | 'approved' | 'rejected' | 'paid'
export const CLAIM_STATUSES: { id: ClaimStatus; label: string }[] = [
  { id: 'submitted', label: msg('To approve') }, { id: 'approved', label: msg('To pay back') },
  { id: 'paid', label: msg('Paid back') }, { id: 'rejected', label: msg('Turned down') },
]
export const claimStatusLabel = (s: ClaimStatus) => CLAIM_STATUSES.find(x => x.id === s)!.label

/** Offered in the list; any other category typed is kept too. Saved in English (shown with t()). */
export const CLAIM_CATEGORIES = [msg('Fuel'), msg('Parking & tolls'), msg('Supplies'), msg('Travel'), msg('Meals'), msg('Phone & internet'), msg('Other')]

/**
 * Euros a kilometre for a private car: what Spain lets a business pay back without tax (€0.26 since
 * July 2023). A business can pay more, but the extra is taxed as pay: check with the gestoría.
 */
export const DEFAULT_MILEAGE_RATE = 0.26

export interface ExpenseClaim {
  id: string
  profile_id: string
  kind: ClaimKind
  spent_on: string
  description: string
  category: string | null
  /** What's paid back. Mileage: the kilometres times the rate (the database works it out). */
  amount: number
  km: number | null
  rate_per_km: number | null
  /** Mileage: there and back counts the kilometres twice. */
  return_trip: boolean
  from_place: string | null
  to_place: string | null
  status: ClaimStatus
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  paid_on: string | null
  /** The receipt, kept with the tax documents (Tax › Expenses). */
  document_id: string | null
  created_at: string
  document?: { name: string; link: string | null } | null
}
export type ClaimInput = Partial<Omit<ExpenseClaim, 'id' | 'profile_id' | 'decided_by' | 'decided_at' | 'created_at' | 'document'>> & { id?: string; description: string }

const round2 = (n: number) => Math.round(n * 100) / 100

/** A trip's amount: kilometres (twice there and back) times the rate. */
export const mileageAmount = (km: number, rate: number, returnTrip = false) => round2(km * (returnTrip ? 2 : 1) * rate)

/** Kilometres a trip counts for. */
export const tripKm = (c: Pick<ExpenseClaim, 'km' | 'return_trip'>) => (c.km ?? 0) * (c.return_trip ? 2 : 1)

export interface ClaimTotals { toApprove: number; toPayBack: number; paidSince: number; km: number }

/** What's waiting on an admin, what's owed back, and what was paid back (and driven) since a day. */
export function claimTotals(list: Pick<ExpenseClaim, 'status' | 'amount' | 'paid_on' | 'spent_on' | 'kind' | 'km' | 'return_trip'>[], from: string): ClaimTotals {
  const sum = (xs: typeof list) => round2(xs.reduce((s, c) => s + c.amount, 0))
  return {
    toApprove: sum(list.filter(c => c.status === 'submitted')),
    toPayBack: sum(list.filter(c => c.status === 'approved')),
    paidSince: sum(list.filter(c => c.status === 'paid' && (c.paid_on ?? '') >= from)),
    km: list.filter(c => c.kind === 'mileage' && c.status !== 'rejected' && c.spent_on >= from).reduce((s, c) => s + tripKm(c), 0),
  }
}
