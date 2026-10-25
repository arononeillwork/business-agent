// The Legal page, end to end through the Worker's routes against stand-ins for Supabase, Google Drive
// and OneDrive. What must never break:
//   - documents stay where they are: picking one stores only where it is, and nothing is uploaded or copied
//   - Google Drive and OneDrive can both be connected, and the admin picks from either
//   - only files the storage really has (and lets the app open) are added; folders and repeats are skipped
//   - only admins pick; the file is shown to whoever can read its row, straight from its storage
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { legal } from './legal'
import type { Env } from './supabase'
import { SKIPPED, type LegalDocument, type LegalSource, type StorageListing } from '../shared/legalDocs'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: '123456789012-abc.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'google-secret',
  GOOGLE_PICKER_API_KEY: 'browser-key', MS_CLIENT_ID: 'ms-id', MS_CLIENT_SECRET: 'ms-secret',
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
  // The café's Drive: its lease and deeds (picked in Google's picker), a Google Doc, and a file never picked.
  const pdf = (s: string) => new TextEncoder().encode(`%PDF-1.7 ${s}`)
  apis.google.blobs.set('g-lease', { name: 'Contrato arrendamiento.pdf', parent: 'root', type: 'application/pdf', bytes: pdf('lease') })
  apis.google.blobs.set('g-deeds', { name: 'escritura_SL.pdf', parent: 'root', type: 'application/pdf', bytes: pdf('deeds') })
  apis.google.blobs.set('g-policy', { name: 'Política de privacidad', parent: 'root', type: 'application/vnd.google-apps.document', bytes: new Uint8Array() })
  apis.google.blobs.set('g-private', { name: 'Personal.pdf', parent: 'root', type: 'application/pdf', bytes: pdf('private') })
  apis.google.unshared.add('g-private')
  // The café's OneDrive: Documents › Legal with an insurance policy, a Word contract and a zip.
  const items = apis.microsoft.items
  items.set('od-docs', { name: 'Documents', parent: 'root', folder: true })
  items.set('od-legal', { name: 'Legal', parent: 'od-docs', folder: true })
  items.set('od-ins', { name: 'Póliza Mapfre RC.pdf', parent: 'od-legal', type: 'application/pdf', bytes: pdf('insurance') })
  items.set('od-word', { name: 'Contrato cafetera.docx', parent: 'od-legal', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: new Uint8Array([80, 75]) })
  items.set('od-zip', { name: 'Old.zip', parent: 'od-legal', type: 'application/zip', bytes: new Uint8Array([80, 75]) })
  items.set('od-photo', { name: 'Fachada.jpg', parent: 'root', type: 'image/jpeg', bytes: new Uint8Array([255, 216, 255]) })
})
afterEach(() => vi.unstubAllGlobals())

const admin = { authorization: 'Bearer admin-token' }
const call = (path: string, init: RequestInit = {}) => legal.request(`${APP}${path}`, init, env, ctx())
const get = async <T,>(path: string, headers: Record<string, string> = admin) => (await (await call(path, { headers })).json()) as T
const add = (storage: string, ids: string[], headers: Record<string, string> = admin) =>
  call('/api/legal/documents', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ storage, ids }) })
const added = async (storage: string, ids: string[]) => (await (await add(storage, ids)).json()) as { added: LegalDocument[]; skipped: { id: string; name: string | null; why: string }[] }

async function connectStorage(provider: 'google_drive' | 'onedrive') {
  const req = (path: string, init: RequestInit = {}) => integrations.request(`${APP}${path}`, init, env, ctx())
  const start = await req(`/api/integrations/connect/${provider}/start`, { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: '{}' })
  const auth = new URL((await start.json() as { url: string }).url)
  const back = auth.host === 'login.microsoftonline.com' ? 'microsoft' : 'google'
  const res = await req(`/api/integrations/${back}/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`)
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe(provider)
}

const uploads = () => [...apis.calls].filter(c => /^(POST|PUT) (www\.googleapis\.com\/upload|upload\.onedrive|graph\.microsoft\.com\/v1\.0\/me\/drive\/root:.*createUploadSession)/.test(c))

