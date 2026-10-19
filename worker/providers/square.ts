// Square (Block) as the café's payment system, connected with one click (Square OAuth). Read-only:
// the business profile, its locations, its payments and its orders, so Finances can show takings
// next to the team's cost and Sales can show what sold. Access lasts 30 days and is renewed with
// the refresh token. ORDERS_READ came later: a connection made before it still works, without items.
import type { PayMethod, SalesDay, SalesItem } from '../../shared/types'

export const SQUARE_SCOPES = ['MERCHANT_PROFILE_READ', 'PAYMENTS_READ', 'ORDERS_READ']
const VERSION = '2025-01-23'

export interface SquareOAuthConfig { appId: string; appSecret: string; redirectUri: string; sandbox: boolean }
export const base = (sandbox: boolean) => sandbox ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com'

export function authUrl(cfg: SquareOAuthConfig, state: string) {
  const p = new URLSearchParams({ client_id: cfg.appId, scope: SQUARE_SCOPES.join(' '), session: 'false', state, redirect_uri: cfg.redirectUri })
  return `${base(cfg.sandbox)}/oauth2/authorize?${p}`
}

interface TokenResponse { access_token?: string; refresh_token?: string; expires_at?: string; merchant_id?: string; message?: string; type?: string; errors?: { code?: string; detail?: string }[] }

async function token(cfg: SquareOAuthConfig, body: Record<string, string>) {
  const res = await fetch(`${base(cfg.sandbox)}/oauth2/token`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'Square-Version': VERSION },
    body: JSON.stringify({ client_id: cfg.appId, client_secret: cfg.appSecret, ...body }),
  })
  const json = await res.json().catch(() => ({})) as TokenResponse
  if (!res.ok || !json.access_token) {
    const said = json.errors?.[0]?.detail ?? json.message ?? `Square error ${res.status}`
    throw new Error(/refresh|revoked|not_authorized|unauthorized|invalid_grant/i.test(`${said} ${json.type ?? ''} ${json.errors?.[0]?.code ?? ''}`) ? `invalid_grant: ${said}` : `Square: ${said}`)
  }
  return json
}

export const exchangeCode = (cfg: SquareOAuthConfig, code: string) => token(cfg, { code, grant_type: 'authorization_code', redirect_uri: cfg.redirectUri })
export const refreshAccess = (cfg: SquareOAuthConfig, refreshToken: string) => token(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken })

/** A Square API error; `code` is Square's (e.g. INSUFFICIENT_SCOPES). */
export class SquareError extends Error { constructor(message: string, readonly code?: string) { super(message) } }

