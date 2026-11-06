// The Content page's synced folders, end to end through the Worker's routes against stand-ins for Supabase,
// OneDrive and Google Drive. What must never break:
//   - a folder's photos and videos are listed with addresses served from the folder itself: nothing copied
//   - a look adds what's new, takes off what's gone, leaves alone one an admin hid, and lists each file once
//   - only what a browser shows comes in (an iPhone's HEIC is counted, not listed)
//   - Google Drive's folders are read only when Drive was connected with that allowed; only admins
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { content } from './content'
import { forgetMediaTokens } from './media'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import { NO_DRIVE_FOLDERS, type ContentFolder, type FolderListing, type FolderSync } from '../shared/contentFolders'

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
  forgetMediaTokens()
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const admin = { authorization: 'Bearer admin-token' }
const staff = { authorization: 'Bearer staff-token' }
const connections = (path: string, init: RequestInit = {}) => integrations.request(`${APP}${path}`, init, env, ctx())
const call = (path: string, init: RequestInit = {}, who = admin) =>
  content.request(`${APP}${path}`, { ...init, headers: { ...who, 'content-type': 'application/json', ...init.headers } }, env, ctx())

/** Connect OneDrive or Google Drive as on the Connections page (`folders`: Drive's folders may be read too); returns the scope asked for. */
async function connect(provider: 'onedrive' | 'google_drive', folders = false) {
  const start = await connections(`/api/integrations/connect/${provider}/start`, { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ folders }) })
  const auth = new URL((await start.json() as { url: string }).url)
  const back = provider === 'onedrive' ? 'microsoft' : 'google'
  await connections(`/api/integrations/${back}/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`)
  return auth.searchParams.get('scope') ?? ''
}

/** The café's OneDrive: Pictures/Camera Roll with two photos, a video, an iPhone photo and a folder for 2025 with one more. */
function cameraRoll() {
  const add = (id: string, name: string, parent: string, type?: string) =>
    apis.microsoft.items.set(id, type ? { name, parent, type, bytes: new Uint8Array(40).fill(id.length) } : { name, parent, folder: true })
  add('pictures', 'Pictures', 'root')
  add('roll', 'Camera Roll', 'pictures')
  add('img-1', 'IMG_0001.JPG', 'roll', 'image/jpeg')
  add('img-2', 'latte art.jpg', 'roll', 'image/jpeg')
  add('clip-1', 'pour over.mp4', 'roll', 'video/mp4')
  add('heic-1', 'IMG_0002.HEIC', 'roll', 'image/heic')
  add('y2025', '2025', 'roll')
  add('img-3', 'IMG_0003.jpg', 'y2025', 'image/jpeg')
}

const rows = () => db.table('content_items').filter(r => r.source === 'folder')

