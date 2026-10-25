// Music on social posts, through the Worker's routes against stand-ins for Supabase, ElevenLabs,
// the render service, Stripe and R2. What must never break:
//   - a use is reserved before ElevenLabs is asked, and a failed or refused one is never charged
//   - a paid use goes on the Stripe bill exactly once, even when Stripe is down at the time
//   - only Business Agent's own media addresses go to the render service, and its file is kept
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { socialMusic, fillStarterPack, syncMusicInsights } from './socialMusic'
import { chargePendingAiMusic } from './billing'
import { forgetMediaTokens } from './media'
import { seal } from './crypto'
import * as instagram from './providers/instagram'
import { userClient, type Env } from './supabase'
import { ALL_TOOLS, TOOLS, runTool } from './tools'
import { FEATURES } from '../src/app/features'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import { STARTER, photoCuts, renderKey } from '../shared/music'
import type { Profile } from '../shared/types'

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

describe('the AI assistant\'s music tools (MCP and the API)', () => {
  const me = { id: 'admin-1', full_name: 'Aron', role: 'admin', active: true } as Profile
  // Built and tested while Music is switched off (src/app/features.ts); only offered once it's on.
  const call = (name: string, args: unknown, e: Env | null = env) =>
    runTool(ALL_TOOLS.find(t => t.name === name)!, { sb: userClient(env, 'admin-token', 'ai'), me, env: e ?? undefined, origin: APP }, args)

  it('are offered only while Music is switched on', () => {
    const music = ['suggest_music', 'make_music', 'set_post_music']
    expect(ALL_TOOLS.filter(t => t.onlyWith === 'music').map(t => t.name)).toEqual(music)
    for (const name of music) expect(TOOLS.some(t => t.name === name)).toBe(FEATURES.music)
  })
  const POST = '00000000-0000-4000-8000-000000000001'
  const TRACK = '00000000-0000-4000-8000-0000000000a1'
  const ROCK = '00000000-0000-4000-8000-0000000000a2'
  const JAZZ = '00000000-0000-4000-8000-0000000000a3'
  const photo = (x: string) => ({ url: `${APP}/media/posts/${x}.jpg`, type: 'image' })
  const track = (id: string, title: string, moods: string[], patch: Row = {}) => ({
    id, title, artist: 'Business Agent', url: `${APP}/media/music/${id}.mp3`, source: 'starter', duration_s: 40, moods, energy: 3, bpm: 96,
    vocals: false, saved: false, hidden: false, highlight_s: 12, ...patch,
  })
  const thePost = () => db.table('social_posts')[0]
  beforeEach(() => {
    db.tables.business[0].business_type = 'Specialty café, bakery'
    db.tables.brand = [{ id: 1, sound_moods: ['acoustic'], sound_avoid: ['energetic'] }]
    db.tables.music_tracks = [track(TRACK, 'Sunday Morning', ['acoustic', 'chill']), track(ROCK, 'Stadium', ['energetic', 'upbeat']), track(JAZZ, 'Blue Hour', ['jazz'])]
    db.tables.social_posts = [{ id: POST, kind: 'story', media: [photo('sun')], music: null, status: 'scheduled', auto: true, scheduled_at: null, published_at: null }]
  })

  it('suggest_music: the brand\'s sound first, never a mood it avoids, and what AI music would cost', async () => {
    const out = await call('suggest_music', { caption: 'Brunch is back this Sunday' }) as { tracks: Row[]; ai_music: Row }
    expect(out.tracks[0]).toMatchObject({ track_id: TRACK, title: 'Sunday Morning', best_part_from: '0:12', why: expect.arrayContaining(['Morning coffee', 'Your sound']) })
    expect(out.tracks.map(t => t.track_id)).not.toContain(ROCK)
    expect(out.ai_music).toEqual({ can_make: true, cost: 'Free (included in the plan this month)' })
    db.music.freeLeft = 0
    expect((await call('suggest_music', {}) as { ai_music: Row }).ai_music).toEqual({ can_make: true, cost: '€0.99, added to the monthly bill' })
    db.music.reason = 'AI music is on paid plans.'
    expect((await call('suggest_music', {}) as { ai_music: Row }).ai_music).toEqual({ can_make: false, why: 'AI music is on paid plans.' })
  })

  it('make_music: the same use, price and bill as the app, from a prompt built the same way', async () => {
    db.music.freeLeft = 0
    const out = await call('make_music', { description: 'slow Sunday brunch', moods: ['acoustic'], energy: 2, seconds: 60, title: 'Brunch' }) as { cost: string; versions: Row[] }
    // A 60 s story is one use: the fade's two seconds don't make it two.
    expect(apis.elevenlabs.asked[0]).toMatchObject({ music_length_ms: 60000 })
    expect(String(apis.elevenlabs.asked[0].prompt)).toMatch(/acoustic .*for a social media story from a specialty café\. slow Sunday brunch\. Around \d+ bpm\. No vocals\.$/)
    expect(out.cost).toBe('€0.99, added to the monthly bill')
    expect(out.versions.map(v => v.title)).toEqual(['Brunch', 'Brunch (2)'])
    expect(stripe.items.size).toBe(1)
    apis.elevenlabs.refuse = true
    await expect(call('make_music', { description: 'happy music' })).rejects.toThrow('ElevenLabs suggests: "Bright upbeat pop with handclaps"')
    await expect(call('make_music', { description: 'in the style of Rosalía' })).rejects.toThrow('AI music can’t copy a real artist or song')
    await expect(call('make_music', { description: 'happy music' }, null)).rejects.toThrow('needs the app’s server')
  })

  it('set_post_music: a track goes into the story now, with the fingerprint the app would make', async () => {
    const out = await call('set_post_music', { post_id: POST, track_id: TRACK, label: true }) as { music: Row }
    expect(apis.render.jobs[0]).toMatchObject({ kind: 'story', source: photo('sun'), track: { start: 12 }, seconds: 15, original_volume: 0, label: '♫ Sunday Morning · Business Agent' })
    const p = thePost()
    const file = (p.media as Row[])[0]
    expect(file).toMatchObject({ type: 'video' })
    expect(p.music).toMatchObject({ mode: 'mixed', track_id: TRACK, start: 12, seconds: 15, source_media: [photo('sun')], rendered_url: file.url, label: true, audio_name: null })
    expect((p.music as Row).rendered_for).toBe(renderKey({ url: `${APP}/media/music/${TRACK}.mp3`, start: 12, seconds: 15, music_volume: 100, original_volume: 0,
      fade_in: true, fade_out: true, label: true, sources: [photo('sun').url] }))
    expect(out.music).toMatchObject({ title: 'Sunday Morning', part: '0:12–0:27' })
    // Changing it starts again from the photo, not the file with the old music in.
    await call('set_post_music', { post_id: POST, track_id: JAZZ, start: '0:05' })
    expect(apis.render.jobs[1]).toMatchObject({ source: photo('sun'), track: { start: 5 } })
  })

  it('set_post_music: photos on a reel change on the beat; a video keeps its own length', async () => {
    Object.assign(thePost(), { kind: 'reel', media: ['a', 'b', 'c'].map(photo) })
    await call('set_post_music', { post_id: POST, track_id: TRACK })
    expect(apis.render.jobs[0]).toMatchObject({ kind: 'reel', photos: ['a', 'b', 'c'].map(x => photo(x).url), cuts: photoCuts({ bpm: 96, seconds: 15 }, 3), seconds: 15 })
    expect(thePost().music).toMatchObject({ audio_name: 'Easy Beans · Sunday Morning', bpm: 96, cuts: photoCuts({ bpm: 96, seconds: 15 }, 3) })
    Object.assign(thePost(), { media: [{ url: `${APP}/media/posts/v.mp4`, type: 'video' }], music: null })
    await call('set_post_music', { post_id: POST, track_id: TRACK, original_volume: 40 })
    expect(apis.render.jobs[1]).toMatchObject({ seconds: 900, music_volume: 80, original_volume: 40 })
    expect(thePost().music).toMatchObject({ seconds: 12.5, original_volume: 40 })
  })

  it('set_post_music: a song from Instagram\'s library makes it a reminder; remove puts the photo back', async () => {
    await call('set_post_music', { post_id: POST, track_id: TRACK })
    await call('set_post_music', { post_id: POST, instagram_song: 'Bailando - Enrique Iglesias', start: '0:45' })
    expect(thePost()).toMatchObject({ auto: false, media: [photo('sun')], music: { mode: 'in_instagram', song: 'Bailando - Enrique Iglesias', start: 45 } })
    await call('set_post_music', { post_id: POST, track_id: TRACK })
    await call('set_post_music', { post_id: POST, remove: true })
    expect(thePost()).toMatchObject({ media: [photo('sun')], music: null })
  })

  it('set_post_music: says plainly what it can\'t do', async () => {
    await expect(call('set_post_music', { post_id: POST, track_id: TRACK, remove: true })).rejects.toThrow('Pass one of track_id, instagram_song or remove: true')
    await expect(call('set_post_music', { post_id: POST, track_id: TRACK, start: 'soon' })).rejects.toThrow('Write start like 0:45')
    Object.assign(thePost(), { kind: 'post' })
    await expect(call('set_post_music', { post_id: POST, track_id: TRACK })).rejects.toThrow('Music goes into stories and reels')
    Object.assign(thePost(), { kind: 'story', status: 'published' })
    await expect(call('set_post_music', { post_id: POST, remove: true })).rejects.toThrow('went out already')
    await expect(runTool(ALL_TOOLS.find(t => t.name === 'set_post_music')!, { sb: userClient(env, 'staff-token', 'ai'), me: { ...me, role: 'employee' } }, { post_id: POST, remove: true }))
      .rejects.toThrow('Only admins can do that')
    expect(apis.render.jobs).toHaveLength(0)
  })
})

