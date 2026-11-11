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

// ---------------------------------------------------------------------------------------------
// Tips on Square: what customers left on payments at the till, by who took them. Each Square payment
// says which team member took it, and each person is linked to their own Square login (shared/squareTeam.ts),
// so everyone sees their own tips; owners (admins with pay access) see everyone's.
// ---------------------------------------------------------------------------------------------

/** One Square team member's tips: in all, and day by day (the business's days, YYYY-MM-DD). `tipped`: payments with a tip. */
export interface MemberTips { tips: number; tipped: number; days: Record<string, { tips: number; tipped: number }> }

export type TillTipsStatus = 'ok' | 'plan' | 'not_connected' | 'reconnect' | 'not_linked'
export interface TillTipsDay { date: string; tips: number; tipped: number }
export interface PersonTillTips { profile_id: string; tips: number; tipped: number; days: TillTipsDay[] }
/** Tips left on Square over a period; a status other than ok says why there's nothing to show. */
export interface TillTips {
  status: TillTipsStatus
  /** Each person linked to their Square login, most tips first: everyone for owners, only themselves for anyone else. */
  people: PersonTillTips[]
  /** Owners only (null for anyone else): tips on payments taken by someone in Square not linked to anyone here, or by nobody signed in. */
  unlinked: { tips: number; tipped: number } | null
  currency: string
  fetched_at: string | null
}
export const emptyTillTips = (status: TillTipsStatus): TillTips => ({ status, people: [], unlinked: null, currency: 'EUR', fetched_at: null })

/**
 * Square's tips by team member, as people: owners (`everyone`) get every person linked to a Square login
 * and the tips nobody here took; anyone else only their own, or not_linked without a Square login linked.
 */
export function tipsByPerson(byMember: Record<string, MemberTips>, links: { profile_id: string; team_member_id: string }[],
  who: { me: string; everyone: boolean }): Pick<TillTips, 'status' | 'people' | 'unlinked'> {
  const round2 = (n: number) => Math.round(n * 100) / 100
  const shown = links.filter(l => who.everyone || l.profile_id === who.me)
  if (!who.everyone && !shown.length) return { status: 'not_linked', people: [], unlinked: null }
  const people = shown.map(l => {
    const m = byMember[l.team_member_id]
    const days = Object.entries(m?.days ?? {}).map(([date, d]) => ({ date, tips: d.tips, tipped: d.tipped })).sort((a, b) => a.date.localeCompare(b.date))
    return { profile_id: l.profile_id, tips: m?.tips ?? 0, tipped: m?.tipped ?? 0, days }
  }).sort((a, b) => b.tips - a.tips)
  if (!who.everyone) return { status: 'ok', people, unlinked: null }
  const linked = new Set(links.map(l => l.team_member_id))
  const others = Object.entries(byMember).filter(([member]) => !linked.has(member)).map(([, m]) => m)
  return { status: 'ok', people, unlinked: { tips: round2(others.reduce((s, m) => s + m.tips, 0)), tipped: others.reduce((s, m) => s + m.tipped, 0) } }
}
