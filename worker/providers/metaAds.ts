// Meta Ads (Facebook and Instagram ads) through the Marketing API: spend, reach, clicks and
// results per campaign and day for the Ads page, and pausing, resuming or changing a campaign's
// daily budget. Signed in with Facebook Login on the same Meta app as the Facebook Page connection,
// with its own permissions. Meta gives a person's sign-in for 60 days (no refresh token): the app
// warns a week before, like LinkedIn. ads_management (changes) needs Meta's App Review (Advanced
// Access) before people outside the Meta app's own roles can allow it.
import type { AdAccount, AdCampaign, AdDay, CampaignStatus } from '../../shared/ads'
import { FacebookError } from './facebook'

export const META_ADS_SCOPES = ['ads_read', 'ads_management', 'business_management']

export interface MetaAdsOAuthConfig { appId: string; appSecret: string; redirectUri: string; graphVersion: string }

const GRAPH = (v: string) => `https://graph.facebook.com/${v}`

export function authUrl(cfg: MetaAdsOAuthConfig, state: string) {
  const p = new URLSearchParams({ client_id: cfg.appId, redirect_uri: cfg.redirectUri, state, response_type: 'code', scope: META_ADS_SCOPES.join(',') })
  return `https://www.facebook.com/${cfg.graphVersion}/dialog/oauth?${p}`
}

async function graph<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } })
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string; code?: number } }
  if (!res.ok || json.error) throw new FacebookError(`Meta Ads: ${json.error?.message ?? res.status}`, json.error?.code)
  return json
}

/** Every page of a list (Meta pages long answers with paging.next, a full address). */
async function all<T>(url: string, token: string): Promise<T[]> {
  const out: T[] = []
  for (let next: string | undefined = url, n = 0; next && n < 20; n++) {
    const page: { data?: T[]; paging?: { next?: string } } = await graph(next, token)
    out.push(...(page.data ?? []))
    next = page.paging?.next
  }
  return out
}

/** Code → a 60-day sign-in, when it runs out, and the permissions the person allowed. */
export async function exchangeCode(cfg: MetaAdsOAuthConfig, code: string) {
  const plain = async <T>(url: string) => {
    const res = await fetch(url)
    const json = await res.json().catch(() => ({})) as T & { error?: { message?: string; code?: number } }
    if (!res.ok || json.error) throw new FacebookError(`Meta Ads: ${json.error?.message ?? res.status}`, json.error?.code)
    return json
  }
  const short = await plain<{ access_token: string }>(`${GRAPH(cfg.graphVersion)}/oauth/access_token?${new URLSearchParams({
    client_id: cfg.appId, client_secret: cfg.appSecret, redirect_uri: cfg.redirectUri, code })}`)
  const long = await plain<{ access_token: string; expires_in?: number }>(`${GRAPH(cfg.graphVersion)}/oauth/access_token?${new URLSearchParams({
    grant_type: 'fb_exchange_token', client_id: cfg.appId, client_secret: cfg.appSecret, fb_exchange_token: short.access_token })}`)
  const perms = await graph<{ data: { permission: string; status: string }[] }>(`${GRAPH(cfg.graphVersion)}/me/permissions`, long.access_token)
  return {
    access_token: long.access_token,
    expires_at: new Date(Date.now() + (long.expires_in ?? 5_184_000) * 1000).toISOString(),
    granted: perms.data.filter(p => p.status === 'granted').map(p => p.permission),
  }
}

/** Meta's account_status: 1 active, 2 disabled, 3 unsettled, 7–9 under review or closing, 100+ closed. */
const OPEN_ACCOUNT = new Set([1, 3, 7, 8, 9])

