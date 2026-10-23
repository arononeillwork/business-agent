// Music on social posts, through the Worker's routes against stand-ins for Supabase, ElevenLabs,
// the render service, Stripe and R2. What must never break:
//   - a use is reserved before ElevenLabs is asked, and a failed or refused one is never charged
//   - a paid use goes on the Stripe bill exactly once, even when Stripe is down at the time
//   - only Business Agent's own media addresses go to the render service, and its file is kept
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { socialMusic, fillStarterPack } from './socialMusic'
import { chargePendingAiMusic } from './billing'
import { forgetMediaTokens } from './media'
import * as instagram from './providers/instagram'
import type { Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import { STARTER } from '../shared/music'

const APP = 'https://app.test'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** R2, in memory (the deploy's MEDIA bucket). */
const r2 = new Map<string, { bytes: Uint8Array; type?: string }>()
const MEDIA = {
  async put(key: string, body: ArrayBuffer | ReadableStream, opts?: { httpMetadata?: { contentType?: string } }) {
    r2.set(key, { bytes: new Uint8Array(await new Response(body).arrayBuffer()), type: opts?.httpMetadata?.contentType })
    return {}
  },
  async get(key: string) { const f = r2.get(key); return f ? { body: f.bytes, httpMetadata: { contentType: f.type } } : null },
}

const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', STRIPE_SECRET_KEY: 'sk_test_platform', ELEVENLABS_API_KEY: 'el-key',
  RENDER_URL: 'https://render.test', RENDER_KEY: 'render-key', MEDIA,
} as unknown as Env

/** Stripe's invoice items: one per idempotency key, as on Stripe; `down` makes it fail. */
const stripe = { items: new Map<string, Record<string, string>>(), down: false }
function stripeHandle(url: string, init?: RequestInit): Response | null {
  const u = new URL(url)
  if (u.host !== 'api.stripe.com') return null
  if (u.pathname !== '/v1/invoiceitems') return json({ error: { message: `fake Stripe: ${u.pathname}` } }, 404)
  if (stripe.down) return json({ error: { message: 'Stripe is having a moment' } }, 500)
  const key = new Headers(init?.headers).get('idempotency-key')!
  if (!stripe.items.has(key)) stripe.items.set(key, { id: `ii_${stripe.items.size + 1}`, ...Object.fromEntries(new URLSearchParams(String(init?.body))) })
  return json(stripe.items.get(key))
}

let db: FakeSupabase
let apis: FakeProviders
beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  r2.clear()
  stripe.items.clear()
  stripe.down = false
  forgetMediaTokens()
  db.tables.billing = [{ id: 1, plan: 'business', status: 'active', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' }]
  db.tables.music_tracks = []
  db.tables.music_generations = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? stripeHandle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
const post = (path: string, body: unknown, who: 'admin' | 'staff' = 'admin', e: Env = env) =>
  socialMusic.request(`${APP}${path}`, { method: 'POST', headers: { authorization: `Bearer ${who}-token`, 'content-type': 'application/json' }, body: JSON.stringify(body) }, e, ctx())
const make = (patch: Record<string, unknown> = {}, e: Env = env) =>
  post('/api/social/music/generate', { prompt: 'Warm acoustic morning music for a café. No vocals.', seconds: 17, title: 'Sunday', moods: ['acoustic', 'nonsense'], energy: 2, ...patch }, 'admin', e)
const generation = () => db.table('music_generations')[0]

describe('Create with AI', () => {
  it('makes two versions of the length asked, keeps them in the Music folder, and the month\'s free one costs nothing', async () => {
    const res = await make()
    expect(res.status).toBe(200)
    const out = await res.json() as { generation: Row; tracks: Row[] }
    expect(apis.elevenlabs.asked).toHaveLength(2)
    expect(apis.elevenlabs.asked[0]).toMatchObject({ prompt: 'Warm acoustic morning music for a café. No vocals.', music_length_ms: 17000, model_id: 'music_v1', force_instrumental: true })
    expect(out.generation).toMatchObject({ uses: 1, free: 1, price_cents: 0 })
    expect(out.tracks.map(t => t.title)).toEqual(['Sunday', 'Sunday (2)'])
    expect(out.tracks[0]).toMatchObject({ source: 'ai', duration_s: 17, moods: ['acoustic'], energy: 2, vocals: false })
    expect(out.tracks[0].licence).toMatchObject({ kind: 'ai', provider: 'elevenlabs', model: 'music_v1', generation: generation().id, made_by: 'admin-1' })
    for (const t of out.tracks) {
      expect(t.url).toMatch(/^https:\/\/app\.test\/media\/music\/[\w-]+\.mp3$/)
      expect(r2.get(String(t.url).replace(`${APP}/media/`, ''))?.type).toBe('audio/mpeg')
    }
    expect(generation()).toMatchObject({ status: 'done', free: 1, price_cents: 0, model: 'music_v1' })
    expect(generation().track_ids).toEqual(out.tracks.map(t => t.id))
    expect(stripe.items.size).toBe(0)
  })

  it('a paid use goes on the subscription\'s next invoice, once', async () => {
    db.music.freeLeft = 0
    const out = await (await make({ seconds: 75 })).json() as { generation: Row }
    expect(out.generation).toMatchObject({ uses: 2, free: 0, price_cents: 198 })
    expect([...stripe.items.entries()]).toEqual([[`business-agent-ai-music-${generation().id}`, expect.objectContaining({
      customer: 'cus_1', subscription: 'sub_1', amount: '198', currency: 'eur', tax_behavior: 'exclusive',
      description: 'AI music track for social media (2 minutes)', 'metadata[business_agent_ai_music]': generation().id })]])
    expect(generation()).toMatchObject({ stripe_invoice_item: 'ii_1' })
    expect(generation().charged_at).toBeTruthy()
    expect(await chargePendingAiMusic(env)).toBe(0)
  })

  it('Stripe down: the track is made and the charge goes on that night, still once', async () => {
    db.music.freeLeft = 0
    stripe.down = true
    expect((await make()).status).toBe(200)
    expect(generation()).toMatchObject({ status: 'done', price_cents: 99, charged_at: null })
    stripe.down = false
    expect(await chargePendingAiMusic(env)).toBe(1)
    expect(await chargePendingAiMusic(env)).toBe(0)
    expect(stripe.items.size).toBe(1)
  })

  it('ElevenLabs turns the prompt down: nothing kept, nothing charged, the free one comes back, with its suggestion', async () => {
    apis.elevenlabs.refuse = true
    const res = await make()
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'ElevenLabs can’t make that: describe the feel instead of naming an artist or a song.', suggestion: 'Bright upbeat pop with handclaps' })
    expect(generation()).toMatchObject({ status: 'refused', free: 0, price_cents: 0 })
    expect(db.music.freeLeft).toBe(1)
    expect(db.table('music_tracks')).toHaveLength(0)
    expect(r2.size).toBe(0)
  })

  it('ElevenLabs failing: says nothing was charged', async () => {
    db.music.freeLeft = 0
    apis.elevenlabs.down = true
    const res = await make()
    expect(res.status).toBe(502)
    expect((await res.json() as { error: string }).error).toBe('ElevenLabs: Service temporarily unavailable Nothing was charged.')
    expect(generation()).toMatchObject({ status: 'failed', price_cents: 0 })
    expect(stripe.items.size).toBe(0)
  })

  it('the plan, the free ones or the limit say no: ElevenLabs isn\'t asked', async () => {
    db.music.reason = 'That would go over this month\'s limit of €25.00 for pay per use. Raise it on the Billing page.'
    const res = await make()
    expect(res.status).toBe(402)
    expect((await res.json() as { error: string }).error).toMatch(/limit of €25\.00/)
    expect(apis.elevenlabs.asked).toHaveLength(0)
  })

  it('refuses artists, staff, a missing key and no storage before reserving anything', async () => {
    expect((await make({ prompt: 'Something in the style of Rosalía' })).status).toBe(422)
    expect((await post('/api/social/music/generate', { prompt: 'Chill', seconds: 15 }, 'staff')).status).toBe(403)
    expect((await make({}, { ...env, ELEVENLABS_API_KEY: undefined } as Env)).status).toBe(503)
    expect((await make({}, { ...env, MEDIA: undefined } as Env)).status).toBe(400)
    expect((await make({ seconds: 2 })).status).toBe(400)
    expect(db.table('music_generations')).toHaveLength(0)
  })
})

describe('putting music into a story or reel', () => {
  beforeEach(() => {
    db.tables.music_tracks = [{ id: 't1', title: 'Sunday Morning', artist: 'Business Agent', url: `${APP}/media/music/sunday.mp3` }]
  })
  const render = (patch: Record<string, unknown> = {}, e: Env = env) => post('/api/social/render', {
    kind: 'story', sources: [{ url: `${APP}/media/posts/sun.jpg`, type: 'image' }], track_id: 't1', start: 12, seconds: 15,
    music_volume: 90, original_volume: 100, fade_in: true, fade_out: true, label: true, ...patch }, 'admin', e)

  it('sends the job to the render service and keeps the MP4 with the post\'s other files', async () => {
    const res = await render()
    expect(res.status).toBe(200)
    const out = await res.json() as { media: { url: string; type: string }; ms: number }
    expect(apis.render.jobs).toEqual([{ kind: 'story', source: { url: `${APP}/media/posts/sun.jpg`, type: 'image' }, track: { url: `${APP}/media/music/sunday.mp3`, start: 12 },
      seconds: 15, music_volume: 90, original_volume: 100, fade_in: true, fade_out: true, label: '♫ Sunday Morning · Business Agent' }])
    expect(out).toMatchObject({ media: { type: 'video' }, ms: 8400 })
    expect(out.media.url).toMatch(/^https:\/\/app\.test\/media\/posts\/[\w-]+\.mp4$/)
    expect(r2.get(out.media.url.replace(`${APP}/media/`, ''))?.bytes.length).toBe(4096)
  })

  it('a reel from photos sends every photo and where each is cut; videos get no label', async () => {
    const photos = ['a', 'b', 'c'].map(x => ({ url: `${APP}/media/posts/${x}.jpg`, type: 'image' }))
    await render({ kind: 'reel', sources: photos, cuts: [0, 2, 4], seconds: 6 })
    expect(apis.render.jobs[0]).toMatchObject({ kind: 'reel', photos: photos.map(p => p.url), cuts: [0, 2, 4] })
    expect(apis.render.jobs[0]).not.toHaveProperty('label')
    await render({ sources: [{ url: `${APP}/media/posts/v.mp4`, type: 'video' }] })
    expect(apis.render.jobs[1]).not.toHaveProperty('label')
  })

  it('only our own files go to the render service; its problems are passed on plainly', async () => {
    expect((await render({ sources: [{ url: 'https://evil.test/x.jpg', type: 'image' }] })).status).toBe(400)
    expect((await render({ sources: [{ url: 'http://app.test/media/posts/x.jpg', type: 'image' }] })).status).toBe(400)
    expect((await render({ kind: 'post' })).status).toBe(400)
    expect((await render({ track_id: 'nope' })).status).toBe(404)
    expect(apis.render.jobs).toHaveLength(0)
    apis.render.refuse = 'The video is too short: at least 3 seconds'
    const res = await render()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'The video is too short: at least 3 seconds' })
    expect((await render({}, { ...env, RENDER_URL: undefined } as Env)).status).toBe(503)
  })
})

