// Instagram (professional account), connected by the business itself with one click: "Instagram API
// with Instagram Login". The owner signs in on instagram.com and allows access; we keep a long-lived
// token (60 days) and renew it every night, long before it runs out. Setup: docs/INTEGRATIONS.md.
export const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish']

export interface InstagramOAuthConfig { appId: string; appSecret: string; redirectUri: string }
/** A connected account: its token and Instagram user id. */
export interface InstagramConfig { token: string; userId: string; graphVersion: string }

export function authUrl(cfg: InstagramOAuthConfig, state: string) {
  const p = new URLSearchParams({
    client_id: cfg.appId, redirect_uri: cfg.redirectUri, response_type: 'code', scope: INSTAGRAM_SCOPES.join(','), state,
    enable_fb_login: '0', force_authentication: '1',
  })
  return `https://www.instagram.com/oauth/authorize?${p}`
}

const said = (json: { error_message?: string; error?: { message?: string } | string; error_description?: string }, fallback: string) =>
  json.error_message ?? (typeof json.error === 'object' ? json.error?.message : json.error_description ?? json.error) ?? fallback

/** Code → short-lived token → long-lived token (60 days). Returns the permissions actually granted. */
export async function exchangeCode(cfg: InstagramOAuthConfig, code: string) {
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, grant_type: 'authorization_code', redirect_uri: cfg.redirectUri, code }),
  })
  const raw = await res.json() as { data?: { access_token: string; user_id: string | number; permissions?: string }[]; access_token?: string; user_id?: string | number; permissions?: string | string[] } & Parameters<typeof said>[0]
  const short = raw.data?.[0] ?? raw
  if (!res.ok || !short.access_token) throw new Error(said(raw, 'Instagram sign-in failed'))
  const long = await tokenCall(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: cfg.appSecret, access_token: short.access_token })}`)
  const permissions = Array.isArray(short.permissions) ? short.permissions.join(',') : short.permissions
  return { ...long, userId: String(short.user_id), permissions }
}

async function tokenCall(url: string) {
  const res = await fetch(url)
  const json = await res.json() as { access_token?: string; expires_in?: number } & Parameters<typeof said>[0]
  if (!res.ok || !json.access_token) throw new Error(said(json, 'Instagram sign-in failed'))
  return { access_token: json.access_token, expires_at: new Date(Date.now() + (json.expires_in ?? 60 * 86_400) * 1000).toISOString() }
}

/** A fresh 60-day token (the current one must still be valid and at least a day old). */
export const refreshToken = (token: string) =>
  tokenCall(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })}`)

async function graph<T>(cfg: InstagramConfig, path: string, init: RequestInit = {}): Promise<T> {
  const url = `https://graph.instagram.com/${cfg.graphVersion}/${path}`
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${cfg.token}`, ...init.headers } })
  const json = await res.json() as T & { error?: { message: string } }
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Instagram error ${res.status}`)
  return json
}

export interface InstagramProfile {
  username: string; name?: string; followers_count: number; follows_count?: number; media_count: number
  profile_picture_url?: string; biography?: string; website?: string
  recent: { id: string; caption?: string; media_url?: string; thumbnail_url?: string; permalink: string; timestamp: string; like_count?: number; comments_count?: number }[]
}

/** The account: username, counts and its latest posts. */
export async function profile(cfg: InstagramConfig): Promise<InstagramProfile> {
  const p = await graph<Omit<InstagramProfile, 'recent'> & { account_type?: string }>(cfg,
    'me?fields=user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count')
  const media = await graph<{ data: InstagramProfile['recent'] }>(cfg,
    'me/media?fields=id,caption,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=6')
  return { ...p, recent: media.data }
}

/** Publish a photo post: create a media container, then publish it. Returns the media id. */
export async function publishPhoto(cfg: InstagramConfig, imageUrl: string, caption: string) {
  const form = (o: Record<string, string>) => ({ method: 'POST', body: new URLSearchParams(o) })
  const container = await graph<{ id: string }>(cfg, `${cfg.userId}/media`, form({ image_url: imageUrl, caption: caption.slice(0, 2200) }))
  const published = await graph<{ id: string }>(cfg, `${cfg.userId}/media_publish`, form({ creation_id: container.id }))
  // The post's link, for the planner (falls back to the id if Instagram doesn't say).
  const made = await graph<{ permalink?: string }>(cfg, `${published.id}?fields=permalink`).catch(() => ({ permalink: undefined }))
  return made.permalink ?? published.id
}
