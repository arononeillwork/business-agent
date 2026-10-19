// Square's customer directory comes into Customers by itself: right after Square is connected,
// then every 15 minutes (only the people added or changed since). Each one is a customer with
// source "square", linked by Square's id so they're never added twice. Someone already on the list
// (same email or phone) is linked rather than added again, and keeps where they came from. What's
// typed in the app wins: Square only fills fields that are empty here. Nobody is opted in to
// marketing (GDPR: Square doesn't record a yes), and people deleted in Square stay.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from './supabase'
import * as square from './providers/square'
import { setIntegration, squareSession } from './connections'
import { EMAIL, cleanDate, cleanPhone } from '../shared/customers'
import type { Customer, CustomerInput } from '../shared/types'

type Row = Pick<Customer, 'id' | 'first_name' | 'last_name' | 'email' | 'phone' | 'company' | 'birthday' | 'notes'> & { square_id: string | null }
type Incoming = CustomerInput & { square_id: string }
const FILLABLE = ['first_name', 'last_name', 'email', 'phone', 'company', 'birthday', 'notes'] as const

/** A Square customer as a customer here; null when there's no name, email or phone to keep. */
export function fromSquare(c: square.SquareCustomer): Incoming | null {
  const text = (v: string | undefined, max: number) => v?.trim().slice(0, max) || null
  const email = c.email_address?.trim().toLowerCase() ?? ''
  const r: Incoming = {
    square_id: c.id, kind: 'customer', source: 'square',
    first_name: text(c.given_name, 100), last_name: text(c.family_name, 100), company: text(c.company_name, 120),
    email: EMAIL.test(email) && email.length <= 254 ? email : null,
    phone: c.phone_number ? cleanPhone(c.phone_number) : null,
    // "0000-05-14": Square wasn't told the year, and a birthday here needs one.
    birthday: c.birthday ? cleanDate(c.birthday) : null,
    notes: text(c.note, 2000),
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
  const incoming = found.map(fromSquare).filter((c): c is Incoming => !!c)
  let added = 0
  if (incoming.length) {
    const { data: existing, error } = await db.from('customers').select('id, square_id, first_name, last_name, email, phone, company, birthday, notes')
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
    added = add.length
  }
  await setIntegration(db, 'square', { last_sync_at: started.toISOString() })
  return added
}
