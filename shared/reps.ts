// Sales reps & rewards: the people who sell the café for it (someone on the team, an ambassador
// from outside, a customer who spreads the word), each with a code for their business cards, and
// the café's own list of what earns a reward. Reps earn commission, paid out; customers earn credit
// to spend in the café. Every reward, spend and payout is a line in a ledger, and a balance is
// what's approved, added up. The database has the same rules (migration …_sales_reps.sql).
// Reach: the people a rep talks to (their followers and the people they see in person); a reward
// can grow with it. Crews: a coach and their fighters; the leader earns a share of what the crew
// earns. Someone an employee adds waits for an admin's OK (the rep_reach_and_crews migration).
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
  tiktok: string | null
  youtube: string | null
  /** Their page's name or address. */
  facebook: string | null
  instagram_followers: number | null
  tiktok_followers: number | null
  youtube_followers: number | null
  facebook_followers: number | null
  /** People they reach in person: a gym's members, a studio's clients, a WhatsApp group. */
  community: number | null
  /** Their followers and the people they see, added up (the database adds them). */
  reach: number
  /** Their profile photo, from Instagram (its links last a few days). */
  picture_url: string | null
  followers_checked_at: string | null
  /** The crew they're in: its leader earns a share of what they earn. */
  leader_id: string | null
  /** False while they wait for an admin's OK (an employee added them, or a rep to their crew). */
  approved: boolean
  phone: string | null
  email: string | null
  notes: string | null
  active: boolean
  created_at: string
  /** Who added them (null: a rep, from their own page). */
  created_by?: string | null
}
export type SalesRepInput = Partial<Omit<SalesRep, 'created_at' | 'created_by' | 'reach' | 'followers_checked_at'>> & { name: string }

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
  /** Bigger for people who reach more (a set amount only): see REACH_TIERS. */
  scales_with_reach: boolean
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
  /** A crew leader's share of this crew member's reward. */
  bonus_for: string | null
  /** ×2, ×3 or ×5 for the rep's reach. */
  multiplier: number | null
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
  /** What a crew's leader earns of what their crew earns, in %. */
  crew_share: number
  /** Rewards that grow with reach do. */
  boost_by_reach: boolean
  /** The café's own words at the top of each rep's page. */
  pitch: string | null
}

/** The ledger's own words for spending credit and paying commission (written by the database in English). */
export const USED_AT_TILL = msg('Used at the till')
export const COMMISSION_PAID = msg('Commission paid')

const round2 = (n: number) => Math.round(n * 100) / 100

/** Can this kind of rep earn this reward? */
export const ruleFits = (rule: Pick<RewardRule, 'who'>, kind: RepKind) =>
  rule.who === 'everyone' || (rule.who === 'customers') === (kind === 'customer')

/**
 * What a reward is worth: its amount (times the rep's reach multiplier when it grows with reach and
 * the café has that on), or its percentage of the sale (nothing without a sale).
 */
export const rewardAmount = (rule: Pick<RewardRule, 'basis' | 'amount'> & { scales_with_reach?: boolean }, sale?: number | null, reach = 0, boost = true) =>
  rule.basis === 'fixed' ? round2(rule.amount * (rule.scales_with_reach && boost ? reachMultiplier(reach) : 1))
    : sale && sale > 0 ? round2(sale * rule.amount / 100) : 0

// ---- Reach ------------------------------------------------------------------------------------------
export type ReachTierId = 'local' | 'rising' | 'big' | 'star'
export interface ReachTier { id: ReachTierId; from: number; multiplier: number; label: string; what: string }
/** The steps a reward that grows with reach takes (the database's reach_multiplier() says the same). */
export const REACH_TIERS: ReachTier[] = [
  { id: 'local', from: 0, multiplier: 1, label: msg('Local voice'), what: msg('Friends, family, the regulars') },
  { id: 'rising', from: 1_000, multiplier: 2, label: msg('Rising voice'), what: msg('A thousand people or more') },
  { id: 'big', from: 10_000, multiplier: 3, label: msg('Big voice'), what: msg('Ten thousand or more: a coach, a club, a local page') },
  { id: 'star', from: 50_000, multiplier: 5, label: msg('Local star'), what: msg('Fifty thousand or more') },
]
export const reachTier = (reach: number | null | undefined) => [...REACH_TIERS].reverse().find(t => (reach ?? 0) >= t.from)!
export const reachMultiplier = (reach: number | null | undefined) => reachTier(reach).multiplier
/** The next step up and how many more people it takes; null at the top. */
export function nextTier(reach: number | null | undefined) {
  const next = REACH_TIERS.find(t => t.from > (reach ?? 0))
  return next ? { tier: next, more: next.from - (reach ?? 0) } : null
}

