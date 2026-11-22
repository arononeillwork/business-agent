// Reviews page: Google reviews read from the business's own profile (the Google Maps connection:
// all of them, with replies and the photos people added), or until Google approves that, from the
// public listing (Places API: the 5 newest, no replies). Every review seen is kept (public.reviews), so each new one is noticed
// once: the Worker looks every hour (every 3 hours on Places, which Google charges for past 1,000
// look-ups a month: shared/refresh.ts) and admins get a notification, a low rating flagged. Opening
// the page shows what's kept; it only asks Google when that's due.
import Anthropic from '@anthropic-ai/sdk'
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, requestDb, secretPlaceId, type Env } from './supabase'
import { explain, googleSession, lasting, markBroken, myBusinessApiOff } from './connections'
import { cached } from './cache'
import * as google from './providers/google'
import { placeReviews } from './providers/places'
import {
  CONNECT_MAPS, googleTranslation, guessLanguage, isLow, originalWords, starsOf, toTranslate, translationOf, MAX_REPLY,
  type Review, type ReviewFeed, type ReviewLanguage, type ReviewPhoto, type ReviewsState,
} from '../shared/reviews'
import { translateReviews } from './reviewTranslations'
import { MINUTES } from '../shared/refresh'
import { signInCheck } from './signedIn'

export const reviews = new Hono<{ Bindings: Env }>()

const admin = async (c: { env: Env; req: { header: (n: string) => string | undefined } }) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return false
  const { data } = await signInCheck(c.env, token, 'is_admin')
  return data === true
}
for (const path of ['/api/reviews', '/api/reviews/*']) {
  reviews.use(path, async (c, next) => {
    if (!await admin(c)) return c.json({ error: 'Only an admin can see reviews' }, 403)
    await next()
  })
}

const placesOn = (env: Env, db: SupabaseClient) => !!(env.GOOGLE_PLACES_API_KEY && secretPlaceId(env, db))
const isConnected = async (db: SupabaseClient) => {
  const { data } = await db.from('integrations').select('status, external').eq('provider', 'google_business').single()
  const ext = (data?.external ?? {}) as { location?: string; account?: string }
  return data?.status === 'connected' && !!ext.location && !!ext.account
}

interface Feed {
  feed: ReviewFeed | null; list: Review[]; google_rating: number | null; google_count: number | null; problem: string | null
  /** Whether the reviews' photos could be read this time (if not, the ones kept stay as they were). */
  photos?: boolean
}

const DAY = 86_400_000
/** Most photos kept for one review (the `review_photos` migration holds it to this). */
const MAX_REVIEW_PHOTOS = 20

/**
 * The photos a reviewer added with their review. Google keeps them among the listing's customer photos
 * without saying which review they came with, so: the same name, added within a day of the review being
 * written or last changed. Anonymous reviews get none.
 */
function photosFor(reviewer: string, created: string, updated: string | undefined, media: google.GoogleCustomerMedia[]): ReviewPhoto[] {
  const who = reviewer.trim().toLowerCase()
  if (!who) return []
  const from = Date.parse(created) - DAY
  const to = Math.max(Date.parse(updated ?? '') || 0, Date.parse(created)) + DAY
  return media
    .filter(m => (m.mediaFormat ?? 'PHOTO') === 'PHOTO' && m.googleUrl?.startsWith('https://') && m.attribution?.profileName?.trim().toLowerCase() === who)
    .map(m => ({ m, at: Date.parse(m.createTime ?? '') }))
    .filter(({ at }) => at >= from && at <= to)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_REVIEW_PHOTOS)
    .map(({ m }) => ({ url: m.googleUrl!, thumb: m.thumbnailUrl?.startsWith('https://') ? m.thumbnailUrl : null }))
}

