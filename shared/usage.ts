// User analytics (Settings → User analytics, the owners'): who uses the app, on what device, from where, and
// how long they spend on each page. The app keeps the time (src/app/usage.ts) and sends it to the Worker
// (POST /api/usage, worker/usage.ts), which adds the device and the town and keeps it (the user_analytics
// migration); owners read it back through usage_report(). The rules both sides share, what's sent, and the
// totals the page shows are here, so the app, the Worker, the demo and the tests agree. Who has signed in, and
// how, comes from Supabase's own records (usage_sign_ins()), so it shows before any visit is recorded.
import { msg } from './i18n'

/** Time on a page counts while it's on screen and someone touched, scrolled, typed or moved the mouse this recently. */
export const IDLE_MS = 3 * 60_000
/** A visit ends after this long without the app in use; the next use starts a new one. */
export const VISIT_GAP_MS = 30 * 60_000
/** How often the app sends what it has built up (and whenever it's hidden or closed). */
export const SEND_EVERY_MS = 60_000
/** Visits are kept this long (the Worker clears older ones nightly). */
export const KEEP_DAYS = 365
/** A report's limits: pages in it, seconds for one page, and its size. */
export const MAX_PAGES = 40
export const MAX_SECONDS = 3600
export const MAX_VIEWS = 100
export const MAX_REPORT_BYTES = 8 * 1024
/** Visits listed one by one on the page (the latest); the totals count them all. */
export const VISITS_LISTED = 500

export type UsageDevice = 'phone' | 'tablet' | 'computer'

/** A page's time in a report: its menu key ('rules' is Staff rules), times opened, seconds in use. */
export interface UsagePageTime { page: string; views: number; seconds: number }

/** What the app sends: its visit, how it's open (installed from the home screen; a touch screen), and the time per page. */
export interface UsageReport { visit: string; installed: boolean; touch: boolean; pages: UsagePageTime[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAGE = /^[a-z0-9-]{1,40}$/
const whole = (x: unknown, max: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(Math.max(Math.round(x), 0), max) : 0)

/** The report the app sent, cleaned, or null when it isn't one. Pages with nothing in them are left out. */
export function cleanUsageReport(body: unknown): UsageReport | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.visit !== 'string' || !UUID.test(b.visit) || !Array.isArray(b.pages)) return null
  const pages = new Map<string, UsagePageTime>()
  for (const p of b.pages.slice(0, MAX_PAGES) as unknown[]) {
    if (!p || typeof p !== 'object') continue
    const { page, views, seconds } = p as Record<string, unknown>
    if (typeof page !== 'string' || !PAGE.test(page)) continue
    const was = pages.get(page) ?? { page, views: 0, seconds: 0 }
    pages.set(page, { page, views: Math.min(was.views + whole(views, MAX_VIEWS), MAX_VIEWS), seconds: Math.min(was.seconds + whole(seconds, MAX_SECONDS), MAX_SECONDS) })
  }
  return {
    visit: b.visit.toLowerCase(), installed: b.installed === true, touch: b.touch === true,
    pages: [...pages.values()].filter(p => p.views > 0 || p.seconds > 0),
  }
}

/**
 * The device, its system and browser, from the browser's own description (its User-Agent). `touch`: the
 * app saw a touch screen, which tells an iPad (it says it's a Mac) from a Mac.
 */
export function deviceOf(ua: string, touch = false): { device: UsageDevice; os: string | null; browser: string | null } {
  const ipadAsMac = /Macintosh/.test(ua) && touch
  const os = /iPad/.test(ua) || ipadAsMac ? 'iPadOS'
    : /iPhone|iPod/.test(ua) ? 'iOS'
      : /Android/.test(ua) ? 'Android'
        : /CrOS/.test(ua) ? 'ChromeOS'
          : /Windows/.test(ua) ? 'Windows'
            : /Macintosh|Mac OS X/.test(ua) ? 'macOS'
              : /Linux/.test(ua) ? 'Linux' : null
  const device: UsageDevice = os === 'iPadOS' || /Tablet/i.test(ua) || (os === 'Android' && !/Mobile/.test(ua)) ? 'tablet'
    : os === 'iOS' || os === 'Android' || /Mobile|Phone/i.test(ua) ? 'phone' : 'computer'
  const browser = /EdgiOS|EdgA?\//.test(ua) ? 'Edge'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
      : /OPR\/|Opera/.test(ua) ? 'Opera'
        : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
          : /CriOS|Chrome\//.test(ua) ? 'Chrome'
            : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari'
              // An installed app on an iPhone or iPad leaves "Safari" out.
              : /AppleWebKit/.test(ua) && (os === 'iOS' || os === 'iPadOS') ? 'Safari' : null
  return { device, os, browser }
}

