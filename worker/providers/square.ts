// Square (Block) as the café's payment system, connected with one click (Square OAuth). It reads
// the business profile, its locations, its payments, its orders and its customer directory, so
// Finances can show takings next to the team's cost, Sales can show what sold and Customers lists
// the till's customers; and its loyalty programme and gift cards (the Loyalty page), where the only
// changes the app makes are goodwill points and selling a digital gift card. Access lasts 30 days
// and is renewed with the refresh token. ORDERS_READ, CUSTOMERS_READ, the loyalty and gift card
// permissions and ITEMS_READ (the item library, for the Menu page) came later: a connection made
// before them still works, without those parts. So did EMPLOYEES_READ and EMPLOYEES_WRITE: the team
// members (each person's own Square login, linked on the Team page) and who took each payment
// (the Leaderboard's sales). And ITEMS_WRITE: a menu price changed in the app is changed in the item
// library too (only the prices of the items' variations; nothing is added or deleted there).
import type { SquareObject, SquareVariation } from '../../shared/menuSquare'
import type { PayMethod, SalesDay, SalesItem } from '../../shared/types'
import type { MemberTips } from '../../shared/tips'
import { hmacBase64, safeEqual } from '../crypto'

export const SQUARE_SCOPES = ['MERCHANT_PROFILE_READ', 'PAYMENTS_READ', 'ORDERS_READ', 'CUSTOMERS_READ', 'CUSTOMERS_WRITE',
  'LOYALTY_READ', 'LOYALTY_WRITE', 'GIFTCARDS_READ', 'GIFTCARDS_WRITE', 'ITEMS_READ', 'EMPLOYEES_READ', 'EMPLOYEES_WRITE', 'ITEMS_WRITE']
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

/** A Square API error; `code` is Square's (e.g. INSUFFICIENT_SCOPES), `status` the HTTP status. */
export class SquareError extends Error { constructor(message: string, readonly code?: string, readonly status?: number) { super(message) } }

async function api<T>(sandbox: boolean, accessToken: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base(sandbox)}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${accessToken}`, 'Square-Version': VERSION, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({})) as T & { errors?: { code?: string; detail?: string }[] }
  if (!res.ok) {
    const e = json.errors?.[0]
    throw new SquareError(/ACCESS_TOKEN_(REVOKED|EXPIRED)|UNAUTHORIZED/.test(e?.code ?? '') ? `invalid_grant: ${e?.detail ?? e?.code}` : `Square: ${e?.detail ?? e?.code ?? res.status}`, e?.code, res.status)
  }
  return json
}

/** Square's API for the other Square modules (loyalty and gift cards): GET, or POST with a body. */
export const squareApi = api

/**
 * A customer made by the app (CUSTOMERS_WRITE): a rep who earns credit, so the team finds them on the
 * till. The same key gives back the same customer, so a retry never makes a second.
 */
export async function createCustomer(sandbox: boolean, accessToken: string,
  c: { key: string; given_name: string; nickname?: string | null; reference_id: string; note?: string | null }): Promise<string> {
  const r = await api<{ customer: { id: string } }>(sandbox, accessToken, '/v2/customers', {
    idempotency_key: c.key, given_name: c.given_name, reference_id: c.reference_id,
    ...(c.nickname ? { nickname: c.nickname } : {}), ...(c.note ? { note: c.note } : {}),
  })
  return r.customer.id
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

/**
 * The item library: items with their variations, categories, modifier lists and images (the Menu page,
 * when its menu comes from Square). Needs ITEMS_READ: without it Square answers INSUFFICIENT_SCOPES.
 */
export async function catalog(sandbox: boolean, accessToken: string): Promise<SquareObject[]> {
  const objects: SquareObject[] = []
  let cursor: string | undefined
  for (let page = 0; page < 30; page++) {
    const r = await api<{ objects?: SquareObject[]; cursor?: string }>(sandbox, accessToken,
      `/v2/catalog/list?types=ITEM,CATEGORY,MODIFIER_LIST,IMAGE${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    objects.push(...(r.objects ?? []))
    cursor = r.cursor
    if (!cursor) break
  }
  return objects
}

/** Items (or modifier lists) by their ids, each with its variations as Square has them now (versions included). */
export async function catalogObjects(sandbox: boolean, accessToken: string, ids: string[]): Promise<SquareObject[]> {
  if (!ids.length) return []
  const r = await api<{ objects?: SquareObject[] }>(sandbox, accessToken, '/v2/catalog/batch-retrieve', { object_ids: ids, include_related_objects: false })
  return r.objects ?? []
}

/**
 * Item variations with their new prices, in one go (all or none). Each is sent as Square gave it, with
 * its version, so a change made in Square meanwhile is refused (VERSION_MISMATCH) rather than overwritten.
 * Needs ITEMS_WRITE: without it Square answers INSUFFICIENT_SCOPES. The idempotency key makes a retry
 * of the same change harmless.
 */