/** Reviews as Google has them now, from the best source there is. */
async function readFeed(env: Env, db: SupabaseClient): Promise<Feed> {
  let problem: string | null = null
  if (await isConnected(db)) {
    try {
      const s = await googleSession(env, db)
      const [raw, media] = await Promise.all([
        google.listReviews(s.token, s.account!, s.location!),
        // Photos are extra: should Google refuse just those, the reviews still come through.
        google.listCustomerMedia(s.token, s.account!, s.location!).catch(() => null),
      ])
      const list = raw.flatMap((r): Review[] => {
        const rating = starsOf(r.starRating)
        if (!rating || !r.createTime) return []
        const text = originalWords(r.comment)
        const reviewer = r.reviewer?.isAnonymous ? '' : r.reviewer?.displayName ?? ''
        const language = guessLanguage(text)
        return [{ id: r.name, source: 'google', rating, text, reviewer,
          created_at: r.createTime, reply: r.reviewReply?.comment ?? null, replied_at: r.reviewReply?.updateTime ?? null,
          language, url: null, photos: media ? photosFor(reviewer, r.createTime, r.updateTime, media) : [],
          // Google's own translation, when it sent one with the reviewer's words.
          translations: translationOf(language, googleTranslation(r.comment)) }]
      })
      await wordsFromPlaces(env, db, list)
      return { feed: 'business_profile', list, google_rating: null, google_count: null, problem: null, photos: !!media }
    } catch (e) {
      problem = explain('google_business', e)
      // Reviews' own API being off leaves Google Maps working (hours): the page says so, the connection stays.
      if (lasting('google_business', e) && !myBusinessApiOff(e)) await markBroken(db, 'google_business', problem)
    }
  }
  if (placesOn(env, db)) {
    try {
      const p = await placeReviews(env.GOOGLE_PLACES_API_KEY!, secretPlaceId(env, db)!)
      const list = p.reviews.flatMap((r): Review[] => {
        const rating = starsOf(r.rating)
        if (!rating || !r.publishTime) return []
        const language: ReviewLanguage = r.language?.startsWith('es') ? 'es' : r.language?.startsWith('en') ? 'en' : guessLanguage(r.text)
        return [{ id: r.name, source: 'google', rating, text: r.text, reviewer: r.author, created_at: r.publishTime, reply: null, replied_at: null,
          language, url: r.url, photos: [], translations: translationOf(language, r.translated) }]
      })
      return { feed: 'places', list, google_rating: p.rating, google_count: p.count, problem }
    } catch (e) {
      problem ??= e instanceof Error ? e.message : String(e)
    }
  }
  return { feed: null, list: [], google_rating: null, google_count: null,
    problem: problem ?? CONNECT_MAPS }
}

/**
 * A review only a day or two old can come from the business's profile with its stars and no words yet,
 * while Google's public listing already shows them. With a Places key, those words are filled in from
 * the listing: the same reviewer, written within a day of it. Older reviews without words are left as
 * they are (no look-up every hour for a review that really has none).
 */
async function wordsFromPlaces(env: Env, db: SupabaseClient, list: Review[]) {
  const recent = list.filter(r => !r.text && r.reviewer && Date.now() - Date.parse(r.created_at) < 2 * DAY)
  if (!recent.length || !placesOn(env, db)) return
  try {
    const p = await placeReviews(env.GOOGLE_PLACES_API_KEY!, secretPlaceId(env, db)!)
    for (const r of recent) {
      const same = p.reviews.find(x => x.text && x.publishTime && x.author.trim().toLowerCase() === r.reviewer.trim().toLowerCase()
        && Math.abs(Date.parse(x.publishTime) - Date.parse(r.created_at)) < DAY)
      if (!same?.text) continue
      r.text = same.text
      r.language = same.language?.startsWith('es') ? 'es' : same.language?.startsWith('en') ? 'en' : guessLanguage(same.text)
      r.translations = translationOf(r.language, same.translated)
    }
  } catch { /* the listing is extra: the profile's reviews still come through */ }
}

const stars = (n: number) => `${n}★`

/**
 * Read Google's reviews, keep any not seen before, and tell every admin about each new one
 * (only those from the last 7 days: connecting doesn't dig up years of old reviews as "new").
 */
