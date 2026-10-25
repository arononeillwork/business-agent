// Loyalty, stamp cards and gift cards, read from Square (the till). The programme itself (what a
// point is called, how it's earned, what it buys) is set up in the Square Dashboard; earning and
// redeeming happen at the till. A programme that gives points per visit is the café's stamp card:
// one stamp a visit, the reward at the first tier ("Buy 9, the 10th is free").
// Gift cards: only the last 4 digits of a card number ever leave the Worker.
import { msg } from './i18n'

export interface LoyaltyTier { id: string; name: string; points: number }

export interface LoyaltyProgram {
  /** What a point is called, one and several ("Stamp", "Stamps"; "Bean", "Beans"). */
  one: string
  other: string
  /** Points per visit (a stamp card), when that's how points are earned. */
  per_visit: number | null
  /** The smallest spend that earns a visit's points (euros), if the programme sets one. */
  minimum_spend: number | null
  /** Points per amount spent ("1 point per €1"), when that's how points are earned. */
  per_spend: { points: number; amount: number } | null
  tiers: LoyaltyTier[]
}

export interface LoyaltyMember {
  id: string
  customer_id: string | null
  /** From the app's Customers (by Square id) or Square's directory; null when unknown. */
  name: string | null
  balance: number
  lifetime: number
  enrolled_at: string | null
  /** The last time points were earned. */
  last_visit: string | null
}

export type LoyaltyEventKind = 'earn' | 'redeem' | 'adjust' | 'expire' | 'other'
export interface LoyaltyEvent { id: string; kind: LoyaltyEventKind; points: number; at: string; account_id: string; reason?: string | null }

export interface LoyaltyState {
  /** ok; no_program: none set up in Square yet; reconnect: Square was connected without loyalty access. */
  status: 'ok' | 'no_program' | 'reconnect'
  program: LoyaltyProgram | null
  members: LoyaltyMember[]
  events: LoyaltyEvent[]
  /** When the service was last asked (the Worker keeps its answer a while: shared/refresh.ts). */
  fetched_at?: string
}

export type GiftCardState = 'ACTIVE' | 'PENDING' | 'DEACTIVATED' | 'BLOCKED'
export interface GiftCard {
  id: string
  /** The last 4 digits of the card number (GAN). */
  last4: string
  type: 'DIGITAL' | 'PHYSICAL'
  state: GiftCardState
  balance: number
  created_at: string
  customer_id: string | null
  customer: string | null
}
export type GiftCardActivityKind = 'activate' | 'load' | 'redeem' | 'clear' | 'other'
export interface GiftCardActivity { id: string; kind: GiftCardActivityKind; amount: number; at: string; last4: string; balance: number | null }

export interface GiftCards {
  status: 'ok' | 'reconnect'
  currency: string
  cards: GiftCard[]
  activities: GiftCardActivity[]
  /** When the service was last asked (the Worker keeps its answer a while: shared/refresh.ts). */
  fetched_at?: string
}

/** A card number as shown anywhere: its last 4 digits. */
export const last4 = (gan: string | null | undefined) => (gan ?? '').replace(/\D/g, '').slice(-4)

/** The stamp card: how many stamps fill it (the first reward's points). Null: not a stamp card. */
export function stampCard(p: LoyaltyProgram | null): { per_visit: number; size: number; reward: string } | null {
  if (!p?.per_visit || !p.tiers.length) return null
  const first = [...p.tiers].sort((a, b) => a.points - b.points)[0]
  return { per_visit: p.per_visit, size: Math.max(1, Math.round(first.points / p.per_visit)), reward: first.name }
}

/** Stamps on a member's card now (a full card's worth already means a reward is waiting). */
export function stampsOf(balance: number, p: LoyaltyProgram | null) {
  const card = stampCard(p)
  if (!card) return null
  const stamps = Math.floor(Math.max(0, balance) / card.per_visit)
  return { stamps: stamps % card.size, rewards: Math.floor(stamps / card.size), size: card.size }
}

/** Headline figures: members, points outstanding, and this month's points earned and rewards redeemed. */
export function loyaltyTotals(s: LoyaltyState, month: string) {
  const inMonth = (e: LoyaltyEvent) => e.at.slice(0, 7) === month
  return {
    members: s.members.length,
    outstanding: s.members.reduce((n, m) => n + Math.max(0, m.balance), 0),
    earned_this_month: s.events.filter(e => e.kind === 'earn' && inMonth(e)).reduce((n, e) => n + e.points, 0),
    redeemed_this_month: s.events.filter(e => e.kind === 'redeem' && inMonth(e)).length,
  }
}

/** Points earned and rewards redeemed per day, every day from `from` to `to` (YYYY-MM-DD, inclusive) shown. */
export function loyaltyByDay(events: LoyaltyEvent[], from: string, to: string) {
  const days: { date: string; earned: number; redeemed: number }[] = []
  for (let d = from; d <= to; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) days.push({ date: d, earned: 0, redeemed: 0 })
  const at = new Map(days.map(d => [d.date, d]))
  for (const e of events) {
    const day = at.get(e.at.slice(0, 10))
    if (!day) continue
    if (e.kind === 'earn') day.earned += e.points
    if (e.kind === 'redeem') day.redeemed += 1
  }
  return days
}

/** Gift cards: how many are live, what's still owed on them (a liability), and what was sold this month. */
export function giftCardTotals(g: GiftCards, month: string) {
  const live = g.cards.filter(c => c.state === 'ACTIVE')
  const sold = g.activities.filter(a => (a.kind === 'activate' || a.kind === 'load') && a.at.slice(0, 7) === month)
  return {
    active: live.length,
    outstanding: Math.round(live.reduce((n, c) => n + c.balance, 0) * 100) / 100,
    sold_this_month: Math.round(sold.reduce((n, a) => n + a.amount, 0) * 100) / 100,
  }
}

/** A gift card amount the app will sell: €5 to €1,000, in cents. */
export function giftCardAmountProblem(amount: number) {
  if (!Number.isFinite(amount) || amount < 5) return msg('Gift cards start at €5')
  if (amount > 1000) return msg('Gift cards go up to €1,000')
  if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) return msg('Use euros and cents')
  return null
}

/** Goodwill points: a whole number, not zero, within ±1,000. */
export function adjustProblem(points: number) {
  if (!Number.isInteger(points) || points === 0) return msg('Give a whole number of points, not zero')
  if (Math.abs(points) > 1000) return msg('Adjust by up to 1,000 points at a time')
  return null
}

/** Where a programme is set up (Square Dashboard → Loyalty). */
export const SQUARE_LOYALTY_SETUP = 'https://app.squareup.com/dashboard/loyalty'
export const SQUARE_GIFT_CARDS = 'https://app.squareup.com/dashboard/gift-cards'
