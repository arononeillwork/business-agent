// The coffee club (Sales → Coffee club; shared/coffeeClub.ts says what it is). Square takes the money, the app
// counts the coffees:
//   - Setting it up makes, in Square: a subscription plan at one flat monthly price (a new variation when the price
//     changes: members who joined at the old one keep it), the discount the team applies on the till (the whole
//     drink, up to the club's most) and the checkout page people join on (taken down when not selling).
//   - Square's subscriptions at the business's locations on one of the club's variations are its members; the
//     latest invoice of each says whether the month's charge went through.
//   - A sale on the till with the club's discount is a coffee (Square's order webhook straight away, and every
//     15 minutes the sales since the last look, in case one was missed): counted against the member added to the
//     sale, for the week it was in (Monday to Sunday, the business's days), or kept with why it didn't count.
//   - What's left this week goes on the member's Square customer note, as the first line (the team's own lines
//     stay), which the till shows when they're added to a sale. Written only when it changes, a few a run.
// Admins only, and only while Square is the connected till. A connection made before the app asked for
// subscriptions says to connect Square again.
import { Hono, type MiddlewareHandler } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, requestDb, type Env } from './supabase'
import { connectedOf, explain, lasting, markBroken, squareSession } from './connections'
import { cached, forget } from './cache'
import { minutesFor } from './refresh'
import * as loyalty from './providers/squareLoyalty'
import { SquareError } from './providers/square'
import type { SquareCustomer } from './providers/square'
import * as square from './providers/squareClub'
import { importSquareCustomer } from './squareCustomers'
import { signInCheck } from './signedIn'
import { zoneOf } from './zone'
import type { SiteClub } from '../shared/siteAccount'
import {
  clubInputProblem, clubProblem, inGoodStanding, noteLine, standing, weekOf, withNoteLine,
  type ClubCoffee, type ClubMember, type ClubStatus, type CoffeeClubInput, type CoffeeClubSettings, type CoffeeClubState, type TillLanguage,
} from '../shared/coffeeClub'
import { addDays, today, weekStart } from '../shared/time'

export const coffeeClubRoutes = new Hono<{ Bindings: Env }>()

export const RECONNECT = 'Reconnect Square to allow the coffee club: Connections → Square → Connect again.'
const NOT_CONNECTED = 'Connect Square on the Connections page to run a coffee club.'
/** Notes written on Square customers in one run (two requests each), so a Monday's new week doesn't use up a run. */
export const NOTES_A_RUN = 4
/** Square customers brought into Customers in one run for members who just joined. */
const IMPORTS_A_RUN = 3
/** How far back the catch-up looks at most, and how much it overlaps the last look. */
const LOOK_BACK_MS = 3 * 86_400_000
const OVERLAP_MS = 2 * 3_600_000

/** Something to tell the admin as it is, as opposed to Square failing. */
class ClubError extends Error {}

/** The club as kept (the coffee_club migration). */
interface ClubRow {
  name: string; price: number; currency: string; coffees_per_week: number; max_value: number; till_language: TillLanguage; selling: boolean
  square_location_id: string | null; square_plan_id: string | null; square_variation_id: string | null; square_old_variation_ids: string[] | null
  square_discount_id: string | null; square_link_id: string | null; signup_url: string | null; orders_checked_at: string | null; set_up_at: string
}
interface MemberRow {
  id: string; square_subscription_id: string; square_customer_id: string; square_variation_id: string | null; customer_id: string | null
  status: ClubStatus; started_on: string | null; ends_on: string | null; paid: boolean; paid_through: string | null; note_line: string | null
  card_code: string | null
}
const MEMBER_COLUMNS = 'id, square_subscription_id, square_customer_id, square_variation_id, customer_id, status, started_on, ends_on, paid, paid_through, note_line, card_code'

const missingScope = (e: unknown) => e instanceof SquareError && e.code === 'INSUFFICIENT_SCOPES'
const check = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data }