/** The ad accounts this person can use (closed and disabled ones left out). Ids keep Meta's act_ prefix. */
export async function adAccounts(graphVersion: string, token: string): Promise<AdAccount[]> {
  const rows = await all<{ id: string; name?: string; currency?: string; account_status?: number }>(
    `${GRAPH(graphVersion)}/me/adaccounts?fields=id,name,currency,account_status&limit=100`, token)
  return rows.filter(a => OPEN_ACCOUNT.has(a.account_status ?? 1))
    .map(a => ({ id: a.id, name: a.name || a.id, currency: a.currency ?? 'EUR' })).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Results: what a café's campaigns are usually for, counted once each: purchases (online orders),
 * leads (forms) and messaging conversations started (people writing on Instagram, Messenger or
 * WhatsApp). Link clicks are already the clicks figure; likes and video views aren't results.
 */
export const RESULT_ACTIONS = ['purchase', 'lead', 'onsite_conversion.messaging_conversation_started_7d']
export const resultsOf = (actions?: { action_type: string; value: string }[]) =>
  Math.round((actions ?? []).filter(a => RESULT_ACTIONS.includes(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0) * 100) / 100

/** Meta's budgets are whole cents (minor units) in a string. */
export const fromMinor = (v: string | number | undefined | null) => (v === undefined || v === null || v === '' ? null : Number(v) / 100)

const STATUS: Record<string, CampaignStatus> = { ACTIVE: 'active', PAUSED: 'paused' }
interface RawCampaign { id: string; name?: string; status?: string; effective_status?: string; daily_budget?: string; lifetime_budget?: string }
interface RawInsight { campaign_id?: string; date_start?: string; spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[] }

/**
 * Campaigns (not deleted or archived) and their figures from and to inclusive (the ad account's
 * time zone), and the figures per day. A budget kept on the ad sets, or a lifetime budget, isn't
 * a daily budget here.
 */
export async function report(graphVersion: string, token: string, accountId: string, from: string, to: string) {
  const [camps, rows] = await Promise.all([
    all<RawCampaign>(`${GRAPH(graphVersion)}/${accountId}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget&limit=200`, token),
    all<RawInsight>(`${GRAPH(graphVersion)}/${accountId}/insights?${new URLSearchParams({ level: 'campaign', time_increment: '1', limit: '500',
      fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions', time_range: JSON.stringify({ since: from, until: to }) })}`, token),
  ])
  const add = (a: Omit<AdDay, 'date'>, b: Omit<AdDay, 'date'>) => ({ spend: Math.round((a.spend + b.spend) * 100) / 100, impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks, results: Math.round((a.results + b.results) * 100) / 100 })
  const zero = { spend: 0, impressions: 0, clicks: 0, results: 0 }
  const byCampaign = new Map<string, Omit<AdDay, 'date'>>()
  const byDay = new Map<string, Omit<AdDay, 'date'>>()
  for (const r of rows) {
    const m = { spend: Number(r.spend ?? 0), impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks ?? 0), results: resultsOf(r.actions) }
    byCampaign.set(r.campaign_id ?? '', add(byCampaign.get(r.campaign_id ?? '') ?? zero, m))
    byDay.set(r.date_start ?? '', add(byDay.get(r.date_start ?? '') ?? zero, m))
  }
  const campaigns: AdCampaign[] = camps.filter(c => !['DELETED', 'ARCHIVED'].includes(c.effective_status ?? c.status ?? '')).map(c => ({
    platform: 'meta_ads', id: c.id, name: c.name ?? c.id, status: STATUS[c.status ?? ''] ?? 'other',
    daily_budget: c.lifetime_budget && Number(c.lifetime_budget) > 0 ? null : fromMinor(c.daily_budget),
    ...(byCampaign.get(c.id) ?? zero),
  }))
  return { campaigns, days: [...byDay].map(([date, m]) => ({ date, ...m })).sort((a, b) => a.date.localeCompare(b.date)) }
}

/** Pause or resume a campaign, or set its daily budget (in the account's currency). */
export async function updateCampaign(graphVersion: string, token: string, campaignId: string, patch: { status?: 'active' | 'paused'; daily_budget?: number }) {
  const form = new URLSearchParams()
  if (patch.status) form.set('status', patch.status === 'active' ? 'ACTIVE' : 'PAUSED')
  if (patch.daily_budget !== undefined) form.set('daily_budget', String(Math.round(patch.daily_budget * 100)))
  await graph(`${GRAPH(graphVersion)}/${encodeURIComponent(campaignId)}`, token, { method: 'POST', body: form })
}
