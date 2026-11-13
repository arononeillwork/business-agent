// Accounts & rewards on the business's own website (docs/WEBSITE.md → Accounts & rewards). Someone who
// signs in there is a customer here, and the website's account page reads what they have from the app:
//   POST /api/site/<business>/account/sync      find or make the customer (as the Square sync matches)
//   POST /api/site/<business>/account/summary   their points (Square Loyalty, read here), credit, cashback, rep
//   POST /api/site/<business>/account/erase     erase them (GDPR), from the website's "delete my account"
// The work is in the site_accounts migration's functions; this checks who's asking and adds the points.
//
// Only the website's server calls these, with the business's website key (worker/websiteKey.ts): no key
// here is no answer, browsers get no CORS headers and OPTIONS is refused. The email is only ever in the
// body, never in the address, a log line or an error kept for HQ (the outcome is logged, not who). The
// website says it checked the address itself (its sign-in): "email_verified": true, or 403. Each
// business turns it on on Website & SEO (settings.website_accounts); off, or a number that's no business,
// is the same 404. What's changed is in the audit log as done via the website.
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { businessDb, type BusinessDb, type Env } from './supabase'
import { businessIn, websiteKey } from './websiteKey'
import { connectedOf, squareSession } from './connections'
import { cached } from './cache'
import { SquareError } from './providers/square'
import * as loyalty from './providers/squareLoyalty'
import { reportError } from './errors'
import { cleanPhone } from '../shared/customers'
import { splitName } from '../shared/newsletter'
import { siteSummary, type SiteAccountErase, type SiteAccountSync, type SitePoints, type SummaryRow } from '../shared/siteAccount'
import type { LoyaltyProgram } from '../shared/loyalty'

export const siteAccount = new Hono<{ Bindings: Env }>()

const NOT_ON = { error: 'This business doesn’t have accounts on its website.' }
const BAD_KEY = { error: 'That key isn’t this business’s website key.' }
const NO_KEY = { error: 'Accounts need the website key, from the website’s server.' }
const NOT_VERIFIED = { error: 'Say the email was checked by the website’s sign-in: "email_verified": true.' }
const UNAVAILABLE = { error: 'The account couldn’t be read just now. Try again in a minute.' }
const POST_ONLY = { error: 'Only POST, from the website’s server.' }
/** Never kept by a browser or anything in between. */
const HEADERS = { 'cache-control': 'no-store' }

/** Calls a business's website may make in a minute (counted with its key), in this Worker instance. */
export const REQUESTS_A_MINUTE = 120
const hits = new Map<number, { n: number; until: number }>()
let now = () => Date.now()
/** Tests: nothing counted from another test, and a clock of their own if they like. */
export function forgetSiteAccountCalls(clock?: () => number) {
  hits.clear()
  now = clock ?? (() => Date.now())
}
function take(business: number) {
  const t = now()
  const h = hits.get(business)
  if (!h || h.until <= t) {
    if (hits.size > 5000) for (const [k, v] of hits) if (v.until <= t) hits.delete(k)
    hits.set(business, { n: 1, until: t + 60_000 })
    return true
  }
  if (h.n >= REQUESTS_A_MINUTE) return false
  h.n++
  return true
}

/** Square Loyalty's answers kept a while (provider_cache): the programme 30 minutes, someone's points 15. */
export const POINTS_KEY = 'site-points:'
const PROGRAM_KEY = `${POINTS_KEY}program`
const PROGRAM_MINUTES = 30
const POINTS_MINUTES = 15
/** Square has this long to answer, so the website (which waits 4 s) gets an answer either way. */
const SQUARE_MS = 2500

const email = z.string().trim().toLowerCase().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
const text = (max: number) => z.string().trim().max(max).nullish()
const WHO = z.object({ email, email_verified: z.literal(true) })
const SYNC = WHO.extend({
  name: text(200), first_name: text(100), last_name: text(100), phone: text(40),
  square_customer_id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,191}$/).nullish(),
  lang: z.string().trim().regex(/^[A-Za-z]{2}([-_][A-Za-z0-9]{2,8})?$/).nullish(),
  rep_code: text(40),
})