async function loadClub(db: SupabaseClient): Promise<ClubRow | null> {
  const row = check(await db.from('coffee_club').select('*').maybeSingle()) as ClubRow | null
  return row ? { ...row, price: Number(row.price), max_value: Number(row.max_value) } : null
}
const variationsOf = (c: ClubRow) => new Set([c.square_variation_id, ...(c.square_old_variation_ids ?? [])].filter((x): x is string => !!x))

/** Coffees counted (no problem) for these members in the week of `monday`, by member. */
async function usedIn(db: SupabaseClient, monday: string, memberIds?: string[]) {
  let q = db.from('coffee_club_coffees').select('member_id, quantity').eq('week', monday).is('problem', null)
  if (memberIds) q = q.in('member_id', memberIds.length ? memberIds : ['-'])
  const used = new Map<string, number>()
  for (const r of check(await q) as { member_id: string | null; quantity: number }[]) {
    if (r.member_id) used.set(r.member_id, (used.get(r.member_id) ?? 0) + r.quantity)
  }
  return used
}

// ---------------------------------------------------------------------------------------------------------------
// Members: Square's subscriptions on the club's plan
// ---------------------------------------------------------------------------------------------------------------

const lower = (s?: string): ClubStatus => (['PENDING', 'ACTIVE', 'PAUSED', 'CANCELED', 'DEACTIVATED'].includes(s ?? '') ? (s!.toLowerCase() as ClubStatus) : 'pending')

/** Customers here for these Square customers, bringing in (a few) Square hasn't sent yet. */
async function customersFor(db: SupabaseClient, squareIds: string[], s?: { sandbox: boolean; token: string }) {
  const ids = [...new Set(squareIds)]
  if (!ids.length) return new Map<string, string>()
  const read = async () => new Map((check(await db.from('customers').select('id, square_id').in('square_id', ids)) as { id: string; square_id: string }[]).map(r => [r.square_id, r.id]))
  let found = await read()
  const missing = ids.filter(id => !found.has(id)).slice(0, IMPORTS_A_RUN)
  if (s && missing.length) {
    for (const id of missing) {
      const c = await square.customer(s.sandbox, s.token, id).catch(e => { if (e instanceof SquareError && e.code === 'NOT_FOUND') return null; throw e })
      if (c) await importSquareCustomer(db, c as unknown as SquareCustomer)
    }
    found = await read()
  }
  return found
}

/** Saves these subscriptions as members (only the club's), with whether each one's latest charge was paid when known. */
async function saveMembers(db: SupabaseClient, c: ClubRow, subs: square.SquareSubscription[], paid: Map<string, boolean>, s: { sandbox: boolean; token: string }) {
  const ours = subs.filter(x => x.plan_variation_id && variationsOf(c).has(x.plan_variation_id) && x.customer_id)
  if (!ours.length) return [] as MemberRow[]
  const existing = new Map((check(await db.from('coffee_club_members').select(MEMBER_COLUMNS)
    .in('square_subscription_id', ours.map(x => x.id))) as MemberRow[]).map(m => [m.square_subscription_id, m]))
  const customers = await customersFor(db, ours.map(x => x.customer_id!), s)
  const rows = ours.map(x => {
    const before = existing.get(x.id)
    return {
      square_subscription_id: x.id, square_customer_id: x.customer_id!, square_variation_id: x.plan_variation_id ?? null,
      customer_id: customers.get(x.customer_id!) ?? before?.customer_id ?? null,
      status: lower(x.status), started_on: x.start_date ?? null, ends_on: x.canceled_date ?? null,
      paid: paid.get(x.id) ?? before?.paid ?? true, paid_through: x.charged_through_date ?? null, updated_at: new Date().toISOString(),
    }
  })
  return check(await db.from('coffee_club_members').upsert(rows, { onConflict: 'business_id,square_subscription_id' }).select(MEMBER_COLUMNS)) as MemberRow[]
}

