// The Analytics page beyond the website (admins): the business's Instagram, TikTok, LinkedIn Page and
// Facebook Page, each read with the connection the Social planner posts with. Each answer is kept
// for the business's social refresh rate (provider_cache, worker/refresh.ts). A connection that wasn't
// allowed to read statistics (made before they were asked for, a box unticked, the app not approved for them yet) gets
// `access: 'needs_scope'` instead of an error, and is never marked broken for it: posting still works.
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, requestDb, type Env } from './supabase'
import {
  asksForStats, explain, facebookSession, instagramOAuth, instagramSession, lasting, linkedinOAuth, linkedinSession, markBroken, tiktokSession, type LinkedInExternal,
} from './connections'
import { cached } from './cache'
import * as instagram from './providers/instagram'
import * as tiktok from './providers/tiktok'
import * as linkedin from './providers/linkedin'
import * as facebook from './providers/facebook'
import {
  FACEBOOK_METRICS, SOCIAL_NAMES, chunks, facebookReport, fillDays, insightDays, insightTotals, instagramReport, isSocialSource, linkedinReport, noReport,
  statsRefused, tiktokReport, unixDay, type SocialAccess, type SocialDay, type SocialReport, type SocialSource,
} from '../shared/socialAnalytics'
import { BASELINE_DAYS, IMPACT_DAYS, followerDays, ownPost, postAbout, postImpacts, type PostImpact } from '../shared/postImpact'
import type { Mention } from '../shared/mentions'
import { minutesFor } from './refresh'
import { addDays, today } from '../shared/time'
import { zoneOf } from './zone'
import { signInCheck, signedInUser } from './signedIn'

export const socialAnalytics = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

socialAnalytics.use('/api/analytics/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const [{ data: user }, { data: isAdmin }] = await Promise.all([signedInUser(c.env, token), signInCheck(c.env, token, 'is_admin')])
  if (!user.user || !isAdmin) return c.json({ error: 'Only an admin can see the analytics' }, 403)
  c.set('userId', user.user.id)
  await next()
})

const DATE = /^\d{4}-\d{2}-\d{2}$/
/** The longest period asked for at once: three months (Facebook allows 93 days). */
const MAX_DAYS = 92

// ---- Reading each platform -------------------------------------------------------------------

const INSTAGRAM_METRICS = ['reach', 'views', 'accounts_engaged', 'likes', 'comments', 'saves', 'shares', 'profile_links_taps', 'total_interactions']
/** Posts whose own figures are read (one call each). */
const POSTS_READ = 25

/**
 * Instagram over from–to: the account's metrics (30 days at a time, added up), reach day by day,
 * new followers day by day (only within the last 30 days, which is all Instagram keeps; from a week
 * before the period, so a post early in it has a usual to go by), and the period's posts.
 */
export async function readInstagram(cfg: instagram.InstagramConfig, from: string, to: string, now = today()): Promise<SocialReport> {
  const parts = chunks(from, to, 30)
  const span = (p: { from: string; to: string }) => [unixDay(p.from), unixDay(addDays(p.to, 1))] as const
  const before = addDays(from, -BASELINE_DAYS), kept = addDays(now, -29)
  const since = before > kept ? before : kept
  const [who, totals, reach, newFollowers, media] = await Promise.all([
    instagram.statsProfile(cfg),
    Promise.all(parts.map(p => instagram.accountInsights(cfg, INSTAGRAM_METRICS, ...span(p)))),
    Promise.all(parts.map(p => instagram.accountDays(cfg, 'reach', ...span(p)))),
    since <= to
      ? instagram.accountDays(cfg, 'follower_count', ...span({ from: since, to })).then(m => (m ? insightDays(m) : null), () => null)
      : Promise.resolve(null),
    instagram.mediaSince(cfg, from),
  ])
  const added: Record<string, number> = {}
  for (const part of totals) for (const [k, v] of Object.entries(insightTotals(part))) added[k] = (added[k] ?? 0) + v
  const inPeriod = media.filter(m => m.timestamp.slice(0, 10) >= from && m.timestamp.slice(0, 10) <= to).slice(0, POSTS_READ)
  const insights = await Promise.all(inPeriod.map(m => instagram.postInsights(cfg, m.id, m.media_product_type === 'FEED')))
  // Days Instagram hasn't counted yet (a day or two late) aren't days with no one new.
  const last = newFollowers?.reduce((a, d) => (d.date > a ? d.date : a), '') ?? ''
  const followerDays = newFollowers && last ? fillDays(newFollowers.filter(d => d.date >= since), since, last) : null
  const gained = followerDays && from >= since ? followerDays.filter(d => d.date >= from && d.date <= to).reduce((n, d) => n + d.value, 0) : null
  return instagramReport({
    username: who.username, followers: who.followers_count ?? null, totals: added, follower_gain: gained, follower_days: followerDays,
    reach_days: reach.flatMap(m => insightDays(m)), media: inPeriod.map((m, i) => ({ ...m, insights: insights[i] })),
  }, from, to)
}