// ---- what owners read (public.usage_report()) ------------------------------------------------------

/** A visit: one tab in use without a 30-minute break, with its device, place and pages. */
export interface UsageVisit {
  id: string
  profile_id: string
  started_at: string
  last_seen_at: string
  device: UsageDevice
  os: string | null
  browser: string | null
  installed: boolean
  city: string | null
  region: string | null
  country: string | null
  seconds: number
  pages: UsagePageTime[]
  /** Where it was used (usage_report_by_location()): a named connection's name, else its town; '' when not known. */
  location?: string
}

/** One person's time on one page in the period. */
export interface PersonPage { profile_id: string; page: string; views: number; seconds: number; first_at: string; last_at: string }
/** One person's visits in the period. */
export interface PersonTotals { profile_id: string; visits: number; seconds: number; first_at: string; last_at: string }
export interface PersonDevice { profile_id: string; device: UsageDevice; os: string | null; browser: string | null; installed: boolean; visits: number; last_at: string }
export interface PersonPlace { profile_id: string; city: string | null; region: string | null; country: string; visits: number; last_at: string }

/** Whose a visit is: their name, colour and role (partners included, whom the app's list of the team leaves out). */
export interface UsageName { profile_id: string; full_name: string; colour: string; role: string }

/** The period's visits as owners see them (public.usage_report()): `visits` the latest 500, the totals all of them. */
export interface UsageData {
  people: PersonTotals[]
  pages: PersonPage[]
  devices: PersonDevice[]
  places: PersonPlace[]
  visits: UsageVisit[]
  names: UsageName[]
  total_visits: number
}

export const NO_USAGE: UsageData = { people: [], pages: [], devices: [], places: [], visits: [], names: [], total_visits: 0 }

// ---- by location (public.usage_report_by_location()) ------------------------------------------------
// One sign-in can be used at several shops, so a visit's location is where it was used: the internet connection
// it came from, by the name an owner gave it ("San Pedro café"), else its town. The page shows the locations
// together (atLocation(data, null)) or one at a time.

type Located<T> = T & { location: string }

/** An internet connection visits came from (an id that can't be turned back into the address), to name. */
export interface UsageNetwork { network: string; name: string | null; city: string | null; country: string | null; visits: number; people: number; last_at: string }

/** The period's visits with each total kept apart by location. */
export interface LocatedUsage {
  people: Located<PersonTotals>[]
  pages: Located<PersonPage>[]
  devices: Located<PersonDevice>[]
  places: Located<PersonPlace>[]
  visits: (Located<UsageVisit> & { network: string | null })[]
  networks: UsageNetwork[]
  names: UsageName[]
  total_visits: number
}

export const NO_LOCATED_USAGE: LocatedUsage = { ...NO_USAGE, people: [], pages: [], devices: [], places: [], visits: [], networks: [] }

/** A location's name: a named connection's, else the town (else region or country) the connection is in. */
export const locationOf = (v: { city: string | null; region?: string | null; country: string | null }, name?: string | null) =>
  name || v.city || v.region || v.country || ''

/** Add up rows that are the same but for their location. */
function merge<T extends { location: string }>(rows: T[], key: (r: T) => string, add: (a: Omit<T, 'location'>, b: T) => Omit<T, 'location'>): Omit<T, 'location'>[] {
  const out = new Map<string, Omit<T, 'location'>>()
  for (const r of rows) {
    const k = key(r)
    const was = out.get(k)
    const { location: _, ...rest } = r
    out.set(k, was ? add(was, r) : rest)
  }
  return [...out.values()]
}

