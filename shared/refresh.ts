// How often the app reads each outside service, in one place. The Worker keeps each answer for this
// long (provider_cache, worker/cache.ts) and its timers follow it; the pages say it ("Updated 5 min
// ago · every 15 minutes") and Connections lists it all. Each is set to stay well inside what the
// service allows (its rate limits, and its free monthly allowance where it charges per call).
// Most can be changed by the business (CHOICES, Connections → How often things update): Free keeps the
// usual times or slower, each plan up may go a step faster, and Business picks the fastest or types its
// own number of minutes. The Worker keeps to what the plan in force allows (refreshMinutes()).
import { msg } from './i18n'
import type { PlanId } from './plans'

/** Minutes an answer is kept before the service is asked again. */
export const MINUTES = {
  /** Takings and best sellers for a period that includes yesterday or today (Square, SumUp, Stripe). */
  takings: 15,
  /** Takings and best sellers for a period over before yesterday: they no longer change (bar a late refund). */
  takingsPast: 24 * 60,
  /** Square loyalty and gift cards. */
  loyalty: 30,
  /** Meta Ads and Google Ads (forgotten straight away when a campaign is changed here). */
  ads: 60,
  /** Search Console: Google's own figures are 2–3 days behind. */
  search: 6 * 60,
  /** Invoices in the connected Gmail or Outlook. */
  mailInvoices: 15,
  /** Google reviews from the business's own profile (Business Profile, no charge). */
  reviewsProfile: 60,
  /** Google reviews from Places, which Google charges for past 1,000 look-ups a month: about 240 a month. */
  reviewsPlaces: 3 * 60,
  /** Competitors on Google (Places): each followed place, and the look around the business, once a week. */
  competitors: 7 * 24 * 60,
  /** The Email page's list from the connected Gmail or Outlook (each filter and search kept on its own). */
  email: 5,
  /** Instagram, TikTok, LinkedIn and Facebook statistics (Analytics): the platforms update them a few times a day. */
  social: 3 * 60,
} as const

/**
 * How long takings for a period ending at `endIso` (exclusive) are kept: once it's over before yesterday, a
 * day; else `today` (the business's own rate, refreshMinutes(…, 'takings'); the usual 15 minutes).
 */
export const takingsMinutes = (endIso: string, now = Date.now(), today: number = MINUTES.takings) =>
  (Date.parse(endIso) <= now - 86_400_000 ? MINUTES.takingsPast : today)

/** A service the app reads, for the pages' notes and the list on Connections. */
export interface RefreshSource {
  id: 'takings' | 'loyalty' | 'customers' | 'reviews' | 'hours' | 'mentions' | 'messages' | 'search' | 'ads' | 'mail' | 'sports' | 'connections' | 'website'
    | 'competitors'
    | 'email'
    | 'social'
    | 'menu'
  /** What it is and where it comes from. */
  what: string
  from: string
  /** How often, as a phrase that follows "Updated 5 min ago · ". */
  every: string
  /** Why that often. */
  why: string
}

