// The Content page's Google Photos, end to end through the Worker's routes against stand-ins for
// Supabase, Google Drive and Google's Photos Picker API. What must never break:
//   - Google Photos only connects when Google opened a picker for the account (and nothing's left behind)
//   - a pick is read only once the admin pressed Done, and a "not yet" doesn't mark the connection broken
//   - what was picked is copied into the café's own Drive (Business Agent/Content), a few per request,
//     each with Google's token and a size, and listed once (picking it again adds nothing)
//   - what can't be brought in says why; only admins, with storage and Google Photos connected
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { content } from './content'
import { forgetMediaTokens } from './media'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import { IMPORT_BATCH, type GooglePhotosImport, type GooglePhotosPick } from '../shared/content'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret',
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
const call = (path: string, init: RequestInit = {}, who = admin) => content.request(`${APP}${path}`, { ...init, headers: { ...who, ...init.headers } }, env, ctx())

/** Connect an app signed in with Google, as on the Connections page; returns where Google sent the admin back to. */
async function connect(provider: 'google_drive' | 'google_photos', back?: string) {
  const start = await connections(`/api/integrations/connect/${provider}/start`, { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ back }) })
  const auth = new URL((await start.json() as { url: string }).url)
  const res = await connections(`/api/integrations/google/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`)
  return { scope: auth.searchParams.get('scope') ?? '', location: new URL(res.headers.get('location')!) }
}

const photo = (id: string, n = 100, over: Partial<FakeProviders['googlePhotos']['picks'][number]> = {}) =>
  ({ id, type: 'PHOTO' as const, filename: `${id}.jpg`, mimeType: 'image/jpeg', bytes: new Uint8Array(n).fill(id.length), width: 4000, height: 3000,
    createTime: '2026-10-30T09:15:00Z', ...over })

/** Start a pick, have the admin pick these and press Done; returns the pick. */
async function picked(picks: FakeProviders['googlePhotos']['picks']) {
  apis.googlePhotos.picks = picks
  const res = await call('/api/content/google-photos/sessions', { method: 'POST' })
  expect(res.status).toBe(200)
  const p = await res.json() as GooglePhotosPick
  apis.pick(p.id)
  return p
}

/**
 * Bring a pick in the way the page does: a page at a time, counting on the first round; the same page again
 * while some are left, passing what was skipped; then the next page.
 */
async function bringIn(id: string) {
  const rounds: GooglePhotosImport[] = []
  const skip: string[] = []
  let page: string | null = null
  for (;;) {
    const res = await call(`/api/content/google-photos/sessions/${id}/import`, {
      method: 'POST', body: JSON.stringify({ skip, page, count: !rounds.length }), headers: { 'content-type': 'application/json' } })
    expect(res.status).toBe(200)
    const r = await res.json() as GooglePhotosImport
    rounds.push(r)
    skip.push(...r.skipped.map(s => s.id))
    if (r.left) continue
    if (!r.next_page) return rounds
    page = r.next_page
  }
}

const path = (id: string): string[] => { const f = apis.google.folders.get(id); return f ? [...path(f.parent), f.name] : [] }

describe('Google Photos as a connection', () => {
  it('asks only for the picker’s permission, proves itself with a picker session it puts away, and comes back to the Content page', async () => {
    const { scope, location } = await connect('google_photos', 'content')
    expect(scope.split(' ')).toContain('https://www.googleapis.com/auth/photospicker.mediaitems.readonly')
    expect(scope).not.toMatch(/photoslibrary/)
    expect(location.pathname).toBe('/content')
    expect(location.searchParams.get('connected')).toBe('google_photos')
    expect(db.integration('google_photos')).toMatchObject({ status: 'connected', account_label: 'cafe@gmail.com' })
    expect([...apis.googlePhotos.sessions.values()]).toEqual([{ picked: false, deleted: true, max: '1' }])
  })

  it('an account without Google Photos, or the permission unticked, doesn’t connect and says why', async () => {
    apis.googlePhotos.noLibrary = true
    const { location } = await connect('google_photos')
    expect(location.searchParams.get('connect_error')).toBe('This Google account has no Google Photos yet. Open photos.google.com with it once, then connect again.')
    expect(db.integration('google_photos').status).toBe('disconnected')

    apis.googlePhotos.noLibrary = false
    apis.google.granted = apis.google.granted.replace('https://www.googleapis.com/auth/photospicker.mediaitems.readonly', '')
    const again = await connect('google_photos')
    expect(again.location.searchParams.get('connect_error')).toMatch(/without the permission it needs/)
  })
})

