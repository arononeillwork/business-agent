// Post ideas: anyone on the team keeps the photos and videos they make for an idea in the café's Drive
// (The Business Agent/Social/Ideas); nobody else can, and only photos and videos go there.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { forgetMediaTokens } from './media'
import { postIdeas } from './postIdeas'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'

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
const call = (path: string, init: RequestInit = {}) => integrations.request(`${APP}${path}`, init, env, ctx())
const upload = (headers: Record<string, string>, bytes: Uint8Array, type: string) =>
  postIdeas.request(`${APP}/api/post-ideas/media`, { method: 'POST', headers: { ...headers, 'content-type': type }, body: bytes }, env, ctx())

/** An admin connects Google Drive, as on the Connections page. */
async function connectDrive() {
  const start = await call('/api/integrations/connect/google_drive/start', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: '{}' })
  const auth = new URL((await start.json() as { url: string }).url)
  const res = await call(`/api/integrations/google/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`)
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe('google_drive')
}

describe('Post ideas: the team’s photos and videos', () => {
  it('an employee’s video goes into The Business Agent/Social/Ideas, and its address plays it', async () => {
    await connectDrive()
    const video = new Uint8Array([1, 2, 3, 4, 5])
    const res = await upload(staff, video, 'video/mp4')
    expect(res.status).toBe(200)
    const stored = await res.json() as { url: string; type: string }
    expect(stored.type).toBe('video')
    expect(stored.url).toMatch(/^https:\/\/app\.test\/media\/g\/1\/file-\d+\/[\w-]{24}\.mp4$/)
    const [file] = [...apis.google.blobs.values()]
    const path = (id: string): string[] => { const f = apis.google.folders.get(id); return f ? [...path(f.parent), f.name] : [] }
    expect(path(file.parent)).toEqual(['The Business Agent', 'Social', 'Ideas'])
    const got = await call(new URL(stored.url).pathname)
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(video)
  })

  it('photos and videos only, and only once storage is connected', async () => {
    expect((await (await upload(staff, new Uint8Array([1]), 'image/jpeg')).json() as { error: string }).error).toMatch(/Connect Google Drive or OneDrive/)
    await connectDrive()
    expect((await (await upload(staff, new Uint8Array([1]), 'audio/mpeg')).json() as { error: string }).error).toBe('Add a photo or a video')
    expect((await upload(staff, new Uint8Array([1]), 'image/png')).status).toBe(400)
    expect(apis.google.blobs.size).toBe(0)
  })

  it('nobody outside the team: signed out, or the café tablet', async () => {
    await connectDrive()
    // The stand-in knows admins and employees; the tablet is neither.
    db.people.set('tablet-token', { id: 'tablet-1', role: 'kiosk' } as unknown as { id: string; role: 'employee' })
    expect((await upload({}, new Uint8Array([1]), 'image/jpeg')).status).toBe(401)
    const tablet = await upload({ authorization: 'Bearer tablet-token' }, new Uint8Array([1]), 'image/jpeg')
    expect(tablet.status).toBe(403)
    expect((await tablet.json() as { error: string }).error).toBe('Only the team adds photos and videos to ideas')
    expect(apis.google.blobs.size).toBe(0)
  })
})
