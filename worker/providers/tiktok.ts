// TikTok, connected by the business with one click (Login Kit): the owner signs in and allows
// posting. Photo posts go through the Content Posting API; TikTok fetches the photo from our own
// domain (verified once in the TikTok developer portal). Until TikTok audits the app, posts can only
// be private to the account (docs/INTEGRATIONS.md).
import type { TikTokUserStats, TikTokVideo } from '../../shared/socialAnalytics'

/** Statistics for the Analytics page (Login Kit / Display API): followers and likes, and each video's counts. */
export const STATS_SCOPES = ['user.info.stats', 'video.list']
export const TIKTOK_SCOPES = ['user.info.basic', 'video.publish', ...STATS_SCOPES]
const API = 'https://open.tiktokapis.com/v2'

export interface TikTokOAuthConfig { clientKey: string; clientSecret: string; redirectUri: string }

export function authUrl(cfg: TikTokOAuthConfig, state: string) {
  const p = new URLSearchParams({ client_key: cfg.clientKey, response_type: 'code', scope: TIKTOK_SCOPES.join(','), redirect_uri: cfg.redirectUri, state })
  return `https://www.tiktok.com/v2/auth/authorize/?${p}`
}

interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; open_id?: string; scope?: string; error?: string; error_description?: string }

async function token(body: Record<string, string>) {
  const res = await fetch(`${API}/oauth/token/`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) })
  const json = await res.json().catch(() => ({})) as TokenResponse
  if (!res.ok || !json.access_token) {
    throw new Error(json.error === 'invalid_grant' ? `invalid_grant: ${json.error_description ?? 'access revoked or expired'}` : `TikTok: ${json.error_description ?? json.error ?? res.status}`)
  }
  return json
}

export const exchangeCode = (cfg: TikTokOAuthConfig, code: string) =>
  token({ client_key: cfg.clientKey, client_secret: cfg.clientSecret, code, grant_type: 'authorization_code', redirect_uri: cfg.redirectUri })
export const refreshAccess = (cfg: TikTokOAuthConfig, refreshToken: string) =>
  token({ client_key: cfg.clientKey, client_secret: cfg.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken })

async function api<T>(accessToken: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { 'content-type': 'application/json; charset=UTF-8' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = await res.json().catch(() => ({})) as { data?: T; error?: { code?: string; message?: string } }
  if (!res.ok || (json.error?.code && json.error.code !== 'ok')) throw new Error(`TikTok: ${json.error?.message || json.error?.code || res.status}`)
  return json.data as T
}

export const user = async (accessToken: string) =>
  (await api<{ user: { open_id: string; display_name?: string; avatar_url?: string } }>(accessToken, '/user/info/?fields=open_id,display_name,avatar_url')).user

export interface CreatorInfo { creator_username?: string; creator_nickname?: string; privacy_level_options: string[]; max_video_post_duration_sec?: number }
/** What this account may post right now (TikTok asks apps to check before every post). */
export const creatorInfo = (accessToken: string) => api<CreatorInfo>(accessToken, '/post/publish/creator_info/query/', {})

/**
 * Publish a photo post. Public when the account allows it; private (only the account sees it) while
 * TikTok hasn't audited the app. Waits briefly for TikTok to confirm; returns the post link or id.
 */
export async function publishPhoto(accessToken: string, caption: string, imageUrl: string, { waitMs = 2500, tries = 4 } = {}) {
  const info = await creatorInfo(accessToken)
  const privacy = info.privacy_level_options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : info.privacy_level_options[0] ?? 'SELF_ONLY'
  const { publish_id } = await api<{ publish_id: string }>(accessToken, '/post/publish/content/init/', {
    post_info: { title: caption.split('\n')[0].slice(0, 90), description: caption.slice(0, 4000), privacy_level: privacy, disable_comment: false, auto_add_music: true },
    source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: [imageUrl] },
    post_mode: 'DIRECT_POST', media_type: 'PHOTO',
  })
  for (let i = 0; i < tries; i++) {
    await new Promise(r => setTimeout(r, waitMs))
    const res = await fetch(`${API}/post/publish/status/fetch/`, {
      method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ publish_id }),
    })
    // Read the raw text too: post ids are 19-digit numbers, which JSON parsing would round.
    const text = await res.text()
    const json = JSON.parse(text) as { data?: { status: string; fail_reason?: string }; error?: { code?: string; message?: string } }
    if (!res.ok || (json.error?.code && json.error.code !== 'ok')) throw new Error(`TikTok: ${json.error?.message || json.error?.code || res.status}`)
    if (json.data?.status === 'FAILED') throw new Error(`TikTok: ${json.data.fail_reason ?? 'the post failed'}`)
    if (json.data?.status === 'PUBLISH_COMPLETE') {
      const id = text.match(/"publicaly_available_post_id"\s*:\s*\[\s*"?(\d+)/)?.[1]
      return id && info.creator_username ? `https://www.tiktok.com/@${info.creator_username}/photo/${id}` : publish_id
    }
  }
  return publish_id // still processing on TikTok's side; it finishes by itself
}

// ---- Statistics (Analytics page) ---------------------------------------------------------------
// TikTok has no history: followers and likes as they stand, and each video's counts so far.

/** Like api(), keeping TikTok's error code in the message ("scope_not_authorized": statistics weren't allowed). */
async function stats<T>(accessToken: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { 'content-type': 'application/json; charset=UTF-8' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = await res.json().catch(() => ({})) as { data?: T; error?: { code?: string; message?: string } }
  if (!res.ok || (json.error?.code && json.error.code !== 'ok')) {
    throw new Error(`TikTok: ${[json.error?.code, json.error?.message].filter(Boolean).join(': ') || res.status}`)
  }
  return json.data as T
}

/** Followers, following, likes on all videos and how many videos (user.info.stats). */
export const userStats = async (accessToken: string) =>
  (await stats<{ user: TikTokUserStats }>(accessToken, '/user/info/?fields=open_id,display_name,follower_count,following_count,likes_count,video_count')).user

const VIDEO_FIELDS = 'id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count'

/** The account's videos posted since `since` (Unix seconds), newest first (video.list): up to ten pages of 20. */
export async function videosSince(accessToken: string, since: number, pages = 10) {
  const out: TikTokVideo[] = []
  let cursor: number | undefined
  for (let i = 0; i < pages; i++) {
    const r = await stats<{ videos?: TikTokVideo[]; cursor?: number; has_more?: boolean }>(accessToken, `/video/list/?fields=${VIDEO_FIELDS}`,
      { max_count: 20, ...(cursor !== undefined ? { cursor } : {}) })
    const videos = r.videos ?? []
    out.push(...videos)
    if (!r.has_more || !videos.length || videos[videos.length - 1].create_time < since) break
    cursor = r.cursor
  }
  return out
}
