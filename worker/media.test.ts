// Photos and videos for posts, end to end through the Worker's routes against stand-ins for
// Supabase, Google Drive, OneDrive and Instagram. What must never break:
//   - files go into the café's own Drive/OneDrive, in the folder for their kind of post
//   - only addresses Business Agent signed open a file (never anything else in that Drive)
//   - posts, carousels, reels and stories reach Instagram with every photo and video
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seal, unseal } from './crypto'
import { drainOutbox, integrations, setInstagramWait } from './integrations'
import { forgetMediaTokens } from './media'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret',
  MS_CLIENT_ID: 'ms-id', MS_CLIENT_SECRET: 'ms-secret', INSTAGRAM_APP_ID: 'ig-app', INSTAGRAM_APP_SECRET: 'ig-secret',
} as unknown as Env

let db: FakeSupabase
let apis: FakeProviders
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  forgetMediaTokens()
  setInstagramWait({ waitMs: 0 })
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const admin = { authorization: 'Bearer admin-token' }
const call = (path: string, init: RequestInit = {}) => integrations.request(`${APP}${path}`, init, env, ctx())
/** Upload a file the way the app does: its bytes, its type, and the folder for its kind of post. */
const upload = (bytes: Uint8Array, type: string, folder = 'Posts') =>
  call(`/api/integrations/media?folder=${folder}`, { method: 'POST', headers: { ...admin, 'content-type': type }, body: bytes })
function fileOf(n: number, seed = 1) {
  const b = new Uint8Array(n)
  for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) % 251
  return b
}
/** Same bytes (big files: comparing element by element with toEqual takes minutes). */
const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b))

/** Connect Google Drive or OneDrive (sign in there and come back), as on the Connections page. */
async function connectStorage(provider: 'google_drive' | 'onedrive') {
  const start = await call(`/api/integrations/connect/${provider}/start`, { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: '{}' })
  const auth = new URL((await start.json() as { url: string }).url)
  const back = auth.host === 'login.microsoftonline.com' ? 'microsoft' : 'google'
  const res = await call(`/api/integrations/${back}/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`)
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe(provider)
}

describe('Photos and videos for posts: kept in the café’s Drive or OneDrive', () => {
  it('with no storage connected, the app is told to connect Google Drive or OneDrive', async () => {
    const list = await call('/api/integrations', { headers: admin })
    expect((await list.json() as { media_storage: unknown }).media_storage).toBeNull()
    const res = await upload(fileOf(10), 'image/jpeg')
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toMatch(/Connect Google Drive or OneDrive/)
  })

  it('only JPEG photos (up to 8 MB) and MP4/MOV videos (up to 100 MB) are taken', async () => {
    await connectStorage('google_drive')
    expect((await (await upload(fileOf(10), 'image/png')).json() as { error: string }).error).toBe('Use a JPEG photo, an MP4 or MOV video, or an MP3 or M4A track')
    const big = await call('/api/integrations/media', { method: 'POST', headers: { ...admin, 'content-type': 'image/jpeg', 'content-length': String(9 * 1024 * 1024) }, body: fileOf(10) })
    expect((await big.json() as { error: string }).error).toBe('Photos can be up to 8 MB')
    expect(apis.google.blobs.size).toBe(0)
  })

  it('Google Drive: a reel’s video goes into Business Agent/Social/Reels, and its signed address plays it', async () => {
    await connectStorage('google_drive')
    expect((await (await call('/api/integrations', { headers: admin })).json() as { media_storage: string }).media_storage).toBe('google_drive')
    const video = fileOf(5000)
    const res = await upload(video, 'video/mp4', 'Reels')
    expect(res.status).toBe(200)
    const stored = await res.json() as { url: string; type: string; storage: string }
    expect(stored).toMatchObject({ type: 'video', storage: 'google_drive' })
    expect(stored.url).toMatch(/^https:\/\/app\.test\/media\/g\/file-\d+\/[\w-]{24}\.mp4$/)

    // In the café's Drive: Business Agent / Social / Reels.
    const [file] = [...apis.google.blobs.values()]
    const path = (id: string): string[] => { const f = apis.google.folders.get(id); return f ? [...path(f.parent), f.name] : [] }
    expect(path(file.parent)).toEqual(['Business Agent', 'Social', 'Reels'])
    expect(file).toMatchObject({ type: 'video/mp4' })
    expect(file.name).toMatch(/^\d{4}-\d{2}-\d{2} \w{8}\.mp4$/)

    // Anyone with the address (Instagram) gets the file, without signing in; a player can ask for part.
    const got = await call(new URL(stored.url).pathname)
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toBe('video/mp4')
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(video)
    const part = await call(new URL(stored.url).pathname, { headers: { range: 'bytes=0-99' } })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe('bytes 0-99/5000')

    // A made-up or altered address opens nothing.
    const [, , , id, sig] = new URL(stored.url).pathname.split('/')
    expect((await call(`/media/g/${id}/${'A'.repeat(24)}.mp4`)).status).toBe(404)
    expect((await call(`/media/g/folder-1/${sig}`)).status).toBe(404)
  })

  it('OneDrive: a big video goes up in pieces into Business Agent/Social/Stories, and comes back whole', async () => {
    await connectStorage('onedrive')
    const video = fileOf(21 * 1024 * 1024 + 123, 7)
    const res = await upload(video, 'video/quicktime', 'Stories')
    expect(res.status).toBe(200)
    const stored = await res.json() as { url: string }
    expect(stored.url).toMatch(/\/media\/o\/item-\d+\/[\w-]{24}\.mov$/)
    expect(apis.calls.filter(c => c.startsWith('PUT upload.onedrive.test')).length).toBe(3) // 10 MiB + 10 MiB + the rest
    expect([...apis.microsoft.blobs.values()][0].path).toMatch(/^Business Agent\/Social\/Stories\/.+\.mov$/)
    const got = await call(new URL(stored.url).pathname)
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toBe('video/quicktime')
    expect(same(new Uint8Array(await got.arrayBuffer()), video)).toBe(true)
  })
})