/** TikTok: the account's counts now, and its videos back to the start of the period. */
export async function readTikTok(token: string, username: string | null, from: string, to: string): Promise<SocialReport> {
  const [user, videos] = await Promise.all([tiktok.userStats(token), tiktok.videosSince(token, unixDay(from))])
  return tiktokReport(user, videos, username, from, to)
}

/** A LinkedIn Page: followers now and gained (LinkedIn has those up to two days ago), and its posts' figures day by day. */
export async function readLinkedIn(version: string, token: string, page: { id: string; name: string }, from: string, to: string, now = today()): Promise<SocialReport> {
  const last = addDays(now, -2)
  const gainsTo = to < last ? to : last
  const [followers, gains, shares] = await Promise.all([
    linkedin.followerCount(version, token, page.id),
    gainsTo >= from ? linkedin.followerGains(version, token, page.id, from, gainsTo) : Promise.resolve([]),
    linkedin.shareStats(version, token, page.id, from, to),
  ])
  return linkedinReport({ page, followers, follower_gains: gains, shares }, from, to)
}

/** A Facebook Page: each insights metric on its own (one Meta retires leaves the others), and its posts. */
export async function readFacebook(s: facebook.PageAccess, from: string, to: string): Promise<SocialReport> {
  const since = unixDay(from), until = unixDay(addDays(to, 1))
  const [page, metrics, posts] = await Promise.all([
    facebook.pageStats(s),
    Promise.allSettled(FACEBOOK_METRICS.map(m => facebook.pageInsight(s, m, since, until))),
    facebook.pagePosts(s, since, until),
  ])
  const read = metrics.flatMap(r => (r.status === 'fulfilled' && r.value ? [r.value] : []))
  // None could be read: say why (usually read_insights wasn't allowed) rather than show a page of zeros.
  const refused = metrics.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (!read.length && refused) throw refused.reason
  return facebookReport({ page, insights: read, posts }, from, to)
}

// ---- What each post did (Instagram) -------------------------------------------------------------

/**
 * The day after the last one whose posts about the café are shown: a period runs to yesterday (the
 * platforms are a day behind), but a post about the café from today shows in it too (too soon to tell),
 * so one just added is there.
 */
export const aboutUntil = (to: string, now = today()) => (to >= addDays(now, -1) ? addDays(now, 1) : addDays(to, 1))

const MENTION_FIELDS = 'id, kind, username, media_url, permalink, caption, mentioned_at, video, likes, comments, views, shares, saves, added_by'

/** Keep Instagram's new followers each day (it forgets them after 30 days). Never throws. */
export async function keepFollowerDays(db: SupabaseClient, days: SocialDay[] | null | undefined) {
  if (!days?.length) return
  const at = new Date().toISOString()
  const { error } = await db.from('social_follower_days')
    .upsert(days.map(d => ({ source: 'instagram', day: d.date, gained: Math.max(0, Math.round(d.value)), updated_at: at })), { onConflict: 'business_id,source,day' })
  if (error) console.error('keeping new followers', error.message)
}

/**
 * Once a day (from the Instagram check every 15 minutes): the last 30 days of new followers, kept, so
 * What each post did can go further back than Instagram does. Only with statistics allowed.
 */
export async function refreshFollowerDays(db: SupabaseClient, cfg: instagram.InstagramConfig, now = today()) {
  await cached(db, 'instagram:follower-days', 20 * 60, async () => {
    const since = addDays(now, -29)
    const m = await instagram.accountDays(cfg, 'follower_count', unixDay(since), unixDay(now))
    const days = m ? insightDays(m) : []
    const last = days.reduce((a, d) => (d.date > a ? d.date : a), '')
    if (last) await keepFollowerDays(db, fillDays(days.filter(d => d.date >= since), since, last))
    return { days: days.length }
  })
}

/**
 * The café's own posts of the period and the ones about it (collabs, tags, story mentions), each with
 * the followers gained the day it went out and the two after, against the week before. Null for
 * anything but Instagram with statistics.
 */
export async function postImpact(db: SupabaseClient, report: SocialReport): Promise<PostImpact[] | null> {
  if (report.source !== 'instagram' || report.access !== 'ok') return null
  await keepFollowerDays(db, report.follower_days)
  const [{ data: kept, error: e1 }, { data: about, error: e2 }] = await Promise.all([
    db.from('social_follower_days').select('day, gained').eq('source', 'instagram')
      .gte('day', addDays(report.from, -BASELINE_DAYS)).lte('day', addDays(report.to, IMPACT_DAYS)),
    db.from('instagram_mentions').select(MENTION_FIELDS)
      .gte('mentioned_at', `${report.from}T00:00:00Z`).lt('mentioned_at', `${aboutUntil(report.to)}T00:00:00Z`)
      .order('mentioned_at', { ascending: false }).limit(100),
  ])
  if (e1 || e2) throw new Error((e1 ?? e2)!.message)
  const days = followerDays((kept ?? []).map(d => ({ date: String(d.day), value: Number(d.gained) })), report.follower_days)
  const own = (report.all_posts ?? report.posts).map(ownPost)
  return postImpacts([...own, ...((about ?? []) as (Mention & { added_by: string | null })[]).map(postAbout)], days)
}

