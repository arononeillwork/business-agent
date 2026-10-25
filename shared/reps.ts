// Sales reps & rewards: the people who sell the café for it (someone on the team, an ambassador
// from outside, a customer who spreads the word), each with a code for their business cards, and
// the café's own list of what earns a reward. Reps earn commission, paid out; customers earn credit
// to spend in the café. Every reward, spend and payout is a line in a ledger, and a balance is
// what's approved, added up. The database has the same rules (migration …_sales_reps.sql).
import { msg } from './i18n'
import type { Mention } from './mentions'

export type RepKind = 'team' | 'ambassador' | 'customer'
export const REP_KINDS: { id: RepKind; label: string; what: string }[] = [
  { id: 'customer', label: msg('Customer'), what: msg('Earns credit to spend in the café') },
  { id: 'ambassador', label: msg('Ambassador'), what: msg('Sells for the café from outside it: earns commission') },
  { id: 'team', label: msg('On the team'), what: msg('Someone on the team: earns commission') },
]
export const kindLabel = (k: RepKind) => REP_KINDS.find(x => x.id === k)!.label
/** Customers earn credit to spend in the café; the team and ambassadors earn commission. */
export const earnsCredit = (k: RepKind) => k === 'customer'

export interface SalesRep {
  id: string
  name: string
  kind: RepKind
  /** Someone on the team (a team rep). */
  profile_id: string | null
  /** The customer they are, on Customers. */
  customer_id: string | null
  /** On their business cards. */
  code: string
  /** Without the @: their stories and posts about the café are matched to them by it. */
  instagram: string | null
  phone: string | null
  email: string | null
  notes: string | null
  active: boolean
  created_at: string
}
export type SalesRepInput = Partial<Omit<SalesRep, 'created_at'>> & { name: string }

/** Who earns a reward on the list: customers (as credit), reps (as commission) or both. */
export type RuleWho = 'everyone' | 'customers' | 'reps'
export const RULE_WHO: { id: RuleWho; label: string }[] = [
  { id: 'everyone', label: msg('Everyone') }, { id: 'customers', label: msg('Customers') }, { id: 'reps', label: msg('Reps') },
]
export interface RewardRule {
  id: string
  name: string
  who: RuleWho
  /** fixed: `amount` euros each time; percent: `amount` % of the sale it brought in. */
  basis: 'fixed' | 'percent'
  amount: number
  /** An admin approves it before it counts. */
  needs_approval: boolean
  /** The most times one person earns it in a calendar month. */
  monthly_limit: number | null
  sort: number
  active: boolean
}
export type RewardRuleInput = Omit<RewardRule, 'id' | 'sort'> & { id?: string; sort?: number }

export type RewardKind = 'earn' | 'redeem' | 'payout'
export type RewardStatus = 'pending' | 'approved' | 'rejected'
export interface RepReward {
  id: string
  rep_id: string
  /** earn: a reward earned; redeem: credit spent in the café; payout: commission paid out. */
  kind: RewardKind
  rule_id: string | null
  /** What it was for, as it was called then. */
  label: string
  sale_amount: number | null
  /** Earned (+), spent or paid out (−). */
  amount: number
  status: RewardStatus
  proof_url: string | null
  /** The Instagram story or post it rewarded. */
  mention_id: string | null
  note: string | null
  occurred_on: string
  logged_by: string | null
  created_at: string
}
export interface RewardLog {
  rep_id: string
  rule_id: string
  sale_amount?: number | null
  note?: string | null
  proof_url?: string | null
  mention_id?: string | null
  occurred_on?: string | null
}
export interface LoggedReward { id: string; status: RewardStatus; amount: number }

export interface RepSettings {
  /** On the business cards, for the new customer ("10% off your first drink"). */
  welcome_offer: string | null
}

/** The ledger's own words for spending credit and paying commission (written by the database in English). */
export const USED_AT_TILL = msg('Used at the till')
export const COMMISSION_PAID = msg('Commission paid')

const round2 = (n: number) => Math.round(n * 100) / 100

/** Can this kind of rep earn this reward? */
export const ruleFits = (rule: Pick<RewardRule, 'who'>, kind: RepKind) =>
  rule.who === 'everyone' || (rule.who === 'customers') === (kind === 'customer')

/** What a reward is worth: its amount, or its percentage of the sale (nothing without a sale). */
export const rewardAmount = (rule: Pick<RewardRule, 'basis' | 'amount'>, sale?: number | null) =>
  rule.basis === 'fixed' ? rule.amount : sale && sale > 0 ? round2(sale * rule.amount / 100) : 0

/** What a rep can spend in the café or is owed: everything approved, added up. */
export const balanceOf = (rewards: RepReward[], repId: string) =>
  round2(rewards.filter(r => r.rep_id === repId && r.status === 'approved').reduce((a, r) => a + r.amount, 0))

const monthOf = (day: string) => day.slice(0, 7)

