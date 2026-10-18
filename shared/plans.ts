// Business Agent's plans: names, prices, limits and what each includes. Used by the pricing page,
// the Billing page, feature locks in the app and the Worker (Stripe Checkout).
// The limits and features are enforced by the database (migration 36, `plan_limits` and
// `plan_features`); plans.test.ts checks that migration still matches this file.

export type PlanId = 'free' | 'starter' | 'pro' | 'business'
export type Interval = 'month' | 'year'

/** Paid parts of the app a plan may or may not include. Everything else is on every plan. */
export type Feature = 'google_maps' | 'apps' | 'whatsapp' | 'takings' | 'sports' | 'music' | 'kiosk' | 'partners'

export interface PlanLimits {
  /** Active admins and employees. null: no limit. */
  people: number | null
  /** Instagram, Facebook and TikTok accounts connected at once. */
  socialAccounts: number
  /** Social posts scheduled per calendar month. null: no limit. */
  postsPerMonth: number | null
}

export interface Plan {
  id: PlanId
  name: string
  blurb: string
  /** Euros a month on monthly billing, VAT not included. */
  monthly: number
  /** Euros a year on yearly billing (two months free). */
  yearly: number
  limits: PlanLimits
  features: Feature[]
  popular?: boolean
  /** The plan the free trial is for. */
  trial?: boolean
}

/** The top plan's free trial. A card is taken at the start; nothing is charged until it ends. */
export const TRIAL_DAYS = 60
export const TRIAL_MONTHS = 2

export const PLANS: Plan[] = [
  {
    id: 'free', name: 'Free', blurb: 'Try the basics with a very small team.', monthly: 0, yearly: 0,
    limits: { people: 3, socialAccounts: 1, postsPerMonth: 1 },
    features: [],
  },
  {
    id: 'starter', name: 'Starter', blurb: 'For a small team getting organised.', monthly: 25, yearly: 250,
    limits: { people: 10, socialAccounts: 1, postsPerMonth: 12 },
    features: ['google_maps', 'apps'],
  },
  {
    id: 'pro', name: 'Pro', blurb: 'For busy venues that want it all in sync.', monthly: 49, yearly: 490, popular: true,
    limits: { people: 25, socialAccounts: 3, postsPerMonth: 60 },
    features: ['google_maps', 'apps', 'whatsapp', 'takings', 'sports', 'music', 'kiosk'],
  },
  {
    id: 'business', name: 'Business', blurb: 'Everything, for larger teams and their advisers.', monthly: 79, yearly: 790, trial: true,
    limits: { people: null, socialAccounts: 3, postsPerMonth: null },
    features: ['google_maps', 'apps', 'whatsapp', 'takings', 'sports', 'music', 'kiosk', 'partners'],
  },
]

export const plan = (id: PlanId | string | null | undefined): Plan => PLANS.find(p => p.id === id) ?? PLANS[0]
export const TRIAL_PLAN = PLANS.find(p => p.trial)!

/** The cheapest plan that includes a feature (for "Upgrade to …" prompts). */
export const planFor = (f: Feature): Plan => PLANS.find(p => p.features.includes(f))!

export const FEATURE_LABEL: Record<Feature, string> = {
  google_maps: 'Opening hours synced to Google Maps',
  apps: 'Gmail, Outlook, Google Drive and OneDrive',
  whatsapp: 'WhatsApp and text reminders',
  takings: 'Takings from Stripe or Square',
  sports: "What's on: matches and fiestas",
  music: 'Music for the venue',
  kiosk: 'Clock-in tablet with staff PINs',
  partners: 'Read-only access for your gestoría and partners',
}

/** Which plan feature an app connection needs (connections not listed are on every plan). */
export const CONNECTION_FEATURE: Record<string, Feature> = {
  google_business: 'google_maps', whatsapp: 'whatsapp', square: 'takings', stripe: 'takings',
  spotify: 'music', youtube_music: 'music', gmail: 'apps', outlook: 'apps', google_drive: 'apps', onedrive: 'apps',
}
export const SOCIAL_CONNECTIONS = ['instagram', 'facebook', 'tiktok']

// ---------------------------------------------------------------------------------------------
// Line-by-line comparison (pricing page). Values: true/false, or text for limits.
// ---------------------------------------------------------------------------------------------
const lim = (n: number | null, unit = '') => (n === null ? 'Unlimited' : `${n}${unit}`)
type Cell = boolean | string
export interface CompareRow { label: string; values: Record<PlanId, Cell>; note?: string }
const every = (v: Cell = true): Record<PlanId, Cell> => ({ free: v, starter: v, pro: v, business: v })
const byFeature = (f: Feature): Record<PlanId, Cell> =>
  Object.fromEntries(PLANS.map(p => [p.id, p.features.includes(f)])) as Record<PlanId, Cell>
const byLimit = (pick: (l: PlanLimits) => string): Record<PlanId, Cell> =>
  Object.fromEntries(PLANS.map(p => [p.id, pick(p.limits)])) as Record<PlanId, Cell>

