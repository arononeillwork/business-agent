// Music on social posts (docs/SOCIAL_MUSIC_PLAN.md), the parts that need the Worker:
//   - Create with AI: reserve a use in the database (free ones first, the spending limit), ask
//     ElevenLabs for two versions, keep them in the café's Drive/OneDrive (Music folder), settle the
//     use, and put any charge on the Stripe bill. A failed or refused one is never charged.
//   - Render: put the chosen part of a track into a story or reel (the render service, render/).
//   - The starter pack: a dozen tracks made once by Business Agent for every business that posts.
//   - Nightly, Instagram's likes and comments on posts with music, so suggestions learn.
// The library itself is read and changed by the app through Supabase (migration 85's rules).
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { MediaError, mediaStorage, storeMedia } from './media'
import { chargeAiMusic } from './billing'
import { instagramSession } from './connections'
import * as elevenlabs from './providers/elevenlabs'
import * as instagram from './providers/instagram'
import { AI_MAX_SECONDS, AI_MIN_SECONDS, STARTER, STARTER_SECONDS, isMood, namesArtist } from '../shared/music'
import type { RenderJob } from '../render/ffmpeg'
import type { AiMusicQuote, MusicTrack, PostMedia, SocialPost } from '../shared/types'

/** ElevenLabs' terms, kept on each AI track's licence record (checked 23 Oct 2026). */
const TERMS = 'https://elevenlabs.io/terms-of-use'

type Vars = { userId: string; token: string }
export const socialMusic = new Hono<{ Bindings: Env; Variables: Vars }>()

/** Admins only, like the rest of the Social planner. */
socialMusic.use('/api/social/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'app')
  const [{ data: user }, { data: isAdmin }] = await Promise.all([sb.auth.getUser(token), sb.rpc('is_admin')])
  if (!user.user || !isAdmin) return c.json({ error: 'Only an admin can do that' }, 403)
  c.set('userId', user.user.id)
  c.set('token', token)
  await next()
})

const elevenlabsConfig = (env: Env): elevenlabs.ElevenLabsConfig | null =>
  env.ELEVENLABS_API_KEY ? { apiKey: env.ELEVENLABS_API_KEY, model: env.ELEVENLABS_MUSIC_MODEL } : null

/** What's switched on: AI music (ElevenLabs), putting music into files (the render service), storage. */
socialMusic.get('/api/social/music/status', async c => {
  const db = serviceClient(c.env)
  const { data: starter } = await db.from('music_tracks').select('starter_key').eq('source', 'starter')
  return c.json({
    ai: !!elevenlabsConfig(c.env), render: !!(c.env.RENDER_URL && c.env.RENDER_KEY), storage: await mediaStorage(c.env, db),
    starter: { made: starter?.length ?? 0, of: STARTER.length, on: !!elevenlabsConfig(c.env) && c.env.MUSIC_STARTER !== 'off' },
  })
})

/** Why music couldn't be made or put in, with the HTTP status the app gets (a refused prompt: ElevenLabs' rewording, if any). */
export class MusicError extends Error {
  status: 400 | 402 | 404 | 422 | 502 | 503
  suggestion?: string | null
  constructor(message: string, status: MusicError['status'], suggestion?: string | null) {
    super(message)
    this.status = status
    this.suggestion = suggestion
  }
}

export interface MakeRequest {
  prompt?: string; seconds?: number; title?: string; moods?: string[]; energy?: number; bpm?: number; genre?: string; post_id?: string | null
}
export interface MadeMusic {
  /** `free`: how many of its uses were the plan's free ones. */
  generation: { id: string; uses: number; free: number; price_cents: number }
  tracks: MusicTrack[]
}

const VERSIONS = 2

/** Keep an MP3 in the Music folder; its public address. */
async function keep(env: Env, db: SupabaseClient, origin: string, bytes: ArrayBuffer) {
  return (await storeMedia(env, db, origin, { type: 'audio/mpeg', size: bytes.byteLength, body: bytes, folder: 'Music' })).url
}