describe('Legal page: documents picked where they are in the café’s Google Drive or OneDrive', () => {
  it('only admins pick; everyone else is turned away before any storage is touched', async () => {
    await connectStorage('google_drive')
    expect((await call('/api/legal/sources')).status).toBe(401)
    for (const res of [await call('/api/legal/sources', { headers: { authorization: 'Bearer staff-token' } }),
      await call('/api/legal/google/picker', { headers: { authorization: 'Bearer staff-token' } }),
      await call('/api/legal/onedrive/browse', { headers: { authorization: 'Bearer staff-token' } }),
      await add('google_drive', ['g-lease'], { authorization: 'Bearer staff-token' })]) {
      expect(res.status).toBe(403)
    }
    expect(db.table('legal_documents')).toHaveLength(0)
  })

  it('lists both storages, connected or not; Google Drive is picked in Google’s picker, OneDrive browsed here', async () => {
    let { sources } = await get<{ sources: LegalSource[] }>('/api/legal/sources')
    expect(sources).toEqual([
      { storage: 'google_drive', connected: false, account: null, how: 'picker', problem: null },
      { storage: 'onedrive', connected: false, account: null, how: 'browse', problem: null },
    ])
    await connectStorage('google_drive')
    await connectStorage('onedrive')
    ;({ sources } = await get<{ sources: LegalSource[] }>('/api/legal/sources'))
    expect(sources.map(s => [s.storage, s.connected, s.account])).toEqual([['google_drive', true, 'cafe@gmail.com'], ['onedrive', true, expect.any(String)]])

    // Without the picker's key, Google Drive says why and OneDrive still works.
    const noKey = { ...env, GOOGLE_PICKER_API_KEY: undefined } as Env
    const res = await legal.request(`${APP}/api/legal/sources`, { headers: admin }, noKey, ctx())
    expect((await res.json() as { sources: LegalSource[] }).sources.map(s => s.problem)).toEqual([expect.stringMatching(/isn’t switched on.*OneDrive works/), null])
    expect((await legal.request(`${APP}/api/legal/google/picker`, { headers: admin }, noKey, ctx())).status).toBe(400)
  })

  it('the picker gets a fresh Drive token, the key and the project number (never cached)', async () => {
    expect((await call('/api/legal/google/picker', { headers: admin })).status).toBe(409) // not connected yet
    await connectStorage('google_drive')
    const res = await call('/api/legal/google/picker', { headers: admin })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ token: expect.stringMatching(/^g-access/), key: 'browser-key', app_id: '123456789012' })
  })

  it('Google Drive: picked files are added where they are, with a kind guessed; unpicked files, repeats and folders are skipped', async () => {
    await connectStorage('google_drive')
    const { added: docs, skipped } = await added('google_drive', ['g-lease', 'g-deeds', 'g-private'])
    expect(docs.map(d => [d.title, d.kind, d.storage, d.file_id, d.link])).toEqual([
      ['Contrato arrendamiento', 'lease', 'google_drive', 'g-lease', 'https://drive.google.com/file/d/g-lease/view'],
      ['escritura_SL', 'company', 'google_drive', 'g-deeds', 'https://drive.google.com/file/d/g-deeds/view'],
    ])
    expect(docs[0]).toMatchObject({ file_name: 'Contrato arrendamiento.pdf', mime_type: 'application/pdf', size: 14, modified_at: '2026-10-20T09:30:00.000Z', location: null })
    expect(skipped).toEqual([{ id: 'g-private', name: null, why: SKIPPED.unshared }])

    const again = await added('google_drive', ['g-lease', [...apis.google.folders.keys()][0]])
    expect(again.added).toEqual([])
    expect(again.skipped.map(s => [s.name, s.why])).toEqual([['Contrato arrendamiento', SKIPPED.already], ['Business Agent', SKIPPED.folder]])
    expect(uploads()).toEqual([])
    expect(db.table('legal_documents')).toHaveLength(2)
  })

  it('OneDrive: browses any folder, marks what’s already added, and adds files with the folder they’re in', async () => {
    await connectStorage('onedrive')
    const top = await get<StorageListing>('/api/legal/onedrive/browse')
    expect(top.folder).toEqual({ id: null, name: 'OneDrive' })
    expect(top.items.map(i => [i.name, i.folder])).toEqual([['Documents', true], ['Fachada.jpg', false]]) // folders first

    const { added: docs } = await added('onedrive', ['od-ins', 'od-word'])
    expect(docs.map(d => [d.title, d.kind, d.location])).toEqual([['Póliza Mapfre RC', 'insurance', 'Documents/Legal'], ['Contrato cafetera', 'contract', 'Documents/Legal']])
    expect(docs[0].link).toBe('https://onedrive.live.com/?id=od-ins')

    const inside = await get<StorageListing>('/api/legal/onedrive/browse?folder=od-legal')
    expect(inside.folder).toEqual({ id: 'od-legal', name: 'Legal' })
    expect(inside.items.map(i => [i.name, i.added_id])).toEqual([['Contrato cafetera.docx', docs[1].id], ['Old.zip', null], ['Póliza Mapfre RC.pdf', docs[0].id]])
    expect((await call('/api/legal/onedrive/browse?folder=nowhere', { headers: admin })).status).toBe(404)
    expect((await call('/api/legal/onedrive/browse?folder=od-ins', { headers: admin })).status).toBe(404) // a file isn't a folder
    expect(uploads()).toEqual([])
  })

  it('both connected at once: documents come from either and say which', async () => {
    await connectStorage('google_drive')
    await connectStorage('onedrive')
    await added('google_drive', ['g-lease'])
    await added('onedrive', ['od-ins'])
    expect(db.table('legal_documents').map(d => [d.storage, d.file_id])).toEqual([['google_drive', 'g-lease'], ['onedrive', 'od-ins']])
    expect(db.integration('google_drive').status).toBe('connected')
  })

  it('refuses a storage that isn’t connected, an unknown one, nothing chosen, or too much at once', async () => {
    const error = async (res: Response, code = 400) => { expect(res.status).toBe(code); return (await res.json() as { error: string }).error }
    expect(await error(await add('onedrive', ['od-ins']), 409)).toMatch(/^OneDrive isn’t connected/)
    await connectStorage('onedrive')
    expect(await error(await add('dropbox', ['x']))).toBe('Choose Google Drive or OneDrive')
    expect(await error(await add('onedrive', []))).toBe('Choose at least one file')
    expect(await error(await add('onedrive', Array.from({ length: 51 }, (_, i) => `f${i}`)))).toBe('Choose up to 50 files at a time')
  })

  it('shows a file straight from its storage: PDFs and pictures as they are, Google Docs and Word files as PDFs', async () => {
    await connectStorage('google_drive')
    await connectStorage('onedrive')
    const [lease, policy] = (await added('google_drive', ['g-lease', 'g-policy'])).added
    const [word, zip, photo] = (await added('onedrive', ['od-word', 'od-zip', 'od-photo'])).added
    const file = (d: LegalDocument, headers: Record<string, string> = admin) => call(`/api/legal/documents/${d.id}/file`, { headers })

    let res = await file(lease)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe('inline; filename="Contrato arrendamiento.pdf"; filename*=UTF-8\'\'Contrato%20arrendamiento.pdf')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.text()).toBe('%PDF-1.7 lease')

    res = await file(policy)
    expect(res.headers.get('content-disposition')).toMatch(/filename\*=UTF-8''Pol%C3%ADtica%20de%20privacidad\.pdf$/)
    expect(await res.text()).toBe('%PDF-1.7 Política de privacidad')
    expect(await (await file(word)).text()).toBe('%PDF-1.7 converted Contrato cafetera.docx')
    res = await file(photo)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([255, 216, 255]))

    res = await file(zip)
    expect(res.status).toBe(415)
    expect((await res.json() as { error: string }).error).toBe('This kind of file opens in OneDrive')
  })

  it('a file is shown only to who can read its row, and says so when its storage is gone', async () => {
    await connectStorage('google_drive')
    const [lease] = (await added('google_drive', ['g-lease'])).added
    expect((await call(`/api/legal/documents/${lease.id}/file`)).status).toBe(401)
    expect((await call('/api/legal/documents/not-an-id/file', { headers: admin })).status).toBe(404)
    expect((await call('/api/legal/documents/00000000-0000-4000-8000-000000000000/file', { headers: admin })).status).toBe(404)

    apis.google.blobs.delete('g-lease') // deleted in Drive
    let res = await call(`/api/legal/documents/${lease.id}/file`, { headers: admin })
    expect(res.status).toBe(404)
    expect((await res.json() as { error: string }).error).toMatch(/isn’t in Google Drive any more/)

    db.integration('google_drive').status = 'disconnected'
    res = await call(`/api/legal/documents/${lease.id}/file`, { headers: admin })
    expect(res.status).toBe(409)
    expect((await res.json() as { error: string }).error).toMatch(/^Google Drive isn’t connected/)
  })
})
