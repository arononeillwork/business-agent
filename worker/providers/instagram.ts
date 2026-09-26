// Instagram (professional account linked to a Facebook Page), via the Meta Graph API.
export interface InstagramConfig { token: string; userId: string; graphVersion: string }

async function graph<T>(cfg: InstagramConfig, path: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${cfg.graphVersion}/${path}`)
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

export async function profile(cfg: InstagramConfig): Promise<InstagramProfile> {
  const p = await graph<Omit<InstagramProfile, 'recent'>>(cfg,
    `${cfg.userId}?fields=username,name,followers_count,follows_count,media_count,profile_picture_url,biography,website`)
  const media = await graph<{ data: InstagramProfile['recent'] }>(cfg,
    `${cfg.userId}/media?fields=id,caption,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=6`)
  return { ...p, recent: media.data }
}

/** Publish a photo post: create a media container, then publish it. Returns the media id. */
export async function publishPhoto(cfg: InstagramConfig, imageUrl: string, caption: string) {
  const form = (o: Record<string, string>) => ({ method: 'POST', body: new URLSearchParams(o) })
  const container = await graph<{ id: string }>(cfg, `${cfg.userId}/media`, form({ image_url: imageUrl, caption: caption.slice(0, 2200) }))
  const published = await graph<{ id: string }>(cfg, `${cfg.userId}/media_publish`, form({ creation_id: container.id }))
  return published.id
}
