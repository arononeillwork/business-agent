// Analytics beyond the website: how the business's own Instagram, TikTok, LinkedIn Page and Facebook
// Page did over a period. Google Search Console only covers the website's Google search traffic, so
// each of these comes from its own platform, through the connection the Social planner already uses
// (worker/socialAnalytics.ts reads them). Here: what the Analytics page shows, and the pure steps that
// turn each platform's answers into it.
import { msg } from './i18n'
import { addDays } from './time'

export type SocialSource = 'instagram' | 'tiktok' | 'linkedin' | 'facebook'
export const SOCIAL_SOURCES: SocialSource[] = ['instagram', 'tiktok', 'linkedin', 'facebook']
export const isSocialSource = (s: string): s is SocialSource => (SOCIAL_SOURCES as string[]).includes(s)
export const SOCIAL_NAMES: Record<SocialSource, string> = { instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', facebook: 'Facebook' }

/** The statistics permission each platform needs, asked for when it's connected (worker/providers/*). */
export const STATS_SCOPES: Record<SocialSource, string[]> = {
  instagram: ['instagram_business_manage_insights'],
  tiktok: ['user.info.stats', 'video.list'],
  linkedin: ['rw_organization_admin'],
  facebook: ['read_insights'],
}

export type SocialMetricId = 'followers' | 'total_likes' | 'reach' | 'views' | 'accounts_engaged' | 'interactions' | 'profile_links_taps'
  | 'likes' | 'comments' | 'shares' | 'saves' | 'videos' | 'views_per_video' | 'impressions' | 'clicks' | 'engagement' | 'page_views'

export const METRIC_LABELS: Record<SocialMetricId, string> = {
  followers: msg('Followers'), total_likes: msg('Likes on all your videos'), reach: msg('Accounts reached'), views: msg('Views'),
  accounts_engaged: msg('Accounts engaged'), interactions: msg('Interactions'), profile_links_taps: msg('Taps on your links'),
  likes: msg('Likes'), comments: msg('Comments'), shares: msg('Shares'), saves: msg('Saves'), videos: msg('Videos posted'),
  views_per_video: msg('Views per video'), impressions: msg('Impressions'), clicks: msg('Clicks'), engagement: msg('Engagement rate'),
  page_views: msg('Page visits'),
}

/** One headline figure. */
export interface SocialMetric {
  id: SocialMetricId
  /** null: the platform doesn't give it for this account or period. */
  value: number | null
  /** 'now': as it stands today (followers), so not compared with the period before; 'period': over the period. */
  kind: 'now' | 'period'
  /** For a 'now' figure: how much it moved during the period, when the platform says. */
  change?: number | null
  /** A share (0.034 is 3.4%) rather than a count. */
  percent?: boolean
}

export interface SocialDay { date: string; value: number }

/** A post (or video) from the period and how it did, as far as the platform shares. */
export interface SocialPost {
  id: string
  url: string | null
  caption: string
  /** When it went out. */
  at: string
  thumbnail: string | null
  views?: number | null
  reach?: number | null
  likes?: number | null
  comments?: number | null
  shares?: number | null
  saves?: number | null
}
export type PostColumn = 'views' | 'reach' | 'likes' | 'comments' | 'shares' | 'saves'

/**
 * Whether there are figures: 'ok'; 'needs_scope' when the connection wasn't allowed to read
 * statistics (made before they were asked for, a box unticked, or the app not approved for them);
 * 'needs_page' when LinkedIn posts as the person, who has no Page statistics.
 */
export type SocialAccess = 'ok' | 'needs_scope' | 'needs_page'

export interface SocialReport {
  source: SocialSource
  from: string
  to: string
  access: SocialAccess
  /** The account as people know it: "@easy.beans.coffee", "Easy Beans Coffee". */
  account: string | null
  profile_url: string | null
  metrics: SocialMetric[]
  /** One figure day by day (null: the platform has nothing per day). */
  chart: { metric: SocialMetricId; days: SocialDay[] } | null
  /** The period's posts, best first. */
  posts: SocialPost[]
  /** What each post shows, in order. */
  post_columns: PostColumn[]
  /** A note on what the figures cover, when it isn't obvious. */
  note?: 'tiktok_videos' | null
  fetched_at?: string
}

/** No figures, and why. */
export const noReport = (source: SocialSource, from: string, to: string, access: Exclude<SocialAccess, 'ok'>, account: string | null = null): SocialReport =>
  ({ source, from, to, access, account, profile_url: null, metrics: [], chart: null, posts: [], post_columns: [] })

// ---- Dates ---------------------------------------------------------------------------------

/** Midnight UTC at the start of a day, in seconds (Meta) or milliseconds (LinkedIn). */
export const unixDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000
export const msDay = (date: string) => Date.parse(`${date}T00:00:00Z`)

/** The days from `from` to `to` (inclusive) in runs of at most `max` days: Instagram reads 30 at a time. */
export function chunks(from: string, to: string, max: number): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = []
  for (let a = from; a <= to; a = addDays(a, max)) {
    const b = addDays(a, max - 1)
    out.push({ from: a, to: b < to ? b : to })
  }
  return out
}

