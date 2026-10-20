// Ads from Meta (Facebook and Instagram) and Google, read with each platform's own API and shown
// side by side on the Ads page: what was spent, what it brought (clicks, results) and each
// campaign, with pause, resume and the daily budget changed from here. Used by the Worker (which
// reads the platforms) and the app (which adds them up), so both count the same way.

export type AdPlatform = 'meta_ads' | 'google_ads'
export const AD_PLATFORMS: AdPlatform[] = ['meta_ads', 'google_ads']
export const PLATFORM_NAMES: Record<AdPlatform, string> = { meta_ads: 'Meta Ads', google_ads: 'Google Ads' }

/** Money in the ad account's currency (euros for a Spanish café), counts as whole numbers. */
export interface AdMetrics { spend: number; impressions: number; clicks: number; results: number }
export interface AdDay extends AdMetrics { date: string }

/** Running, paused, or finished/removed/held up (shown but not changeable). */
export type CampaignStatus = 'active' | 'paused' | 'other'

export interface AdCampaign extends AdMetrics {
  platform: AdPlatform
  id: string
  name: string
  status: CampaignStatus
  /** The campaign's own daily budget; null when the budget sits elsewhere (ad sets, a lifetime or shared budget). */
  daily_budget: number | null
}

export interface AdAccount { id: string; name: string; currency: string }

/** One platform's figures for the days asked for. */
export interface PlatformReport {
  platform: AdPlatform
  account: AdAccount
  /** Meta: allowed to pause, resume and change budgets (ads_management); Google always is. */
  can_manage: boolean
  totals: AdMetrics
  days: AdDay[]
  campaigns: AdCampaign[]
}

export interface AdsReport {
  from: string
  to: string
  platforms: PlatformReport[]
  /** A platform that couldn't be read just now (the others still show). */
  failed?: { platform: AdPlatform; error: string }[]
}

/** The monthly limits the business set itself (the platforms' own budgets still decide what's spent). */
export interface AdSettings {
  meta_ads_monthly_cap: number | null
  google_ads_monthly_cap: number | null
  /** Warn on the Ads page once this share of a cap is spent. */
  alert_at_percent: number
}

export interface CampaignPatch { status?: 'active' | 'paused'; daily_budget?: number }

export const NO_METRICS: AdMetrics = { spend: 0, impressions: 0, clicks: 0, results: 0 }
const round2 = (n: number) => Math.round(n * 100) / 100

/** Two sets of figures added up. */
export const addMetrics = (a: AdMetrics, b: AdMetrics): AdMetrics => ({
  spend: round2(a.spend + b.spend), impressions: a.impressions + b.impressions, clicks: a.clicks + b.clicks, results: round2(a.results + b.results),
})

/** Every platform added up. */
export const totalsOf = (platforms: PlatformReport[]) => platforms.reduce((s, p) => addMetrics(s, p.totals), NO_METRICS)

/** Click-through rate (0.031 = 3.1%); null with nothing shown. */
export const ctr = (m: AdMetrics) => (m.impressions ? m.clicks / m.impressions : null)
/** Cost per click; null with no clicks. */
export const cpc = (m: AdMetrics) => (m.clicks ? m.spend / m.clicks : null)
/** Cost per result (a purchase, lead, message or conversion); null with none. */
export const costPerResult = (m: AdMetrics) => (m.results ? m.spend / m.results : null)

const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** Every date from `from` to `to`, each with every platform's figures added up (zero on a day with none). */
export function mergeDays(platforms: PlatformReport[], from: string, to: string): AdDay[] {
  const by = new Map<string, AdMetrics>()
  for (const p of platforms) for (const d of p.days) by.set(d.date, addMetrics(by.get(d.date) ?? NO_METRICS, d))
  const out: AdDay[] = []
  for (let d = from; d <= to; d = nextDay(d)) out.push({ date: d, ...(by.get(d) ?? NO_METRICS) })
  return out
}

/** Every platform's campaigns in one list: the ones that spent most first, running before paused. */
export function allCampaigns(platforms: PlatformReport[]): AdCampaign[] {
  const rank = (c: AdCampaign) => (c.status === 'active' ? 0 : c.status === 'paused' ? 1 : 2)
  return platforms.flatMap(p => p.campaigns).sort((a, b) => rank(a) - rank(b) || b.spend - a.spend || a.name.localeCompare(b.name))
}

/** A platform's figures from its days (the days are the source; totals always agree with them). */
export function sumDays(days: AdDay[]): AdMetrics {
  return days.reduce((s, d) => addMetrics(s, d), NO_METRICS)
}

export interface Pacing {
  spent: number
  cap: number | null
  /** Share of the cap spent so far (0.5 = half); null without a cap. */
  share: number | null
  /** What the month comes to if spending carries on at this month's daily average. */
  projected: number
  daysGone: number
  daysInMonth: number
  /** At or past the warning share of the cap (or projected to go over it). */
  warn: boolean
  over: boolean
}

/**
 * How a month's spend is going against the business's own cap. `spent`: this month so far, up to
 * and including `day` (YYYY-MM-DD); the projection is that daily average for the whole month.
 */
export function pacing(spent: number, cap: number | null, day: string, alertAtPercent = 80): Pacing {
  const [y, m, d] = day.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const projected = round2(d ? spent / d * daysInMonth : spent)
  const share = cap ? spent / cap : null
  const over = !!cap && spent > cap
  const warn = !!cap && (share! * 100 >= alertAtPercent || projected > cap)
  return { spent: round2(spent), cap, share, projected, daysGone: d, daysInMonth, warn, over }
}

export interface UtmParts { url: string; source: string; medium: string; campaign: string; content?: string }

/** Lower case, spaces as hyphens, no characters that confuse the reports: "Autumn menu!" → "autumn-menu" ("paid_social" stays). */
export const utmValue = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9._~-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '')

/**
 * A link that says where a visit came from (Google Analytics and the like read utm_… from it). The
 * address keeps its own query and #part; a utm_… it already had is replaced. null: not a web
 * address, or no source, medium or campaign.
 */
export function utmLink(p: UtmParts): string | null {
  const typed = p.url.trim()
  if (!typed) return null
  let url: URL
  try { url = new URL(/^https?:\/\//i.test(typed) ? typed : `https://${typed}`) } catch { return null }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null
  const parts: [string, string][] = [['utm_source', utmValue(p.source)], ['utm_medium', utmValue(p.medium)], ['utm_campaign', utmValue(p.campaign)], ['utm_content', utmValue(p.content ?? '')]]
  if (!parts[0][1] || !parts[1][1] || !parts[2][1]) return null
  for (const [k, v] of parts) {
    url.searchParams.delete(k)
    if (v) url.searchParams.set(k, v)
  }
  return url.toString()
}

/** Where to make a new campaign (not built into the app). */
export const CREATE_CAMPAIGN_URL: Record<AdPlatform, string> = {
  meta_ads: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns',
  google_ads: 'https://ads.google.com/aw/campaigns/new',
}
