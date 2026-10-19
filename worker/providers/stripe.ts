// Stripe as the business's payment system, connected with one click (Stripe Connect OAuth,
// read-only). The business signs in to its own Stripe account and allows read access; the app
// keeps only the connected account's id and reads with the platform's secret key plus the
// Stripe-Account header, as Stripe recommends. Nothing expires, so nothing needs renewing.

export interface StripeOAuthConfig { clientId: string; secretKey: string; redirectUri: string }

export function authUrl(cfg: StripeOAuthConfig, state: string) {
  const p = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, scope: 'read_only', state, redirect_uri: cfg.redirectUri })
  return `https://connect.stripe.com/oauth/authorize?${p}`
}

interface OAuthResponse { stripe_user_id?: string; scope?: string; error?: string; error_description?: string }

/** The connected account's id (acct_…) once the business allowed access. */
export async function exchangeCode(cfg: StripeOAuthConfig, code: string): Promise<{ accountId: string; scope?: string }> {
  const res = await fetch('https://connect.stripe.com/oauth/token', {
    method: 'POST', headers: { authorization: `Bearer ${cfg.secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code }),
  })
  const json = await res.json().catch(() => ({})) as OAuthResponse
  if (!res.ok || !json.stripe_user_id) throw new Error(`Stripe: ${json.error_description ?? json.error ?? res.status}`)
  return { accountId: json.stripe_user_id, scope: json.scope }
}

/** Stop the app's access to the account (on disconnect). */
export async function deauthorize(cfg: StripeOAuthConfig, accountId: string) {
  await fetch('https://connect.stripe.com/oauth/deauthorize', {
    method: 'POST', headers: { authorization: `Bearer ${cfg.secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, stripe_user_id: accountId }),
  }).catch(() => {})
}

async function api<T>(secretKey: string, accountId: string, path: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, { headers: { authorization: `Bearer ${secretKey}`, 'Stripe-Account': accountId } })
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string; code?: string; type?: string } }
  if (!res.ok) {
    const e = json.error
    // The business removed the app in its Stripe settings (or the account is gone).
    const removed = e?.code === 'account_invalid' || /does not have access to account|no such account|revoked/i.test(e?.message ?? '')
    throw new Error(removed ? `invalid_grant: ${e?.message}` : `Stripe: ${e?.message ?? res.status}`)
  }
  return json
}

export interface StripeAccount { id: string; name: string | null; currency: string; chargesEnabled: boolean }

export async function account(secretKey: string, accountId: string): Promise<StripeAccount> {
  const a = await api<{ id: string; business_profile?: { name?: string }; settings?: { dashboard?: { display_name?: string } }; email?: string;
    default_currency?: string; charges_enabled?: boolean }>(secretKey, accountId, '/account')
  return { id: a.id, name: a.business_profile?.name ?? a.settings?.dashboard?.display_name ?? a.email ?? null,
    currency: (a.default_currency ?? 'eur').toUpperCase(), chargesEnabled: !!a.charges_enabled }
}

interface BalanceTx { id: string; type: string; amount: number; currency: string; created: number }

/**
 * Takings between two instants, added up per local day (Europe/Madrid by default), from the
 * account's balance: payments add to gross, refunds to refunds. Amounts in main units (euros).
 */
export async function salesByDay(secretKey: string, accountId: string, fromIso: string, toIso: string, timeZone = 'Europe/Madrid') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
  const local = (unix: number) => {
    const p = Object.fromEntries(parts.formatToParts(new Date(unix * 1000)).map(x => [x.type, x.value]))
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 }
  }
  const byDay = new Map<string, { date: string; gross: number; tips: number; refunds: number; payments: number; hours: number[] }>()
  let currency: string | undefined
  let after: string | undefined
  for (let page = 0; page < 30; page++) {
    const q = new URLSearchParams({ 'created[gte]': String(Math.floor(Date.parse(fromIso) / 1000)), 'created[lt]': String(Math.floor(Date.parse(toIso) / 1000)), limit: '100',
      ...(after ? { starting_after: after } : {}) })
    const r = await api<{ data: BalanceTx[]; has_more: boolean }>(secretKey, accountId, `/balance_transactions?${q}`)
    for (const t of r.data) {
      const pay = t.type === 'charge' || t.type === 'payment'
      const refund = t.type === 'refund' || t.type === 'payment_refund'
      if (!pay && !refund) continue
      currency ??= t.currency.toUpperCase()
      const { date, hour } = local(t.created)
      const row = byDay.get(date) ?? { date, gross: 0, tips: 0, refunds: 0, payments: 0, hours: Array<number>(24).fill(0) }
      if (pay) { row.gross += t.amount / 100; row.payments += 1; row.hours[hour] += t.amount / 100 } else row.refunds += Math.abs(t.amount) / 100
      byDay.set(date, row)
    }
    if (!r.has_more || !r.data.length) break
    after = r.data[r.data.length - 1].id
  }
  const round = (n: number) => Math.round(n * 100) / 100
  return { currency: currency ?? 'EUR', days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(d => ({ ...d, gross: round(d.gross), refunds: round(d.refunds), hours: d.hours.map(round) })) }
}