/**
 * The day a Meta daily value is for. Meta stamps each day with when it ended ("2026-09-02T07:00:00+0000"
 * is 1 September, Pacific time), so it's the day before the stamp's date.
 */
export const dayOfEndTime = (endTime: string) => addDays(endTime.slice(0, 10), -1)

/** Every day of the period, with 0 for days the platform left out. */
export function fillDays(days: SocialDay[], from: string, to: string): SocialDay[] {
  const by = new Map<string, number>()
  for (const d of days) by.set(d.date, (by.get(d.date) ?? 0) + d.value)
  const out: SocialDay[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, value: by.get(d) ?? 0 })
  return out
}

const inPeriod = (iso: string, from: string, to: string) => { const d = iso.slice(0, 10); return d >= from && d <= to }
const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((n, x) => n + (x ?? 0), 0)
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(Number(x)) ? Number(x) : null)
const caption = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
/** Meta's times ("2026-09-28T09:10:00+0000") as plain ISO, which every browser reads. */
export const isoOf = (s: string) => { const ms = Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')); return Number.isNaN(ms) ? s : new Date(ms).toISOString() }

// ---- Meta's insights answers (Instagram and Facebook) --------------------------------------

/** One insights metric as Meta answers it: a total for the range, or values day by day. */
export interface MetaInsight { name: string; total_value?: { value?: number }; values?: { value?: number | Record<string, number>; end_time?: string }[] }

/** Each metric's total: Meta's total_value, or its daily values added up. */
export function insightTotals(data: MetaInsight[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of data) {
    const total = num(m.total_value?.value)
    out[m.name] = total ?? sum((m.values ?? []).map(v => num(v.value)))
  }
  return out
}

/** A metric's values day by day. */
export const insightDays = (m: MetaInsight | undefined): SocialDay[] =>
  (m?.values ?? []).filter(v => v.end_time).map(v => ({ date: dayOfEndTime(v.end_time!), value: num(v.value) ?? 0 }))

// ---- Instagram -----------------------------------------------------------------------------

/** What the Worker read from Instagram for a period. */
export interface InstagramStats {
  username: string
  followers: number | null
  /** Each account metric added up over the period (reach, views, accounts_engaged, likes, comments, saves, shares, profile_links_taps). */
  totals: Record<string, number>
  /** Accounts reached each day. */
  reach_days: SocialDay[]
  /** New followers over the period (Instagram keeps the last 30 days, and nothing under 100 followers). */
  follower_gain: number | null
  media: {
    id: string; caption?: string; permalink?: string; timestamp: string; media_type?: string
    thumbnail_url?: string; media_url?: string; like_count?: number; comments_count?: number
    insights?: Record<string, number>
  }[]
}

export function instagramReport(s: InstagramStats, from: string, to: string): SocialReport {
  const total = (k: string) => (k in s.totals ? s.totals[k] : null)
  const posts: SocialPost[] = s.media.filter(m => inPeriod(m.timestamp, from, to)).map(m => ({
    id: m.id, url: m.permalink ?? null, caption: caption(m.caption), at: isoOf(m.timestamp),
    thumbnail: m.thumbnail_url ?? (m.media_type === 'VIDEO' ? null : m.media_url ?? null),
    reach: m.insights?.reach ?? null, views: m.insights?.views ?? null,
    likes: m.insights?.likes ?? m.like_count ?? null, comments: m.insights?.comments ?? m.comments_count ?? null,
    saves: m.insights?.saved ?? m.insights?.saves ?? null, shares: m.insights?.shares ?? null,
  }))
  return {
    source: 'instagram', from, to, access: 'ok', account: `@${s.username}`, profile_url: `https://www.instagram.com/${s.username}/`,
    metrics: [
      { id: 'followers', kind: 'now', value: s.followers, change: s.follower_gain },
      { id: 'reach', kind: 'period', value: total('reach') },
      { id: 'views', kind: 'period', value: total('views') },
      { id: 'accounts_engaged', kind: 'period', value: total('accounts_engaged') },
      { id: 'likes', kind: 'period', value: total('likes') },
      { id: 'comments', kind: 'period', value: total('comments') },
      { id: 'saves', kind: 'period', value: total('saves') },
      { id: 'profile_links_taps', kind: 'period', value: total('profile_links_taps') },
    ],
    chart: { metric: 'reach', days: fillDays(s.reach_days.filter(d => d.date >= from && d.date <= to), from, to) },
    posts: best(posts, p => p.reach ?? sum([p.likes, p.comments, p.saves, p.shares])),
    post_columns: ['reach', 'likes', 'comments', 'saves'],
  }
}

// ---- TikTok --------------------------------------------------------------------------------

export interface TikTokUserStats { display_name?: string; follower_count?: number; following_count?: number; likes_count?: number; video_count?: number }
export interface TikTokVideo {
  id: string; title?: string; video_description?: string; create_time: number; cover_image_url?: string; share_url?: string
  view_count?: number; like_count?: number; comment_count?: number; share_count?: number
}

/**
 * TikTok shares today's counts only (no history): followers and likes as they stand, and each
 * video's views, likes, comments and shares so far. The period's figures are those of the videos
 * posted in it.
 */
export function tiktokReport(user: TikTokUserStats, videos: TikTokVideo[], username: string | null, from: string, to: string): SocialReport {
  const mine = videos.filter(v => inPeriod(new Date(v.create_time * 1000).toISOString(), from, to))
  const views = sum(mine.map(v => v.view_count))
  const posts: SocialPost[] = mine.map(v => ({
    id: v.id, url: v.share_url ?? (username ? `https://www.tiktok.com/@${username}/video/${v.id}` : null),
    caption: caption(v.title || v.video_description), at: new Date(v.create_time * 1000).toISOString(), thumbnail: v.cover_image_url ?? null,
    views: v.view_count ?? null, likes: v.like_count ?? null, comments: v.comment_count ?? null, shares: v.share_count ?? null,
  }))
  return {
    source: 'tiktok', from, to, access: 'ok', account: username ? `@${username}` : user.display_name ?? null,
    profile_url: username ? `https://www.tiktok.com/@${username}` : null,
    metrics: [
      { id: 'followers', kind: 'now', value: num(user.follower_count) },
      { id: 'total_likes', kind: 'now', value: num(user.likes_count) },
      { id: 'videos', kind: 'period', value: mine.length },
      { id: 'views', kind: 'period', value: views },
      { id: 'views_per_video', kind: 'period', value: mine.length ? Math.round(views / mine.length) : null },
      { id: 'likes', kind: 'period', value: sum(mine.map(v => v.like_count)) },
      { id: 'comments', kind: 'period', value: sum(mine.map(v => v.comment_count)) },
      { id: 'shares', kind: 'period', value: sum(mine.map(v => v.share_count)) },
    ],
    chart: null,
    posts: best(posts, p => p.views ?? 0),
    post_columns: ['views', 'likes', 'comments', 'shares'],
    note: 'tiktok_videos',
  }
}

// ---- LinkedIn ------------------------------------------------------------------------------

export interface LinkedInShareStats { impressionCount?: number; uniqueImpressionsCount?: number; clickCount?: number; likeCount?: number; commentCount?: number; shareCount?: number }
export interface LinkedInStatsDay { timeRange?: { start?: number; end?: number } }
export interface LinkedInStats {
  page: { id: string; name: string; vanity?: string | null }
  followers: number | null
  /** Followers gained each day (LinkedIn has them up to two days ago). */
  follower_gains: (LinkedInStatsDay & { followerGains?: { organicFollowerGain?: number; paidFollowerGain?: number } })[]
  /** The Page's posts' figures each day. */
  shares: (LinkedInStatsDay & { totalShareStatistics?: LinkedInShareStats })[]
}

const dayOfMs = (ms: number | undefined) => (ms === undefined ? '' : new Date(ms).toISOString().slice(0, 10))

export function linkedinReport(s: LinkedInStats, from: string, to: string): SocialReport {
  const days = s.shares.filter(d => { const day = dayOfMs(d.timeRange?.start); return day >= from && day <= to })
  const stat = (k: keyof LinkedInShareStats) => sum(days.map(d => d.totalShareStatistics?.[k]))
  const impressions = stat('impressionCount'), clicks = stat('clickCount'), likes = stat('likeCount'), comments = stat('commentCount'), shares = stat('shareCount')
  const gains = s.follower_gains.filter(d => { const day = dayOfMs(d.timeRange?.start); return day >= from && day <= to })
  return {
    source: 'linkedin', from, to, access: 'ok', account: s.page.name,
    profile_url: s.page.vanity ? `https://www.linkedin.com/company/${s.page.vanity}/` : `https://www.linkedin.com/company/${s.page.id}/`,
    metrics: [
      { id: 'followers', kind: 'now', value: s.followers,
        change: gains.length ? sum(gains.map(g => sum([g.followerGains?.organicFollowerGain, g.followerGains?.paidFollowerGain]))) : null },
      { id: 'impressions', kind: 'period', value: impressions },
      { id: 'clicks', kind: 'period', value: clicks },
      // LinkedIn's own engagement rate: clicks, reactions, comments and reposts over impressions.
      { id: 'engagement', kind: 'period', percent: true, value: impressions ? (clicks + likes + comments + shares) / impressions : null },
      { id: 'likes', kind: 'period', value: likes },
      { id: 'comments', kind: 'period', value: comments },
      { id: 'shares', kind: 'period', value: shares },
    ],
    chart: { metric: 'impressions', days: fillDays(days.map(d => ({ date: dayOfMs(d.timeRange?.start), value: num(d.totalShareStatistics?.impressionCount) ?? 0 })), from, to) },
    posts: [],
    post_columns: [],
  }
}

/** LinkedIn's Rest.li 2.0 time range, day by day: from the first day to the day after the last. */
export const linkedinDays = (from: string, to: string) =>
  `(timeRange:(start:${msDay(from)},end:${msDay(addDays(to, 1))}),timeGranularityType:DAY)`

// ---- Facebook ------------------------------------------------------------------------------

export interface FacebookStats {
  page: { id: string; name: string; link?: string | null; followers: number | null }
  /** Page insights by metric: page_media_view, page_total_media_view_unique, page_post_engagements, page_views_total, page_daily_follows_unique. */
  insights: MetaInsight[]
  posts: { id: string; message?: string; created_time: string; permalink_url?: string; full_picture?: string
    shares?: { count?: number }; reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } }[]
}