/** The figures for one location (or, with null, every location together), as the page shows them. */
export function atLocation(data: LocatedUsage, location: string | null): UsageData {
  const here = <T extends { location: string }>(rows: T[]) => (location === null ? rows : rows.filter(r => r.location === location))
  const people = merge(here(data.people), r => r.profile_id, (a, b) => ({
    ...a, visits: a.visits + b.visits, seconds: a.seconds + b.seconds, first_at: earlier(a.first_at, b.first_at), last_at: later(a.last_at, b.last_at),
  }))
  return {
    people,
    pages: merge(here(data.pages), r => `${r.profile_id}|${r.page}`, (a, b) => ({
      ...a, views: a.views + b.views, seconds: a.seconds + b.seconds, first_at: earlier(a.first_at, b.first_at), last_at: later(a.last_at, b.last_at),
    })),
    devices: merge(here(data.devices), r => [r.profile_id, r.device, r.os, r.browser].join('|'), (a, b) => ({
      ...a, installed: a.installed || b.installed, visits: a.visits + b.visits, last_at: later(a.last_at, b.last_at),
    })),
    places: merge(here(data.places), r => [r.profile_id, r.city, r.region, r.country].join('|'), (a, b) => ({
      ...a, visits: a.visits + b.visits, last_at: later(a.last_at, b.last_at),
    })),
    visits: here(data.visits),
    names: data.names,
    total_visits: location === null ? data.total_visits : people.reduce((n, p) => n + p.visits, 0),
  }
}

/** One location on the Locations tab: who used it there, how often, for how long, and its connections. */
export interface UsageLocation { location: string; people: number; visits: number; seconds: number; last_at: string; networks: UsageNetwork[] }

/** Every location in the period, the busiest first. */
export function locationsOf(data: LocatedUsage): UsageLocation[] {
  const out = new Map<string, UsageLocation>()
  for (const p of data.people) {
    const x = out.get(p.location) ?? { location: p.location, people: 0, visits: 0, seconds: 0, last_at: p.last_at, networks: [] }
    out.set(p.location, { ...x, people: x.people + 1, visits: x.visits + p.visits, seconds: x.seconds + p.seconds, last_at: later(x.last_at, p.last_at) })
  }
  for (const n of data.networks) out.get(locationOf(n, n.name))?.networks.push(n)
  return [...out.values()].sort((a, b) => b.visits - a.visits || b.last_at.localeCompare(a.last_at) || a.location.localeCompare(b.location))
}

export type UsagePeriod = '7' | '30' | '90' | '365'
export const USAGE_PERIODS: { id: UsagePeriod; label: string; days: number }[] = [
  { id: '7', label: msg('Last 7 days'), days: 7 },
  { id: '30', label: msg('Last 30 days'), days: 30 },
  { id: '90', label: msg('Last 90 days'), days: 90 },
  { id: '365', label: msg('Last 12 months'), days: 365 },
]
export const isUsagePeriod = (x: unknown): x is UsagePeriod => USAGE_PERIODS.some(p => p.id === x)

/** The visits a period covers: those that started from `days` ago until now (and a minute on, for a clock a little ahead). */
export function usageRange(period: UsagePeriod, now = Date.now()): { from: string; to: string } {
  const days = USAGE_PERIODS.find(p => p.id === period)!.days
  return { from: new Date(now - days * 86_400_000).toISOString(), to: new Date(now + 60_000).toISOString() }
}

const later = (a: string, b: string) => (a > b ? a : b)
const earlier = (a: string, b: string) => (a < b ? a : b)
const byLast = <T extends { visits: number; last_at: string }>(a: T, b: T) => b.visits - a.visits || b.last_at.localeCompare(a.last_at)

/** What a stored page row of a visit is (the demo's, shaped like the table). */
export interface StoredPage extends UsagePageTime { visit_id: string; first_at: string; last_at: string }

/** A visit as kept (the demo's, shaped like the table). */
export type StoredVisit = Omit<UsageVisit, 'pages' | 'location'> & { network?: string | null }

/**
 * public.usage_report_by_location() over visits and their pages kept elsewhere (the demo): the same shape, the
 * same rules. `people`: everyone's names; `named`: the owners' names for connections.
 */
