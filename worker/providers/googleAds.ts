// Google Ads: spend, clicks and conversions per campaign and day for the Ads page, and pausing,
// resuming or changing a campaign's daily budget from there. Signed in with the same Google app as
// Gmail and Drive (adwords scope); every call also carries Business Agent's developer token, which
// Google issues from a Google Ads manager account (API Center) and must approve for real accounts.
// Money comes in micros (a millionth of the account's currency).
import type { AdAccount, AdCampaign, AdDay, CampaignStatus } from '../../shared/ads'

export const GOOGLE_ADS_SCOPES = ['https://www.googleapis.com/auth/adwords', 'openid', 'email']
export const GOOGLE_ADS_VERSION = 'v21'

export interface GoogleAdsConfig { developerToken: string; version: string }
/** An ad account; `login`: the manager account it's reached through, when it isn't directly the person's. */
export type GoogleAdsAccount = AdAccount & { login?: string }

/** A Google Ads API error, with Google's own error code when it gives one (e.g. DEVELOPER_TOKEN_NOT_APPROVED). */
export class GoogleAdsError extends Error { constructor(message: string, readonly code?: string) { super(message) } }

interface ApiError { error?: { message?: string; status?: string; details?: { errors?: { errorCode?: Record<string, string>; message?: string }[] }[] } }

async function ads<T>(cfg: GoogleAdsConfig, token: string, path: string, body?: unknown, login?: string): Promise<T> {
  const res = await fetch(`https://googleads.googleapis.com/${cfg.version}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'developer-token': cfg.developerToken, ...(login ? { 'login-customer-id': login } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({})) as T & ApiError
  if (!res.ok) {
    const first = json.error?.details?.flatMap(d => d.errors ?? [])[0]
    const code = first?.errorCode ? Object.values(first.errorCode)[0] : json.error?.status
    throw new GoogleAdsError(`Google Ads: ${first?.message ?? json.error?.message ?? res.status}${code ? ` (${code})` : ''}`, code)
  }
  return json
}

/** Every row of a GAQL query (Google pages long answers). */
async function search<R>(cfg: GoogleAdsConfig, token: string, customer: string, query: string, login?: string): Promise<R[]> {
  const out: R[] = []
  let pageToken: string | undefined
  do {
    const page = await ads<{ results?: R[]; nextPageToken?: string }>(cfg, token, `/customers/${customer}/googleAds:search`, { query, ...(pageToken ? { pageToken } : {}) }, login)
    out.push(...(page.results ?? []))
    pageToken = page.nextPageToken
  } while (pageToken)
  return out
}

interface CustomerRow { customer?: { id?: string; descriptiveName?: string; currencyCode?: string; manager?: boolean } }
interface ClientRow { customerClient?: { id?: string; descriptiveName?: string; currencyCode?: string; manager?: boolean } }

/**
 * The ad accounts this Google account can read: its own, and those under a manager account it
 * runs (agencies often run a business's ads that way). Manager accounts themselves have no ads.
 */
export async function accounts(cfg: GoogleAdsConfig, token: string): Promise<GoogleAdsAccount[]> {
  const { resourceNames = [] } = await ads<{ resourceNames?: string[] }>(cfg, token, '/customers:listAccessibleCustomers')
  const found = new Map<string, GoogleAdsAccount>()
  for (const id of resourceNames.map(r => r.replace(/^customers\//, ''))) {
    const [c] = await search<CustomerRow>(cfg, token, id, 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1')
      .catch(() => [] as CustomerRow[]) // a cancelled or closed account the person still "has"
    if (!c?.customer) continue
    if (!c.customer.manager) {
      found.set(id, { id, name: c.customer.descriptiveName || id, currency: c.customer.currencyCode ?? 'EUR' })
      continue
    }
    const clients = await search<ClientRow>(cfg, token, id, 'SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager FROM customer_client WHERE customer_client.manager = false', id)
      .catch(() => [] as ClientRow[])
    for (const { customerClient: k } of clients) {
      if (k?.id && !found.has(k.id)) found.set(k.id, { id: k.id, name: k.descriptiveName || k.id, currency: k.currencyCode ?? 'EUR', login: id })
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Micros (a string, as the API sends 64-bit numbers) → money, to the cent. */
export const fromMicros = (v: string | number | undefined) => Math.round(Number(v ?? 0) / 10_000) / 100
export const toMicros = (money: number) => String(Math.round(money * 100) * 10_000)

const STATUS: Record<string, CampaignStatus> = { ENABLED: 'active', PAUSED: 'paused' }

interface CampaignRow {
  campaign?: { id?: string; name?: string; status?: string; resourceName?: string }
  campaignBudget?: { resourceName?: string; amountMicros?: string; explicitlyShared?: boolean; period?: string }
}
interface MetricRow {
  campaign?: { id?: string }
  segments?: { date?: string }
  metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number }
}

const day = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''

/**
 * Campaigns (not removed) and their figures from and to inclusive (the account's own time zone),
 * plus the figures per day. A shared budget (several campaigns on one) has no daily budget here:
 * changing it would change the others too.
 */
export async function report(cfg: GoogleAdsConfig, token: string, account: GoogleAdsAccount, from: string, to: string) {
  const [camps, rows] = await Promise.all([
    search<CampaignRow>(cfg, token, account.id, "SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros, campaign_budget.explicitly_shared, campaign_budget.period FROM campaign WHERE campaign.status != 'REMOVED'", account.login),
    search<MetricRow>(cfg, token, account.id, `SELECT campaign.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${day(from)}' AND '${day(to)}'`, account.login),
  ])
  const byCampaign = new Map<string, Omit<AdDay, 'date'>>()
  const byDay = new Map<string, AdDay>()
  for (const r of rows) {
    const m = { spend: fromMicros(r.metrics?.costMicros), impressions: Number(r.metrics?.impressions ?? 0), clicks: Number(r.metrics?.clicks ?? 0), results: Math.round((r.metrics?.conversions ?? 0) * 100) / 100 }
    const id = r.campaign?.id ?? '', date = r.segments?.date ?? ''
    const c = byCampaign.get(id) ?? { spend: 0, impressions: 0, clicks: 0, results: 0 }
    byCampaign.set(id, { spend: Math.round((c.spend + m.spend) * 100) / 100, impressions: c.impressions + m.impressions, clicks: c.clicks + m.clicks, results: Math.round((c.results + m.results) * 100) / 100 })
    const d = byDay.get(date) ?? { date, spend: 0, impressions: 0, clicks: 0, results: 0 }
    byDay.set(date, { date, spend: Math.round((d.spend + m.spend) * 100) / 100, impressions: d.impressions + m.impressions, clicks: d.clicks + m.clicks, results: Math.round((d.results + m.results) * 100) / 100 })
  }
  const campaigns: AdCampaign[] = camps.map(r => ({
    platform: 'google_ads', id: r.campaign?.id ?? '', name: r.campaign?.name ?? '', status: STATUS[r.campaign?.status ?? ''] ?? 'other',
    daily_budget: !r.campaignBudget?.explicitlyShared && (r.campaignBudget?.period ?? 'DAILY') === 'DAILY' && r.campaignBudget?.amountMicros ? fromMicros(r.campaignBudget.amountMicros) : null,
    ...(byCampaign.get(r.campaign?.id ?? '') ?? { spend: 0, impressions: 0, clicks: 0, results: 0 }),
  }))
  return { campaigns, days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)) }
}