describe('Bringing photos and videos in from Google Photos', () => {
  it('needs an admin, the café’s storage and Google Photos connected', async () => {
    expect((await call('/api/content/google-photos/sessions', { method: 'POST' }, staff)).status).toBe(403)
    const noStorage = await call('/api/content/google-photos/sessions', { method: 'POST' })
    expect(noStorage.status).toBe(409)
    expect((await noStorage.json() as { error: string }).error).toMatch(/Connect Google Drive or OneDrive/)
    await connect('google_drive')
    const noPhotos = await call('/api/content/google-photos/sessions', { method: 'POST' })
    expect(noPhotos.status).toBe(409)
    expect((await noPhotos.json() as { error: string }).error).toBe('Connect Google Photos on the Connections page first.')
  })

  it('waits for Done, then copies what was picked into Business Agent/Content, a few at a time, and lists each once', async () => {
    await connect('google_drive')
    await connect('google_photos')
    apis.googlePhotos.picks = [photo('gp-1'), photo('gp-2')]
    const start = await call('/api/content/google-photos/sessions', { method: 'POST' })
    const p = await start.json() as GooglePhotosPick
    expect(p).toMatchObject({ picker_uri: `https://photos.google.com/picker/${p.id}/autoclose`, poll_ms: 4000, timeout_ms: 1_800_000 })
    expect(apis.googlePhotos.sessions.get(p.id)?.max).toBe('2000')

    // Not picked yet: the page keeps waiting, and the connection is fine.
    expect(await (await call(`/api/content/google-photos/sessions/${p.id}`)).json()).toEqual({ picked: false, poll_ms: 4000 })
    const early = await call(`/api/content/google-photos/sessions/${p.id}/import`, { method: 'POST' })
    expect(early.status).toBe(409)
    expect((await early.json() as { error: string }).error).toBe('Finish picking in Google Photos first.')
    expect(db.integration('google_photos').status).toBe('connected')

    // Done: seven photos and a video; the page asks until nothing's left.
    apis.googlePhotos.picks = [...Array.from({ length: 7 }, (_, i) => photo(`gp-${i + 1}`, 100 + i)),
      { id: 'gp-video', type: 'VIDEO', filename: 'pour over.mp4', mimeType: 'video/mp4', bytes: new Uint8Array(3000).fill(9), width: 1920, height: 1080 }]
    apis.pick(p.id)
    expect((await (await call(`/api/content/google-photos/sessions/${p.id}`)).json() as { picked: boolean }).picked).toBe(true)
    const rounds = await bringIn(p.id)
    expect(rounds.map(r => r.added.length)).toEqual([IMPORT_BATCH, 8 - IMPORT_BATCH])
    expect(rounds.map(r => r.left)).toEqual([8 - IMPORT_BATCH, 0])
    expect(rounds.map(r => r.total)).toEqual([8, null])
    expect(apis.googlePhotos.sessions.get(p.id)?.deleted).toBe(true)

    // Each file asked for with Google's token: photos at a size, the video as a video.
    expect(apis.googlePhotos.downloads.every(d => d.auth?.startsWith('Bearer g-access-'))).toBe(true)
    expect(apis.googlePhotos.downloads.map(d => d.url)).toContain('https://lh3.googleusercontent.com/pp/gp-1=w2560-h2560')
    expect(apis.googlePhotos.downloads.map(d => d.url)).toContain('https://lh3.googleusercontent.com/pp/gp-video=dv')

    // In the café's Drive, Business Agent/Content, and listed with where they came from.
    const files = [...apis.google.blobs.values()]
    expect(files).toHaveLength(8)
    expect(files.every(f => path(f.parent).join('/') === 'Business Agent/Content')).toBe(true)
    const rows = db.table('content_items')
    expect(rows).toHaveLength(8)
    const first = rows.find(r => r.source_id === 'gp-1')!
    expect(first).toMatchObject({ kind: 'photo', source: 'google_photos', title: 'gp-1', width: 2560, height: 1920, taken_at: '2026-10-30T09:15:00Z', added_by: 'admin-1' })
    expect(String(first.url)).toMatch(/^https:\/\/app\.test\/media\/g\/1\/file-\d+\/[\w-]{24}\.jpg$/)
    expect(rows.find(r => r.source_id === 'gp-video')).toMatchObject({ kind: 'video', title: 'pour over', width: 1920 })
    expect(String(rows.find(r => r.source_id === 'gp-video')!.url)).toMatch(/\.mp4$/)
    expect(db.integration('google_photos').last_sync_at).toBeTruthy()

    // The copy plays from its address, without signing in (Instagram fetches it for a post).
    const got = await connections(new URL(String(first.url)).pathname)
    expect(got.status).toBe(200)
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(new Uint8Array(100).fill(4))

    // Picking the same ones again adds nothing.
    const again = await picked(apis.googlePhotos.picks)
    const [round] = await bringIn(again.id)
    expect(round).toMatchObject({ added: [], skipped: [], left: 0, already: 8 })
    expect(db.table('content_items')).toHaveLength(8)
  })

  it('brings a big pick in a page (100) after another, says how many on the first round, and asks the library a page at a time', async () => {
    await connect('google_drive')
    await connect('google_photos')
    const p = await picked(Array.from({ length: 230 }, (_, i) => photo(`gp-${i + 1}`, 10 + (i % 50))))
    const rounds = await bringIn(p.id)
    expect(rounds[0].total).toBe(230)
    expect(rounds.slice(1).every(r => r.total === null)).toBe(true)
    expect(rounds.reduce((n, r) => n + r.added.length, 0)).toBe(230)
    expect(rounds.every(r => r.added.length <= IMPORT_BATCH)).toBe(true)
    expect(db.table('content_items')).toHaveLength(230)
    expect(new Set(db.table('content_items').map(r => r.source_id)).size).toBe(230)
    expect(apis.googlePhotos.sessions.get(p.id)?.deleted).toBe(true)

    // Picked again with 20 new ones: the 230 count as already there, page by page, once each.
    const again = await picked([...apis.googlePhotos.picks, ...Array.from({ length: 20 }, (_, i) => photo(`gp-new-${i}`))])
    const more = await bringIn(again.id)
    expect(more[0].total).toBe(250)
    expect(more.reduce((n, r) => n + r.added.length, 0)).toBe(20)
    expect(db.table('content_items')).toHaveLength(250)
  })

  it('says why something wasn’t brought in: a video Google is still making, one too big, a kind it can’t keep', async () => {
    await connect('google_drive')
    await connect('google_photos')
    const p = await picked([
      photo('ok'),
      { id: 'busy', type: 'VIDEO', filename: 'busy.mp4', mimeType: 'video/mp4', bytes: new Uint8Array(10), status: 'PROCESSING' },
      { id: 'gif', type: 'PHOTO', filename: 'fun.gif', mimeType: 'image/gif', bytes: new Uint8Array(10) },
    ])
    const [round] = await bringIn(p.id)
    expect(round.added.map(a => a.source_id)).toEqual(['ok'])
    expect(round.skipped).toEqual([{ id: 'busy', name: 'busy.mp4', reason: 'processing' }, { id: 'gif', name: 'fun.gif', reason: 'kind' }])
    // A HEIC original comes as a JPEG at the size asked for.
    const heic = await picked([photo('heic', 50, { filename: 'IMG_2041.HEIC', mimeType: 'image/heic' })])
    const [r2] = await bringIn(heic.id)
    expect(r2.added[0]).toMatchObject({ title: 'IMG_2041', kind: 'photo' })
    expect(r2.added[0].url).toMatch(/\.jpg$/)
  })

  it('a file sent without its size is read first, and still kept', async () => {
    await connect('google_drive')
    await connect('google_photos')
    apis.googlePhotos.noLength = true
    const p = await picked([photo('nolength', 321)])
    const [round] = await bringIn(p.id)
    expect(round.added).toHaveLength(1)
    expect([...apis.google.blobs.values()][0].bytes.length).toBe(321)
  })

  it('Google Photos’ access removed: the pick fails in words and the Connections card turns red', async () => {
    await connect('google_drive')
    await connect('google_photos')
    apis.google.revoked = true
    const res = await call('/api/content/google-photos/sessions', { method: 'POST' })
    expect(res.status).toBe(502)
    expect((await res.json() as { error: string }).error).toBe('Google Photos access was removed or has expired. Connect it again.')
    expect(db.integration('google_photos')).toMatchObject({ status: 'error' })
  })

  it('a pick closed without picking is put away', async () => {
    await connect('google_drive')
    await connect('google_photos')
    const res = await call('/api/content/google-photos/sessions', { method: 'POST' })
    const p = await res.json() as GooglePhotosPick
    expect((await call(`/api/content/google-photos/sessions/${p.id}`, { method: 'DELETE' })).status).toBe(200)
    expect(apis.googlePhotos.sessions.get(p.id)?.deleted).toBe(true)
    const gone = await call(`/api/content/google-photos/sessions/${p.id}`)
    expect(gone.status).toBe(404)
    expect((await gone.json() as { error: string }).error).toBe('That Google Photos pick has ended. Pick again.')
  })
})