export type SocialNetwork = 'instagram' | 'tiktok' | 'youtube' | 'facebook'
export const SOCIALS: { id: SocialNetwork; label: string; followers: `${SocialNetwork}_followers`; url: (handle: string) => string }[] = [
  { id: 'instagram', label: 'Instagram', followers: 'instagram_followers', url: h => `https://www.instagram.com/${h}/` },
  { id: 'tiktok', label: 'TikTok', followers: 'tiktok_followers', url: h => `https://www.tiktok.com/@${h}` },
  { id: 'youtube', label: 'YouTube', followers: 'youtube_followers', url: h => `https://www.youtube.com/@${h}` },
  { id: 'facebook', label: 'Facebook', followers: 'facebook_followers', url: h => (/^https?:\/\//i.test(h) ? h : `https://www.facebook.com/${encodeURIComponent(h)}`) },
]
type ReachParts = Partial<Pick<SalesRep, 'instagram_followers' | 'tiktok_followers' | 'youtube_followers' | 'facebook_followers' | 'community'>>
/** Followers and the people they see, added up (as the database's generated `reach`). */
export const reachOf = (r: ReachParts) =>
  (r.instagram_followers ?? 0) + (r.tiktok_followers ?? 0) + (r.youtube_followers ?? 0) + (r.facebook_followers ?? 0) + (r.community ?? 0)

/** A number of people as typed: "12,400", "12.4k", "1.2M", "850". Null when empty; NaN when it isn't one. */
export function parseCount(raw: string | null | undefined): number | null {
  const v = (raw ?? '').trim().toLowerCase().replace(/\s/g, '')
  if (!v) return null
  const m = v.match(/^(\d+(?:[.,]\d+)?)([km])$/)
  if (m) return Math.round(Number(m[1].replace(',', '.')) * (m[2] === 'k' ? 1_000 : 1_000_000))
  return /^\d{1,3}([.,]\d{3})+$|^\d+$/.test(v) ? Number(v.replace(/[.,]/g, '')) : NaN
}

/** A number of people, short: 950, 8.1k, 12k, 1.2M. */
export function formatReach(n: number | null | undefined): string {
  const v = Math.max(0, Math.round(n ?? 0))
  const short = (x: number, unit: string) => `${x >= 10 ? Math.round(x) : Math.round(x * 10) / 10}${unit}`
  if (v >= 999_500) return short(v / 1_000_000, 'M')
  if (v >= 1_000) return short(v / 1_000, 'k')
  return String(v)
}

// ---- Crews ------------------------------------------------------------------------------------------
/** Who is in a leader's crew (active, waiting ones too). */
export const crewOf = (reps: SalesRep[], leaderId: string) => reps.filter(r => r.leader_id === leaderId && r.active)
/** A leader's reach with their crew's (the people who hear about the café through them). */
export const crewReach = (reps: SalesRep[], leader: SalesRep) => leader.reach + crewOf(reps, leader.id).reduce((a, r) => a + r.reach, 0)
/** A crew bonus line's crew member: the database writes "Crew bonus · Name". */
export const bonusFrom = (r: Pick<RepReward, 'label'>) => { const i = r.label.indexOf(' · '); return i >= 0 ? r.label.slice(i + 3) : '' }

/** The café's words for its reps when it hasn't written its own. */
export const DEFAULT_PITCH = msg('Everything here is made by local people, and every new face who comes in because of you keeps it that way. Thank you for talking about us.')

// ---- A rep's own page (/rep/<link>, no sign-in) ------------------------------------------------------
export interface RepPageRule extends Pick<RewardRule, 'id' | 'name' | 'who' | 'basis' | 'amount' | 'scales_with_reach' | 'needs_approval' | 'monthly_limit'> {
  used_this_month: number
}
export interface RepPageData {
  rep: Pick<SalesRep, 'id' | 'name' | 'kind' | 'code' | 'approved' | 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'instagram_followers'
    | 'tiktok_followers' | 'youtube_followers' | 'facebook_followers' | 'community' | 'reach' | 'picture_url'> & { leader: string | null }
  business: { name: string | null; logo: string | null }
  settings: RepSettings
  /** What they can spend or are owed, and what's waiting for an admin. */
  balance: number
  waiting: number
  /** This month: what they earned, how many rewards, their place among everyone who earned (null: nothing yet). */
  month: { earned: number; rewards: number; rank: number | null; people: number }
  rewards: (Pick<RepReward, 'id' | 'kind' | 'label' | 'amount' | 'status' | 'occurred_on' | 'multiplier'> & { bonus: boolean })[]
  crew: { name: string; reach: number; approved: boolean; instagram: string | null; earned_this_month: number; bonus_this_month: number }[]
  rules: RepPageRule[]
}
/** What a rep sends from their page: what they shared, with a note or a link. */
export interface RepClaim { rule_id: string; note?: string | null; proof_url?: string | null; occurred_on?: string | null }
/** Someone a crew's leader adds from their page. */
export interface CrewSuggestion extends Partial<Pick<SalesRep, 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'instagram_followers' | 'tiktok_followers'
  | 'youtube_followers' | 'facebook_followers' | 'community' | 'phone'>> {
  name: string
  note?: string | null
}
/** What Instagram says about an account (it shares followers for people who've messaged the café). */
export interface SocialLookup { found: boolean; followers?: number; name?: string; picture?: string; reason?: string }

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

/** An Instagram (or TikTok) handle as kept: no @, lower case. Null when it isn't one. */
export function cleanInstagram(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, '').replace(/[/?].*$/, '').replace(/^@/, '').toLowerCase()
  return /^[a-z0-9._]{1,30}$/.test(v) ? v : null
}
/** A YouTube handle as kept: no @, lower case (hyphens allowed). Null when it isn't one. */
export function cleanYoutube(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().replace(/^https?:\/\/(www\.)?youtube\.com\/@?/i, '').replace(/[/?].*$/, '').replace(/^@/, '').toLowerCase()
  return /^[a-z0-9._-]{1,30}$/.test(v) ? v : null
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
    who: 'customers', basis: 'fixed', amount: 1, needs_approval: false, monthly_limit: 4, scales_with_reach: true },
  { key: 'post', name: msg('Posted about the café and tagged it'), what: msg('A post or reel of their own, with the café tagged'),
    who: 'customers', basis: 'fixed', amount: 2, needs_approval: true, monthly_limit: 2, scales_with_reach: true },
  { key: 'card', name: msg('Brought a new customer with their card'), what: msg('Someone new shows their business card at the till'),
    who: 'everyone', basis: 'fixed', amount: 3, needs_approval: false, monthly_limit: 10, scales_with_reach: false },
  { key: 'event', name: msg('Booked an event or catering'), what: msg('A party, a meeting, a cake order: a share of what it comes to'),
    who: 'reps', basis: 'percent', amount: 10, needs_approval: true, monthly_limit: null, scales_with_reach: false },
  { key: 'business', name: msg('Brought in a business customer'), what: msg('An office, a hotel or a gym that orders regularly'),
    who: 'reps', basis: 'fixed', amount: 25, needs_approval: true, monthly_limit: null, scales_with_reach: false },
  { key: 'shoutout', name: msg('Gave the café a shout-out'), what: msg('A story or post from a coach, a club or a local page, to all their followers'),
    who: 'reps', basis: 'fixed', amount: 5, needs_approval: true, monthly_limit: 4, scales_with_reach: true },
]