/** An error's message for the logs and HQ, without any address in it. */
const scrub = (s: string) => s.replace(/[^\s@"'<>()]+@[^\s@"'<>()]+/g, '[email]').slice(0, 300)

/** Logged and kept for HQ by what happened, never by whom. */
async function failed(env: Env, business: number, action: string, e: unknown) {
  const code = (e as { code?: unknown } | null)?.code
  const message = scrub(e instanceof Error ? e.message : typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : 'failed')
  await reportError(env, `site account ${action}`, new Error(`${typeof code === 'string' && code ? `${code}: ` : ''}${message}`), { business })
}

type Gate = { business: number; db: BusinessDb; body: Record<string, unknown> }

/** Who's asking, in this order: the business has it on (404), its key (401), within its limit (429), a checked email (403). */
async function gate(c: Context<{ Bindings: Env }>): Promise<Gate | Response> {
  const business = businessIn(c.req.param('business') ?? '')
  if (!business) return c.json(NOT_ON, 404, HEADERS)
  const db = businessDb(c.env, business, 'website')
  const [settings, key] = await Promise.all([
    db.from('settings').select('website_accounts').eq('id', 1).maybeSingle(),
    db.from('newsletter').select('key_hash').maybeSingle(),
  ])
  if (settings.error || key.error) return c.json(UNAVAILABLE, 503, HEADERS)
  if (settings.data?.website_accounts !== true) return c.json(NOT_ON, 404, HEADERS)
  const keyed = await websiteKey(c, (key.data?.key_hash as string | null | undefined) ?? null)
  if (keyed !== true) return c.json(keyed === 'wrong' ? BAD_KEY : NO_KEY, 401, HEADERS)
  if (!take(business)) return c.json({ error: 'Too many calls from the website just now. Try again in a minute.' }, 429, { ...HEADERS, 'retry-after': '60' })
  const body = await c.req.json<unknown>().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: 'Send JSON: { "email", "email_verified": true }' }, 400, HEADERS)
  if ((body as Record<string, unknown>).email_verified !== true) return c.json(NOT_VERIFIED, 403, HEADERS)
  return { business, db, body: body as Record<string, unknown> }
}

const badBody = (c: Context, e: z.ZodError) =>
  c.json({ error: 'Check what was sent', fields: [...new Set(e.issues.map(i => String(i.path[0] ?? '')))].filter(Boolean) }, 400, HEADERS)