export async function upsertVariations(sandbox: boolean, accessToken: string, idempotencyKey: string, variations: SquareVariation[]) {
  await api<{ objects?: unknown[] }>(sandbox, accessToken, '/v2/catalog/batch-upsert', {
    idempotency_key: idempotencyKey, batches: [{ objects: variations.map(v => ({ ...v, type: 'ITEM_VARIATION' })) }],
  })
}

/** A customer in the seller's Square directory (what we read of it). */
export interface SquareCustomer {
  id: string
  given_name?: string
  family_name?: string
  company_name?: string
  email_address?: string
  phone_number?: string
  /** "1990-05-14", or "0000-05-14" when Square wasn't told the year. */
  birthday?: string
  note?: string
  updated_at?: string
}

/**
 * The customer directory, or only the customers added or changed since an instant. Needs
 * CUSTOMERS_READ: without it Square answers INSUFFICIENT_SCOPES (a SquareError with that code).
 */
export async function customers(sandbox: boolean, accessToken: string, updatedSince?: string): Promise<SquareCustomer[]> {
  const out: SquareCustomer[] = []
  let cursor: string | undefined
  for (let page = 0; page < 200; page++) {
    const r = await api<{ customers?: SquareCustomer[]; cursor?: string }>(sandbox, accessToken, '/v2/customers/search', {
      limit: 100, ...(cursor ? { cursor } : {}),
      query: { ...(updatedSince ? { filter: { updated_at: { start_at: updatedSince } } } : {}), sort: { field: 'CREATED_AT', order: 'ASC' } },
    })
    out.push(...r.customers ?? [])
    cursor = r.cursor
    if (!cursor) break
  }
  return out
}

/**
 * A webhook from Square is genuine when its x-square-hmacsha256-signature is the HMAC-SHA256 (base64)
 * of the notification URL as registered followed by the raw body, keyed with the subscription's
 * signature key.
 */
export async function verifyWebhook(signatureKey: string, notificationUrl: string, rawBody: string, header: string | null | undefined) {
  if (!header) return false
  return safeEqual(header, await hmacBase64(signatureKey, notificationUrl + rawBody))
}

/** What a customer.created / customer.updated webhook carries (the customer as it is now). */
export interface SquareCustomerEvent { merchant_id?: string; type?: string; data?: { id?: string; object?: { customer?: SquareCustomer } } }
/** catalog.version.updated: something in the seller's item library changed (it doesn't say what). */
export const CATALOG_UPDATED = 'catalog.version.updated'

/** A team member as Square gives one (what we read of it). */
export interface SquareTeamMember {
  id: string
  given_name?: string
  family_name?: string
  email_address?: string
  phone_number?: string
  is_owner?: boolean
  status?: 'ACTIVE' | 'INACTIVE'
}

/**
 * The seller's team members, active ones first. Needs EMPLOYEES_READ: without it Square answers
 * INSUFFICIENT_SCOPES (a SquareError with that code), and the business connects Square again.
 */
export async function teamMembers(sandbox: boolean, accessToken: string): Promise<SquareTeamMember[]> {
  const out: SquareTeamMember[] = []
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const r = await api<{ team_members?: SquareTeamMember[]; cursor?: string }>(sandbox, accessToken, '/v2/team-members/search', { limit: 200, ...(cursor ? { cursor } : {}) })
    out.push(...r.team_members ?? [])
    cursor = r.cursor
    if (!cursor) break
  }
  return out.sort((a, b) => Number(b.status !== 'INACTIVE') - Number(a.status !== 'INACTIVE'))
}

/**
 * A new team member, working at the given locations, for someone on the team to have their own Square
 * login. Needs EMPLOYEES_WRITE. Square doesn't let apps set the passcode or permissions: the owner does
 * that in the Square Dashboard, and Square then sends them the invitation. The idempotency key makes a
 * retry return the same team member rather than a second one.
 */
export async function createTeamMember(sandbox: boolean, accessToken: string, idempotencyKey: string,
  m: { given_name: string; family_name?: string; email_address?: string | null; phone_number?: string | null; location_ids: string[] }): Promise<SquareTeamMember> {
  const r = await api<{ team_member: SquareTeamMember }>(sandbox, accessToken, '/v2/team-members', {
    idempotency_key: idempotencyKey,
    team_member: {
      given_name: m.given_name, ...(m.family_name ? { family_name: m.family_name } : {}),
      ...(m.email_address ? { email_address: m.email_address } : {}), ...(m.phone_number ? { phone_number: m.phone_number } : {}),
      status: 'ACTIVE', assigned_locations: { assignment_type: 'EXPLICIT_LOCATIONS', location_ids: m.location_ids },
    },
  })
  return r.team_member
}

