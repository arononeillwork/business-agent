// Google Search Console: how the business's website does in Google Search (clicks, impressions,
// click-through rate and position, by day, search, page, device and country) for the Analytics
// page. Read-only (webmasters.readonly), signed in with the same Google app as Gmail and Drive.
// Google's figures lag by 2–3 days.
import type { SearchReport, SearchRow } from '../../shared/types'
import { cleanWebsite } from '../../shared/connections'

export const SEARCH_CONSOLE_SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly', 'openid', 'email']
const API = 'https://searchconsole.googleapis.com/webmasters/v3'

async function gsc<T>(token: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message ?? `Search Console error ${res.status}`)
  return json
}

/** The websites (properties) this Google account can read: owners and full or restricted users, not unverified ones. */
export async function sites(token: string): Promise<string[]> {
  const r = await gsc<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(token, '/sites')
  return (r.siteEntry ?? []).filter(s => s.permissionLevel !== 'siteUnverifiedUser').map(s => s.siteUrl).sort()
}

const bare = (host: string) => host.toLowerCase().replace(/^www\./, '')
const hostOf = (url: string) => { try { return new URL(url).hostname.toLowerCase() } catch { return null } }

/**
 * Which property to read: the only one, or the one for the business's website. A domain property
 * (sc-domain:example.com, which covers www, other subdomains, http and https) comes first, then a
 * URL-prefix property for the same address (https://www.example.com/), then one for the same site
 * with or without www. null: the admin chooses.
 */
export function pickSite(list: string[], website?: string | null): string | null {
  if (list.length === 1) return list[0]
  const host = hostOf(cleanWebsite(website) ?? '')
  if (!host) return null
  const domain = list.filter(s => s.startsWith('sc-domain:')).map(s => ({ s, d: s.slice('sc-domain:'.length).toLowerCase() }))
    .filter(({ d }) => host === d || host.endsWith(`.${d}`)).sort((a, b) => b.d.length - a.d.length)[0]?.s
  const prefixes = list.filter(s => /^https?:\/\//.test(s))
  const exact = prefixes.find(s => hostOf(s) === host && new URL(s).pathname === '/' && new URL(s).protocol === new URL(cleanWebsite(website)!).protocol)
  const same = prefixes.filter(s => hostOf(s) === host).concat(prefixes.filter(s => hostOf(s) !== host && bare(hostOf(s) ?? '') === bare(host)))
    .sort((a, b) => new URL(a).pathname.length - new URL(b).pathname.length)[0]
  return domain ?? exact ?? same ?? null
}

/** A property as people say it: "easybeanscoffee.com", "www.easybeanscoffee.com". */
export const siteLabel = (site: string) => site.startsWith('sc-domain:') ? site.slice('sc-domain:'.length) : site.replace(/^https?:\/\//, '').replace(/\/$/, '')

/** One small query (the last four weeks' totals): proves this account can read the property's search data. */
export async function probe(token: string, site: string) {
  const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10)
  await gsc(token, `/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { startDate: day(30), endDate: day(2), type: 'web', rowLimit: 1 })
}

interface ApiRow { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }
const row = (r?: ApiRow): SearchRow => ({
  clicks: r?.clicks ?? 0, impressions: r?.impressions ?? 0,
  ctr: Math.round((r?.ctr ?? 0) * 10_000) / 10_000, position: Math.round((r?.position ?? 0) * 10) / 10,
})

/** Web search figures for one property, from and to inclusive (YYYY-MM-DD, Google's Pacific-time days). */
export async function report(token: string, site: string, from: string, to: string): Promise<SearchReport> {
  const query = (dimensions: string[], rowLimit: number) =>
    gsc<{ rows?: ApiRow[] }>(token, `/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { startDate: from, endDate: to, type: 'web', dimensions, rowLimit })
      .then(r => r.rows ?? [])
  const byClicks = (a: SearchRow, b: SearchRow) => b.clicks - a.clicks || b.impressions - a.impressions
  // Totals come from their own query: rows split by search leave out the anonymised ones, so they add up to less.
  const [totals, days, queries, pages, devices, countries] = await Promise.all([
    query([], 1), query(['date'], 500), query(['query'], 25), query(['page'], 25), query(['device'], 10), query(['country'], 250),
  ])
  return {
    site, from, to,
    totals: row(totals[0]),
    days: days.map(r => ({ date: r.keys![0], ...row(r) })).sort((a, b) => a.date.localeCompare(b.date)),
    queries: queries.map(r => ({ query: r.keys![0], ...row(r) })).sort(byClicks),
    pages: pages.map(r => ({ page: r.keys![0], ...row(r) })).sort(byClicks),
    devices: devices.map(r => ({ device: r.keys![0] as 'DESKTOP' | 'MOBILE' | 'TABLET', ...row(r) })).sort(byClicks),
    countries: countries.map(r => ({ country: r.keys![0], ...row(r) })).sort(byClicks),
  }
}
