// Loyalty page: the Square loyalty programme (the café's stamp card when it gives points per visit)
// and gift cards, read from Square and kept 30 minutes (provider_cache; forgotten after a change made
// here). Admins only, and only while Square is the connected till.
// A Square connection made before the loyalty and gift card permissions were asked for answers
// `status: 'reconnect'` (reads) or a plain "Reconnect Square…" (changes), never Square's own error.
import { Hono, type MiddlewareHandler } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, requestDb, userClient, type Env } from './supabase'
import { connectedOf, explain, lasting, markBroken, squareSession } from './connections'
import { cached, forget } from './cache'
import { SquareError } from './providers/square'
import * as loyalty from './providers/squareLoyalty'
import { adjustProblem, giftCardAmountProblem, type GiftCards, type LoyaltyState } from '../shared/loyalty'
import { MINUTES } from '../shared/refresh'
import { addDays, today, zonedIso } from '../shared/time'

export const loyaltyRoutes = new Hono<{ Bindings: Env }>()

export const RECONNECT = 'Reconnect Square to allow loyalty and gift cards: Connections → Square → Connect again.'
const NOT_CONNECTED = 'Connect Square on the Connections page to see loyalty and gift cards.'

/** Something to tell the admin as it is (a missing permission, a wrong amount), as opposed to Square failing. */
class LoyaltyError extends Error {}

const admins: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const { data: isAdmin } = await userClient(c.env, token, 'app').rpc('is_admin')
  if (!isAdmin) return c.json({ error: 'Only an admin can see loyalty and gift cards' }, 403)
  if (await connectedOf(await requestDb(c), ['square'] as const) !== 'square') return c.json({ error: NOT_CONNECTED }, 409)
  await next()
}

loyaltyRoutes.use('/api/loyalty/*', admins)
loyaltyRoutes.use('/api/loyalty', admins)
loyaltyRoutes.use('/api/giftcards/*', admins)
loyaltyRoutes.use('/api/giftcards', admins)

const missingScope = (e: unknown) => e instanceof SquareError && e.code === 'INSUFFICIENT_SCOPES'

/** Square failed: a lasting failure turns its Connections card red; the admin gets plain words either way. */
async function failure(db: SupabaseClient, e: unknown) {
  if (e instanceof LoyaltyError) return e.message
  if (missingScope(e)) return RECONNECT
  const why = explain('square', e)
  if (lasting('square', e)) await markBroken(db, 'square', why)
  return why
}

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive, Madrid days; the last 60 days when not given) as instants. */
function range(q: (k: string) => string | undefined) {
  const to = q('to') ?? today(), from = q('from') ?? addDays(to, -59)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new LoyaltyError('Give from and to dates (YYYY-MM-DD)')
  return { fromIso: zonedIso(from, '00:00'), toIso: zonedIso(addDays(to, 1), '00:00') }
}

/** Names for Square customer ids: the app's Customers first (linked by square_id). */
async function names(db: SupabaseClient, ids: string[]) {
  if (!ids.length) return new Map<string, string>()
  const { data } = await db.from('customers').select('square_id, first_name, last_name, company').in('square_id', ids)
  return new Map((data ?? []).map(r => [r.square_id as string,
    [r.first_name, r.last_name].filter(Boolean).join(' ') || (r.company as string | null) || '']).filter(([, n]) => n) as [string, string][])
}

// The programme, its members (most points first) and what happened in the range.
loyaltyRoutes.get('/api/loyalty', async c => {
  const db = await requestDb(c)
  try {
    const { fromIso, toIso } = range(k => c.req.query(k))
    const { data, fetched_at } = await cached(db, `loyalty:${fromIso}:${toIso}`, MINUTES.loyalty, async (): Promise<LoyaltyState> => {
      const s = await squareSession(c.env, db)
      const program = await loyalty.program(s.sandbox, s.token)
      if (!program) return { status: 'no_program', program: null, members: [], events: [] }
      const [accounts, events] = await Promise.all([loyalty.accounts(s.sandbox, s.token), loyalty.events(s.sandbox, s.token, fromIso, toIso)])
      const who = await names(db, accounts.map(a => a.customer_id).filter((x): x is string => !!x))
      const lastEarn = new Map<string, string>()
      for (const e of events) if (e.kind === 'earn' && !lastEarn.has(e.account_id)) lastEarn.set(e.account_id, e.at)
      const members = accounts.map(a => ({
        id: a.id, customer_id: a.customer_id ?? null, name: (a.customer_id && who.get(a.customer_id)) || null,
        balance: a.balance ?? 0, lifetime: a.lifetime_points ?? 0, enrolled_at: a.enrolled_at ?? a.created_at ?? null, last_visit: lastEarn.get(a.id) ?? null,
      })).sort((a, b) => b.balance - a.balance || b.lifetime - a.lifetime)
      return { status: 'ok', program, members, events }
    })
    return c.json({ ...data, fetched_at } satisfies LoyaltyState)
  } catch (e) {
    if (missingScope(e)) return c.json({ status: 'reconnect', program: null, members: [], events: [] } satisfies LoyaltyState)
    return c.json({ error: await failure(db, e) }, 400)
  }
})