/** Pause or resume a campaign. */
export async function setStatus(cfg: GoogleAdsConfig, token: string, account: GoogleAdsAccount, campaignId: string, status: 'active' | 'paused') {
  await ads(cfg, token, `/customers/${account.id}/campaigns:mutate`, {
    operations: [{ update: { resourceName: `customers/${account.id}/campaigns/${campaignId}`, status: status === 'active' ? 'ENABLED' : 'PAUSED' }, updateMask: 'status' }],
  }, account.login)
}

/** Change a campaign's own daily budget (refused for a shared budget, which other campaigns use too). */
export async function setDailyBudget(cfg: GoogleAdsConfig, token: string, account: GoogleAdsAccount, campaignId: string, amount: number) {
  const [row] = await search<CampaignRow>(cfg, token, account.id,
    `SELECT campaign.id, campaign_budget.resource_name, campaign_budget.explicitly_shared FROM campaign WHERE campaign.id = ${Number(campaignId)}`, account.login)
  if (!row?.campaignBudget?.resourceName) throw new GoogleAdsError('Google Ads: that campaign wasn’t found')
  if (row.campaignBudget.explicitlyShared) throw new GoogleAdsError('This campaign shares its budget with other campaigns. Change it in Google Ads.')
  await ads(cfg, token, `/customers/${account.id}/campaignBudgets:mutate`, {
    operations: [{ update: { resourceName: row.campaignBudget.resourceName, amountMicros: toMicros(amount) }, updateMask: 'amount_micros' }],
  }, account.login)
}