/**
 * Create with AI, as the admin `sb` is signed in as: one use (or one per started minute), two
 * versions, both added to Music. The use is reserved first (the plan, the free ones, the limit:
 * migration 85) and settled after; a failed or refused one is never charged.
 */
export async function makeAiMusic(env: Env, sb: SupabaseClient, userId: string, origin: string, body: MakeRequest): Promise<MadeMusic> {
  const prompt = (body.prompt ?? '').trim()
  const seconds = Number(body.seconds)
  const title = (body.title ?? '').trim().slice(0, 70) || 'AI track'
  if (prompt.length < 3 || prompt.length > 600) throw new MusicError('Describe the music in a few words (up to 600 characters)', 400)
  if (!Number.isFinite(seconds) || seconds < AI_MIN_SECONDS || seconds > AI_MAX_SECONDS) throw new MusicError('A track is 3 seconds to 10 minutes long', 400)
  if (namesArtist(prompt)) throw new MusicError('Describe the feel instead: AI music can’t copy a real artist or song.', 422)
  const cfg = elevenlabsConfig(env)
  if (!cfg) throw new MusicError('AI music isn’t switched on yet (ELEVENLABS_API_KEY).', 503)
  const db = serviceClient(env)
  if (!await mediaStorage(env, db)) {
    throw new MusicError('Connect Google Drive or OneDrive on the Connections page first: that’s where your tracks are kept.', 400)
  }

  const { data: started, error } = await sb.rpc('ai_music_start', { p_prompt: prompt, p_seconds: seconds, p_post: body.post_id ?? null })
  if (error) throw new MusicError(error.message, error.code === 'P0402' ? 402 : 400)
  const use = started as AiMusicQuote & { id: string }
  const finish = (status: 'done' | 'failed' | 'refused', ids: string[] = [], model: string | null = null, why: string | null = null) =>
    db.rpc('ai_music_finish', { p_id: use.id, p_status: status, p_track_ids: ids, p_model: model, p_error: why })

  try {
    const made = await Promise.all(Array.from({ length: VERSIONS }, () => elevenlabs.compose(cfg, { prompt, seconds })))
    const urls = await Promise.all(made.map(m => keep(env, db, origin, m.bytes)))
    const at = new Date().toISOString()
    const { data: tracks, error: insertError } = await db.from('music_tracks').insert(made.map((m, i) => ({
      source: 'ai', title: i ? `${title} (${i + 1})` : title, url: urls[i], duration_s: seconds,
      moods: (body.moods ?? []).filter(isMood).slice(0, 8), energy: body.energy ? Math.min(5, Math.max(1, Math.round(body.energy))) : null,
      bpm: body.bpm ?? null, genre: body.genre?.slice(0, 40) ?? null, vocals: false, highlight_s: 0,
      licence: { kind: 'ai', provider: 'elevenlabs', model: m.model, song_id: m.songId, prompt, terms: TERMS, made_by: userId, generation: use.id, at },
      created_by: userId,
    }))).select('*')
    if (insertError) throw new Error(insertError.message)
    await finish('done', (tracks as MusicTrack[]).map(t => t.id), made[0].model)
    // On the bill straight away; if Stripe doesn't answer, the nightly job puts it on.
    if (use.price_cents > 0) {
      await chargeAiMusic(env, { id: use.id, price_cents: use.price_cents, uses: use.uses })
        .catch(e => console.error('ai music charge failed (retried tonight)', e))
    }
    return { generation: { id: use.id, uses: use.uses, free: use.free, price_cents: use.price_cents }, tracks: tracks as MusicTrack[] }
  } catch (e) {
    const refused = e instanceof elevenlabs.PromptRefused
    await finish(refused ? 'refused' : 'failed', [], null, e instanceof Error ? e.message : String(e))
    if (refused) throw new MusicError(e.message, 422, e.suggestion ?? null)
    throw new MusicError(`${e instanceof Error ? e.message : String(e)} Nothing was charged.`, e instanceof MediaError ? 400 : 502)
  }
}