export function usageReportOf(visits: StoredVisit[], pages: StoredPage[], from: string, to: string,
  people: { id: string; full_name: string; colour: string; role: string }[] = [], named: Record<string, string> = {}): LocatedUsage {
  const inPeriod = visits.filter(v => v.started_at >= from && v.started_at < to)
    .map(v => ({ ...v, network: v.network ?? null, location: locationOf(v, v.network ? named[v.network] : null) }))
  const ids = new Map(inPeriod.map(v => [v.id, v]))
  const own = pages.filter(p => ids.has(p.visit_id))
  const totals = new Map<string, LocatedUsage['people'][number]>()
  const devices = new Map<string, LocatedUsage['devices'][number]>()
  const places = new Map<string, LocatedUsage['places'][number]>()
  const networks = new Map<string, UsageNetwork & { who: Set<string> }>()
  for (const v of inPeriod) {
    const tk = `${v.profile_id}|${v.location}`
    const p = totals.get(tk)
    totals.set(tk, p
      ? { ...p, visits: p.visits + 1, seconds: p.seconds + v.seconds, first_at: earlier(p.first_at, v.started_at), last_at: later(p.last_at, v.last_seen_at) }
      : { profile_id: v.profile_id, location: v.location, visits: 1, seconds: v.seconds, first_at: v.started_at, last_at: v.last_seen_at })
    const dk = [v.profile_id, v.location, v.device, v.os, v.browser].join('|')
    const d = devices.get(dk)
    devices.set(dk, d
      ? { ...d, installed: d.installed || v.installed, visits: d.visits + 1, last_at: later(d.last_at, v.last_seen_at) }
      : { profile_id: v.profile_id, location: v.location, device: v.device, os: v.os, browser: v.browser, installed: v.installed, visits: 1, last_at: v.last_seen_at })
    if (v.country) {
      const pk = [v.profile_id, v.location, v.city, v.region, v.country].join('|')
      const pl = places.get(pk)
      places.set(pk, pl
        ? { ...pl, visits: pl.visits + 1, last_at: later(pl.last_at, v.last_seen_at) }
        : { profile_id: v.profile_id, location: v.location, city: v.city, region: v.region, country: v.country, visits: 1, last_at: v.last_seen_at })
    }
    if (v.network) {
      const n = networks.get(v.network) ?? { network: v.network, name: named[v.network] ?? null, city: v.city, country: v.country, visits: 0, people: 0, last_at: v.last_seen_at, who: new Set<string>() }
      n.who.add(v.profile_id)
      networks.set(v.network, { ...n, visits: n.visits + 1, people: n.who.size, last_at: later(n.last_at, v.last_seen_at) })
    }
  }
  const byPage = new Map<string, LocatedUsage['pages'][number]>()
  for (const p of own) {
    const v = ids.get(p.visit_id)!
    const k = `${v.profile_id}|${v.location}|${p.page}`
    const x = byPage.get(k)
    byPage.set(k, x
      ? { ...x, views: x.views + p.views, seconds: x.seconds + p.seconds, first_at: earlier(x.first_at, p.first_at), last_at: later(x.last_at, p.last_at) }
      : { profile_id: v.profile_id, location: v.location, page: p.page, views: p.views, seconds: p.seconds, first_at: p.first_at, last_at: p.last_at })
  }
  const latest = [...inPeriod].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, VISITS_LISTED)
  const whose = new Set(inPeriod.map(v => v.profile_id))
  return {
    people: [...totals.values()], pages: [...byPage.values()], devices: [...devices.values()], places: [...places.values()],
    names: people.filter(p => whose.has(p.id)).map(p => ({ profile_id: p.id, full_name: p.full_name, colour: p.colour, role: p.role })),
    visits: latest.map(v => ({ ...v, pages: own.filter(p => p.visit_id === v.id).sort((a, b) => a.first_at.localeCompare(b.first_at))
      .map(p => ({ page: p.page, views: p.views, seconds: p.seconds })) })),
    networks: [...networks.values()].map(({ who: _, ...n }) => n).sort((a, b) => b.visits - a.visits || b.last_at.localeCompare(a.last_at)),
    total_visits: inPeriod.length,
  }
}