export const COMPARE: { group: string; rows: CompareRow[] }[] = [
  { group: 'Team', rows: [
    { label: 'People on the team', values: byLimit(l => lim(l.people)) },
    { label: 'Drag-and-drop rota, shared to phones', values: every() },
    { label: 'Clock-ins, breaks and timecards', values: every() },
    { label: 'Registro de jornada (monthly record)', values: every(), note: 'Required by law in Spain, so it is on every plan.' },
    { label: 'Time off and holiday allowance', values: every() },
    { label: 'Shared team calendar and to-do list', values: every() },
    { label: 'Clock-in tablet with staff PINs', values: byFeature('kiosk') },
  ] },
  { group: 'Social media', rows: [
    { label: 'Social accounts connected (Instagram, Facebook, TikTok)', values: byLimit(l => String(l.socialAccounts)) },
    { label: 'Scheduled posts per month', values: byLimit(l => lim(l.postsPerMonth)) },
    { label: 'Write once, post to every connected network', values: every() },
  ] },
  { group: 'Messages', rows: [
    { label: 'Shift reminders by email', values: every() },
    { label: 'WhatsApp and text reminders', values: byFeature('whatsapp') },
  ] },
  { group: 'Your business online', rows: [
    { label: 'Opening hours synced to Google Maps', values: byFeature('google_maps') },
    { label: "What's on: matches, fiestas, bank holidays", values: byFeature('sports') },
    { label: 'Music for the venue (Spotify, YouTube Music)', values: byFeature('music') },
  ] },
  { group: 'Money and admin', rows: [
    { label: 'Takings from Stripe or Square next to team cost', values: byFeature('takings') },
    { label: 'Gmail, Outlook, Google Drive and OneDrive', values: byFeature('apps') },
    { label: 'Read-only access for your gestoría and partners', values: byFeature('partners') },
  ] },
  { group: 'AI', rows: [
    { label: 'Custom MCP connection (Claude, ChatGPT, Cursor, n8n…)', values: every() },
    { label: 'REST API and personal access keys', values: every() },
  ] },
  { group: 'Support', rows: [
    { label: 'Help by email', values: every() },
    { label: 'Priority support', values: { free: false, starter: false, pro: false, business: true } },
  ] },
]

/** Short "what you get" bullets for each plan card. */
export function planHighlights(p: Plan): string[] {
  const l = p.limits
  const people = l.people === null ? 'Unlimited team members' : `Up to ${l.people} team members`
  const social = `${l.socialAccounts} social account${l.socialAccounts > 1 ? 's' : ''}, ${l.postsPerMonth === null ? 'unlimited' : l.postsPerMonth} scheduled post${l.postsPerMonth === 1 ? '' : 's'} a month`
  const base = [people, social, 'Custom MCP connection for your AI']
  const extra: Record<PlanId, string[]> = {
    free: ['Rota, clock-ins and timecards', 'Registro de jornada', 'Email reminders'],
    starter: ['Everything in Free', 'Opening hours synced to Google Maps', 'Gmail, Outlook, Drive and OneDrive'],
    pro: ['Everything in Starter', 'WhatsApp and text reminders', 'Takings from Stripe or Square', 'Clock-in tablet, music and match nights'],
    business: ['Everything in Pro', 'Gestoría and partner access', 'Priority support'],
  }
  return [...base, ...extra[p.id]]
}

// ---------------------------------------------------------------------------------------------
// Subscription state → the plan the business can use right now.
// ---------------------------------------------------------------------------------------------
export type BillingStatus = 'none' | 'comped' | 'trialing' | 'active' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'paused'

export interface Billing {
  plan: PlanId
  status: BillingStatus
  interval: Interval | null
  trial_ends_at: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  trial_used: boolean
  has_customer: boolean
  /** Complimentary (status 'comped'): always the top plan, free, set by us. */
  complimentary: Complimentary | null
  complimentary_note: string | null
}

export type Complimentary = 'founder' | 'friends_family'
export const COMPLIMENTARY_LABEL: Record<Complimentary, string> = { founder: 'Founding account', friends_family: 'Friends & family' }

/**
 * The plan in force. Paid plans count only while the subscription is paid up: trialing (within
 * its end date), active, or complimentary (comped: founding account, friends & family). Once a trial ends without a payment, or a renewal
 * fails, the business is on Free until Stripe takes the payment. Mirrors public.current_plan().
 */
export function effectivePlan(b: Pick<Billing, 'plan' | 'status' | 'trial_ends_at'> | null | undefined, now = new Date()): PlanId {
  if (!b) return 'free'
  if (b.status === 'comped' || b.status === 'active') return b.plan
  if (b.status === 'trialing') return b.trial_ends_at && new Date(b.trial_ends_at) > now ? b.plan : 'free'
  return 'free'
}

/** Paid plan chosen but not in force (trial ended unpaid, renewal failed…): show a warning. */
export const paymentProblem = (b: Billing | null | undefined, now = new Date()) =>
  !!b && b.plan !== 'free' && effectivePlan(b, now) === 'free' && b.status !== 'none'