// Goodwill points for a member (or taking some back): { account_id, points, reason, key }.
loyaltyRoutes.post('/api/loyalty/adjust', async c => {
  const db = await requestDb(c)
  try {
    const b = await c.req.json<{ account_id?: string; points?: number; reason?: string; key?: string }>().catch(() => ({} as Record<string, undefined>))
    const points = Number(b.points)
    const problem = adjustProblem(points)
    if (problem) throw new LoyaltyError(problem)
    if (!b.account_id || !/^[\w-]{1,64}$/.test(b.account_id)) throw new LoyaltyError('Choose a member')
    const reason = (b.reason ?? '').trim()
    if (!reason) throw new LoyaltyError('Say why, for the record (Square keeps it)')
    if (!b.key || !/^[\w-]{8,64}$/.test(b.key)) throw new LoyaltyError('Try again')
    const s = await squareSession(c.env, db)
    await loyalty.adjust(s.sandbox, s.token, b.account_id, points, reason, `adjust:${b.key}`)
    await forget(db, 'loyalty:')
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: await failure(db, e) }, 400)
  }
})

// Gift cards (the last 4 digits of each number only), each with the amount it was first loaded with
// and when it was last spent with, and what happened to them in the range.
loyaltyRoutes.get('/api/giftcards', async c => {
  const db = await requestDb(c)
  try {
    const { fromIso, toIso } = range(k => c.req.query(k))
    const { data, fetched_at } = await cached(db, `giftcards:book:${fromIso}:${toIso}`, MINUTES.loyalty, async (): Promise<GiftCards> => {
      const s = await squareSession(c.env, db)
      const { currency, cards, activities } = await loyalty.giftCardBook(s.sandbox, s.token, fromIso, toIso)
      const who = await names(db, cards.map(g => g.customer_id).filter((x): x is string => !!x))
      return { status: 'ok', currency, cards: cards.map(g => ({ ...g, customer: (g.customer_id && who.get(g.customer_id)) || null })), activities }
    })
    return c.json({ ...data, fetched_at } satisfies GiftCards)
  } catch (e) {
    if (missingScope(e)) return c.json({ status: 'reconnect', currency: 'EUR', cards: [], activities: [] } satisfies GiftCards)
    return c.json({ error: await failure(db, e) }, 400)
  }
})

// One gift card's whole number, for "Copy number" on the Gift cards tab (a giveaway, a refund):
// asked of Square each time and never kept, so lists and provider_cache only ever hold the last 4 digits.
loyaltyRoutes.get('/api/giftcards/:id/number', async c => {
  const db = await requestDb(c)
  try {
    const id = c.req.param('id')
    if (!/^[\w:-]{1,100}$/.test(id)) throw new LoyaltyError('Choose a gift card from the list')
    const s = await squareSession(c.env, db)
    const number = await loyalty.giftCardNumber(s.sandbox, s.token, id)
    if (!number) throw new LoyaltyError('Square didn’t give this card’s number: look it up in the Square Dashboard.')
    return c.json({ number }, 200, { 'cache-control': 'no-store' })
  } catch (e) {
    return c.json({ error: await failure(db, e) }, 400)
  }
})

// Sell a digital gift card for an amount paid at the till: { amount, customer_id?, key }.
loyaltyRoutes.post('/api/giftcards', async c => {
  const db = await requestDb(c)
  try {
    const b = await c.req.json<{ amount?: number; customer_id?: string | null; key?: string }>().catch(() => ({} as Record<string, undefined>))
    const amount = Number(b.amount)
    const problem = giftCardAmountProblem(amount)
    if (problem) throw new LoyaltyError(problem)
    if (!b.key || !/^[\w-]{8,64}$/.test(b.key)) throw new LoyaltyError('Try again')
    if (b.customer_id && !/^[\w-]{1,64}$/.test(b.customer_id)) throw new LoyaltyError('Choose a customer from the list')
    const s = await squareSession(c.env, db)
    const location = s.locationIds[0]
    if (!location) throw new LoyaltyError('Square has no location for this business. Connect Square again.')
    const { data: row } = await db.from('integrations').select('external').eq('provider', 'square').single()
    const currency = ((row?.external ?? {}) as { currency?: string }).currency ?? 'EUR'
    const card = await loyalty.sellGiftCard(s.sandbox, s.token, { locationId: location, amount, currency, customerId: b.customer_id ?? null, key: `giftcard:${b.key}` })
    const who = await names(db, card.customer_id ? [card.customer_id] : [])
    await forget(db, 'giftcards:')
    return c.json({ card: { ...card, customer: (card.customer_id && who.get(card.customer_id)) || null } })
  } catch (e) {
    return c.json({ error: await failure(db, e) }, 400)
  }
})