async function api<T>(sandbox: boolean, accessToken: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base(sandbox)}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${accessToken}`, 'Square-Version': VERSION, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({})) as T & { errors?: { code?: string; detail?: string }[] }
  if (!res.ok) {
    const e = json.errors?.[0]
    throw new SquareError(/ACCESS_TOKEN_(REVOKED|EXPIRED)|UNAUTHORIZED/.test(e?.code ?? '') ? `invalid_grant: ${e?.detail ?? e?.code}` : `Square: ${e?.detail ?? e?.code ?? res.status}`, e?.code)
  }
  return json
}

export interface SquareLocation { id: string; name: string; currency?: string; status?: string }

export const merchant = async (sandbox: boolean, accessToken: string) =>
  (await api<{ merchant: { id: string; business_name?: string; currency?: string; country?: string } }>(sandbox, accessToken, '/v2/merchants/me')).merchant

export const locations = async (sandbox: boolean, accessToken: string) =>
  ((await api<{ locations?: SquareLocation[] }>(sandbox, accessToken, '/v2/locations')).locations ?? []).filter(l => (l.status ?? 'ACTIVE') === 'ACTIVE')

type DaySales = SalesDay & { hours: number[]; methods: Partial<Record<PayMethod, number>> }

/** How a payment was paid, in Square's words (source_type) → the app's four kinds. */
const methodOf = (source?: string): PayMethod => source === 'CARD' ? 'card' : source === 'CASH' ? 'cash' : source === 'WALLET' ? 'wallet' : 'other'

/**
 * Completed payments between two instants, added up per local day (Europe/Madrid by default),
 * across the given locations, with each day split by hour and by how people paid. Amounts are in
 * the currency's main unit (euros, not cents).
 */
export async function salesByDay(sandbox: boolean, accessToken: string, locationIds: string[], fromIso: string, toIso: string, timeZone = 'Europe/Madrid') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
  const local = (iso: string) => {
    const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 }
  }
  const byDay = new Map<string, DaySales>()
  let currency: string | undefined
  for (const location of locationIds) {
    let cursor: string | undefined
    do {
      const q = new URLSearchParams({ begin_time: fromIso, end_time: toIso, location_id: location, limit: '100', ...(cursor ? { cursor } : {}) })
      const page = await api<{ payments?: { created_at: string; status: string; source_type?: string; amount_money?: { amount: number; currency: string }; tip_money?: { amount: number }; refunded_money?: { amount: number } }[]; cursor?: string }>(
        sandbox, accessToken, `/v2/payments?${q}`)
      for (const p of page.payments ?? []) {
        if (p.status !== 'COMPLETED') continue
        currency ??= p.amount_money?.currency
        const { date, hour } = local(p.created_at)
        const row = byDay.get(date) ?? { date, gross: 0, tips: 0, refunds: 0, payments: 0, hours: Array<number>(24).fill(0), methods: {} }
        const amount = (p.amount_money?.amount ?? 0) / 100
        row.gross += amount
        row.tips += (p.tip_money?.amount ?? 0) / 100
        row.refunds += (p.refunded_money?.amount ?? 0) / 100
        row.payments += 1
        row.hours[hour] += amount
        const how = methodOf(p.source_type)
        row.methods[how] = (row.methods[how] ?? 0) + amount
        byDay.set(date, row)
      }
      cursor = page.cursor
    } while (cursor)
  }
  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
    ...d, gross: round(d.gross), tips: round(d.tips), refunds: round(d.refunds), hours: d.hours.map(round),
    methods: Object.fromEntries(Object.entries(d.methods).map(([k, v]) => [k, round(v)])),
  }))
  return { currency: currency ?? 'EUR', days }
}
const round = (n: number) => Math.round(n * 100) / 100

/**
 * What sold between two instants: completed orders' line items, added up by item (and variation,
 * when it isn't the only one), most sold first. Needs ORDERS_READ: without it Square answers
 * INSUFFICIENT_SCOPES (a SquareError with that code), and the business connects Square again.
 */
export async function topItems(sandbox: boolean, accessToken: string, locationIds: string[], fromIso: string, toIso: string, limit = 25): Promise<SalesItem[]> {
  const byName = new Map<string, SalesItem>()
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const r = await api<{ orders?: { line_items?: { name?: string; variation_name?: string; quantity?: string; gross_sales_money?: { amount: number } }[] }[]; cursor?: string }>(
      sandbox, accessToken, '/v2/orders/search', {
        location_ids: locationIds, limit: 500, ...(cursor ? { cursor } : {}),
        query: { filter: { state_filter: { states: ['COMPLETED'] }, date_time_filter: { closed_at: { start_at: fromIso, end_at: toIso } } }, sort: { sort_field: 'CLOSED_AT' } },
      })
    for (const o of r.orders ?? []) {
      for (const li of o.line_items ?? []) {
        const variation = li.variation_name && !/^regular$/i.test(li.variation_name) ? li.variation_name : null
        const name = [li.name?.trim() || 'Custom amount', variation].filter(Boolean).join(' · ')
        const row = byName.get(name) ?? { name, quantity: 0, gross: 0 }
        row.quantity += Number(li.quantity ?? 1) || 0
        row.gross += (li.gross_sales_money?.amount ?? 0) / 100
        byName.set(name, row)
      }
    }
    cursor = r.cursor
    if (!cursor) break
  }
  return [...byName.values()].map(i => ({ ...i, gross: round(i.gross), quantity: Math.round(i.quantity * 100) / 100 }))
    .sort((a, b) => b.gross - a.gross || b.quantity - a.quantity).slice(0, limit)
}
