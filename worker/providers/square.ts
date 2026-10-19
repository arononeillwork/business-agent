// Square (Block) as the café's payment system, connected with one click (Square OAuth). Read-only:
// the business profile, its locations and its payments, so the Finances page can show takings next
// to the team's cost. Access lasts 30 days and is renewed with the refresh token.
export const SQUARE_SCOPES = ['MERCHANT_PROFILE_READ', 'PAYMENTS_READ']
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

async function api<T>(sandbox: boolean, accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${base(sandbox)}${path}`, { headers: { authorization: `Bearer ${accessToken}`, 'Square-Version': VERSION, accept: 'application/json' } })
  const json = await res.json().catch(() => ({})) as T & { errors?: { code?: string; detail?: string }[] }
  if (!res.ok) {
    const e = json.errors?.[0]
    throw new Error(/ACCESS_TOKEN_(REVOKED|EXPIRED)|UNAUTHORIZED/.test(e?.code ?? '') ? `invalid_grant: ${e?.detail ?? e?.code}` : `Square: ${e?.detail ?? e?.code ?? res.status}`)
  }
  return json
}

export interface SquareLocation { id: string; name: string; currency?: string; status?: string }

export const merchant = async (sandbox: boolean, accessToken: string) =>
  (await api<{ merchant: { id: string; business_name?: string; currency?: string; country?: string } }>(sandbox, accessToken, '/v2/merchants/me')).merchant

export const locations = async (sandbox: boolean, accessToken: string) =>
  ((await api<{ locations?: SquareLocation[] }>(sandbox, accessToken, '/v2/locations')).locations ?? []).filter(l => (l.status ?? 'ACTIVE') === 'ACTIVE')

export interface DaySales { date: string; gross: number; tips: number; refunds: number; payments: number }

/**
 * Completed payments between two instants, added up per local day (Europe/Madrid by default),
 * across the given locations. Amounts are in the currency's main unit (euros, not cents).
 */
export async function salesByDay(sandbox: boolean, accessToken: string, locationIds: string[], fromIso: string, toIso: string, timeZone = 'Europe/Madrid') {
  const day = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const byDay = new Map<string, DaySales>()
  let currency: string | undefined
  for (const location of locationIds) {
    let cursor: string | undefined
    do {
      const q = new URLSearchParams({ begin_time: fromIso, end_time: toIso, location_id: location, limit: '100', ...(cursor ? { cursor } : {}) })
      const page = await api<{ payments?: { created_at: string; status: string; amount_money?: { amount: number; currency: string }; tip_money?: { amount: number }; refunded_money?: { amount: number } }[]; cursor?: string }>(
        sandbox, accessToken, `/v2/payments?${q}`)
      for (const p of page.payments ?? []) {
        if (p.status !== 'COMPLETED') continue
        currency ??= p.amount_money?.currency
        const d = day(p.created_at)
        const row = byDay.get(d) ?? { date: d, gross: 0, tips: 0, refunds: 0, payments: 0 }
        row.gross += (p.amount_money?.amount ?? 0) / 100
        row.tips += (p.tip_money?.amount ?? 0) / 100
        row.refunds += (p.refunded_money?.amount ?? 0) / 100
        row.payments += 1
        byDay.set(d, row)
      }
      cursor = page.cursor
    } while (cursor)
  }
  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(d => ({ ...d, gross: round(d.gross), tips: round(d.tips), refunds: round(d.refunds) }))
  return { currency: currency ?? 'EUR', days }
}
const round = (n: number) => Math.round(n * 100) / 100