/** One team member (null when Square doesn't know the id). */
export async function teamMember(sandbox: boolean, accessToken: string, id: string): Promise<SquareTeamMember | null> {
  try {
    return (await api<{ team_member: SquareTeamMember }>(sandbox, accessToken, `/v2/team-members/${encodeURIComponent(id)}`)).team_member
  } catch (e) {
    if (e instanceof SquareError && e.code === 'NOT_FOUND') return null
    throw e
  }
}

/**
 * Completed payments between two instants, added up by the team member who took each (`team_member_id`;
 * '' for payments nobody signed in for). Amounts in the currency's main unit, less refunds. The team
 * members are worth nothing without EMPLOYEES_READ, so the Leaderboard reads them first (teamMembers) and a
 * connection without it asks to connect again rather than counting every sale as nobody's.
 */
export async function salesByTeamMember(sandbox: boolean, accessToken: string, locationIds: string[], fromIso: string, toIso: string) {
  const by = new Map<string, { sales: number; gross: number }>()
  let currency: string | undefined
  for (const location of locationIds) {
    let cursor: string | undefined
    for (let page = 0; page < 100; page++) {
      const q = new URLSearchParams({ begin_time: fromIso, end_time: toIso, location_id: location, limit: '100', ...(cursor ? { cursor } : {}) })
      const r = await api<{ payments?: { status: string; team_member_id?: string; employee_id?: string; amount_money?: { amount: number; currency: string }; refunded_money?: { amount: number } }[]; cursor?: string }>(
        sandbox, accessToken, `/v2/payments?${q}`)
      for (const p of r.payments ?? []) {
        if (p.status !== 'COMPLETED') continue
        currency ??= p.amount_money?.currency
        const who = p.team_member_id ?? p.employee_id ?? ''
        const row = by.get(who) ?? { sales: 0, gross: 0 }
        row.sales += 1
        row.gross += ((p.amount_money?.amount ?? 0) - (p.refunded_money?.amount ?? 0)) / 100
        by.set(who, row)
      }
      cursor = r.cursor
      if (!cursor) break
    }
  }
  return { currency: currency ?? 'EUR', byMember: Object.fromEntries([...by].map(([k, v]) => [k, { sales: v.sales, gross: round(v.gross) }])) }
}

/**
 * Tips left on completed payments between two instants (the Tips page), by the team member who took each
 * payment ('' for nobody signed in), in all and per local day. `amount_money` is before the tip, so a
 * refund bigger than it gave some of the tip back, and only what's left counts. Main units (euros).
 */
export async function tipsByTeamMember(sandbox: boolean, accessToken: string, locationIds: string[], fromIso: string, toIso: string, timeZone = 'Europe/Madrid') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const dayOf = (iso: string) => {
    const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
    return `${p.year}-${p.month}-${p.day}`
  }
  // In cents while adding up.
  const by: Record<string, MemberTips> = {}
  let currency: string | undefined
  for (const location of locationIds) {
    let cursor: string | undefined
    for (let page = 0; page < 100; page++) {
      const q = new URLSearchParams({ begin_time: fromIso, end_time: toIso, location_id: location, limit: '100', ...(cursor ? { cursor } : {}) })
      const r = await api<{ payments?: { created_at: string; status: string; team_member_id?: string; employee_id?: string; amount_money?: { amount: number; currency: string }; tip_money?: { amount: number }; refunded_money?: { amount: number } }[]; cursor?: string }>(
        sandbox, accessToken, `/v2/payments?${q}`)
      for (const p of r.payments ?? []) {
        if (p.status !== 'COMPLETED') continue
        currency ??= p.amount_money?.currency
        const tip = p.tip_money?.amount ?? 0
        const kept = tip - Math.min(tip, Math.max(0, (p.refunded_money?.amount ?? 0) - (p.amount_money?.amount ?? 0)))
        if (kept <= 0) continue
        const member = by[p.team_member_id ?? p.employee_id ?? ''] ??= { tips: 0, tipped: 0, days: {} }
        const day = member.days[dayOf(p.created_at)] ??= { tips: 0, tipped: 0 }
        member.tips += kept
        member.tipped += 1
        day.tips += kept
        day.tipped += 1
      }
      cursor = r.cursor
      if (!cursor) break
    }
  }
  const euros = (cents: number) => Math.round(cents) / 100
  const byMember = Object.fromEntries(Object.entries(by).map(([k, m]) => [k, {
    tips: euros(m.tips), tipped: m.tipped, days: Object.fromEntries(Object.entries(m.days).map(([d, v]) => [d, { tips: euros(v.tips), tipped: v.tipped }])),
  }]))
  return { currency: currency ?? 'EUR', byMember }
}