/** Every member, from Square: the club's subscriptions and their latest invoices. */
async function syncMembers(db: SupabaseClient, c: ClubRow, s: { sandbox: boolean; token: string; locationIds: string[] }) {
  const locations = [...new Set([c.square_location_id, ...s.locationIds].filter((x): x is string => !!x))]
  const subs = await square.subscriptions(s.sandbox, s.token, locations)
  const ours = subs.filter(x => x.plan_variation_id && variationsOf(c).has(x.plan_variation_id))
  let paid = new Map<string, boolean>()
  if (ours.length && c.square_location_id) paid = square.paidBySubscription(await square.invoices(s.sandbox, s.token, c.square_location_id))
  return saveMembers(db, c, ours, paid, s)
}

// ---------------------------------------------------------------------------------------------------------------
// Coffees: the sales the club's discount was used on
// ---------------------------------------------------------------------------------------------------------------

/**
 * One completed sale: its club coffees counted (once, however often it's read) against the member added to it,
 * for the sale's week. Returns the members whose week changed.
 */
export async function recordOrder(db: SupabaseClient, c: ClubRow, o: square.SquareOrder, tz?: string): Promise<string[]> {
  if (!c.square_discount_id || o.state !== 'COMPLETED') return []
  const lines = square.clubLines(o, c.square_discount_id)
  if (!lines.length) return []
  const seen = new Set((check(await db.from('coffee_club_coffees').select('square_line_uid').eq('square_order_id', o.id)) as { square_line_uid: string }[]).map(r => r.square_line_uid))
  const fresh = lines.filter(l => !seen.has(l.uid))
  if (!fresh.length) return []
  const at = o.closed_at ?? o.created_at ?? new Date().toISOString()
  const week = weekOf(at, tz)
  const customerId = square.customerOf(o)
  const members = customerId
    ? check(await db.from('coffee_club_members').select(MEMBER_COLUMNS).eq('square_customer_id', customerId)) as MemberRow[]
    : []
  // Someone with more than one membership (joined again): the one in good standing.
  const member = members.find(inGoodStanding) ?? members.find(m => m.status === 'active') ?? members[0] ?? null
  let used = member ? (await usedIn(db, week, [member.id])).get(member.id) ?? 0 : 0
  const rows = fresh.map(l => {
    const problem = clubProblem(customerId, member, used, l.quantity, c.coffees_per_week)
    if (!problem) used += l.quantity
    return {
      square_order_id: o.id, square_line_uid: l.uid, member_id: member?.id ?? null, square_customer_id: customerId,
      item: l.item, quantity: l.quantity, value: l.value, at, week, problem,
    }
  })
  check(await db.from('coffee_club_coffees').upsert(rows, { onConflict: 'business_id,square_order_id,square_line_uid', ignoreDuplicates: true }))
  return member ? [member.id] : []
}

/** The sales since the last look (a little before it, in case one was late to show), each counted. */
async function catchUp(db: SupabaseClient, c: ClubRow, s: { sandbox: boolean; token: string; locationIds: string[] }, tz?: string) {
  const started = new Date()
  const floor = Math.max(Date.parse(c.set_up_at) || 0, started.getTime() - LOOK_BACK_MS)
  const from = new Date(Math.max(floor, c.orders_checked_at ? Date.parse(c.orders_checked_at) - OVERLAP_MS : floor)).toISOString()
  const locations = c.square_location_id ? [c.square_location_id] : s.locationIds
  if (!locations.length) return
  for (const o of await square.completedOrders(s.sandbox, s.token, locations, from, started.toISOString())) await recordOrder(db, c, o, tz)
  check(await db.from('coffee_club').update({ orders_checked_at: started.toISOString() }).eq('id', 1))
}

// ---------------------------------------------------------------------------------------------------------------
// The note on the till
// ---------------------------------------------------------------------------------------------------------------

/**
 * The members whose note on Square isn't what it should be now get it (at most `limit`, `only` these if given):
 * the club's line first, the team's own lines as they were. A customer gone from Square is left alone.
 */