// ---- The route ----------------------------------------------------------------------------------

type Row = { status: string; account_label: string | null; external: Record<string, unknown> | null }

/** Known before asking: the connection wasn't allowed statistics, or LinkedIn posts as the person (no Page). */
function knownGap(env: Env, source: SocialSource, ext: Record<string, unknown>): Exclude<SocialAccess, 'ok'> | null {
  if (source === 'instagram' && ext.can_see_insights === false) return 'needs_scope'
  if (source === 'tiktok' && ext.stats === false) return 'needs_scope'
  if (source === 'facebook' && ext.insights === false) return 'needs_scope'
  if (source === 'linkedin') {
    const li = ext as LinkedInExternal & { stats?: boolean }
    // Without the Community Management API there are no Pages at all; with it, a Page has to be chosen.
    if (!li.page_id || li.page_id === 'me') return linkedinOAuth(env, '')?.pages ? 'needs_page' : 'needs_scope'
    if (li.stats === false) return 'needs_scope'
  }
  return null
}

async function readSource(env: Env, db: SupabaseClient, source: SocialSource, row: Row, from: string, to: string): Promise<SocialReport> {
  const ext = row.external ?? {}
  switch (source) {
    case 'instagram':
      if (!instagramOAuth(env, '')) throw new Error('Instagram is not set up')
      return readInstagram(await instagramSession(env, db), from, to, today(await zoneOf(db)))
    case 'tiktok':
      return readTikTok(await tiktokSession(env, db), typeof ext.username === 'string' ? ext.username : null, from, to)
    case 'linkedin': {
      const s = await linkedinSession(env, db)
      const id = s.external.page_id!
      return readLinkedIn(s.cfg.version, s.token, { id, name: s.external.page_name ?? row.account_label ?? `Page ${id}` }, from, to, today(await zoneOf(db)))
    }
    case 'facebook':
      return readFacebook(await facebookSession(env, db), from, to)
  }
}

// One platform's figures for from–to inclusive (YYYY-MM-DD). The page asks again for the period before, to compare.
socialAnalytics.get('/api/analytics/:source', async c => {
  const source = c.req.param('source')
  if (!isSocialSource(source)) return c.json({ error: 'Unknown source' }, 404)
  const from = c.req.query('from') ?? '', to = c.req.query('to') ?? ''
  if (!DATE.test(from) || !DATE.test(to) || from > to) return c.json({ error: 'Give from and to dates (YYYY-MM-DD)' }, 400)
  if (addDays(from, MAX_DAYS - 1) < to) return c.json({ error: `At most ${MAX_DAYS} days at a time` }, 400)
  const db = await requestDb(c)
  const { data } = await db.from('integrations').select('status, account_label, external').eq('provider', source).maybeSingle()
  const row = data as Row | null
  const name = SOCIAL_NAMES[source]
  if (!row || (row.status !== 'connected' && row.status !== 'error')) return c.json({ error: `Connect ${name} on the Connections page to see its statistics` }, 400)
  const without = (access: Exclude<SocialAccess, 'ok'>) => c.json({ ...noReport(source, from, to, access, row.account_label), fetched_at: new Date().toISOString() })
  // Reconnecting only helps once sign-in asks for the statistics permissions (STATS_SCOPES): until then, say so.
  const missing = (access: Exclude<SocialAccess, 'ok'>) => without(access === 'needs_scope' && !asksForStats(c.env, source) ? 'not_switched_on' : access)
  const gap = knownGap(c.env, source, row.external ?? {})
  if (gap) return missing(gap)
  try {
    const { data: report, fetched_at } = await cached(db, `social:${source}:${from}:${to}`, minutesFor(db, 'social'), () => readSource(c.env, db, source, row, from, to))
    const impact = await postImpact(db, report).catch(e => { console.error('what each post did', e); return null })
    return c.json({ ...report, ...(impact ? { impact } : {}), fetched_at })
  } catch (e) {
    // Not allowed to read statistics: ask to connect again; the connection itself is fine.
    if (statsRefused(source, e instanceof Error ? e.message : String(e))) return missing('needs_scope')
    const why = explain(source, e)
    if (lasting(source, e)) await markBroken(db, source, why)
    return c.json({ error: why }, 400)
  }
})
