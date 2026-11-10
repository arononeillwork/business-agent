// Cashback for posts about the café (Sales reps & rewards → Cashback for posts): a rep's post on Instagram
// earns from what it did, so much per 1,000 views, per new follower the café gained in the post's days
// (the day it went out and the two after: shared/postImpact.ts) and per 100 likes, up to a most per post,
// however old the post. The database works it out nightly and logs it (the post_cashback and
// cashback_every_follower migrations, pay_post_cashback()); this says the same for the page.
import { msg } from './i18n'
import type { PostImpact } from './postImpact'

export interface CashbackRates {
  cashback_on: boolean
  cashback_per_1000_views: number
  cashback_per_follower: number
  cashback_per_100_likes: number
  /** The most one post earns. */
  cashback_max: number
  /** An admin approves each before it counts. */
  cashback_needs_approval: boolean
}

/** What every café starts with (the migration's defaults). */
export const CASHBACK_DEFAULTS: CashbackRates = {
  cashback_on: true, cashback_per_1000_views: 0.5, cashback_per_follower: 0.1, cashback_per_100_likes: 0.2, cashback_max: 15, cashback_needs_approval: true,
}
export const CASHBACK_KEYS = Object.keys(CASHBACK_DEFAULTS) as (keyof CashbackRates)[]

/** Less than this isn't logged: every cent a post earns is kept. */
export const CASHBACK_MIN = 0.01

/** The ledger's words for it (written by the database in English). */
export const CASHBACK_LABEL = msg('Cashback for a post')
/** A ledger line that's a post's cashback. */
export const isCashback = (r: { source?: string | null }) => !!r.source?.startsWith('cashback:')

const round2 = (n: number) => Math.round(n * 100) / 100

/** The new followers in a post's three days, when all three are known. */
export const followersIn = (p: Pick<PostImpact, 'gained' | 'days'>) => (p.gained !== null && p.days === 3 ? p.gained : null)

/** What a post earns, and each part of it (before the most a post earns). */
export function cashbackFor(p: Pick<PostImpact, 'views' | 'likes' | 'gained' | 'days'>, r: CashbackRates) {
  const views = (p.views ?? 0) / 1000 * r.cashback_per_1000_views
  const followers = (followersIn(p) ?? 0) * r.cashback_per_follower
  const likes = (p.likes ?? 0) / 100 * r.cashback_per_100_likes
  return { amount: round2(Math.min(r.cashback_max, views + followers + likes)), views: round2(views), followers: round2(followers), likes: round2(likes) }
}

/** Due: its three days' new followers are all in, or a week has gone by (then by views and likes alone). */
export const cashbackDue = (p: Pick<PostImpact, 'at' | 'days' | 'gained'>, today: string) =>
  (p.gained !== null && p.days === 3) || p.at.slice(0, 10) <= addDaysIso(today, -7)

const addDaysIso = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** The rates as the database gives them (numeric columns come as text). */
export const cashbackRates = (row: Partial<Record<keyof CashbackRates, unknown>> | null | undefined): CashbackRates => ({
  cashback_on: row?.cashback_on === undefined ? CASHBACK_DEFAULTS.cashback_on : !!row.cashback_on,
  cashback_per_1000_views: row?.cashback_per_1000_views === undefined ? CASHBACK_DEFAULTS.cashback_per_1000_views : Number(row.cashback_per_1000_views),
  cashback_per_follower: row?.cashback_per_follower === undefined ? CASHBACK_DEFAULTS.cashback_per_follower : Number(row.cashback_per_follower),
  cashback_per_100_likes: row?.cashback_per_100_likes === undefined ? CASHBACK_DEFAULTS.cashback_per_100_likes : Number(row.cashback_per_100_likes),
  cashback_max: row?.cashback_max === undefined ? CASHBACK_DEFAULTS.cashback_max : Number(row.cashback_max),
  cashback_needs_approval: row?.cashback_needs_approval === undefined ? CASHBACK_DEFAULTS.cashback_needs_approval : !!row.cashback_needs_approval,
})
