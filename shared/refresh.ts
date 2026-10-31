// How often the app reads each outside service, in one place. The Worker keeps each answer for this
// long (provider_cache, worker/cache.ts) and its timers follow it; the pages say it ("Updated 5 min
// ago · every 15 minutes") and Connections lists it all. Each is set to stay well inside what the
// service allows (its rate limits, and its free monthly allowance where it charges per call).
import { msg } from './i18n'

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
} as const

/** How long takings for a period ending at `endIso` (exclusive) are kept: once it's over before yesterday, a day. */
export const takingsMinutes = (endIso: string, now = Date.now()) => (Date.parse(endIso) <= now - 86_400_000 ? MINUTES.takingsPast : MINUTES.takings)

/** A service the app reads, for the pages' notes and the list on Connections. */
export interface RefreshSource {
  id: 'takings' | 'loyalty' | 'customers' | 'reviews' | 'hours' | 'mentions' | 'messages' | 'search' | 'ads' | 'mail' | 'sports' | 'connections' | 'website'
    | 'competitors'
    | 'email'
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
]

export const source = (id: RefreshSource['id']) => SOURCES.find(s => s.id === id)!
