// Accounts & rewards on the business's own website (docs/WEBSITE.md → Accounts & rewards): what the
// website's server is told about someone signed in there. Their points are Square Loyalty's, read by the
// Worker (worker/siteAccount.ts); their credit is the reps ledger's, its balance the same as on their rep
// page (the site_accounts migration's site_account_summary()); how a post earns cashback is the café's
// rates (shared/cashback.ts). The contract only grows: fields are added, never renamed or removed.
import { earnsCredit, reachMultiplier, reachTier, type ReachTierId, type RepKind, type RewardStatus } from './reps'

/** POST /account/sync: who they are here. */
export interface SiteAccountSync {
  customer_id: string
  /** Made just now (from the website); false: they were on Customers already. */
  created: boolean
  /** They're an active rep with the café's OK. */
  is_rep: boolean
  /** What was sent but not kept: "phone" (not a phone number), "square_customer_id" (on someone else, or they have another). */
  ignored: string[]
}

/** Their Square Loyalty points (the programme's own words for them, "Bean" and "Beans"). */
export interface SitePoints {
  program: { one: string; other: string; tiers: { id: string; name: string; points: number }[] }
  balance: number
  lifetime: number
}

/** A line of their credit: earned (+), spent, paid out or taken back (−). Dates YYYY-MM-DD. */
export interface SiteCreditLine {
  date: string
  label: string
  amount: number
  status: RewardStatus
  /** Only what the app writes itself (a post's views and likes, a spend at the till), never the team's notes. */
  note: string | null
}

export interface SiteCredit {
  /** What's approved, added up: what the rep page shows (rep_balance()). */
  balance: number
  /** What's waiting for an admin. */
  pending: number
  /** Their credit is on a Square gift card on file too (spent at the till with it). */
  gift_card_linked: boolean
  /** The last 20, newest first. */
  lines: SiteCreditLine[]
}

/** How a post about the café earns cashback (amounts in the business's currency). */
export interface SiteCashback { on: true; per_1000_views: number; per_100_likes: number; per_follower: number; max: number }

export interface SiteRep {
  code: string
  kind: RepKind
  earns: 'credit' | 'commission'
  reach: number
  /** The reach step's name ("Local voice"), and its id to word it on the website. */
  reach_step: string
  reach_step_id: ReachTierId
  /** What rewards that grow with reach are multiplied by for them (1 when the café has that off). */
  multiplier: number
  crew: { leads: boolean; members: number }
  /** Earned this month (what's waiting included, not what was turned down). */
  this_month: number
}

/** POST /account/summary. `customer: null` alone: the email isn't on Customers (the website then calls sync). */
export interface SiteAccountSummary {
  customer: { id: string; first_name: string | null } | null
  points?: SitePoints | null
  credit?: SiteCredit | null
  cashback?: SiteCashback | null
  rep?: SiteRep | null
}

/** POST /account/erase. kept: "ledger" when their ledger lines stay (blanked), null when they're gone. */
export interface SiteAccountErase { erased: true; kept: 'ledger' | null; found: boolean }

/** What site_account_summary() gives the Worker. */
export interface SummaryRow {
  customer: { id: string; first_name: string | null } | null
  square_customer_id?: string | null
  credit?: SiteCredit | null
  cashback?: SiteCashback | null
  rep?: { code: string; kind: RepKind; reach: number; boost_by_reach: boolean; crew_members: number; this_month: number } | null
}

const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100

/** The summary the website gets: the database's, with the points and the rep's reach step in words. Never the Square id. */
export function siteSummary(row: SummaryRow, points: SitePoints | null): SiteAccountSummary {
  if (!row.customer) return { customer: null }
  const credit = row.credit ? {
    balance: num(row.credit.balance), pending: num(row.credit.pending), gift_card_linked: !!row.credit.gift_card_linked,
    lines: (row.credit.lines ?? []).map(l => ({ date: l.date, label: l.label, amount: num(l.amount), status: l.status, note: l.note ?? null })),
  } : null
  const cashback = row.cashback ? {
    on: true as const, per_1000_views: num(row.cashback.per_1000_views), per_100_likes: num(row.cashback.per_100_likes),
    per_follower: num(row.cashback.per_follower), max: num(row.cashback.max),
  } : null
  const r = row.rep
  const step = r ? reachTier(r.reach) : null
  const rep: SiteRep | null = r && step ? {
    code: r.code, kind: r.kind, earns: earnsCredit(r.kind) ? 'credit' : 'commission', reach: Number(r.reach ?? 0),
    reach_step: step.label, reach_step_id: step.id, multiplier: r.boost_by_reach ? reachMultiplier(r.reach) : 1,
    crew: { leads: Number(r.crew_members) > 0, members: Number(r.crew_members ?? 0) }, this_month: num(r.this_month),
  } : null
  return { customer: { id: row.customer.id, first_name: row.customer.first_name ?? null }, points, credit, cashback, rep }
}
