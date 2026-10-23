// Reviews page: Google reviews read from the business's own profile (the Google Maps connection:
// all of them, and replies), or until Google approves that, from the public listing (Places API:
// the 5 newest, no replies). Every review seen is kept (public.reviews), so each new one is noticed
// once: the Worker looks every hour (every 3 hours on Places, which Google charges for past 1,000
// look-ups a month: shared/refresh.ts) and admins get a notification, a low rating flagged. Opening
// the page shows what's kept; it only asks Google when that's due.
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { explain, googleSession, lasting, markBroken } from './connections'
import { cached } from './cache'
import * as google from './providers/google'
import { placeReviews } from './providers/places'
import { CONNECT_MAPS, guessLanguage, isLow, starsOf, MAX_REPLY, type Review, type ReviewFeed, type ReviewsState } from '../shared/reviews'
import { MINUTES } from '../shared/refresh'

export const reviews = new Hono<{ Bindings: Env }>()

const admin = async (c: { env: Env; req: { header: (n: string) => string | undefined } }) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return false
  const { data } = await userClient(c.env, token, 'app').rpc('is_admin')
  return data === true
}
for (const path of ['/api/reviews', '/api/reviews/*']) {
  reviews.use(path, async (c, next) => {
    if (!await admin(c)) return c.json({ error: 'Only an admin can see reviews' }, 403)
    await next()
  })
}

const placesOn = (env: Env) => !!(env.GOOGLE_PLACES_API_KEY && env.GOOGLE_PLACE_ID)
const isConnected = async (db: SupabaseClient) => {
  const { data } = await db.from('integrations').select('status, external').eq('provider', 'google_business').single()
  const ext = (data?.external ?? {}) as { location?: string; account?: string }
  return data?.status === 'connected' && !!ext.location && !!ext.account
}

interface Feed { feed: ReviewFeed | null; list: Review[]; google_rating: number | null; google_count: number | null; problem: string | null }

/** Reviews as Google has them now, from the best source there is. */
async function readFeed(env: Env, db: SupabaseClient): Promise<Feed> {
  let problem: string | null = null
  if (await isConnected(db)) {
    try {
      const s = await googleSession(env, db)
      const raw = await google.listReviews(s.token, s.account!, s.location!)
      const list = raw.flatMap((r): Review[] => {
        const rating = starsOf(r.starRating)
        if (!rating || !r.createTime) return []
        const text = r.comment?.replace(/\n*\(Translated by Google\)[\s\S]*$/, '').trim() || null
        return [{ id: r.name, source: 'google', rating, text, reviewer: r.reviewer?.isAnonymous ? '' : r.reviewer?.displayName ?? '',
          created_at: r.createTime, reply: r.reviewReply?.comment ?? null, replied_at: r.reviewReply?.updateTime ?? null,
          language: guessLanguage(text), url: null }]
      })
      return { feed: 'business_profile', list, google_rating: null, google_count: null, problem: null }
    } catch (e) {
      problem = explain('google_business', e)
      if (lasting('google_business', e)) await markBroken(db, 'google_business', problem)
    }
  }
  if (placesOn(env)) {
    try {
      const p = await placeReviews(env.GOOGLE_PLACES_API_KEY!, env.GOOGLE_PLACE_ID!)
      const list = p.reviews.flatMap((r): Review[] => {
        const rating = starsOf(r.rating)
        if (!rating || !r.publishTime) return []
        return [{ id: r.name, source: 'google', rating, text: r.text, reviewer: r.author, created_at: r.publishTime, reply: null, replied_at: null,
          language: r.language?.startsWith('es') ? 'es' : r.language?.startsWith('en') ? 'en' : guessLanguage(r.text), url: r.url }]
      })
      return { feed: 'places', list, google_rating: p.rating, google_count: p.count, problem }
    } catch (e) {
      problem ??= e instanceof Error ? e.message : String(e)
    }
  }
  return { feed: null, list: [], google_rating: null, google_count: null,
    problem: problem ?? CONNECT_MAPS }
}

const stars = (n: number) => `${n}★`

/**
 * Read Google's reviews, keep any not seen before, and tell every admin about each new one
 * (only those from the last 7 days: connecting doesn't dig up years of old reviews as "new").
 */
