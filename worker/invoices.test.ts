// Invoices that come by email, end to end through the Worker's routes against stand-ins for
// Supabase, Gmail and Google Drive. What must never break:
//   - the mailbox is read only when the admin allowed it, and only by admins with pay access
//   - each email's invoice is matched to its supplier and brought in once
//   - the file lands in the café's Drive under Tax/<year>/Q<n>/Purchase invoices, kept once
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { invoices, parseFrom } from './invoices'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret', MS_CLIENT_ID: 'ms-id', MS_CLIENT_SECRET: 'ms-secret',
} as unknown as Env

let db: FakeSupabase
let apis: FakeProviders
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
  db.table('suppliers').push(
    { id: 'roaster', name: 'Tostadores del Sur', email: 'pedidos@tostadoresdelsur.es', website: null, active: true, tax_id: 'B29123456', payment_terms: '30 días' },
    { id: 'bakery', name: 'By Eric', email: 'info@by-eric.es', website: null, active: true, tax_id: null, payment_terms: null })
  const pdf = new TextEncoder().encode('%PDF-1.7 invoice')
  const facturae = new TextEncoder().encode(`<fe:Facturae xmlns:fe="x"><Parties><SellerParty><TaxIdentification><TaxIdentificationNumber>B29123456</TaxIdentificationNumber></TaxIdentification>
    <LegalEntity><CorporateName>Tostadores del Sur SL</CorporateName></LegalEntity></SellerParty></Parties><Invoices><Invoice><InvoiceHeader><InvoiceNumber>0142</InvoiceNumber>
    <InvoiceSeriesCode>F2026</InvoiceSeriesCode></InvoiceHeader><InvoiceIssueData><IssueDate>2026-09-14</IssueDate></InvoiceIssueData><InvoiceTotals>
    <TotalGrossAmountBeforeTaxes>250.00</TotalGrossAmountBeforeTaxes><TotalTaxOutputs>25.00</TotalTaxOutputs><InvoiceTotal>275.00</InvoiceTotal></InvoiceTotals></Invoice></Invoices></fe:Facturae>`)
  apis.google.inbox = [
    { id: 'm1', from: 'Tostadores del Sur <facturacion@tostadoresdelsur.es>', subject: 'Factura F2026-0142', at: '2026-09-15T08:00:00Z',
      files: [{ id: 'a1', name: 'F2026-0142.xsig', type: 'application/xml', bytes: facturae }, { id: 'a2', name: 'logo.gif', type: 'image/gif', bytes: pdf }] },
    { id: 'm2', from: 'info@by-eric.es', subject: 'Factura agosto', at: '2026-09-02T09:00:00Z', files: [{ id: 'b1', name: 'Factura agosto.pdf', type: 'application/pdf', bytes: pdf }] },
    { id: 'm3', from: 'Mum <mum@gmail.com>', subject: 'Holiday photos', at: '2026-09-10T09:00:00Z', files: [{ id: 'c1', name: 'beach.zip', type: 'application/zip', bytes: pdf }] },
  ]
})
afterEach(() => vi.unstubAllGlobals())

const admin = { authorization: 'Bearer admin-token' }
const call = (path: string, init: RequestInit = {}) => invoices.request(`${APP}${path}`, init, env, ctx())
const req = (path: string, init: RequestInit = {}) => integrations.request(`${APP}${path}`, init, env, ctx())

/** Connect a Google service (asking to read the mailbox too, when `read`), as on Connections or Invoices. */
async function connect(provider: 'gmail' | 'google_drive', read = false) {
  const start = await req(`/api/integrations/connect/${provider}/start`, { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ read }) })
  const auth = new URL((await start.json() as { url: string }).url)
  const res = await req(`/api/integrations/google/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`)
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe(provider)
  return auth
}

