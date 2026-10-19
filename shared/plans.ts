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
  /** Who it's for, in a sentence (plan details). */
  bestFor: string
  /** How help works on this plan. */
  support: string
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
    bestFor: 'A small team trying Business Agent: the rota, clock-ins and the legal hours record, free for ever.',
    support: 'Help centre and email',
    limits: { people: 3, socialAccounts: 1, postsPerMonth: 1 },
    features: [],
  },
  {
    id: 'starter', name: 'Starter', blurb: 'For a small team getting organised.', monthly: 39, yearly: 390,
    bestFor: 'One venue with a small team that wants its Google listing, email and files to look after themselves.',
    support: 'Email, reply within 2 working days',
    limits: { people: 10, socialAccounts: 1, postsPerMonth: 12 },
    features: ['google_maps', 'apps'],
  },
  {
    id: 'pro', name: 'Pro', blurb: 'For busy venues that want it all in sync.', monthly: 79, yearly: 790, popular: true,
    bestFor: 'A busy café, bar or shop: WhatsApp reminders, takings next to the rota, the clock-in tablet and social every week.',
    support: 'Email, reply within 1 working day',
    limits: { people: 25, socialAccounts: 3, postsPerMonth: 60 },
    features: ['google_maps', 'apps', 'whatsapp', 'takings', 'sports', 'music', 'kiosk'],
  },
  {
    id: 'business', name: 'Business', blurb: 'Everything, for larger teams and their advisers.', monthly: 129, yearly: 1290, trial: true,
    bestFor: 'A larger team, or a business that works with a gestoría or partners: everything switched on, no limits on people or posts.',
    support: 'Priority email and phone, same working day',
    limits: { people: null, socialAccounts: 3, postsPerMonth: null },
    features: ['google_maps', 'apps', 'whatsapp', 'takings', 'sports', 'music', 'kiosk', 'partners'],
  },
]

/**
 * Enterprise: groups, franchises and multi-site operators. Not self-serve: a conversation with
 * sales, a contract and limits to fit (shown at the foot of the plans).
 */
export const ENTERPRISE = {
  name: 'Enterprise',
  blurb: 'For groups, franchises and multi-site operators.',
  price: 'Tailored to your group',
  email: 'sales@businesssagent.com',
  includes: [
    'Everything in Business, with limits set for you',
    'Each venue its own branded app, one contract and one invoice',
    'Your own private instance, data kept in the EU',
    'Onboarding, staff training and data import done for you',
    'Single sign-on with Google Workspace or Microsoft 365',
    'Custom integrations and higher API limits',
    'A named account manager and a support agreement',
    'Annual invoicing and payment by bank transfer',
  ],
}

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
/** One line of the comparison: what it is in plain words (`explain`), and each plan's value. */
export interface CompareRow { label: string; values: Record<PlanId, Cell>; note?: string; explain?: string }
const every = (v: Cell = true): Record<PlanId, Cell> => ({ free: v, starter: v, pro: v, business: v })
const byFeature = (f: Feature): Record<PlanId, Cell> =>
  Object.fromEntries(PLANS.map(p => [p.id, p.features.includes(f)])) as Record<PlanId, Cell>
const byLimit = (pick: (l: PlanLimits) => string): Record<PlanId, Cell> =>
  Object.fromEntries(PLANS.map(p => [p.id, pick(p.limits)])) as Record<PlanId, Cell>

export const COMPARE: { group: string; rows: CompareRow[] }[] = [
  { group: 'Team', rows: [
    { label: 'People on the team', values: byLimit(l => lim(l.people)),
      explain: 'Admins and staff who sign in. People who have left don’t count.' },
    { label: 'Drag-and-drop rota, shared to phones', values: every(),
      explain: 'Plan the week by dragging shifts; everyone sees their hours on their phone.' },
    { label: 'Clock-ins, breaks and timecards', values: every(),
      explain: 'Staff clock in and out on their phone; hours and breaks add up by themselves.' },
    { label: 'Registro de jornada (monthly record)', values: every(), note: 'Required by law in Spain, so it is on every plan.',
      explain: 'The monthly working-time record, ready to sign and share.' },
    { label: 'Time off and holiday allowance', values: every(),
      explain: 'Requests, approvals and how many days each person has left.' },
    { label: 'Shared team calendar and to-do list', values: every(),
      explain: 'Events, closures and the jobs to get done, in one place.' },
    { label: 'Clock-in tablet with staff PINs', values: byFeature('kiosk'),
      explain: 'A tablet by the door where staff clock in with a PIN.' },
  ] },
  { group: 'Social media', rows: [
    { label: 'Social accounts connected (Instagram, Facebook, TikTok)', values: byLimit(l => String(l.socialAccounts)),
      explain: 'How many accounts you can post to at once.' },
    { label: 'Scheduled posts per month', values: byLimit(l => lim(l.postsPerMonth)),
      explain: 'Posts planned for a date. Reminders to post yourself count too.' },
    { label: 'Posts, carousels, reels and stories', values: every(),
      explain: 'Plan every kind of post on a calendar, list or table.' },
    { label: 'Photos and videos kept in your Google Drive or OneDrive', values: byFeature('apps'),
      explain: 'Needed to post automatically: the files wait there for Instagram to collect.' },
    { label: 'Instagram messages inbox', values: every(),
      explain: 'Read and answer Instagram DMs, story mentions and replies in the app.' },
  ] },
  { group: 'Messages', rows: [
    { label: 'Shift reminders by email', values: every(),
      explain: 'Everyone gets their shifts and changes by email.' },
    { label: 'WhatsApp and text reminders', values: byFeature('whatsapp'),
      explain: 'Shift reminders and rota changes on WhatsApp or text, from your number.' },
  ] },
  { group: 'Your business online', rows: [
    { label: 'Opening hours synced to Google Maps', values: byFeature('google_maps'),
      explain: 'Change your hours or a closure once; Google Maps updates by itself.' },
    { label: "What's on: matches, fiestas, bank holidays", values: byFeature('sports'),
      explain: 'Big matches and local events, so you can plan staff and the TV.' },
    { label: 'Music for the venue (Spotify, YouTube Music)', values: byFeature('music'),
      explain: 'An approved playlist staff can play and pause from the app.' },
  ] },
  { group: 'Money and admin', rows: [
    { label: 'Takings from Stripe or Square next to team cost', values: byFeature('takings'),
      explain: 'Sales each day beside what the rota costs.' },
    { label: 'Gmail, Outlook, Google Drive and OneDrive', values: byFeature('apps'),
      explain: 'Alerts sent from your own email; exports saved to your own drive.' },
    { label: 'Read-only access for your gestoría and partners', values: byFeature('partners'),
      explain: 'Your gestoría sees hours and pay records, and changes nothing.' },
  ] },
  { group: 'AI', rows: [
    { label: 'Custom MCP connection (Claude, ChatGPT, Cursor, n8n…)', values: every(),
      explain: 'Ask your own AI “who is working Saturday?” and it answers from your data.' },
    { label: 'REST API and personal access keys', values: every(),
      explain: 'Connect your own tools and automations.' },
  ] },
  { group: 'Support', rows: [
    { label: 'Help', values: Object.fromEntries(PLANS.map(p => [p.id, p.support])) as Record<PlanId, Cell>,
      explain: 'How to reach us, and how quickly we reply.' },
    { label: 'Priority support', values: { free: false, starter: false, pro: false, business: true },
      explain: 'Your questions go to the front of the queue.' },
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
  /** Referral months already credited on the Stripe bill. */
  referral_months_applied: number
  /** Another business that referred this one (its own month free). */
  referred_by: string | null
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
