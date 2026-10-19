// SumUp as the business's payment system (the card reader and its till app), connected with one
// click (SumUp OAuth). Read-only: the merchant profile and the transactions history, so Finances can
// show takings next to the team's cost and Sales can show when and how people paid. Access lasts
// an hour and is renewed with the refresh token. The history has no line items (only a one-line
// product summary), so there are no best sellers from SumUp.
import type { PayMethod, SalesDay } from '../../shared/types'

// transactions.history: payments, tips and refunds; user.profile_readonly: the business name and
// merchant code. Nothing that can take, refund or move money, or change the SumUp app's settings.
export const SUMUP_SCOPES = ['transactions.history', 'user.profile_readonly']
const API = 'https://api.sumup.com'

export interface SumUpOAuthConfig { clientId: string; clientSecret: string; redirectUri: string }

export function authUrl(cfg: SumUpOAuthConfig, state: string) {
  const p = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, redirect_uri: cfg.redirectUri, scope: SUMUP_SCOPES.join(' '), state })
  return `${API}/authorize?${p}`
}

interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }

async function token(body: Record<string, string>) {
  const res = await fetch(`${API}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) })
  const json = await res.json().catch(() => ({})) as TokenResponse
  if (!res.ok || !json.access_token) {
    // Keep the code: invalid_grant means the access was removed or the refresh token ran out (6 months unused).
    throw new Error(json.error === 'invalid_grant' ? `invalid_grant: ${json.error_description ?? 'access revoked or expired'}` : `SumUp: ${json.error_description ?? json.error ?? res.status}`)
  }
  return json
}

export const exchangeCode = (cfg: SumUpOAuthConfig, code: string) =>
  token({ grant_type: 'authorization_code', client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: cfg.redirectUri })
export const refreshAccess = (cfg: SumUpOAuthConfig, refreshToken: string) =>
  token({ grant_type: 'refresh_token', client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refreshToken })

async function api<T>(accessToken: string, pathAndQuery: string): Promise<T> {
  const res = await fetch(`${API}${pathAndQuery}`, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' } })
  const json = await res.json().catch(() => ({})) as T & { message?: string; error_message?: string; error_code?: string }
  if (!res.ok) {
    const said = json.message ?? json.error_message ?? json.error_code ?? String(res.status)
    // 401: the access was removed in SumUp (or the token is no good any more).
    throw new Error(res.status === 401 ? `invalid_grant: ${said}` : `SumUp: ${said}`)
  }
  return json
}

export interface SumUpMerchant { merchant_code: string; name: string | null; currency: string | null }

/** The signed-in merchant: its code, the name it trades under, and its currency when SumUp says. */
export async function merchant(accessToken: string): Promise<SumUpMerchant> {
  const me = await api<{ account?: { username?: string }; merchant_profile?: {
    merchant_code?: string; company_name?: string; currency?: string; default_currency?: string; country?: string
    doing_business_as?: { business_name?: string }
  } }>(accessToken, '/v0.1/me')
  const m = me.merchant_profile
  if (!m?.merchant_code) throw new Error('This SumUp login has no merchant account. Sign in with the account the card reader uses.')
  return { merchant_code: m.merchant_code, name: m.doing_business_as?.business_name || m.company_name || me.account?.username || null,
    currency: m.currency ?? m.default_currency ?? null }
}

/** One item of the transactions history, as SumUp sends it. `amount` is in main units (euros) and includes the tip. */
export interface SumUpTransaction {
  id: string; timestamp: string; amount: number; currency: string; status: string
  type?: string; payment_type?: string; entry_mode?: string; card_type?: string; tip_amount?: number; refunded_amount?: number
}

/** How a payment was paid, in SumUp's words → the app's four kinds. */
const methodOf = (t: SumUpTransaction): PayMethod => {
  if (t.payment_type === 'CASH') return 'cash'
  if (/APPLE_PAY|GOOGLE_PAY|SAMSUNG_PAY/i.test(t.entry_mode ?? '')) return 'wallet'
  if (['POS', 'ECOM', 'MOTO', 'RECURRING'].includes(t.payment_type ?? '') || t.card_type) return 'card'
  return 'other'
}

/** Payments (successful, or refunded since) between two instants, oldest first, page by page. */
export async function transactions(accessToken: string, fromIso: string, toIso: string, maxPages = 50) {
  const out: SumUpTransaction[] = []
  let q: string | undefined = new URLSearchParams([['limit', '100'], ['order', 'ascending'], ['oldest_time', fromIso], ['newest_time', toIso],
    ['statuses[]', 'SUCCESSFUL'], ['statuses[]', 'REFUNDED'], ['types[]', 'PAYMENT']]).toString()
  for (let page = 0; q && page < maxPages; page++) {
    const r: { items?: SumUpTransaction[]; links?: { rel: string; href: string }[] } = await api(accessToken, `/v0.1/me/transactions/history?${q}`)
    out.push(...(r.items ?? []))
    // The next page comes as a query string (or a whole address) under links rel=next.
    const next = r.links?.find(l => l.rel === 'next')?.href
    q = next ? (/^https?:/.test(next) ? new URL(next).search.slice(1) : next.replace(/^\?/, '')) : undefined
    if (!r.items?.length) break
  }
  return out
}

/** The latest transaction, if any: proves the history can be read (and tells the currency). */
export async function latest(accessToken: string) {
  const r = await api<{ items?: SumUpTransaction[] }>(accessToken, '/v0.1/me/transactions/history?limit=1&order=descending')
  return r.items?.[0] ?? null
}

type DaySales = SalesDay & { hours: number[]; methods: Partial<Record<PayMethod, number>> }

/**
 * Takings between two instants, added up per local day (Europe/Madrid by default), with each day
 * split by hour and by how people paid, the same shape as Square's. `gross` excludes tips (SumUp's
 * amount includes them); refunds are what was given back on those payments.
 */
export async function salesByDay(accessToken: string, fromIso: string, toIso: string, timeZone = 'Europe/Madrid') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
  const local = (iso: string) => {
    const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 }
  }
  const from = Date.parse(fromIso), to = Date.parse(toIso)
  const byDay = new Map<string, DaySales>()
  let currency: string | undefined
  for (const t of await transactions(accessToken, fromIso, toIso)) {
    if ((t.type ?? 'PAYMENT') !== 'PAYMENT' || !['SUCCESSFUL', 'REFUNDED'].includes(t.status)) continue
    const at = Date.parse(t.timestamp)
    if (!(at >= from && at < to)) continue
    currency ??= t.currency
    const { date, hour } = local(t.timestamp)
    const row = byDay.get(date) ?? { date, gross: 0, tips: 0, refunds: 0, payments: 0, hours: Array<number>(24).fill(0), methods: {} }
    const tip = t.tip_amount ?? 0
    const amount = (t.amount ?? 0) - tip
    row.gross += amount
    row.tips += tip
    row.refunds += t.refunded_amount ?? (t.status === 'REFUNDED' ? t.amount ?? 0 : 0)
    row.payments += 1
    row.hours[hour] += amount
    const how = methodOf(t)
    row.methods[how] = (row.methods[how] ?? 0) + amount
    byDay.set(date, row)
  }
  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
    ...d, gross: round(d.gross), tips: round(d.tips), refunds: round(d.refunds), hours: d.hours.map(round),
    methods: Object.fromEntries(Object.entries(d.methods).map(([k, v]) => [k, round(v)])),
  }))
  return { currency: currency ?? 'EUR', days }
}
const round = (n: number) => Math.round(n * 100) / 100