describe('Invoices from the mailbox', () => {
  it('reads the mailbox only once the admin allowed it', async () => {
    apis.google.granted += ' https://www.googleapis.com/auth/gmail.readonly'
    const plain = await connect('gmail')
    expect(plain.searchParams.get('scope')).not.toContain('gmail.readonly') // sending only, as before
    expect(await (await call('/api/invoices/inbox', { headers: admin })).json()).toEqual({ mailbox: 'gmail', can_read: false, messages: [] })
    const reading = await connect('gmail', true)
    expect(reading.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/gmail.readonly')
    expect((await (await call('/api/invoices/inbox', { headers: admin })).json() as { can_read: boolean }).can_read).toBe(true)
  })

  it('asked to read but not allowed on Google’s screen: still not read', async () => {
    await connect('gmail', true) // the fake grants what it grants by default: no gmail.readonly
    expect((await (await call('/api/invoices/inbox', { headers: admin })).json() as { can_read: boolean }).can_read).toBe(false)
  })

  it('lists emails with files that could be invoices, matched to their supplier', async () => {
    apis.google.granted += ' https://www.googleapis.com/auth/gmail.readonly'
    await connect('gmail', true)
    const { messages } = await (await call('/api/invoices/inbox', { headers: admin })).json() as { messages: { id: string; supplier_id: string | null; attachments: { name: string }[] }[] }
    expect(messages.map(m => [m.id, m.supplier_id, m.attachments.map(a => a.name)])).toEqual([
      ['m1', 'roaster', ['F2026-0142.xsig']], // same company domain; the GIF isn't an invoice
      ['m2', 'bakery', ['Factura agosto.pdf']], // the same address
    ]) // the holiday photos (a zip) aren't listed
    expect((await call('/api/invoices/inbox', { headers: { authorization: 'Bearer staff-token' } })).status).toBe(403)
  })

  it('brings an e-invoice in: its file to Drive under the quarter, what it says filled in, and only once', async () => {
    apis.google.granted += ' https://www.googleapis.com/auth/gmail.readonly'
    await connect('gmail', true)
    await connect('google_drive')
    const body = { message: 'm1', attachment: 'a1', name: 'F2026-0142.xsig', at: '2026-09-15T08:00:00Z', from: 'Tostadores del Sur <facturacion@tostadoresdelsur.es>', subject: 'Factura F2026-0142' }
    const res = await call('/api/invoices/import', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expect(res.status).toBe(200)
    const { invoice } = await res.json() as { invoice: Record<string, unknown> }
    expect(invoice).toMatchObject({ direction: 'in', supplier_id: 'roaster', number: 'F2026-0142', issued_on: '2026-09-14', due_on: '2026-10-14',
      net: 250, vat: 25, total: 275, party_tax_id: 'B29123456', status: 'to_check', source: 'email', email_id: 'gmail:m1:a1' })
    const doc = db.table('tax_documents')[0]
    expect(doc).toMatchObject({ kind: 'purchase_invoice', year: 2026, quarter: 3, folder: ['Tax', '2026', 'Q3', 'Purchase invoices'], storage: 'google_drive' })
    expect(invoice.document_id).toBe(doc.id)
    const again = await call('/api/invoices/import', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expect(again.status).toBe(409)
    expect(apis.google.blobs.size).toBe(1)
    const listed = await (await call('/api/invoices/inbox', { headers: admin })).json() as { messages: { id: string; attachments: { imported: boolean }[] }[] }
    expect(listed.messages.find(m => m.id === 'm1')!.attachments[0].imported).toBe(true)
  })

  it('reads who sent it from the From line', () => {
    expect(parseFrom('Tostadores del Sur <Pedidos@Tostadores.es>')).toEqual({ name: 'Tostadores del Sur', email: 'pedidos@tostadores.es' })
    expect(parseFrom('"Makro, S.A." <facturas@makro.es>')).toEqual({ name: 'Makro, S.A.', email: 'facturas@makro.es' })
    expect(parseFrom('info@by-eric.es')).toEqual({ name: null, email: 'info@by-eric.es' })
  })
})