// Browsers never call these: no CORS answer, and nothing but POST.
siteAccount.on(['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], '/api/site/:business/account/*', c => c.json(POST_ONLY, 405, { ...HEADERS, allow: 'POST' }))

// Find or make the customer for someone signed in on the website.
siteAccount.post('/api/site/:business/account/sync', async c => {
  const g = await gate(c)
  if (g instanceof Response) return g
  const read = SYNC.safeParse(g.body)
  if (!read.success) return badBody(c, read.error)
  const b = read.data
  try {
    let first = b.first_name || null, last = b.last_name || null
    if (b.name && !first && !last) ({ first, last } = splitName(b.name))
    let phone: string | null = null
    const ignored: string[] = []
    if (b.phone) {
      const { data } = await g.db.from('business').select('country').eq('id', g.business).maybeSingle()
      phone = cleanPhone(b.phone, (data as { country?: string } | null)?.country === 'IE' ? 'IE' : 'ES')
      if (!phone) ignored.push('phone')
    }
    const { data, error } = await g.db.rpc('site_account_sync', {
      p_business: g.business, p_email: b.email, p_first_name: first, p_last_name: last, p_phone: phone,
      p_square_id: b.square_customer_id ?? null, p_lang: b.lang ? b.lang.slice(0, 2).toLowerCase() : null, p_rep_code: b.rep_code ?? null,
    })
    if (error) throw error
    const r = data as SiteAccountSync
    return c.json({ customer_id: r.customer_id, created: r.created, is_rep: r.is_rep, ignored: [...ignored, ...(r.ignored ?? [])] } satisfies SiteAccountSync, 200, HEADERS)
  } catch (e) {
    await failed(c.env, g.business, 'sync', e)
    return c.json(UNAVAILABLE, 503, HEADERS)
  }
})

// What their account page shows.
siteAccount.post('/api/site/:business/account/summary', async c => {
  const g = await gate(c)
  if (g instanceof Response) return g
  const read = WHO.safeParse(g.body)
  if (!read.success) return badBody(c, read.error)
  let row: SummaryRow
  try {
    const { data, error } = await g.db.rpc('site_account_summary', { p_business: g.business, p_email: read.data.email })
    if (error) throw error
    row = data as SummaryRow
  } catch (e) {
    await failed(c.env, g.business, 'summary', e)
    return c.json(UNAVAILABLE, 503, HEADERS)
  }
  if (!row.customer) return c.json({ customer: null }, 200, HEADERS)
  let points: SitePoints | null
  try {
    points = await pointsOf(c.env, g.db, row.square_customer_id ?? null)
  } catch (e) {
    await failed(c.env, g.business, 'points', e)
    return c.json(UNAVAILABLE, 503, HEADERS)
  }
  return c.json(siteSummary(row, points), 200, HEADERS)
})

// Erase them: from the website's "delete my account".
siteAccount.post('/api/site/:business/account/erase', async c => {
  const g = await gate(c)
  if (g instanceof Response) return g
  const read = WHO.safeParse(g.body)
  if (!read.success) return badBody(c, read.error)
  try {
    const { data, error } = await g.db.rpc('site_account_erase', { p_business: g.business, p_email: read.data.email })
    if (error) throw error
    const r = data as { found: boolean; kept: 'ledger' | null; square_ids?: string[] }
    // Their points aren't kept here either.
    for (const id of r.square_ids ?? []) await g.db.from('provider_cache').delete().eq('key', `${POINTS_KEY}${id}`)
    return c.json({ erased: true, kept: r.kept ?? null, found: !!r.found } satisfies SiteAccountErase, 200, HEADERS)
  } catch (e) {
    await failed(c.env, g.business, 'erase', e)
    return c.json(UNAVAILABLE, 503, HEADERS)
  }
})

/** Settles within `ms`, or fails. */
async function within<T>(ms: number, p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([p, new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error('Square took too long')), ms) })])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Someone's Square Loyalty points: null when Square isn't the connected till (or wasn't allowed loyalty),
 * the programme is off, or they have no account in it (they join at the till). Square failing throws.
 */
export async function pointsOf(env: Env, db: BusinessDb, squareId: string | null): Promise<SitePoints | null> {
  if (!squareId) return null
  if (await connectedOf(db, ['square'] as const) !== 'square') return null
  let session: ReturnType<typeof squareSession> | undefined
  const square = () => (session ??= squareSession(env, db))
  try {
    return await within(SQUARE_MS, (async () => {
      const { data: kept } = await cached(db, PROGRAM_KEY, PROGRAM_MINUTES, async (): Promise<{ program: LoyaltyProgram | null }> => {
        const s = await square()
        return { program: await loyalty.program(s.sandbox, s.token) }
      })
      const program = kept.program
      if (!program) return null
      const { data: mine } = await cached(db, `${POINTS_KEY}${squareId}`, POINTS_MINUTES, async () => {
        const s = await square()
        const a = await loyalty.accountOf(s.sandbox, s.token, squareId)
        return { account: a ? { balance: a.balance ?? 0, lifetime: a.lifetime_points ?? 0 } : null }
      })
      if (!mine.account) return null
      return {
        program: { one: program.one, other: program.other, tiers: program.tiers.map(t => ({ id: t.id, name: t.name, points: t.points })) },
        balance: mine.account.balance, lifetime: mine.account.lifetime,
      }
    })())
  } catch (e) {
    // A Square connection made before loyalty was asked for: as good as no programme, until it's connected again.
    if (e instanceof SquareError && e.code === 'INSUFFICIENT_SCOPES') return null
    throw e
  }
}