it('nightly: Instagram\'s likes and comments on posts with music, so suggestions learn (stories have none)', async () => {
  const sent = (id: string, kind: string, instagram: Row, music: Row | null = { mode: 'mixed', track_id: 't1' }) =>
    ({ id, kind, status: 'published', published_at: new Date(Date.now() - 3 * 86_400_000).toISOString(), music, results: { instagram }, insights: null })
  db.tables.social_posts = [
    sent('p1', 'reel', { status: 'published', url: 'https://instagram.com/reel/1' }),
    sent('p2', 'post', { status: 'published', id: 'm2' }),
    sent('p3', 'story', { status: 'published', id: 'm3' }),
    sent('p4', 'reel', { status: 'published', id: 'm4' }, null),
    { ...sent('p5', 'reel', { status: 'published', id: 'm5' }), published_at: '2026-01-01T09:00:00Z' },
  ]
  apis.instagram.media = [
    { id: 'm1', permalink: 'https://instagram.com/reel/1', like_count: 40, comments_count: 3 },
    { id: 'm2', permalink: 'https://instagram.com/p/2', like_count: 12 },
    { id: 'm4', like_count: 99, comments_count: 9 }, { id: 'm5', like_count: 99, comments_count: 9 },
  ]
  expect(await syncMusicInsights(env)).toBe(0) // Instagram isn't connected
  db.integration('instagram').status = 'connected'
  db.tables.integration_secrets.push({ provider: 'instagram', ciphertext: await seal(env.INTEGRATION_KEY!,
    { access_token: 'ig-token', user_id: '17841400000000001', expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() }) })
  apis.instagram.current = 'ig-token'
  expect(await syncMusicInsights(env)).toBe(2)
  const insights = Object.fromEntries(db.table('social_posts').map(p => [p.id, p.insights]))
  expect(insights).toEqual({ p1: { likes: 40, comments: 3, at: expect.any(String) }, p2: { likes: 12, comments: 0, at: expect.any(String) }, p3: null, p4: null, p5: null })
})

it('a reel with music names its sound on Instagram', async () => {
  apis.instagram.current = 'ig-token'
  await instagram.publish({ token: 'ig-token', userId: '17841400000000001', graphVersion: 'v23.0' },
    { kind: 'reel', media: [{ url: `${APP}/media/posts/r.mp4`, type: 'video' }], caption: 'Latte art', audioName: 'Easy Beans · Sunday Morning' }, { waitMs: 0 })
  expect(apis.instagram.published[0].params).toMatchObject({ media_type: 'REELS', audio_name: 'Easy Beans · Sunday Morning' })
})
