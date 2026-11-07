// The Business Agent's back-office funnel (the Businesses page, HQ's admins only; the hq_funnel migration):
// of the businesses that signed up, how many finished setting up, were in use in their second week, are on
// a trial, pay, and cancelled, each with its share, and the cancellations of the last 12 months by month.
// Set-up, trials and paying come from HQ's list (public.hq_businesses()); week two and cancellations from
// public.hq_funnel(), business by business. HQ itself isn't one of the businesses counted.

/** Billing statuses that count as paying, as the page's Paying tile counts them (a failed renewal still pays). */
export const PAYING_STATUSES = ['active', 'past_due']

/** What the funnel needs of a business on HQ's list. */
export interface FunnelBusiness { id: number; is_hq: boolean; status: string; set_up_at: string | null }

/** A business's second week and cancellation (public.hq_funnel()). */
export interface HqFunnelRow {
  id: number
  /**
   * Someone in it clocked in, added a shift or changed something (the audit log) from day 7 to day 14
   * after it signed up. Null while it's younger than 14 days: not yet, rather than no.
   */
  active_week_two: boolean | null
  /** An owner asked to close the account, or (unless complimentary now) its Stripe subscription was cancelled. */
  cancelled: boolean
  /** When: the earlier of the two. Null when not cancelled, or cancelled before Stripe's date was kept. */
  cancelled_at: string | null
}

export type FunnelStepId = 'signed_up' | 'set_up' | 'week_two' | 'trial' | 'paying' | 'cancelled'

export interface FunnelStep {
  id: FunnelStepId
  count: number
  /** What its share is of: the sign-ups; for week two, the businesses at least 14 days old. */
  of: number
}

export interface Funnel {
  steps: FunnelStep[]
  /** Businesses younger than 14 days, whose week two isn't over: left out of its share. */
  weekTwoNotYet: number
  /** Cancellations in each of the last 12 months, oldest first ('2026-11'), this month last. */
  byMonth: { month: string; count: number }[]
  /** Cancelled with no date yet (the nightly check with Stripe fills it in). */
  undated: number
}

/** A count's share of what it's of (0 when that's nothing). */
export const share = (s: Pick<FunnelStep, 'count' | 'of'>) => (s.of > 0 ? s.count / s.of : 0)

/** The month a moment falls in, where the funnel is looked at ('2026-11'). */
export const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** The last `n` months up to the one `now` is in, oldest first. */
export function lastMonths(now: Date, n = 12): string[] {
  return Array.from({ length: n }, (_, i) => monthOf(new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)))
}

export function hqFunnel(list: FunnelBusiness[], rows: HqFunnelRow[], now = new Date()): Funnel {
  const facts = new Map(rows.map(r => [r.id, r]))
  const businesses = list.filter(b => !b.is_hq)
  // A business hq_funnel() didn't answer for yet (it signed up between the two) is too new to tell.
  const weekTwo = businesses.map(b => facts.get(b.id)?.active_week_two ?? null)
  const cancelled = businesses.map(b => facts.get(b.id)).filter((f): f is HqFunnelRow => !!f?.cancelled)
  const n = businesses.length
  const months = lastMonths(now)
  const inMonth = new Map(months.map(m => [m, 0]))
  for (const f of cancelled) {
    const m = f.cancelled_at ? monthOf(new Date(f.cancelled_at)) : null
    if (m && inMonth.has(m)) inMonth.set(m, inMonth.get(m)! + 1)
  }
  return {
    steps: [
      { id: 'signed_up', count: n, of: n },
      { id: 'set_up', count: businesses.filter(b => b.set_up_at).length, of: n },
      { id: 'week_two', count: weekTwo.filter(w => w === true).length, of: weekTwo.filter(w => w !== null).length },
      { id: 'trial', count: businesses.filter(b => b.status === 'trialing').length, of: n },
      { id: 'paying', count: businesses.filter(b => PAYING_STATUSES.includes(b.status)).length, of: n },
      { id: 'cancelled', count: cancelled.length, of: n },
    ],
    weekTwoNotYet: weekTwo.filter(w => w === null).length,
    byMonth: months.map(month => ({ month, count: inMonth.get(month)! })),
    undated: cancelled.filter(f => !f.cancelled_at).length,
  }
}