// ---- the page's totals --------------------------------------------------------------------------------

/**
 * Someone's last sign-in, from Supabase's own records (public.usage_sign_ins()): when, and how ('google', 'email',
 * 'apple', 'azure' for Microsoft…). A sign-in that's only renewed, the app kept open, doesn't change it.
 */
export interface UsageSignIn { profile_id: string; last_sign_in_at: string; provider: string | null; full_name: string; colour: string; role: string }

/** One person on the People tab: their visits and time, their devices and places (most used first), their pages and last sign-in. */
export interface PersonUsage extends PersonTotals {
  devices: PersonDevice[]
  places: PersonPlace[]
  /** Their pages, most time first. */
  pages: PersonPage[]
  signIn: UsageSignIn | null
}

/**
 * Everyone who used the app in the period, the latest first: those with visits, and those who signed in from
 * `from` on with none recorded yet (signing in is using it; their visits show as the app sends them).
 */
export function peopleUsage(data: UsageData, signIns: UsageSignIn[] = [], from = ''): PersonUsage[] {
  const signInOf = (id: string) => signIns.find(s => s.profile_id === id) ?? null
  const inPeriod = (s: UsageSignIn | null) => !!s && s.last_sign_in_at >= from
  const withVisits: PersonUsage[] = data.people.map(p => {
    const signIn = signInOf(p.profile_id)
    return {
      ...p,
      last_at: inPeriod(signIn) ? later(p.last_at, signIn!.last_sign_in_at) : p.last_at,
      devices: data.devices.filter(d => d.profile_id === p.profile_id).sort(byLast),
      places: data.places.filter(d => d.profile_id === p.profile_id).sort(byLast),
      pages: data.pages.filter(d => d.profile_id === p.profile_id).sort((a, b) => b.seconds - a.seconds || b.views - a.views),
      signIn,
    }
  })
  const signedInOnly: PersonUsage[] = signIns.filter(s => inPeriod(s) && !data.people.some(p => p.profile_id === s.profile_id)).map(s => ({
    profile_id: s.profile_id, visits: 0, seconds: 0, first_at: s.last_sign_in_at, last_at: s.last_sign_in_at, devices: [], places: [], pages: [], signIn: s,
  }))
  return [...withVisits, ...signedInOnly].sort((a, b) => b.last_at.localeCompare(a.last_at))
}

/** One page on the Pages tab: how many people opened it, how often, and the time spent on it in all and on average. */
export interface PageUsage { page: string; people: number; views: number; seconds: number; average: number; last_at: string }

/** Every page opened in the period, the most time first. */
export function pagesUsage(data: UsageData): PageUsage[] {
  const pages = new Map<string, PageUsage>()
  for (const p of data.pages) {
    const x = pages.get(p.page) ?? { page: p.page, people: 0, views: 0, seconds: 0, average: 0, last_at: p.last_at }
    pages.set(p.page, { ...x, people: x.people + 1, views: x.views + p.views, seconds: x.seconds + p.seconds, last_at: later(x.last_at, p.last_at) })
  }
  return [...pages.values()].map(p => ({ ...p, average: Math.round(p.seconds / p.people) }))
    .sort((a, b) => b.seconds - a.seconds || b.views - a.views || a.page.localeCompare(b.page))
}

/**
 * Who opened one page (Staff rules, say), the most time first, and who on the `team` didn't open it in the
 * period at all.
 */
export function pageReaders(data: UsageData, page: string, team: string[]): { readers: PersonPage[]; notOpened: string[] } {
  const readers = data.pages.filter(p => p.page === page).sort((a, b) => b.seconds - a.seconds || b.last_at.localeCompare(a.last_at))
  const opened = new Set(readers.map(r => r.profile_id))
  return { readers, notOpened: team.filter(id => !opened.has(id)) }
}

/** The figures at the top: people who used it, visits, the time in all, and the page with the most time. */
export function usageTotals(data: UsageData): { people: number; visits: number; seconds: number; topPage: string | null } {
  return {
    people: data.people.length, visits: data.total_visits, seconds: data.people.reduce((s, p) => s + p.seconds, 0),
    topPage: pagesUsage(data)[0]?.page ?? null,
  }
}
