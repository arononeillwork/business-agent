// The Documents hub, end to end through the Worker's routes against stand-ins for Supabase, Google
// Drive and OneDrive. What must never break:
//   - browsing shows what's in the café's Business Agent folder, marks the kept documents, and makes nothing
//   - uploads and new folders go under Business Agent/Documents only, with the row saved as the person
//   - nobody without pay access browses, uploads or makes folders
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { files } from './files'
import type { Env } from './supabase'
import type { StorageFolder } from '../shared/documents'
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
const call = (path: string, init: RequestInit = {}) => files.request(`${APP}${path}`, init, env, ctx())
const browse = async (path = '', headers: Record<string, string> = admin) => call(`/api/files/browse?path=${encodeURIComponent(path)}`, { headers })
const listed = async (path = '') => (await (await browse(path)).json()) as StorageFolder
const makeFolder = (path: string[], name: string) =>
  call('/api/files/folders', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ path, name }) })
const SHA = 'cd'.repeat(32)
const pdf = new TextEncoder().encode('%PDF-1.7 the lease')
const upload = (q: Record<string, string>, body: Uint8Array = pdf, headers: Record<string, string> = admin) =>
  call(`/api/files/upload?${new URLSearchParams({ name: 'Contrato alquiler.pdf', kind: 'contract', year: '2026', folder: 'Documents/Contracts', ...q })}`,
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

describe('Documents hub: the café’s Business Agent folder in its Drive or OneDrive', () => {
  it('only admins with pay access browse, upload or make folders', async () => {
    await connectStorage('google_drive')
    const folders = apis.google.folders.size // Business Agent, made on connecting
    expect((await call('/api/files/browse')).status).toBe(401)
    expect((await browse('', { authorization: 'Bearer staff-token' })).status).toBe(403)
    db.people.set('maria-token', { id: 'admin-2', role: 'admin' }) // an admin without pay access
    expect((await upload({}, pdf, { authorization: 'Bearer maria-token' })).status).toBe(403)
    expect((await call('/api/files/folders', { method: 'POST', headers: { authorization: 'Bearer maria-token', 'content-type': 'application/json' },
      body: JSON.stringify({ path: ['Documents'], name: 'Seguros' }) })).status).toBe(403)
    expect(apis.google.blobs.size).toBe(0)
    expect(apis.google.folders.size).toBe(folders)
  })

  it('with no storage connected, the page is told to connect Google Drive or OneDrive', async () => {
    for (const res of [await browse(), await upload({})]) {
      expect(res.status).toBe(400)
      expect((await res.json() as { error: string }).error).toMatch(/^Connect Google Drive or OneDrive.*Business Agent\/Documents/)
    }
  })

  it('Google Drive: nothing there yet shows nothing (and makes nothing); then folders first, files marked when kept', async () => {
    await connectStorage('google_drive')
    const folders = apis.google.folders.size
    expect(await listed()).toMatchObject({ storage: 'google_drive', path: [], entries: [] })
    expect(await listed('Documents/Contracts')).toEqual({ storage: 'google_drive', path: ['Documents', 'Contracts'], link: null, entries: [] })
    expect(apis.google.folders.size).toBe(folders)

    expect(await (await makeFolder(['Documents'], ' Seguros / RC ')).json()).toEqual({ path: ['Documents', 'Seguros RC'] })
    const res = await upload({ sha256: SHA, title: '  Lease of the premises ', tags: 'local, lease, local', expires_on: '2031-03-31' })
    expect(res.status).toBe(200)
    const { document } = await res.json() as { document: Record<string, unknown> }
    expect(document).toMatchObject({ name: 'Contrato alquiler.pdf', kind: 'contract', year: 2026, quarter: null, storage: 'google_drive',
      folder: ['Documents', 'Contracts'], sha256: SHA, title: 'Lease of the premises', tags: ['local', 'lease'], expires_on: '2031-03-31' })
    const [[fileId, file]] = [...apis.google.blobs]
    expect(drivePath(file.parent)).toEqual(['Business Agent', 'Documents', 'Contracts'])
    // A file the café put there itself (not kept on the list).
    apis.google.blobs.set('loose-1', { name: 'Plano local.png', parent: file.parent, type: 'image/png', bytes: new Uint8Array(3) })

    const top = await listed()
    expect(top.entries.map(e => [e.name, e.folder])).toEqual([['Documents', true]])
    expect(top.link).toMatch(/^https:\/\/drive\.google\.com\/drive\/folders\//)
    expect((await listed('Documents')).entries.map(e => e.name)).toEqual(['Contracts', 'Seguros RC'])
    const inside = await listed('Documents/Contracts')
    expect(inside.entries).toEqual([
      { id: fileId, name: 'Contrato alquiler.pdf', folder: false, size: pdf.length, modified: '2026-10-20T09:30:00.000Z', type: 'application/pdf',
        link: `https://drive.google.com/file/d/${fileId}/view`, kept_id: document.id },
      expect.objectContaining({ id: 'loose-1', name: 'Plano local.png', kept_id: null }),
    ])
  })

  it('OneDrive: lists folders and files by path, its own links, and nothing for a folder that isn’t there', async () => {
    await connectStorage('onedrive')
    expect(await listed('Documents')).toEqual({ storage: 'onedrive', path: ['Documents'], link: null, entries: [] })
    await makeFolder(['Documents'], 'Licencias')
    const { document } = await (await upload({ name: 'Licencia apertura.pdf', kind: 'other', folder: 'Documents/Licencias' })).json() as { document: Record<string, unknown> }
    expect([...apis.microsoft.blobs.values()][0].path).toBe('Business Agent/Documents/Licencias/Licencia apertura.pdf')
    const top = await listed()
    expect(top.entries.map(e => e.name)).toEqual(['Documents'])
    expect(top.link).toMatch(/^https:\/\/onedrive\.live\.com\//)
    const inside = await listed('Documents/Licencias')
    expect(inside.entries).toEqual([expect.objectContaining({ name: 'Licencia apertura.pdf', folder: false, size: pdf.length, kept_id: document.id })])
    expect(inside.entries[0].link).toMatch(/^https:\/\/onedrive\.live\.com\//)
  })

  it('uploads and new folders stay in Documents; odd paths, dates and the same file twice are refused', async () => {
    await connectStorage('google_drive')
    const error = async (res: Response, code = 400) => { expect(res.status).toBe(code); return (await res.json() as { error: string }).error }
    expect(await error(await upload({ folder: 'Tax/2026/Q4' }))).toBe('That folder isn’t in the Documents folder')
    expect(await error(await upload({ folder: 'Documents/../Tax' }))).toBe('That folder isn’t in the Documents folder')
    expect(await error(await makeFolder(['Social'], 'Posts'))).toBe('That folder isn’t in the Documents folder')
    expect(await error(await browse('Documents/../..'))).toBe('That folder isn’t in Business Agent')
    expect(await error(await browse('Documents/a\\b'))).toBe('That folder isn’t in Business Agent')
    expect(await listed("Documents/x' or name != 'y")).toMatchObject({ link: null, entries: [] }) // a name, quote and all
    expect(await error(await upload({ expires_on: '31/03/2031' }))).toBe('That date isn’t right')
    expect(await error(await upload({ name: 'run-me.exe' }))).toMatch(/^Use a PDF/)
    expect(apis.google.blobs.size).toBe(0)
    expect((await upload({ sha256: SHA })).status).toBe(200)
    expect(await error(await upload({ sha256: SHA, name: 'Copy.pdf' }), 409)).toBe('Already kept as “Contrato alquiler.pdf”')
    expect(apis.google.blobs.size).toBe(1)
  })
})