export const SOURCES: RefreshSource[] = [
  { id: 'takings', what: msg('Takings and best sellers'), from: 'Square · SumUp · Stripe',
    every: msg('today’s every 15 minutes, earlier days once a day'),
    why: msg('Finished days don’t change, so they’re kept for a day; today’s are read again every 15 minutes, well inside what the tills allow.') },
  { id: 'loyalty', what: msg('Loyalty and gift cards'), from: 'Square', every: msg('every 30 minutes'),
    why: msg('Points and balances change slowly; reading them every half hour keeps well inside Square’s limits.') },
  { id: 'customers', what: msg('Customers'), from: 'Square', every: msg('as soon as Square sends them, and every hour'),
    why: msg('Square tells the app about a new customer straight away; the hourly check catches any it missed.') },
  { id: 'menu', what: msg('The menu from Square'), from: 'Square', every: msg('as soon as Square sends a change, and every hour'),
    why: msg('Square tells the app when the item library changes, so the menu, the website, the screens and Google Maps follow straight away; the regular read catches anything it missed. A price changed here goes to Square within a minute.') },
  { id: 'reviews', what: msg('Google reviews'), from: 'Google', every: msg('every hour (every 3 hours without Business Profile)'),
    why: msg('With Business Profile there’s no charge. Without it they come from Google’s Places service, which charges past 1,000 look-ups a month: every 3 hours is about 240.') },
  { id: 'hours', what: msg('Opening hours on Google Maps'), from: 'Google', every: msg('every 15 minutes'),
    why: msg('Kept the same both ways: a change here or on Google Maps shows on the other within 15 minutes.') },
  { id: 'mentions', what: msg('Instagram mentions'), from: 'Instagram', every: msg('every 15 minutes'),
    why: msg('Often enough to reply the same day, well inside Instagram’s hourly limit.') },
  { id: 'messages', what: msg('Messages'), from: 'Instagram · Facebook · WhatsApp',
    every: msg('every minute on Messages, every 2 minutes elsewhere; WhatsApp as it arrives'),
    why: msg('An open chat is checked every 30 seconds; WhatsApp sends each message to the app as it comes.') },
  { id: 'search', what: msg('Google Search'), from: 'Search Console', every: msg('every 6 hours'),
    why: msg('Google’s search figures are 2–3 days behind, so reading them more often shows nothing new.') },
  { id: 'ads', what: msg('Ads'), from: 'Meta Ads · Google Ads', every: msg('every hour, and straight after a change made here'),
    why: msg('Spend and results settle over the day; an hour keeps well inside both platforms’ limits.') },
  { id: 'mail', what: msg('Invoices in your email'), from: 'Gmail · Outlook', every: msg('every 15 minutes'),
    why: msg('Each check reads up to 40 emails, so it’s done at most every 15 minutes.') },
  { id: 'sports', what: msg('Sports fixtures'), from: 'fixturedownload.com · TheSportsDB · Wikipedia', every: msg('every 6 hours'),
    why: msg('Fixtures rarely move; the free sports sources ask for gentle use.') },
  { id: 'connections', what: msg('Whether each connection still works'), from: msg('Every connected app'), every: msg('every night'),
    why: msg('Admins get a notification if one stops working.') },
  { id: 'competitors', what: msg('Competitors on Google'), from: 'Google', every: msg('every week'),
    why: msg('Ratings and reviews move slowly, and Google’s Places service charges past 1,000 look-ups a month: once a week for each place followed keeps well inside it.') },
  { id: 'website', what: msg('Website and PageSpeed check'), from: 'Google', every: msg('when you ask for a check'),
    why: msg('Each check reads the whole site, so it only runs when asked.') },
  { id: 'email', what: msg('Your email (Email page)'), from: 'Gmail · Outlook', every: msg('every 5 minutes'),
    why: msg('Each filter and search is kept 5 minutes, so going back and forth between them doesn’t read the mailbox again each time.') },
  { id: 'social', what: msg('Social media statistics (Analytics)'), from: 'Instagram · TikTok · LinkedIn · Facebook', every: msg('every 3 hours'),
    why: msg('The platforms update their statistics a few times a day, and limit how often apps may ask: every 3 hours keeps well inside that.') },
]

export const source = (id: RefreshSource['id']) => SOURCES.find(s => s.id === id)!

// ---------------------------------------------------------------------------------------------
// The business's own choice (settings.refresh_minutes), within what its plan allows.
// ---------------------------------------------------------------------------------------------

/** A service the business can read more or less often. */
export type Choosable = 'takings' | 'loyalty' | 'customers' | 'menu' | 'hours' | 'mentions' | 'search' | 'ads' | 'mail' | 'email' | 'social'

export interface Choice {
  /** The minutes it can be set to, fastest first. The fastest still keeps well inside the service's limits. */
  options: number[]
  /** The usual time (one of `options`): what every business gets until it chooses. */
  usual: number
  /** Business's own number of minutes: no faster than `min`, no slower than `max`. */
  min: number
  max: number
  /** How often, with {every} for the time chosen (follows "Updated 5 min ago · "). */
  phrase: string
}