async function writeNotes(db: SupabaseClient, c: ClubRow, s: { sandbox: boolean; token: string }, tz: string | undefined, limit: number, only?: string[]) {
  let q = db.from('coffee_club_members').select(MEMBER_COLUMNS)
  if (only) q = q.in('id', only.length ? only : ['-'])
  const members = check(await q) as MemberRow[]
  const used = await usedIn(db, weekStart(today(tz)), members.map(m => m.id))
  // A customer with a membership that ended and a new one: the new one's line.
  const byCustomer = new Map<string, MemberRow>()
  for (const m of members) {
    const kept = byCustomer.get(m.square_customer_id)
    if (!kept || (kept.status === 'canceled' || kept.status === 'deactivated')) byCustomer.set(m.square_customer_id, m)
  }
  let written = 0
  for (const m of members) {
    // An earlier membership of someone who joined again: the note is the new one's to write.
    if (byCustomer.get(m.square_customer_id) !== m) {
      if (m.note_line !== null) check(await db.from('coffee_club_members').update({ note_line: null }).eq('id', m.id))
      continue
    }
    const line = noteLine(c, { ...m, used_this_week: used.get(m.id) ?? 0 })
    if (line === m.note_line) continue
    if (written >= limit) break
    written++
    let gone = false
    try {
      const sc = await square.customer(s.sandbox, s.token, m.square_customer_id)
      const note = withNoteLine(sc.note, line)
      if (note !== (sc.note ?? '')) await square.setNote(s.sandbox, s.token, m.square_customer_id, note, sc.version)
    } catch (e) {
      if (!(e instanceof SquareError && e.code === 'NOT_FOUND')) throw e
      gone = true
    }
    check(await db.from('coffee_club_members').update({ note_line: line, note_written_at: gone ? null : new Date().toISOString() }).eq('id', m.id))
  }
  return written
}

// ---------------------------------------------------------------------------------------------------------------
// The jobs: every 15 minutes, and Square's webhooks
// ---------------------------------------------------------------------------------------------------------------

/**
 * Every 15 minutes (worker/schedule.ts): members from Square, the sales since the last look, then a few notes.
 * Null: no club (or Square not the till); 'reconnect': Square was connected before the app asked for subscriptions.
 */
export async function syncCoffeeClub(env: Env, db: SupabaseClient): Promise<number | 'reconnect' | null> {
  const c = await loadClub(db)
  if (!c?.square_variation_id || await connectedOf(db, ['square'] as const) !== 'square') return null
  const s = await squareSession(env, db)
  const tz = await zoneOf(db)
  try {
    const members = await syncMembers(db, c, s)
    await catchUp(db, c, s, tz)
    await writeNotes(db, c, s, tz, NOTES_A_RUN)
    return members.length
  } catch (e) {
    if (missingScope(e)) return 'reconnect'
    throw e
  }
}

/** What Square's webhooks carry, for the events the club listens to. */
export interface SquareClubEvent {
  merchant_id?: string
  type?: string
  data?: { id?: string; object?: {
    order_created?: { order_id?: string; state?: string }; order_updated?: { order_id?: string; state?: string }
    subscription?: square.SquareSubscription; invoice?: square.SquareInvoice
  } }
}
export const CLUB_EVENTS = ['order.created', 'order.updated', 'subscription.created', 'subscription.updated', 'invoice.payment_made', 'invoice.scheduled_charge_failed']

/**
 * One of Square's webhooks, for a business with a coffee club: a completed sale counted at once, a subscription
 * joined or changed, a month's charge paid or failed; then those members' notes. Returns whether it was the club's.
 */
