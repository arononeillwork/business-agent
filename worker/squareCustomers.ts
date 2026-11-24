// Square's customer directory comes into Customers by itself: right after Square is connected,
// straight away when someone is added or changed in Square (its customer webhook), and every hour
// as a safety net (only the people added or changed since). Each one is a customer with
// source "square", linked by Square's id so they're never added twice; the ones Square holds for the
// people who post about the café on Instagram (worker/squareReps.ts) come in as from Instagram, with
// their Instagram name. Someone already on the list
// (same email or phone) is linked rather than added again, and keeps where they came from. What's
// typed in the app wins: Square only fills fields that are empty here. Nobody is opted in to
// marketing (GDPR: Square doesn't record a yes), and people deleted in Square stay.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from './supabase'
import * as square from './providers/square'
import { setIntegration, squareSession } from './connections'
import { EMAIL, cleanDate, cleanPhone } from '../shared/customers'
import type { Customer, CustomerInput } from '../shared/types'
import { withoutNoteLine } from '../shared/coffeeClub'

type Row = Pick<Customer, 'id' | 'first_name' | 'last_name' | 'email' | 'phone' | 'company' | 'birthday' | 'notes' | 'instagram' | 'source'> & { square_id: string | null }
type Incoming = CustomerInput & { square_id: string }
const FILLABLE = ['first_name', 'last_name', 'email', 'phone', 'company', 'birthday', 'notes', 'instagram'] as const

const HANDLE = /^@?([A-Za-z0-9._]{1,30})$/
/**
 * Their Instagram name, when Square's customer is one made for someone who posts about the café on
 * Instagram (worker/squareReps.ts: "rep:" as its reference, "@name" as its nickname, or its note).
 */
export function instagramOf(c: Pick<square.SquareCustomer, 'nickname' | 'reference_id' | 'note'>): string | null {
  const nick = c.nickname?.trim() ?? ''
  if (nick.startsWith('@') || c.reference_id?.startsWith('rep:')) {
    const name = HANDLE.exec(nick)?.[1]
    if (name) return name
  }
  return /^Posts about the café on Instagram \(@([A-Za-z0-9._]{1,30})\)/.exec(c.note?.trim() ?? '')?.[1] ?? null
}

/** A Square customer as a customer here; null when there's no name, email or phone to keep. */
export function fromSquare(c: square.SquareCustomer): Incoming | null {
  const text = (v: string | undefined, max: number) => v?.trim().slice(0, max) || null
  const email = c.email_address?.trim().toLowerCase() ?? ''
  const instagram = instagramOf(c)
  const r: Incoming = {
    square_id: c.id, kind: 'customer', source: instagram ? 'instagram' : 'square', instagram,
    first_name: text(c.given_name, 100), last_name: text(c.family_name, 100), company: text(c.company_name, 120),
    email: EMAIL.test(email) && email.length <= 254 ? email : null,
    phone: c.phone_number ? cleanPhone(c.phone_number) : null,
    // "0000-05-14": Square wasn't told the year, and a birthday here needs one.
    birthday: c.birthday ? cleanDate(c.birthday) : null,
    // Without the coffee club's line, which the app writes there for the till (worker/coffeeClub.ts).
    notes: text(withoutNoteLine(c.note), 2000),
  }
  return r.first_name || r.last_name || r.email || r.phone ? r : null
}

const digits = (p: string | null | undefined) => p?.replace(/\D/g, '') || null

/**
 * What to do with Square's customers, given who is on the list already: new people to add, and
 * gaps to fill in (with the Square link) for people already here.
 */