export async function checkReviews(env: Env, db: SupabaseClient): Promise<{ feed: Feed; added: number }> {
  const feed = await readFeed(env, db)
  if (!feed.list.length) return { feed, added: 0 }
  const { data: known } = await db.from('reviews').select('id, translations').in('id', feed.list.map(r => r.id))
  const seen = new Set((known ?? []).map(r => r.id as string))
  const kept = new Map((known ?? []).map(r => [r.id as string, (r.translations ?? {}) as Review['translations']]))
  const fresh = feed.list.filter(r => !seen.has(r.id))
  // Places has no replies: keep the ones made here; the profile's own are the truth. Photos likewise,
  // only when they could be read (Google's addresses for them change, so they're written each time).
  // Translations: the ones kept (made here), with Google's own on top.
  const rows = feed.list.map(({ reply, replied_at, photos, translations, ...r }) => ({
    ...r, ...(feed.feed === 'business_profile' ? { reply, replied_at } : {}), ...(feed.photos ? { photos } : {}),
    translations: { ...kept.get(r.id), ...translations },
  }))
  const { error } = await db.from('reviews').upsert(rows, { onConflict: 'business_id,id' })
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
export const reviewsConfigured = async (env: Env, db: SupabaseClient) => placesOn(env, db) || await isConnected(db)

type FeedInfo = Omit<Feed, 'list' | 'photos'>

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
    const { feed: { list: _list, photos: _photos, ...info } } = await checkReviews(env, db)
    return info
  })
}

/** The business's listing on Google Maps, when the Google Maps connection knows it. */
async function listingUrl(db: SupabaseClient) {
  const { data } = await db.from('integrations').select('external').eq('provider', 'google_business').maybeSingle()
  const ext = (data?.external ?? {}) as { location?: string; locations?: { name?: string; maps_url?: string }[] }
  return ext.locations?.find(l => l.name === ext.location)?.maps_url ?? null
}

async function state(env: Env, db: SupabaseClient, feed: FeedInfo): Promise<ReviewsState> {
  const [{ data }, listing] = await Promise.all([
    db.from('reviews').select('id, source, rating, text, reviewer, created_at, reply, replied_at, language, url, photos, translations')
      .order('created_at', { ascending: false }).limit(1000),
    listingUrl(db),
  ])
  return { feed: feed.feed, can_reply: feed.feed === 'business_profile', google_rating: feed.google_rating, google_count: feed.google_count,
    reviews: ((data ?? []) as Review[]).map(r => ({ ...r, photos: r.photos ?? [], translations: r.translations ?? {} })), problem: feed.problem,
    can_translate: !!env.ANTHROPIC_API_KEY, listing_url: listing }
}

// The reviews kept, checked with Google first when that's due (new ones noticed).
reviews.get('/api/reviews', async c => {
  const db = await requestDb(c)
  try {
    const { data: feed, fetched_at } = await refreshReviews(c.env, db)
    return c.json({ ...await state(c.env, db, feed), fetched_at })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})

// The reviews in another language than the page's, translated into it ({ language: 'en' | 'es' }) and kept:
// up to TRANSLATE_AT_ONCE a time, newest first. Answers how many were translated and how many are left.
reviews.post('/api/reviews/translate', async c => {
  const { language } = await c.req.json<{ language?: string }>().catch(() => ({} as { language?: string }))
  if (language !== 'en' && language !== 'es') return c.json({ error: 'Pick English or Spanish' }, 400)
  if (!c.env.ANTHROPIC_API_KEY) return c.json({ translated: 0, left: 0 })
  const db = await requestDb(c)
  const { data, error } = await db.from('reviews').select('id, text, language, translations').order('created_at', { ascending: false }).limit(200)
  if (error) return c.json({ error: error.message }, 500)
  const todo = toTranslate((data ?? []) as Pick<Review, 'id' | 'text' | 'language' | 'translations'>[], language)
  if (!todo.length) return c.json({ translated: 0, left: 0 })
  try {
    const claude = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY }).beta.messages
    const done = await translateReviews(claude, todo, language)
    for (const r of todo) {
      const text = done.get(r.id)
      if (text) await db.from('reviews').update({ translations: { ...r.translations, [language]: text } }).eq('id', r.id)
    }
    return c.json({ translated: done.size, left: Math.max(0, todo.length - done.size) })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})

// Reply (or change the reply): { id, text }. Only on the business's own profile.
reviews.put('/api/reviews/reply', async c => {
  const db = await requestDb(c)
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
    if (lasting('google_business', e) && !myBusinessApiOff(e)) await markBroken(db, 'google_business', why)
    return c.json({ error: why }, 502)
  }
})

// Take a reply down: { id }.
reviews.delete('/api/reviews/reply', async c => {
  const db = await requestDb(c)
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
