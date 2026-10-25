// Tips: what customers left over a period (cash in the jar, card tips from the till) shared out
// among the team, by the hours each person worked (Timecards) or equally. Everyone sees their own
// share; admins with pay access share them out and mark them paid.
import { msg } from './i18n'
import type { TimeEntry } from './types'

export type TipSplit = 'hours' | 'equal'
export const TIP_SPLITS: { id: TipSplit; label: string }[] = [
  { id: 'hours', label: msg('By hours worked') }, { id: 'equal', label: msg('Equally') },
]
export const splitLabel = (s: TipSplit) => TIP_SPLITS.find(x => x.id === s)!.label

export type PoolStatus = 'draft' | 'shared' | 'paid'
export const POOL_STATUSES: { id: PoolStatus; label: string }[] = [
  { id: 'draft', label: msg('Draft') }, { id: 'shared', label: msg('Shared out') }, { id: 'paid', label: msg('Paid') },
]
export const poolStatusLabel = (s: PoolStatus) => POOL_STATUSES.find(x => x.id === s)!.label

export interface TipShare {
  profile_id: string
  /** Paid minutes worked in the period (from timecards). */
  minutes: number
  amount: number
}

export interface TipPool {
  id: string
  starts_on: string
  ends_on: string
  cash: number
  card: number
  split: TipSplit
  status: PoolStatus
  notes: string | null
  shares: TipShare[]
  created_at: string
}
export type TipPoolInput = Pick<TipPool, 'starts_on' | 'ends_on' | 'cash' | 'card' | 'split' | 'status'> & Partial<Pick<TipPool, 'notes'>> & { id?: string }

/** Each person's paid minutes worked from one day to another (inclusive), from their timecards. */
export function minutesWorked(entries: Pick<TimeEntry, 'profile_id' | 'work_date' | 'paid_minutes'>[], from: string, to: string) {
  const out = new Map<string, number>()
  for (const e of entries) if (e.work_date >= from && e.work_date <= to) out.set(e.profile_id, (out.get(e.profile_id) ?? 0) + e.paid_minutes)
  return out
}

/**
 * The total shared out, to the cent: by minutes worked or equally. The cents left over by rounding
 * go one each to those with the biggest remainders, so the shares always add up to the total.
 * People with no minutes get nothing when it's by hours.
 */
export function splitTips(total: number, people: { profile_id: string; minutes: number }[], split: TipSplit): TipShare[] {
  const sharing = split === 'hours' ? people.filter(p => p.minutes > 0) : people
  const weight = (p: { minutes: number }) => (split === 'hours' ? p.minutes : 1)
  const all = sharing.reduce((s, p) => s + weight(p), 0)
  const cents = Math.round(total * 100)
  if (!all || cents <= 0) return sharing.map(p => ({ profile_id: p.profile_id, minutes: p.minutes, amount: 0 }))
  const exact = sharing.map(p => (cents * weight(p)) / all)
  const base = exact.map(Math.floor)
  let left = cents - base.reduce((s, n) => s + n, 0)
  const order = exact.map((x, i) => ({ i, rest: x - base[i] })).sort((a, b) => b.rest - a.rest || a.i - b.i)
  for (const { i } of order) { if (left <= 0) break; base[i]++; left-- }
  return sharing.map((p, i) => ({ profile_id: p.profile_id, minutes: p.minutes, amount: base[i] / 100 }))
}

/** What one person got from the pools shared out with them, and how much of it is still to be paid. */
export function myTips(pools: TipPool[], profileId: string) {
  const mine = pools.filter(p => p.status !== 'draft').flatMap(p => p.shares.filter(s => s.profile_id === profileId).map(s => ({ pool: p, share: s })))
  const round2 = (n: number) => Math.round(n * 100) / 100
  return { list: mine, total: round2(mine.reduce((s, x) => s + x.share.amount, 0)), unpaid: round2(mine.filter(x => x.pool.status === 'shared').reduce((s, x) => s + x.share.amount, 0)) }
}