export function plan(incoming: Incoming[], existing: Row[]) {
  const bySquare = new Map(existing.filter(r => r.square_id).map(r => [r.square_id!, r]))
  const unlinked = existing.filter(r => !r.square_id)
  const add: Incoming[] = []
  const fill: { id: string; patch: Partial<Incoming> }[] = []
  for (const c of incoming) {
    const here = bySquare.get(c.square_id)
      ?? unlinked.find(r => (c.email && r.email?.toLowerCase() === c.email) || (digits(c.phone) && digits(r.phone) === digits(c.phone)))
    if (!here) { add.push(c); continue }
    const patch: Partial<Incoming> = Object.fromEntries(FILLABLE.filter(k => here[k] == null && c[k] != null).map(k => [k, c[k]]))
    // Someone who posts about the café on Instagram came from Instagram, not from Square itself.
    if (c.source === 'instagram' && here.source === 'square') patch.source = 'instagram'
    if (!here.square_id) {
      patch.square_id = c.square_id
      unlinked.splice(unlinked.indexOf(here), 1)
    }
    if (Object.keys(patch).length) fill.push({ id: here.id, patch })
    Object.assign(here, patch)
    bySquare.set(c.square_id, here)
  }
  return { add, fill }
}

/**
 * Bring Square's customers into Customers. `full` reads the whole directory (after connecting);
 * otherwise only the people changed since the last time. Returns how many were added, or
 * 'reconnect' for a Square connection made before customers were asked for.
 */
export async function syncSquareCustomers(env: Env, db: SupabaseClient, full = false): Promise<number | 'reconnect' | null> {
  const { data: row } = await db.from('integrations').select('status, last_sync_at').eq('provider', 'square').single()
  if (row?.status !== 'connected') return null
  const started = new Date()
  // A few minutes' overlap, so a change made while the last look was running isn't missed.
  const since = !full && row.last_sync_at ? new Date(Date.parse(row.last_sync_at) - 10 * 60_000).toISOString() : undefined
  const s = await squareSession(env, db)
  let found: square.SquareCustomer[]
  try {
    found = await square.customers(s.sandbox, s.token, since)
  } catch (e) {
    if (e instanceof square.SquareError && e.code === 'INSUFFICIENT_SCOPES') return 'reconnect'
    throw e
  }
  const added = await save(db, found.map(fromSquare).filter((c): c is Incoming => !!c))
  await setIntegration(db, 'square', { last_sync_at: started.toISOString() })
  return added
}

/** Add the new people and fill the gaps of those already here. Returns how many were added. */
async function save(db: SupabaseClient, incoming: Incoming[]) {
  if (!incoming.length) return 0
  const { data: existing, error } = await db.from('customers').select('id, square_id, first_name, last_name, email, phone, company, birthday, notes, instagram, source')
  if (error) throw new Error(error.message)
  const { add, fill } = plan(incoming, (existing ?? []) as Row[])
  for (let i = 0; i < add.length; i += 500) {
    const { error: e } = await db.from('customers').insert(add.slice(i, i + 500), { defaultToNull: false })
    if (e) throw new Error(e.message)
  }
  for (const f of fill) {
    const { error: e } = await db.from('customers').update(f.patch).eq('id', f.id)
    if (e) throw new Error(e.message)
  }
  return add.length
}

/**
 * One customer.created or customer.updated webhook: that person, straight into Customers. Only
 * for the Square account this business connected (Square sends every connected seller's events
 * to the one app). Returns whether someone was added.
 */
export async function squareCustomerEvent(db: SupabaseClient, event: square.SquareCustomerEvent) {
  if (event.type !== 'customer.created' && event.type !== 'customer.updated') return false
  const customer = event.data?.object?.customer
  if (!customer?.id) return false
  const { data: row } = await db.from('integrations').select('status, external').eq('provider', 'square').single()
  if (row?.status !== 'connected' || (row.external as { merchant_id?: string } | null)?.merchant_id !== event.merchant_id) return false
  const one = fromSquare(customer)
  return one ? (await save(db, [one])) > 0 : false
}

/** One Square customer into Customers now (a coffee club member who just joined): added, or their gaps filled. */
export async function importSquareCustomer(db: SupabaseClient, customer: square.SquareCustomer) {
  const one = fromSquare(customer)
  return one ? save(db, [one]) : 0
}
