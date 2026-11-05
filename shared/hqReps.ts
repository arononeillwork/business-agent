// Business Agent's own reps (the hq_reps migration, docs/REPS_PLAN.md): people who sell Business Agent
// to business owners, run as Business Agent HQ's reps on its Sales reps & rewards page. A business that
// signs up with a rep's code is on HQ's list with how it's doing; what it pays earns the rep commission.
import { msg } from './i18n'

/** The kinds of business a rep covers: the kinds a business picks at sign-up. */
export type BusinessKind = 'cafe' | 'restaurant' | 'pub' | 'salon' | 'real_estate' | 'other'
export const BUSINESS_KINDS: { id: BusinessKind; label: string }[] = [
  { id: 'cafe', label: msg('Café & coffee shop') },
  { id: 'restaurant', label: msg('Restaurant & bar') },
  { id: 'pub', label: msg('Pub') },
  { id: 'salon', label: msg('Salon & beauty') },
  { id: 'real_estate', label: msg('Real estate agency') },
  { id: 'other', label: msg('Something else') },
]
export const businessKindLabel = (k: string) => (BUSINESS_KINDS.find(x => x.id === k) ?? BUSINESS_KINDS[5]).label

/** Who a rep's code is, for the landing page and Add my business. */
export interface RepCodeInfo {
  name: string
  /** The kinds of business they cover (the first one is picked to start with, when there's one). */
  categories: BusinessKind[]
  /** What their cards offer ("Your first month free, and I'll set it up with you"). */
  offer: string | null
}

/** What a referral link or code turned out to be: another business's, or a Business Agent rep's. */
export interface ReferralOpen {
  business?: string
  rep?: RepCodeInfo
}

/** A business on HQ's list (HQ's admins). */
export interface RepIntroduction {
  id: string
  rep_id: string | null
  name: string
  kind: BusinessKind
  /** The code it signed up with. */
  code: string
  set_up_at: string | null
  plan: string
  /** Stripe's subscription status ('none' before any). */
  status: string
  billing_interval: 'month' | 'year' | null
  first_paid_at: string | null
  created_at: string
}

/** A business on a rep's own page. */
export interface RepPageBusiness {
  name: string
  kind: BusinessKind
  since: string
  set_up_at: string | null
  plan: string
  status: string
  interval: 'month' | 'year' | null
  first_paid_at: string | null
  /** Of its 12 paid months that earn commission, how many so far. */
  months_paid: number
  /** What it has earned the rep so far (refunds taken off). */
  earned: number
}

/** The rep's page, for a Business Agent rep: their businesses, and the rewards that count by themselves. */
export interface RepPageHq {
  businesses: RepPageBusiness[]
  /** Rewards a rep doesn't send in: they count when a business pays. */
  automatic: string[]
}

/** How long commission waits before it counts, in case of a refund. */
export const HOLD_DAYS = 30
/** The paid months that earn a rep commission, for each business. */
export const PAID_MONTHS = 12

export type IntroStage = 'signed_up' | 'set_up' | 'trial' | 'paying' | 'behind' | 'cancelled' | 'complimentary'
export const INTRO_STAGES: { id: IntroStage; label: string; tone: 'good' | 'info' | 'warn' | 'bad' | 'neutral' }[] = [
  { id: 'signed_up', label: msg('Signed up'), tone: 'neutral' },
  { id: 'set_up', label: msg('All set up'), tone: 'neutral' },
  { id: 'trial', label: msg('On a free trial'), tone: 'info' },
  { id: 'paying', label: msg('Paying'), tone: 'good' },
  { id: 'behind', label: msg('Payment failed'), tone: 'warn' },
  { id: 'cancelled', label: msg('Cancelled'), tone: 'bad' },
  { id: 'complimentary', label: msg('Complimentary'), tone: 'neutral' },
]
export const stageInfo = (s: IntroStage) => INTRO_STAGES.find(x => x.id === s)!

/** Where a business a rep brought is: from its billing as Stripe has it, and whether it's set up. */
export function introStage(i: { status: string; plan: string; set_up_at: string | null }): IntroStage {
  if (i.status === 'comped') return 'complimentary'
  if (i.status === 'trialing') return 'trial'
  if (i.status === 'active') return i.plan === 'free' ? (i.set_up_at ? 'set_up' : 'signed_up') : 'paying'
  if (['past_due', 'unpaid', 'incomplete'].includes(i.status)) return 'behind'
  if (['canceled', 'incomplete_expired', 'paused'].includes(i.status)) return 'cancelled'
  return i.set_up_at ? 'set_up' : 'signed_up'
}

export interface CategoryCount { kind: BusinessKind; signedUp: number; setUp: number; paying: number; reps: number }

/**
 * HQ's numbers by kind of business: the businesses that signed up, those set up (or further), those
 * paying now, and the reps who cover it. Only kinds with a rep or a business.
 */
export function byCategory(intros: Pick<RepIntroduction, 'kind' | 'status' | 'plan' | 'set_up_at'>[], reps: { categories: string[]; active: boolean }[]): CategoryCount[] {
  return BUSINESS_KINDS.map(({ id }) => {
    const mine = intros.filter(i => i.kind === id)
    const stages = mine.map(introStage)
    return {
      kind: id,
      signedUp: mine.length,
      setUp: stages.filter(s => s !== 'signed_up').length,
      paying: stages.filter(s => s === 'paying').length,
      reps: reps.filter(r => r.active && r.categories.includes(id)).length,
    }
  }).filter(c => c.signedUp > 0 || c.reps > 0)
}