export const CHOICES: Record<Choosable, Choice> = {
  takings: { options: [2, 5, 10, 15, 30, 60], usual: MINUTES.takings, min: 2, max: 240, phrase: msg('today’s {every}, earlier days once a day') },
  loyalty: { options: [5, 10, 15, 30, 60, 120], usual: MINUTES.loyalty, min: 5, max: 720, phrase: msg('{every}') },
  customers: { options: [5, 10, 30, 60, 180, 360], usual: 60, min: 5, max: 1440, phrase: msg('as soon as Square sends them, and {every}') },
  menu: { options: [5, 15, 30, 60, 180, 360], usual: 60, min: 5, max: 1440, phrase: msg('as soon as Square sends a change, and {every}') },
  hours: { options: [5, 10, 15, 30, 60], usual: 15, min: 5, max: 240, phrase: msg('{every}') },
  mentions: { options: [5, 10, 15, 30, 60], usual: 15, min: 5, max: 240, phrase: msg('{every}') },
  search: { options: [180, 360, 720, 1440], usual: MINUTES.search, min: 180, max: 2880, phrase: msg('{every}') },
  ads: { options: [10, 15, 30, 60, 180], usual: MINUTES.ads, min: 10, max: 720, phrase: msg('{every}, and straight after a change made here') },
  mail: { options: [5, 10, 15, 30, 60], usual: MINUTES.mailInvoices, min: 5, max: 240, phrase: msg('{every}') },
  email: { options: [1, 2, 5, 15, 30], usual: MINUTES.email, min: 1, max: 60, phrase: msg('{every}') },
  social: { options: [30, 60, 180, 360, 720], usual: MINUTES.social, min: 30, max: 1440, phrase: msg('{every}') },
}

export const isChoosable = (id: string): id is Choosable => id in CHOICES

/**
 * How far each plan may change the times: `faster` steps quicker than the usual (Free none: the usual or
 * slower), and Business any of them or its own number of minutes (`own`).
 */
export const PLAN_REFRESH: Record<PlanId, { faster: number; own: boolean; blurb: string }> = {
  free: { faster: 0, own: false, blurb: msg('Free: the usual times, or slower.') },
  starter: { faster: 1, own: false, blurb: msg('Starter: a step faster than the usual.') },
  pro: { faster: 2, own: false, blurb: msg('Pro: two steps faster than the usual.') },
  business: { faster: 99, own: true, blurb: msg('Business: the fastest, or your own number of minutes.') },
}

/** The times a plan may choose for a service, fastest first. */
export function allowedOptions(id: Choosable, plan: PlanId): number[] {
  const c = CHOICES[id]
  const from = Math.max(0, c.options.indexOf(c.usual) - PLAN_REFRESH[plan].faster)
  return c.options.slice(from)
}

/** The fastest a plan may read a service (for "Faster on Pro" hints). */
export const fastestFor = (id: Choosable, plan: PlanId) => (PLAN_REFRESH[plan].own ? CHOICES[id].min : allowedOptions(id, plan)[0])

/** The minutes chosen per service, as kept (settings.refresh_minutes). */
export type RefreshChoices = Partial<Record<Choosable, number>>

/**
 * How often the business reads a service, in minutes: its choice when its plan allows it; else the
 * nearest its plan does that isn't faster (a business back on Free from a trial goes back to the usual).
 * The usual time when it hasn't chosen.
 */
export function refreshMinutes(chosen: RefreshChoices | Record<string, unknown> | null | undefined, plan: PlanId, id: Choosable): number {
  const c = CHOICES[id]
  const v = (chosen as Record<string, unknown> | null | undefined)?.[id]
  if (typeof v !== 'number' || !Number.isFinite(v)) return c.usual
  const n = Math.round(v)
  if (PLAN_REFRESH[plan].own) return Math.min(c.max, Math.max(c.min, n))
  const allowed = allowedOptions(id, plan)
  return allowed.find(o => o >= n) ?? allowed[allowed.length - 1]
}

/** A number of minutes as "every 15 minutes", "every hour", "every 6 hours", "every day": the text (msg) and its {n}. */
export function everyText(minutes: number): { text: string; n?: number } {
  if (minutes <= 1) return { text: msg('every minute') }
  if (minutes < 60 || minutes % 60) return { text: msg('every {n} minutes'), n: minutes }
  const h = minutes / 60
  if (h === 1) return { text: msg('every hour') }
  if (h < 24 || h % 24) return { text: msg('every {n} hours'), n: h }
  const d = h / 24
  if (d === 1) return { text: msg('every day') }
  if (d === 7) return { text: msg('every week') }
  return { text: msg('every {n} days'), n: d }
}

/** Whether a job read every `minutes` is due on the minute `minute` (minutes since 1970), `offset` minutes into its round. */
export const due = (minute: number, minutes: number, offset = 0) => minute % Math.max(1, minutes) === offset % Math.max(1, minutes)