export async function coffeeClubEvent(env: Env, db: SupabaseClient, event: SquareClubEvent): Promise<boolean> {
  if (!CLUB_EVENTS.includes(event.type ?? '')) return false
  const c = await loadClub(db)
  if (!c?.square_variation_id) return false
  const obj = event.data?.object
  const s = await squareSession(env, db)
  const tz = await zoneOf(db)
  let touched: string[] = []
  try {
    if (event.type === 'order.created' || event.type === 'order.updated') {
      const o = obj?.order_updated ?? obj?.order_created
      if (!o?.order_id || o.state !== 'COMPLETED' || !c.square_discount_id) return false
      touched = await recordOrder(db, c, await square.order(s.sandbox, s.token, o.order_id), tz)
    } else if (event.type?.startsWith('subscription.')) {
      const sub = obj?.subscription?.id ? await square.subscription(s.sandbox, s.token, obj.subscription.id) : null
      if (!sub) return false
      touched = (await saveMembers(db, c, [sub], new Map(), s)).map(m => m.id)
    } else {
      const inv = obj?.invoice
      if (!inv?.subscription_id) return false
      const rows = check(await db.from('coffee_club_members').update({ paid: event.type === 'invoice.payment_made', updated_at: new Date().toISOString() })
        .eq('square_subscription_id', inv.subscription_id).select('id')) as { id: string }[]
      touched = rows.map(r => r.id)
    }
    if (touched.length) await writeNotes(db, c, s, tz, NOTES_A_RUN, touched)
    return touched.length > 0
  } catch (e) {
    if (missingScope(e)) return false
    throw e
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The page (admins)
// ---------------------------------------------------------------------------------------------------------------

const admins: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const { data: isAdmin } = await signInCheck(c.env, token, 'is_admin')
  if (!isAdmin) return c.json({ error: 'Only an admin can run the coffee club' }, 403)
  if (await connectedOf(await requestDb(c), ['square'] as const) !== 'square') return c.json({ error: NOT_CONNECTED }, 409)
  await next()
}
coffeeClubRoutes.use('/api/coffee-club', admins)
coffeeClubRoutes.use('/api/coffee-club/*', admins)

/** Square failed: a lasting failure turns its Connections card red; the admin gets plain words either way. */
async function failure(db: SupabaseClient, e: unknown) {
  if (e instanceof ClubError) return e.message
  if (missingScope(e)) return RECONNECT
  const why = explain('square', e)
  if (lasting('square', e)) await markBroken(db, 'square', why)
  return why
}

const settingsOf = (c: ClubRow): CoffeeClubSettings => ({
  name: c.name, price: c.price, currency: c.currency, coffees_per_week: c.coffees_per_week, max_value: c.max_value,
  till_language: c.till_language, selling: c.selling, signup_url: c.signup_url, set_up_at: c.set_up_at,
})

/** Square Loyalty's programme and the Square customers in it, read now and then (provider_cache); null when Square can't say. */
export const LOYALTY_KEY = 'club-loyalty'
async function loyaltyOf(env: Env, db: SupabaseClient): Promise<{ program: boolean; customers: Set<string> } | null> {
  try {
    const { data } = await cached(db, LOYALTY_KEY, minutesFor(db, 'loyalty'), async () => {
      const s = await squareSession(env, db)
      if (!await loyalty.program(s.sandbox, s.token)) return { program: false, customers: [] as string[] }
      return { program: true, customers: (await loyalty.accounts(s.sandbox, s.token)).map(a => a.customer_id).filter((x): x is string => !!x) }
    })
    return { program: data.program, customers: new Set(data.customers) }
  } catch {
    return null
  }
}

/** What the page shows: the club, its members with their week and whether they're in Square Loyalty, and the last 60 days' coffees. */
export async function clubState(db: SupabaseClient, status: CoffeeClubState['status'] = 'ok', env?: Env): Promise<CoffeeClubState> {
  const tz = await zoneOf(db)
  const week = weekStart(today(tz))
  const c = await loadClub(db)
  if (!c) return { status: status === 'reconnect' ? 'reconnect' : 'not_set_up', club: null, members: [], coffees: [], week, checked_at: null, loyalty_program: null }
  const since = `${addDays(today(tz), -60)}T00:00:00Z`
  const [members, recent, counted] = await Promise.all([
    db.from('coffee_club_members').select(MEMBER_COLUMNS).order('created_at', { ascending: false }).then(check) as Promise<MemberRow[]>,
    db.from('coffee_club_coffees').select('id, member_id, item, quantity, value, at, problem, sorted_at').gte('at', since)
      .order('at', { ascending: false }).limit(1000).then(check) as Promise<Omit<ClubCoffee, 'name'>[]>,
    db.from('coffee_club_coffees').select('member_id, quantity, week, at').is('problem', null).limit(20000)
      .then(check) as Promise<{ member_id: string | null; quantity: number; week: string; at: string }[]>,
  ])
  const ids = [...new Set(members.map(m => m.customer_id).filter((x): x is string => !!x))]
  const people = ids.length ? check(await db.from('customers').select('id, first_name, last_name, company').in('id', ids)) as
    { id: string; first_name: string | null; last_name: string | null; company: string | null }[] : []
  const names = new Map(people.map(p => [p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || p.company || null]))
  const stats = new Map<string, { week: number; all: number; last: string | null }>()
  for (const r of counted) {
    if (!r.member_id) continue
    const st = stats.get(r.member_id) ?? { week: 0, all: 0, last: null }
    st.all += r.quantity
    if (r.week === week) st.week += r.quantity
    if (!st.last || r.at > st.last) st.last = r.at
    stats.set(r.member_id, st)
  }
  const memberName = new Map(members.map(m => [m.id, (m.customer_id && names.get(m.customer_id)) || null]))
  const loyal = env ? await loyaltyOf(env, db) : null
  return {
    status, club: settingsOf(c), week, checked_at: c.orders_checked_at, loyalty_program: loyal ? loyal.program : null,
    members: members.map((m): ClubMember => ({
      id: m.id, customer_id: m.customer_id, name: memberName.get(m.id) ?? null, square_customer_id: m.square_customer_id,
      status: m.status, started_on: m.started_on, ends_on: m.ends_on, paid: m.paid, paid_through: m.paid_through,
      used_this_week: stats.get(m.id)?.week ?? 0, last_coffee: stats.get(m.id)?.last ?? null, coffees: stats.get(m.id)?.all ?? 0,
      card_code: m.card_code ?? null, loyalty: loyal ? loyal.customers.has(m.square_customer_id) : null,
    })),
    coffees: recent.map(r => ({ ...r, value: Number(r.value), name: r.member_id ? memberName.get(r.member_id) ?? null : null })),
  }
}

coffeeClubRoutes.get('/api/coffee-club', async c => {
  const db = await requestDb(c)
  try {
    return c.json(await clubState(db, 'ok', c.env))
  } catch (e) {
    return c.json({ error: await failure(db, e) }, 400)
  }
})

const money = (n: number, currency: string, lang: TillLanguage) =>
  new Intl.NumberFormat(lang === 'es' ? 'es-ES' : 'en-IE', { style: 'currency', currency, minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n)

/**
 * Sets the club up, or changes it: { name, price, coffees_per_week, max_value, till_language, selling, key }.
 * Only what changed is made again in Square: a new price is a new variation (and a new checkout page); a new name
 * or most off a drink changes the discount; not selling takes the checkout page down.
 */
coffeeClubRoutes.post('/api/coffee-club', async c => {
  const db = await requestDb(c)
  try {
    const b = await c.req.json<Partial<CoffeeClubInput> & { key?: string }>().catch(() => ({} as Partial<CoffeeClubInput> & { key?: string }))
    const problem = clubInputProblem(b)
    if (problem) throw new ClubError(problem)
    if (!b.key || !/^[\w-]{8,64}$/.test(b.key)) throw new ClubError('Try again')
    const input: CoffeeClubInput = {
      name: b.name!.trim().replace(/\s+/g, ' '), price: Number(b.price), coffees_per_week: Number(b.coffees_per_week),
      max_value: Number(b.max_value), till_language: b.till_language!, selling: b.selling !== false,
    }
    const was = await loadClub(db)
    const s = await squareSession(c.env, db)
    const location = was?.square_location_id ?? s.locationIds[0]
    if (!location) throw new ClubError('Square has no location for this business. Connect Square again.')
    const { data: integ } = await db.from('integrations').select('external').eq('provider', 'square').single()
    const currency = was?.currency ?? ((integ?.external ?? {}) as { currency?: string }).currency ?? 'EUR'
    const { data: biz } = await db.from('business').select('name').maybeSingle()
    const business = ((biz as { name?: string } | null)?.name ?? '').trim()
    const lang = input.till_language
    const price = money(input.price, currency, lang)
    const per = input.coffees_per_week

    const planId = was?.square_plan_id ?? await square.createPlan(s.sandbox, s.token, `club-plan:${b.key}`, input.name)
    const newPrice = !was?.square_variation_id || was.price !== input.price
    const variationId = newPrice
      ? await square.createVariation(s.sandbox, s.token, `club-variation:${b.key}`, planId,
        lang === 'es' ? `${input.name}, ${price} al mes` : `${input.name}, ${price} a month`, input.price, currency)
      : was!.square_variation_id!
    const old = [...(was?.square_old_variation_ids ?? []), ...(newPrice && was?.square_variation_id ? [was.square_variation_id] : [])]
    const discountId = !was?.square_discount_id || was.name !== input.name || was.max_value !== input.max_value
      ? await square.saveDiscount(s.sandbox, s.token, `club-discount:${b.key}`, { id: was?.square_discount_id, name: input.name, max: input.max_value, currency })
      : was.square_discount_id
    // The checkout page: a new one for a new price or name; none while not selling.
    let link = was?.square_link_id && was.signup_url ? { id: was.square_link_id, url: was.signup_url } : null
    if (link && (!input.selling || newPrice || was!.name !== input.name || was!.coffees_per_week !== per)) {
      await square.deleteSignupLink(s.sandbox, s.token, link.id)
      link = null
    }
    if (input.selling && !link) {
      const what = lang === 'es'
        ? (per === 1 ? 'un café a la semana' : `${per} cafés a la semana`)
        : (per === 1 ? 'a coffee a week' : `${per} coffees a week`)
      link = await square.createSignupLink(s.sandbox, s.token, `club-link:${b.key}`, {
        name: business ? `${business}: ${input.name}` : input.name, price: input.price, currency, locationId: location, variationId,
        description: lang === 'es'
          ? `${what} por ${price} al mes. Se cobra cada mes; cancela cuando quieras.`
          : `${what} for ${price} a month. Charged monthly; cancel any time.`,
      })
    }
    check(await db.from('coffee_club').upsert({
      id: 1, ...input, currency, ...(was ? {} : { set_up_at: new Date().toISOString() }), square_location_id: location, square_plan_id: planId, square_variation_id: variationId,
      square_old_variation_ids: old, square_discount_id: discountId, square_link_id: link?.id ?? null, signup_url: link?.url ?? null,
    }, { onConflict: 'business_id' }))
    // The new week's allowance or wording on every member's note, over the next runs.
    if (was && (was.coffees_per_week !== per || was.name !== input.name || was.till_language !== lang)) {
      check(await db.from('coffee_club_members').update({ note_line: null }).neq('status', 'canceled'))
    }
    return c.json(await clubState(db, 'ok', c.env))
  } catch (e) {
    if (missingScope(e)) return c.json(await clubState(db, 'reconnect'))
    return c.json({ error: await failure(db, e) }, 400)
  }
})

// "Check Square now": members, the sales since the last look and a few notes, straight away.
coffeeClubRoutes.post('/api/coffee-club/sync', async c => {
  const db = await requestDb(c)
  try {
    // Who has joined Square Loyalty since, too.
    await forget(db, LOYALTY_KEY)
    const r = await syncCoffeeClub(c.env, db)
    return c.json(await clubState(db, r === 'reconnect' ? 'reconnect' : 'ok', c.env))
  } catch (e) {
    return c.json({ error: await failure(db, e) }, 400)
  }
})

// Cancel a membership: Square stops charging at the end of the month paid for; their coffees count until then.
coffeeClubRoutes.post('/api/coffee-club/members/:id/cancel', async c => {
  const db = await requestDb(c)
  try {
    const id = c.req.param('id')
    if (!/^[\w-]{1,64}$/.test(id)) throw new ClubError('Choose a member from the list')
    const m = check(await db.from('coffee_club_members').select(MEMBER_COLUMNS).eq('id', id).maybeSingle()) as MemberRow | null
    if (!m) throw new ClubError('That member isn’t here any more')
    if (m.status === 'canceled' || m.status === 'deactivated') throw new ClubError('That membership has already ended')
    const s = await squareSession(c.env, db)
    const sub = await square.cancelSubscription(s.sandbox, s.token, m.square_subscription_id)
    check(await db.from('coffee_club_members').update({
      status: lower(sub.status), ends_on: sub.canceled_date ?? null, updated_at: new Date().toISOString(),
    }).eq('id', id))
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: await failure(db, e) }, 400)
  }
})