describe('Synced folders', () => {
  it('look through the OneDrive, show a folder’s photos and videos from where they are, and keep up with it', async () => {
    await connect('onedrive')
    cameraRoll()

    // Looking through: the top, then Pictures.
    const top = await (await call('/api/content/folders/browse?provider=onedrive')).json() as FolderListing
    expect(top).toEqual({ provider: 'onedrive', folder: { id: null, name: 'OneDrive' }, folders: [{ id: 'pictures', name: 'Pictures' }] })
    const pictures = await (await call('/api/content/folders/browse?provider=onedrive&parent=pictures')).json() as FolderListing
    expect(pictures.folders).toEqual([{ id: 'roll', name: 'Camera Roll' }])

    // Camera Roll chosen: its photos and video come in (the 2025 folder's too); the HEIC is counted, not listed.
    const res = await call('/api/content/folders', { method: 'POST', body: JSON.stringify({ provider: 'onedrive', folder_id: 'roll', name: 'Camera Roll', path: 'Pictures › Camera Roll' }) })
    expect(res.status).toBe(200)
    const { folder, sync } = await res.json() as { folder: ContentFolder; sync: FolderSync }
    expect(folder).toMatchObject({ provider: 'onedrive', folder_id: 'roll', name: 'Camera Roll', path: 'Pictures › Camera Roll' })
    expect(sync).toEqual({ added: 4, removed: 0, total: 4, skipped: 1 })
    expect(rows().map(r => r.source_id).sort()).toEqual(['clip-1', 'img-1', 'img-2', 'img-3'])
    expect(rows().find(r => r.source_id === 'img-2')).toMatchObject({ kind: 'photo', title: 'latte art', folder_id: folder.id })
    expect(rows().find(r => r.source_id === 'clip-1')).toMatchObject({ kind: 'video', title: 'pour over' })

    // Nothing copied: the address serves the file from the OneDrive folder itself.
    expect(apis.microsoft.blobs.size).toBe(0)
    const url = new URL(String(rows().find(r => r.source_id === 'img-1')!.url))
    expect(url.pathname).toMatch(/^\/media\/o\/1\/img-1\/[\w-]{24}\.jpg$/)
    const got = await connections(url.pathname)
    expect(got.status).toBe(200)
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(new Uint8Array(40).fill('img-1'.length))

    // Choosing it again doesn't add it twice.
    const again = await (await call('/api/content/folders', { method: 'POST', body: JSON.stringify({ provider: 'onedrive', folder_id: 'roll', name: 'Camera Roll' }) })).json() as { sync: FolderSync }
    expect(again.sync).toMatchObject({ added: 0, removed: 0 })
    expect(db.table('content_folders')).toHaveLength(1)

    // Later: one taken out of the folder, a new one put in; one an admin took off the page stays off.
    apis.microsoft.items.delete('img-1')
    apis.microsoft.items.set('img-4', { name: 'terrace.jpg', parent: 'roll', type: 'image/jpeg', bytes: new Uint8Array(10) })
    rows().find(r => r.source_id === 'img-2')!.hidden = true
    const later = await (await call(`/api/content/folders/${folder.id}/sync`, { method: 'POST' })).json() as FolderSync
    expect(later).toEqual({ added: 1, removed: 1, total: 4, skipped: 1 })
    expect(rows().map(r => r.source_id).sort()).toEqual(['clip-1', 'img-2', 'img-3', 'img-4'])
    expect(rows().find(r => r.source_id === 'img-2')!.hidden).toBe(true)
    expect(db.table('content_folders')[0].last_synced_at).toBeTruthy()
  })

  it('a folder that isn’t there, or OneDrive not connected, says so', async () => {
    const off = await call('/api/content/folders/browse?provider=onedrive')
    expect(off.status).toBe(409)
    expect((await off.json() as { error: string }).error).toBe('Connect OneDrive on the Connections page first.')
    await connect('onedrive')
    const gone = await call('/api/content/folders', { method: 'POST', body: JSON.stringify({ provider: 'onedrive', folder_id: 'nope', name: 'Nope' }) })
    expect(gone.status).toBe(404)
    expect((await gone.json() as { error: string }).error).toBe('That folder isn’t in the OneDrive any more.')
  })

  it('Google Drive’s folders: only when Drive was connected with them allowed, which asks Google for read-only Drive', async () => {
    expect(await connect('google_drive')).not.toContain('https://www.googleapis.com/auth/drive.readonly')
    const no = await call('/api/content/folders/browse?provider=google_drive')
    expect(no.status).toBe(409)
    expect((await no.json() as { error: string }).error).toBe(NO_DRIVE_FOLDERS)

    // Google's screen: read-only Drive allowed.
    apis.google.granted += ' https://www.googleapis.com/auth/drive.readonly'
    expect(await connect('google_drive', true)).toContain('https://www.googleapis.com/auth/drive.readonly')
    expect(db.integration('google_drive').external).toMatchObject({ reads_folders: true })
    apis.google.folders.set('shop', { name: 'Shop photos', parent: 'root', trashed: false })
    apis.google.blobs.set('d-1', { name: 'window.jpg', parent: 'shop', type: 'image/jpeg', bytes: new Uint8Array(12) })
    const top = await (await call('/api/content/folders/browse?provider=google_drive')).json() as FolderListing
    expect(top.folders).toContainEqual({ id: 'shop', name: 'Shop photos' })
    const res = await call('/api/content/folders', { method: 'POST', body: JSON.stringify({ provider: 'google_drive', folder_id: 'shop', name: 'Shop photos' }) })
    expect(res.status).toBe(200)
    expect((await res.json() as { sync: FolderSync }).sync).toMatchObject({ added: 1, total: 1 })
    expect(String(rows()[0].url)).toMatch(/^https:\/\/app\.test\/media\/g\/1\/d-1\/[\w-]{24}\.jpg$/)
  })

  it('are for admins only', async () => {
    await connect('onedrive')
    const res = await call('/api/content/folders/browse?provider=onedrive', {}, staff)
    expect(res.status).toBe(403)
  })
})