describe('Instagram: posts, carousels, reels and stories go out with every photo and video', () => {
  const job = (payload: Record<string, unknown>) =>
    db.table('outbox').push({ id: db.table('outbox').length + 1, kind: 'instagram_post', payload: { target: 'instagram', ...payload }, status: 'pending', attempts: 0 })

  async function connectInstagram() {
    const start = await call('/api/integrations/instagram/start', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: '{}' })
    const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
    await call(`/api/integrations/instagram/callback?code=c&state=${encodeURIComponent(state)}`)
  }

  it('each kind is made the way Instagram wants it, waits for videos, and keeps the link', async () => {
    await connectInstagram()
    apis.instagram.videoChecks = 2
    job({ post_id: 'p1', kind: 'post', caption: 'Flat white', media: [{ url: 'https://app.test/media/g/1/s.jpg', type: 'image' }] })
    job({ post_id: 'p2', kind: 'carousel', caption: 'Behind the bar', media: [
      { url: 'https://app.test/media/g/2/s.jpg', type: 'image' }, { url: 'https://app.test/media/g/3/s.mp4', type: 'video' }] })
    job({ post_id: 'p3', kind: 'reel', caption: 'Latte art, slowly', media: [{ url: 'https://app.test/media/g/4/s.mp4', type: 'video' }] })
    job({ post_id: 'p4', kind: 'story', caption: 'note to self', media: [{ url: 'https://app.test/media/g/5/s.jpg', type: 'image' }] })
    // A job queued before kinds existed: just image_url.
    job({ post_id: 'p5', caption: 'Old one', image_url: 'https://app.test/media/posts/old.jpg' })
    await drainOutbox(env)

    expect(db.table('outbox').map(j => j.status)).toEqual(['sent', 'sent', 'sent', 'sent', 'sent'])
    const [post, carousel, reel, story, old] = apis.instagram.published
    expect(post.params).toEqual({ image_url: 'https://app.test/media/g/1/s.jpg', caption: 'Flat white' })
    expect(carousel.params).toMatchObject({ media_type: 'CAROUSEL', caption: 'Behind the bar' })
    expect(carousel.children).toEqual([
      { is_carousel_item: 'true', image_url: 'https://app.test/media/g/2/s.jpg' },
      { is_carousel_item: 'true', media_type: 'VIDEO', video_url: 'https://app.test/media/g/3/s.mp4' },
    ])
    expect(reel.params).toEqual({ media_type: 'REELS', video_url: 'https://app.test/media/g/4/s.mp4', caption: 'Latte art, slowly', share_to_feed: 'true' })
    expect(story.params).toEqual({ media_type: 'STORIES', image_url: 'https://app.test/media/g/5/s.jpg' }) // stories have no caption
    expect(old.params).toEqual({ image_url: 'https://app.test/media/posts/old.jpg', caption: 'Old one' })
    expect(db.table('outbox')[2].external_id).toBe(`https://www.instagram.com/p/${reel.id}/`)
  })

  it('posts as the professional account, also on a connection that kept the id from sign-in', async () => {
    await connectInstagram()
    const kept = await unseal<{ user_id: string }>(env.INTEGRATION_KEY!, String(db.table('integration_secrets')[0].ciphertext))
    expect(kept.user_id).toBe('17841400000000001')
    expect(db.table('integrations').find(r => r.provider === 'instagram')?.external).toMatchObject({ user_id: '17841400000000001' })

    // Connected before this was fixed: the sign-in id, which Instagram refuses to post to.
    db.table('integration_secrets')[0].ciphertext = await seal(env.INTEGRATION_KEY!, { ...kept, user_id: apis.instagram.loginId })
    job({ post_id: 'p1', kind: 'post', caption: 'Acai bowls', media: [{ url: 'https://app.test/media/g/1/s.jpg', type: 'image' }] })
    await drainOutbox(env)
    expect(db.table('outbox')[0]).toMatchObject({ status: 'sent', last_error: null })
    expect(apis.instagram.published).toHaveLength(1)
  })

  it('a video Instagram can’t use fails with a reason; one still processing is tried again later', async () => {
    await connectInstagram()
    apis.instagram.badVideo = true
    job({ post_id: 'p1', kind: 'reel', caption: 'x', media: [{ url: 'https://app.test/media/g/4/s.mp4', type: 'video' }] })
    await drainOutbox(env)
    expect(db.table('outbox')[0]).toMatchObject({ status: 'failed' })
    expect(String(db.table('outbox')[0].last_error)).toMatch(/couldn’t use the photo or video \(Error: 2207026\)/)

    apis.instagram.badVideo = false
    apis.instagram.videoChecks = 1000
    setInstagramWait({ waitMs: 0, tries: 3 })
    db.table('outbox').length = 0
    job({ post_id: 'p2', kind: 'story', media: [{ url: 'https://app.test/media/g/6/s.mp4', type: 'video' }], caption: '' })
    await drainOutbox(env)
    expect(db.table('outbox')[0]).toMatchObject({ status: 'failed', last_error: 'Instagram is still processing the video. It will be tried again shortly.' })
    expect(apis.instagram.published).toEqual([])
  })
})