// A coffee that didn't count (nobody added to the sale, not a member…), dealt with: off the list of things to look at.
coffeeClubRoutes.post('/api/coffee-club/coffees/:id/sorted', async c => {
  const db = await requestDb(c)
  try {
    const id = c.req.param('id')
    if (!/^[\w-]{1,64}$/.test(id)) throw new ClubError('Choose a coffee from the list')
    const done = check(await db.from('coffee_club_coffees').update({ sorted_at: new Date().toISOString() }).eq('id', id).not('problem', 'is', null).select('id')) as { id: string }[]
    if (!done.length) throw new ClubError('That coffee isn’t on the list any more')
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: await failure(db, e) }, 400)
  }
})

// ---------------------------------------------------------------------------------------------------------------
// The website's account page (worker/siteAccount.ts)
// ---------------------------------------------------------------------------------------------------------------

/**
 * The coffee club on someone's account page: how to join, or their pass (this week's coffees). Undefined when the
 * business has no club. Found by their customer here or their Square customer, whichever the membership has.
 */
export async function siteClub(db: SupabaseClient, customerId: string, squareCustomerId: string | null): Promise<SiteClub | undefined> {
  const c = await loadClub(db)
  if (!c?.square_variation_id) return undefined
  const [mine, viaSquare] = await Promise.all([
    db.from('coffee_club_members').select(MEMBER_COLUMNS).eq('customer_id', customerId).then(check) as Promise<MemberRow[]>,
    squareCustomerId
      ? db.from('coffee_club_members').select(MEMBER_COLUMNS).eq('square_customer_id', squareCustomerId).then(check) as Promise<MemberRow[]>
      : Promise.resolve([] as MemberRow[]),
  ])
  const live = [...new Map([...mine, ...viaSquare].map(m => [m.id, m])).values()].filter(m => m.status !== 'canceled' && m.status !== 'deactivated')
  const m = live.find(inGoodStanding) ?? live[0] ?? null
  const week = weekStart(today(await zoneOf(db)))
  const used = m ? (await usedIn(db, week, [m.id])).get(m.id) ?? 0 : 0
  const st = m ? standing(m) : null
  return {
    name: c.name, price: c.price, currency: c.currency, coffees_per_week: c.coffees_per_week,
    join_url: !m && c.selling ? c.signup_url : null,
    pass: m && st && st !== 'ended' ? {
      standing: st, used_this_week: used, left_this_week: inGoodStanding(m) ? Math.max(0, c.coffees_per_week - used) : 0,
      week_start: week, started_on: m.started_on, ends_on: m.ends_on, card_code: m.card_code ?? null,
    } : null,
  }
}