/** The app's Create with AI: the two versions; the app then keeps one (public.ai_music_keep). */
socialMusic.post('/api/social/music/generate', async c => {
  const body = await c.req.json<MakeRequest>().catch(() => ({} as MakeRequest))
  try {
    return c.json(await makeAiMusic(c.env, userClient(c.env, c.get('token'), 'app'), c.get('userId'), new URL(c.req.url).origin, body))
  } catch (e) {
    if (!(e instanceof MusicError)) throw e
    return c.json(e.suggestion !== undefined ? { error: e.message, suggestion: e.suggestion } : { error: e.message }, e.status)
  }
})

export interface RenderRequest {
  kind?: 'story' | 'reel'
  /** The photo or video before the music (several photos: a reel cut to the beat). */
  sources?: PostMedia[]
  cuts?: number[]
  track_id?: string
  start?: number
  seconds?: number
  music_volume?: number
  original_volume?: number
  fade_in?: boolean
  fade_out?: boolean
  /** Draw "♫ title · artist" on a photo story. */
  label?: boolean
}

/** Our own media addresses (signed, public): the only files the render service is sent to fetch. */
const ownMedia = (url: string) => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.pathname.startsWith('/media/')
  } catch { return false }
}

export interface Rendered {
  media: PostMedia
  ms: number | null
  /** How long the file is (a video's own length, up to what the kind allows), when the service says. */
  seconds: number | null
}

/**
 * Put the music into a story or reel, as the admin `sb` is signed in as (the track must be in
 * their library): the render service makes the MP4, kept like any upload.
 */
