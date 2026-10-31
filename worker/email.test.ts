// The Email page, end to end through the Worker's routes against stand-ins for Supabase and Gmail.
// What must never break:
//   - only admins, and only once reading the mailbox was allowed (the Invoices permission)
//   - each email is matched to its supplier and customer, and opens in the café's own Gmail account
//   - each chip, the period and a supplier are what Gmail is asked for
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { email } from './email'
import type { Env } from './supabase'
import type { EmailState } from '../shared/email'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret', MS_CLIENT_ID: 'ms-id', MS_CLIENT_SECRET: 'ms-secret',
} as unknown as Env

let db: FakeSupabase
let apis: FakeProviders
/** What Gmail was asked to search for (each list of emails). */
let searches: string[]
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  searches = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const u = new URL(url)
    if (u.host === 'gmail.googleapis.com' && u.pathname.endsWith('/messages')) searches.push(u.searchParams.get('q') ?? '')
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
  db.table('suppliers').push(
    { id: 'roaster', name: 'Tostadores del Sur', email: 'pedidos@tostadoresdelsur.es', website: null, active: true, tax_id: null },
    { id: 'bakery', name: 'By Eric', email: 'info@by-eric.es', website: null, active: true, tax_id: null })
  db.table('customers').push({ id: 'c1', first_name: 'Hannah', last_name: 'Becker', company: null, email: 'hannah@example.de', updated_at: '2026-09-20T10:00:00Z' })
  const pdf = new TextEncoder().encode('%PDF-1.7 invoice')
  apis.google.inbox = [
    { id: 'm1', from: 'Tostadores del Sur <facturacion@tostadoresdelsur.es>', subject: 'Factura F2026-0158', at: '2026-09-29T08:00:00Z',
      files: [{ id: 'a1', name: 'Factura F2026-0158.pdf', type: 'application/pdf', bytes: pdf }] },
    { id: 'm2', from: 'Hannah Becker <hannah@example.de>', subject: 'Booking enquiry: baby shower', at: '2026-09-28T09:00:00Z', files: [] },
  ]
})
afterEach(() => vi.unstubAllGlobals())

const admin = { authorization: 'Bearer admin-token' }
const call = (path: string, headers: Record<string, string> = admin) => email.request(`${APP}${path}`, { headers }, env, ctx())
const req = (path: string, init: RequestInit = {}) => integrations.request(`${APP}${path}`, init, env, ctx())

/** Connect Gmail on Connections, allowing it to read the mailbox too when `read` (and Google grants it). */
async function connectGmail(read: boolean) {
  if (read) apis.google.granted += ' https://www.googleapis.com/auth/gmail.readonly'
  const start = await req('/api/integrations/connect/gmail/start', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ read }) })
  const auth = new URL((await start.json() as { url: string }).url)
  const res = await req(`/api/integrations/google/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`)
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe('gmail')
}

describe('Email page', () => {
  it('admins only, and the mailbox is read only once reading it was allowed', async () => {
    expect((await call('/api/email/messages', { authorization: 'Bearer staff-token' })).status).toBe(403)
    expect(await (await call('/api/email/messages')).json()).toMatchObject({ mailbox: null, can_read: false, messages: [] })
    await connectGmail(false)
    expect(await (await call('/api/email/messages')).json()).toMatchObject({ mailbox: 'gmail', can_read: false, messages: [] })
    expect(searches).toEqual([]) // Gmail wasn't asked
  })

  it('lists the mailbox, each email matched to its supplier or customer and opening in the café’s Gmail, with counts for the chips', async () => {
    await connectGmail(true)
    const state = await (await call('/api/email/messages')).json() as EmailState
    expect(state).toMatchObject({ mailbox: 'gmail', can_read: true, next_page: null })
    expect(state.messages.map(m => [m.id, m.from, m.from_name, m.supplier_id, m.customer_name, m.attachments.map(a => a.name)])).toEqual([
      ['m1', 'facturacion@tostadoresdelsur.es', 'Tostadores del Sur', 'roaster', null, ['Factura F2026-0158.pdf']], // the same company domain
      ['m2', 'hannah@example.de', 'Hannah Becker', null, 'Hannah Becker', []],
    ])
    expect(state.messages[0].link).toBe(`https://mail.google.com/mail/?authuser=${encodeURIComponent(state.account!)}#all/m1`)
    expect(Object.keys(state.counts ?? {})).toHaveLength(8)
    expect(searches).toContain('newer_than:30d -in:sent -in:drafts -in:chats')
    expect(searches).toHaveLength(1 + 8) // the list, and a count for each chip

    // Kept 5 minutes: the same list again doesn't ask Gmail.
    const asked = searches.length
    await call('/api/email/messages')
    expect(searches).toHaveLength(asked)
  })

  it('a chip, the period, a search and a supplier are what Gmail is asked for', async () => {
    await connectGmail(true)
    await call('/api/email/messages?filter=unread&days=7&q=espresso')
    expect(searches).toContain('newer_than:7d -in:sent -in:drafts -in:chats is:unread espresso')
    searches = []
    await call('/api/email/messages?filter=invoices&supplier=roaster')
    expect(searches).toContain('newer_than:30d -in:sent -in:drafts -in:chats from:tostadoresdelsur.es has:attachment {factura facturas invoice invoices receipt receipts recibo recibos}')
    searches = []
    await call('/api/email/messages?filter=suppliers&page=next-one')
    expect(searches).toEqual(['newer_than:30d -in:sent -in:drafts -in:chats {from:tostadoresdelsur.es from:by-eric.es}']) // a later page: no counts again
    expect((await call('/api/email/messages?supplier=gone')).status).toBe(400)
  })
})