export async function checkReviews(env: Env, db: SupabaseClient): Promise<{ feed: Feed; added: number }> {
  const feed = await readFeed(env, db)
  if (!feed.list.length) return { feed, added: 0 }
  const { data: known } = await db.from('reviews').select('id').in('id', feed.list.map(r => r.id))
  const seen = new Set((known ?? []).map(r => r.id as string))
  const fresh = feed.list.filter(r => !seen.has(r.id))
  // Places has no replies: keep the ones made here; the profile's own are the truth.
  const rows = feed.list.map(({ reply, replied_at, ...r }) => (feed.feed === 'business_profile' ? { ...r, reply, replied_at } : r))
  const { error } = await db.from('reviews').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(error.message)
  const week = Date.now() - 7 * 86_400_000
  const recent = fresh.filter(r => Date.parse(r.created_at) >= week)
  if (recent.length) {
    const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin').eq('active', true)
    if (admins?.length) {
      await db.from('notifications').insert(recent.flatMap(r => admins.map(a => ({
        profile_id: a.id,
        title: isLow(r) ? `New ${stars(r.rating)} review from ${r.reviewer || 'someone'}: worth a reply` : `New ${stars(r.rating)} review from ${r.reviewer || 'someone'}`,
        body: r.text ? r.text.slice(0, 140) : null, link: '/reviews', kind: 'review', data: { review: r.id, low: isLow(r) },
      }))))
    }
  }
  return { feed, added: fresh.length }
}

/** Is there anything to read reviews from (the cron skips the work otherwise)? */
export const reviewsConfigured = async (env: Env, db: SupabaseClient) => placesOn(env) || await isConnected(db)

type FeedInfo = Omit<Feed, 'list'>

/**
 * Google's reviews checked (checkReviews) when that's due for where they came from last time: every
 * hour from the business's own profile, every 3 hours from Places, and straight away once the profile
 * is connected in place of Places or nothing could be read. `early` lets the hourly cron run a few
 * minutes before the hour is quite up.
 */
export async function refreshReviews(env: Env, db: SupabaseClient, early = 0) {
  return cached<FeedInfo>(db, 'reviews', async kept => {
    if (kept.feed === 'business_profile') return MINUTES.reviewsProfile - early
    if (kept.feed === 'places' && !await isConnected(db)) return MINUTES.reviewsPlaces - early
    return 0
  }, async () => {
    const { feed: { list: _list, ...info } } = await checkReviews(env, db)
    return info
  })
}

async function state(db: SupabaseClient, feed: FeedInfo): Promise<ReviewsState> {
  const { data } = await db.from('reviews').select('id, source, rating, text, reviewer, created_at, reply, replied_at, language, url')
    .order('created_at', { ascending: false }).limit(1000)
  return { feed: feed.feed, can_reply: feed.feed === 'business_profile', google_rating: feed.google_rating, google_count: feed.google_count,
    reviews: (data ?? []) as Review[], problem: feed.problem }
}

// The reviews kept, checked with Google first when that's due (new ones noticed).
reviews.get('/api/reviews', async c => {
  const db = serviceClient(c.env)
  try {
    const { data: feed, fetched_at } = await refreshReviews(c.env, db)
    return c.json({ ...await state(db, feed), fetched_at })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})

// Reply (or change the reply): { id, text }. Only on the business's own profile.
reviews.put('/api/reviews/reply', async c => {
  const db = serviceClient(c.env)
  const { id, text } = await c.req.json<{ id?: string; text?: string }>().catch(() => ({} as { id?: string; text?: string }))
  const reply = text?.trim() ?? ''
  if (!id || !/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/.test(id)) return c.json({ error: 'That review can’t be replied to here' }, 400)
  if (!reply) return c.json({ error: 'Write a reply first' }, 400)
  if (reply.length > MAX_REPLY) return c.json({ error: `Replies can be up to ${MAX_REPLY} characters` }, 400)
  if (!await isConnected(db)) return c.json({ error: 'Replying needs the Google Maps connection (your own Business Profile).' }, 409)
  try {
    const s = await googleSession(c.env, db)
    const r = await google.replyToReview(s.token, id, reply)
    await db.from('reviews').update({ reply, replied_at: r.updateTime ?? new Date().toISOString() }).eq('id', id)
    await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('kind', 'review').eq('data->>review', id).is('read_at', null)
    return c.json({ ok: true })
  } catch (e) {
    const why = explain('google_business', e)
    if (lasting('google_business', e)) await markBroken(db, 'google_business', why)
    return c.json({ error: why }, 502)
  }
})

// Take a reply down: { id }.
reviews.delete('/api/reviews/reply', async c => {
  const db = serviceClient(c.env)
  const { id } = await c.req.json<{ id?: string }>().catch(() => ({} as { id?: string }))
  if (!id || !/^accounts\//.test(id)) return c.json({ error: 'That review can’t be changed here' }, 400)
  try {
    const s = await googleSession(c.env, db)
    await google.deleteReviewReply(s.token, id)
    await db.from('reviews').update({ reply: null, replied_at: null }).eq('id', id)
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: explain('google_business', e) }, 502)
  }
})