export async function renderMusic(env: Env, sb: SupabaseClient, origin: string, r: RenderRequest): Promise<Rendered> {
  if (!env.RENDER_URL || !env.RENDER_KEY) {
    throw new MusicError('Putting music into posts needs the render service: run Actions → Deploy render service once.', 503)
  }
  const sources = r.sources ?? []
  if (r.kind !== 'story' && r.kind !== 'reel') throw new MusicError('Music goes into stories and reels', 400)
  if (!sources.length || sources.some(s => !ownMedia(s.url))) throw new MusicError('Add the photo or video first', 400)
  if (sources.length > 1 && sources.some(s => s.type !== 'image')) throw new MusicError('A reel from photos takes photos only', 400)
  const { data: track } = await sb.from('music_tracks').select('id, title, artist, url').eq('id', r.track_id ?? '').maybeSingle<Pick<MusicTrack, 'id' | 'title' | 'artist' | 'url'>>()
  if (!track) throw new MusicError('That track isn’t in your music library', 404)
  const job: RenderJob = {
    kind: r.kind, source: sources[0], track: { url: track.url, start: Math.max(0, Number(r.start) || 0) },
    ...(sources.length > 1 ? { photos: sources.map(s => s.url), cuts: r.cuts } : {}),
    seconds: Number(r.seconds) || 15, music_volume: r.music_volume ?? 100, original_volume: r.original_volume ?? 100,
    fade_in: r.fade_in !== false, fade_out: r.fade_out !== false,
    ...(r.label && sources.length === 1 && sources[0].type === 'image' ? { label: `♫ ${[track.title, track.artist].filter(Boolean).join(' · ')}` } : {}),
  }
  let res: Response
  try {
    res = await fetch(`${env.RENDER_URL.replace(/\/$/, '')}/render`, {
      method: 'POST', headers: { authorization: `Bearer ${env.RENDER_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(job),
    })
  } catch (e) {
    throw new MusicError(`The render service didn’t answer (${e instanceof Error ? e.message : e}). Try again.`, 502)
  }
  if (!res.ok) {
    const why = await res.json().then(j => (j as { error?: string }).error).catch(() => null)
    throw new MusicError(why ?? `The render service said ${res.status}. Try again.`, res.status === 400 ? 400 : 502)
  }
  const size = Number(res.headers.get('content-length') ?? '')
  const body = size && res.body ? res.body : await res.arrayBuffer()
  try {
    const stored = await storeMedia(env, serviceClient(env), origin, {
      type: 'video/mp4', size: body instanceof ArrayBuffer ? body.byteLength : size, body, folder: r.kind === 'story' ? 'Stories' : 'Reels',
    })
    return {
      media: { url: stored.url, type: 'video' }, ms: Number(res.headers.get('x-render-ms') ?? 0) || null,
      seconds: Number(res.headers.get('x-render-seconds') ?? 0) || null,
    }
  } catch (e) {
    throw new MusicError(e instanceof Error ? e.message : String(e), e instanceof MediaError ? 400 : 502)
  }
}

socialMusic.post('/api/social/render', async c => {
  const r = await c.req.json<RenderRequest>().catch(() => ({} as RenderRequest))
  try {
    return c.json(await renderMusic(c.env, userClient(c.env, c.get('token'), 'app'), new URL(c.req.url).origin, r))
  } catch (e) {
    if (!(e instanceof MusicError)) throw e
    return c.json({ error: e.message }, e.status)
  }
})

/**
 * Nightly: likes and comments on the posts and reels that went out with music in the last 60
 * days, from Instagram, so suggestions learn what does well (shared/music.ts engagementByTrack).
 * Stories have no likes or comments Instagram shares (their reach needs a permission the app
 * doesn't ask for), so they're left out. Answers how many posts it updated.
 */
export async function syncMusicInsights(env: Env): Promise<number> {
  const db = serviceClient(env)
  const { data: ig } = await db.from('integrations').select('status').eq('provider', 'instagram').maybeSingle()
  if (ig?.status !== 'connected') return 0
  const { data } = await db.from('social_posts').select('id, results').not('music', 'is', null).neq('kind', 'story')
    .in('status', ['published', 'partly']).gte('published_at', new Date(Date.now() - 60 * 86_400_000).toISOString())
  const posts = (data ?? []) as Pick<SocialPost, 'id' | 'results'>[]
  if (!posts.length) return 0
  const media = await instagram.mediaCounts(await instagramSession(env, db))
  const at = new Date().toISOString()
  let n = 0
  for (const p of posts) {
    const sent = p.results?.instagram
    const m = media.find(x => (sent?.id && x.id === sent.id) || (sent?.url && x.permalink === sent.url))
    if (!m) continue
    const { error } = await db.from('social_posts').update({ insights: { likes: m.like_count ?? 0, comments: m.comments_count ?? 0, at } }).eq('id', p.id)
    if (error) throw new Error(error.message)
    n++
  }
  return n
}

/**
 * Every few minutes (the cron): the next track of the starter pack, for a business that posts
 * (Instagram connected) and has somewhere to keep files. Made once each, with Business Agent's
 * own ElevenLabs account: free to the business. MUSIC_STARTER=off switches it off.
 */
export async function fillStarterPack(env: Env, origin: string): Promise<string | null> {
  const cfg = elevenlabsConfig(env)
  if (!cfg || env.MUSIC_STARTER === 'off' || !env.SUPABASE_SERVICE_ROLE_KEY) return null
  const db = serviceClient(env)
  const { data: ig } = await db.from('integrations').select('status').eq('provider', 'instagram').maybeSingle()
  if (ig?.status !== 'connected' || !await mediaStorage(env, db)) return null
  const { data: made } = await db.from('music_tracks').select('starter_key').eq('source', 'starter')
  const have = new Set((made ?? []).map(m => m.starter_key))
  const next = STARTER.find(s => !have.has(s.key))
  if (!next) return null
  const track = await elevenlabs.compose(cfg, { prompt: next.prompt, seconds: STARTER_SECONDS })
  const url = await keep(env, db, origin, track.bytes)
  const { error } = await db.from('music_tracks').insert({
    source: 'starter', starter_key: next.key, title: next.title, artist: 'Business Agent', url, duration_s: STARTER_SECONDS,
    moods: next.moods, energy: next.energy, bpm: next.bpm, genre: next.genre, vocals: false, highlight_s: 0,
    licence: { kind: 'starter', provider: 'elevenlabs', model: track.model, song_id: track.songId, prompt: next.prompt, terms: TERMS, made_by: 'Business Agent', at: new Date().toISOString() },
    created_by: null,
  })
  if (error) throw new Error(error.message)
  return next.key
}