/** How many times a rep has had a reward in the month of `day` (turned-down ones don't count). */
export const timesInMonth = (rewards: RepReward[], repId: string, ruleId: string, day: string) =>
  rewards.filter(r => r.rep_id === repId && r.rule_id === ruleId && r.kind === 'earn' && r.status !== 'rejected' && monthOf(r.occurred_on) === monthOf(day)).length

/** Has the rep had this reward as many times this month as it allows? */
export const limitReached = (rule: Pick<RewardRule, 'id' | 'monthly_limit'>, rewards: RepReward[], repId: string, day: string) =>
  rule.monthly_limit !== null && timesInMonth(rewards, repId, rule.id, day) >= rule.monthly_limit

export interface Standing { rep: SalesRep; earned: number; rewards: number }
/** The month's best: what each rep earned (approved or waiting), most first. Reps with nothing aren't on it. */
export function leaderboard(reps: SalesRep[], rewards: RepReward[], month: string): Standing[] {
  return reps.map(rep => {
    const mine = rewards.filter(r => r.rep_id === rep.id && r.kind === 'earn' && r.status !== 'rejected' && monthOf(r.occurred_on) === month)
    return { rep, earned: round2(mine.reduce((a, r) => a + r.amount, 0)), rewards: mine.length }
  }).filter(s => s.rewards > 0).sort((a, b) => b.earned - a.earned || b.rewards - a.rewards || a.rep.name.localeCompare(b.rep.name))
}

/** What customers can still spend, and what reps are owed (each added up from the positive balances). */
export function outstanding(reps: SalesRep[], rewards: RepReward[]) {
  let credit = 0, commission = 0
  for (const r of reps) {
    const b = balanceOf(rewards, r.id)
    if (b <= 0) continue
    if (earnsCredit(r.kind)) credit += b
    else commission += b
  }
  return { credit: round2(credit), commission: round2(commission) }
}

/** An Instagram handle as kept: no @, lower case. Null when it isn't one. */
export function cleanInstagram(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().replace(/^@/, '').toLowerCase()
  return /^[a-z0-9._]{1,30}$/.test(v) ? v : null
}

/** A card code as kept: capitals, no spaces; 3 to 12 letters and digits. Null when it isn't one. */
export function cleanRepCode(raw: string | null | undefined): string | null {
  const v = (raw ?? '').toUpperCase().replace(/\s/g, '')
  return /^[A-Z0-9]{3,12}$/.test(v) ? v : null
}

/** A code from a name, as the database makes one: the first word in capitals and two digits ("LUCIA27"). */
export function codeFor(name: string, taken: Set<string>, random = Math.random): string {
  let word = (name.trim().split(/\s+/)[0] ?? '').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  if (word.length < 2) word = 'EB'
  for (let i = 1; i <= 200; i++) {
    const code = i <= 100 ? `${word}${String(Math.floor(random() * 100)).padStart(2, '0')}` : `${word}${String(Math.floor(random() * 1000)).padStart(3, '0')}`
    if (!taken.has(code)) return code
  }
  throw new Error(`No code is free for ${word}`)
}

export interface MentionToReward { mention: Mention; rep: SalesRep | null }
const WEEK = 7 * 86_400_000
/**
 * Stories and posts about the café from the last week still to be rewarded, each with the rep whose
 * Instagram it is (null: nobody with that handle is a rep yet). Each mention is rewarded once.
 */
export function mentionsToReward(mentions: Mention[], reps: SalesRep[], rewards: RepReward[], now = Date.now()): MentionToReward[] {
  const done = new Set(rewards.map(r => r.mention_id).filter(Boolean))
  return mentions.filter(m => m.username && !done.has(m.id) && now - Date.parse(m.mentioned_at) < WEEK).map(m => ({
    mention: m, rep: reps.find(r => r.active && r.instagram === m.username!.toLowerCase()) ?? null,
  }))
}

/** The usual rewards for a café, to add in one press (their names in the person's language). */
export interface RewardIdea extends Omit<RewardRuleInput, 'active'> { key: string; what: string }
export const REWARD_IDEAS: RewardIdea[] = [
  { key: 'story', name: msg('Reposted our story'), what: msg('A customer shares one of the café’s stories, or puts it in their own'),
    who: 'customers', basis: 'fixed', amount: 1, needs_approval: false, monthly_limit: 4 },
  { key: 'post', name: msg('Posted about the café and tagged it'), what: msg('A post or reel of their own, with the café tagged'),
    who: 'customers', basis: 'fixed', amount: 2, needs_approval: true, monthly_limit: 2 },
  { key: 'card', name: msg('Brought a new customer with their card'), what: msg('Someone new shows their business card at the till'),
    who: 'everyone', basis: 'fixed', amount: 3, needs_approval: false, monthly_limit: 10 },
  { key: 'event', name: msg('Booked an event or catering'), what: msg('A party, a meeting, a cake order: a share of what it comes to'),
    who: 'reps', basis: 'percent', amount: 10, needs_approval: true, monthly_limit: null },
  { key: 'business', name: msg('Brought in a business customer'), what: msg('An office, a hotel or a gym that orders regularly'),
    who: 'reps', basis: 'fixed', amount: 25, needs_approval: true, monthly_limit: null },
]
