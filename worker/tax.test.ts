// Tax documents, end to end through the Worker's routes against stand-ins for Supabase, Google
// Drive and OneDrive. What must never break:
//   - documents go into the café's own Drive/OneDrive under Business Agent/Tax, in the folder chosen
//   - nothing goes outside the Tax folder, and nobody without pay access can upload or browse
//   - the database keeps where each file is, and the same file isn't kept twice
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { tax } from './tax'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret',
  MS_CLIENT_ID: 'ms-id', MS_CLIENT_SECRET: 'ms-secret',
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
})
afterEach(() => vi.unstubAllGlobals())

const admin = { authorization: 'Bearer admin-token' }
const call = (path: string, init: RequestInit = {}) => tax.request(`${APP}${path}`, init, env, ctx())
const SHA = 'ab'.repeat(32)
const pdf = new TextEncoder().encode('%PDF-1.7 a purchase invoice')
const upload = (q: Record<string, string>, body: Uint8Array = pdf, headers: Record<string, string> = admin) =>
  call(`/api/tax/upload?${new URLSearchParams({ name: 'Factura Makro.pdf', kind: 'purchase_invoice', year: '2026', quarter: '4', folder: 'Tax/2026/Q4/Purchase invoices', ...q })}`,
    { method: 'POST', headers: { ...headers, 'content-type': 'application/pdf' }, body })

async function connectStorage(provider: 'google_drive' | 'onedrive') {
  const req = (path: string, init: RequestInit = {}) => integrations.request(`${APP}${path}`, init, env, ctx())
  const start = await req(`/api/integrations/connect/${provider}/start`, { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: '{}' })
  const auth = new URL((await start.json() as { url: string }).url)
  const back = auth.host === 'login.microsoftonline.com' ? 'microsoft' : 'google'
  const res = await req(`/api/integrations/${back}/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`)
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe(provider)
}

/** Where a Drive file or folder is, by folder names. */
const drivePath = (id: string): string[] => { const f = apis.google.folders.get(id); return f ? [...drivePath(f.parent), f.name] : [] }

describe('Tax documents: kept in the café’s Drive or OneDrive, under Business Agent/Tax', () => {
  it('only admins with pay access browse or upload', async () => {
    await connectStorage('google_drive')
    expect((await call('/api/tax/folders')).status).toBe(401)
    expect((await call('/api/tax/folders', { headers: { authorization: 'Bearer staff-token' } })).status).toBe(403)
    db.people.set('maria-token', { id: 'admin-2', role: 'admin' }) // an admin without pay access
    expect((await upload({}, pdf, { authorization: 'Bearer maria-token' })).status).toBe(403)
    expect(apis.google.blobs.size).toBe(0)
  })

  it('with no storage connected, the page is told to connect Google Drive or OneDrive', async () => {
    const res = await call('/api/tax/folders', { headers: admin })
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toMatch(/Connect Google Drive or OneDrive/)
  })

  it('Google Drive: makes a folder, lists it, and an upload lands in the folder chosen with its row saved', async () => {
    await connectStorage('google_drive')
    const made = await call('/api/tax/folders', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' },
      body: JSON.stringify({ path: ['Tax', '2026'], name: ' Gestoría / Q4 ' }) })
    expect(await made.json()).toEqual({ path: ['Tax', '2026', 'Gestoría Q4'] })
    const list = await (await call('/api/tax/folders?path=Tax/2026', { headers: admin })).json() as { storage: string; folders: string[]; link: string }
    expect(list).toMatchObject({ storage: 'google_drive', folders: ['Gestoría Q4'] })
    expect(list.link).toMatch(/^https:\/\/drive\.google\.com\/drive\/folders\//)

    const res = await upload({ sha256: SHA })
    expect(res.status).toBe(200)
    const { document } = await res.json() as { document: Record<string, unknown> }
    expect(document).toMatchObject({ name: 'Factura Makro.pdf', kind: 'purchase_invoice', year: 2026, quarter: 4, storage: 'google_drive',
      folder: ['Tax', '2026', 'Q4', 'Purchase invoices'], sha256: SHA, size: pdf.length })
    const [file] = [...apis.google.blobs.values()]
    expect(drivePath(file.parent)).toEqual(['Business Agent', 'Tax', '2026', 'Q4', 'Purchase invoices'])
    expect(file).toMatchObject({ name: 'Factura Makro.pdf', type: 'application/pdf' })
    expect(document.link).toBe(`https://drive.google.com/file/d/${document.file_id}/view`)
    expect(db.table('tax_documents')).toHaveLength(1)
  })

  it('the same file twice is refused, before anything is uploaded', async () => {
    await connectStorage('google_drive')
    expect((await upload({ sha256: SHA })).status).toBe(200)
    const again = await upload({ sha256: SHA, name: 'Copy.pdf' })
    expect(again.status).toBe(409)
    expect((await again.json() as { error: string }).error).toBe('Already kept as “Factura Makro.pdf”')
    expect(apis.google.blobs.size).toBe(1)
  })

  it('OneDrive: lists the folders made there and uploads with OneDrive’s own link', async () => {
    await connectStorage('onedrive')
    await call('/api/tax/folders', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ path: ['Tax'], name: '2026' }) })
    const list = await (await call('/api/tax/folders', { headers: admin })).json() as { storage: string; folders: string[]; link: string }
    expect(list).toMatchObject({ storage: 'onedrive', folders: ['2026'] })
    expect(list.link).toMatch(/^https:\/\/onedrive\.live\.com\//)
    const { document } = await (await upload({ name: 'Nómina Julio.pdf', kind: 'payslip', folder: 'Tax/2026' })).json() as { document: Record<string, unknown> }
    expect(document).toMatchObject({ storage: 'onedrive', kind: 'payslip', folder: ['Tax', '2026'] })
    expect(String(document.link)).toMatch(/^https:\/\/onedrive\.live\.com\//)
    expect([...apis.microsoft.blobs.values()][0].path).toBe('Business Agent/Tax/2026/Nómina Julio.pdf')
  })

  it('refuses anything outside the Tax folder, files it doesn’t take, and missing details', async () => {
    await connectStorage('google_drive')
    const error = async (res: Response) => { expect(res.status).toBe(400); return (await res.json() as { error: string }).error }
    expect(await error(await upload({ folder: 'Social/Posts' }))).toBe('That folder isn’t in the Tax folder')
    expect(await error(await upload({ folder: 'Tax/../Social' }))).toBe('That folder isn’t in the Tax folder')
    expect(await error(await call('/api/tax/folders?path=Social', { headers: admin }))).toBe('That folder isn’t in the Tax folder')
    expect(await error(await upload({ name: 'run-me.exe' }))).toMatch(/^Use a PDF/)
    expect(await error(await upload({ kind: 'love_letter' }))).toBe('Choose what kind of document it is')
    expect(await error(await upload({ quarter: '5' }))).toBe('Choose the quarter it’s for')
    expect(await error(await upload({}, new Uint8Array(0)))).toBe('That file is empty')
    expect(await error(await call('/api/tax/folders', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' },
      body: JSON.stringify({ path: ['Tax'], name: '   ' }) }))).toBe('Give the folder a name (up to 100 characters)')
    expect(apis.google.blobs.size).toBe(0)
  })
})