export function facebookReport(s: FacebookStats, from: string, to: string): SocialReport {
  const totals = insightTotals(s.insights)
  const total = (k: string) => (k in totals ? totals[k] : null)
  const posts: SocialPost[] = s.posts.filter(p => inPeriod(p.created_time, from, to)).map(p => ({
    id: p.id, url: p.permalink_url ?? `https://www.facebook.com/${p.id}`, caption: caption(p.message), at: isoOf(p.created_time), thumbnail: p.full_picture ?? null,
    likes: num(p.reactions?.summary?.total_count), comments: num(p.comments?.summary?.total_count), shares: num(p.shares?.count) ?? 0,
  }))
  const views = s.insights.find(m => m.name === 'page_media_view')
  return {
    source: 'facebook', from, to, access: 'ok', account: s.page.name, profile_url: s.page.link ?? `https://www.facebook.com/${s.page.id}`,
    metrics: [
      { id: 'followers', kind: 'now', value: s.page.followers, change: total('page_daily_follows_unique') },
      { id: 'views', kind: 'period', value: total('page_media_view') },
      { id: 'reach', kind: 'period', value: total('page_total_media_view_unique') },
      { id: 'interactions', kind: 'period', value: total('page_post_engagements') },
      { id: 'page_views', kind: 'period', value: total('page_views_total') },
      { id: 'likes', kind: 'period', value: sum(posts.map(p => p.likes)) },
      { id: 'comments', kind: 'period', value: sum(posts.map(p => p.comments)) },
      { id: 'shares', kind: 'period', value: sum(posts.map(p => p.shares)) },
    ],
    chart: views ? { metric: 'views', days: fillDays(insightDays(views).filter(d => d.date >= from && d.date <= to), from, to) } : null,
    posts: best(posts, p => sum([p.likes, p.comments, p.shares])),
    post_columns: ['likes', 'comments', 'shares'],
  }
}

/** The page metrics read from Facebook (each asked on its own, so one Meta retires doesn't hide the rest). */
export const FACEBOOK_METRICS = ['page_media_view', 'page_total_media_view_unique', 'page_post_engagements', 'page_views_total', 'page_daily_follows_unique']

// ---- Shared --------------------------------------------------------------------------------

/** The top ten, by `score`. */
function best(posts: SocialPost[], score: (p: SocialPost) => number) {
  return [...posts].sort((a, b) => score(b) - score(a) || b.at.localeCompare(a.at)).slice(0, 10)
}

/**
 * A refusal that means "not allowed to read statistics" rather than "the connection is broken":
 * the page then asks to connect again with statistics allowed, and posting keeps working.
 */
export function statsRefused(source: SocialSource, message: string) {
  if (source === 'tiktok') return /scope_not_authorized|scope|not authori[sz]ed/i.test(message) && !/access_token_invalid/i.test(message)
  if (source === 'linkedin') return /Not enough permissions|ACCESS_DENIED|403|permission/i.test(message) && !/invalid_grant/i.test(message)
  return /\(#(?:10|200|230)\)|does not have permission|permissions? error|insufficient permission|requires .*insights|read_insights|manage_insights/i.test(message)
}