describe('the starter pack', () => {
  it('is made a track at a time for a business that posts, each once, and never when switched off', async () => {
    expect(await fillStarterPack(env, APP)).toBeNull() // Instagram isn't connected
    db.integration('instagram').status = 'connected'
    expect(await fillStarterPack({ ...env, MUSIC_STARTER: 'off' } as Env, APP)).toBeNull()
    expect(await fillStarterPack(env, APP)).toBe(STARTER[0].key)
    expect(await fillStarterPack(env, APP)).toBe(STARTER[1].key)
    const first = db.table('music_tracks')[0]
    expect(first).toMatchObject({ source: 'starter', starter_key: 'sunday-morning', title: 'Sunday Morning', duration_s: 40, moods: STARTER[0].moods })
    expect(first.licence).toMatchObject({ kind: 'starter', provider: 'elevenlabs', made_by: 'Business Agent' })
    expect(apis.elevenlabs.asked[0]).toMatchObject({ prompt: STARTER[0].prompt, music_length_ms: 40000 })
    for (let i = 2; i < STARTER.length; i++) await fillStarterPack(env, APP)
    expect(await fillStarterPack(env, APP)).toBeNull()
    expect(db.table('music_tracks')).toHaveLength(STARTER.length)
    expect(db.table('music_generations')).toHaveLength(0) // free to the business
  })
})

it('a reel with music names its sound on Instagram', async () => {
  apis.instagram.current = 'ig-token'
  await instagram.publish({ token: 'ig-token', userId: '17841400000000001', graphVersion: 'v23.0' },
    { kind: 'reel', media: [{ url: `${APP}/media/posts/r.mp4`, type: 'video' }], caption: 'Latte art', audioName: 'Easy Beans · Sunday Morning' }, { waitMs: 0 })
  expect(apis.instagram.published[0].params).toMatchObject({ media_type: 'REELS', audio_name: 'Easy Beans · Sunday Morning' })
})
