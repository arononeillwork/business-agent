import type { InboxConversation, InboxMessage, MessageKind, TaggedPost } from '../../shared/messages'
import type { PostKind, PostMedia } from '../../shared/types'

// Instagram (professional account), connected by the business itself with one click: "Instagram API
// with Instagram Login". The owner signs in on instagram.com and allows access; we keep a long-lived
// token (60 days) and renew it every night, long before it runs out. Setup: docs/INTEGRATIONS.md.
// Messages (Messages page) and comments (posts the business is tagged in) are asked for too; posting
// alone is what "connected" needs, so an account that declines them still connects.
export const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish',
  'instagram_business_manage_messages', 'instagram_business_manage_comments']

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
  /** The professional account's id: the one posting and messages use. */
  user_id?: string
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

/**
 * The professional account's id, as Instagram says it. The id that comes with the token isn't
 * always the one posting takes (and arrives as a number too long for JavaScript to keep exactly):
 * posting to it fails with "Object with ID … does not exist". Older connections still have it stored.
 */
export async function accountId(cfg: InstagramConfig) {
  const me = await graph<{ user_id?: string | number }>(cfg, 'me?fields=user_id')
  return me.user_id ? String(me.user_id) : cfg.userId
}

/** How long to wait for Instagram to finish with a video (tests set it to nothing). */
export interface PublishWait { waitMs?: number; tries?: number }

/**
 * Wait until Instagram has fetched and processed a container: photos are ready at once, videos
 * take a while. Throws when Instagram couldn't use the file, or is still busy after ~3 minutes
 * (the post is tried again later).
 */
async function ready(cfg: InstagramConfig, id: string, wait: PublishWait) {
  const tries = wait.tries ?? 36
  for (let i = 0; i < tries; i++) {
    const s = await graph<{ status_code?: string; status?: string }>(cfg, `${id}?fields=status_code,status`)
    if (!s.status_code || s.status_code === 'FINISHED' || s.status_code === 'PUBLISHED') return
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
      throw new Error(`Instagram couldn’t use the photo or video${s.status ? ` (${s.status})` : ''}. Check it’s a JPEG photo, or an MP4/MOV video Instagram accepts.`)
    }
    if (i < tries - 1) await new Promise(r => setTimeout(r, wait.waitMs ?? 5000))
  }
  throw new Error('Instagram is still processing the video. It will be tried again shortly.')
}

/**
 * Publish a post, carousel, reel or story: one container per photo/video (a carousel's go inside
 * its own), wait until Instagram has processed them, then publish. Returns the post's link (or id).
 */
export async function publish(cfg: InstagramConfig, post: { kind: PostKind; media: PostMedia[]; caption: string }, wait: PublishWait = {}) {
  const form = (o: Record<string, string>) => ({ method: 'POST', body: new URLSearchParams(o) })
  const userId = await accountId(cfg)
  const make = async (o: Record<string, string>) => (await graph<{ id: string }>(cfg, `${userId}/media`, form(o))).id
  const file = (m: PostMedia): Record<string, string> => (m.type === 'video' ? { video_url: m.url } : { image_url: m.url })
  const first = post.media[0]
  if (!first) throw new Error('Instagram posts need a photo or video')
  const caption = post.caption.slice(0, 2200)
  let container: string
  if (post.kind === 'carousel') {
    const children: string[] = []
    for (const m of post.media.slice(0, 10)) children.push(await make({ is_carousel_item: 'true', ...(m.type === 'video' ? { media_type: 'VIDEO' } : {}), ...file(m) }))
    for (const id of children) await ready(cfg, id, wait)
    container = await make({ media_type: 'CAROUSEL', children: children.join(','), caption })
  } else if (post.kind === 'reel') {
    container = await make({ media_type: 'REELS', video_url: first.url, caption, share_to_feed: 'true' })
  } else if (post.kind === 'story') {
    container = await make({ media_type: 'STORIES', ...file(first) })
  } else {
    container = await make({ image_url: first.url, caption })
  }
  await ready(cfg, container, wait)
  const published = await graph<{ id: string }>(cfg, `${userId}/media_publish`, form({ creation_id: container }))
  // The post's link, for the planner (falls back to the id if Instagram doesn't say).
  const made = await graph<{ permalink?: string }>(cfg, `${published.id}?fields=permalink`).catch(() => ({ permalink: undefined }))
  return made.permalink ?? published.id
}

/** Publish a photo post. Returns its link (or id). */
export const publishPhoto = (cfg: InstagramConfig, imageUrl: string, caption: string, wait: PublishWait = {}) =>
  publish(cfg, { kind: 'post', media: [{ url: imageUrl, type: 'image' }], caption }, wait)

// ---- Direct messages (Messages page) ----------------------------------------------------------
// Instagram's Conversations API: conversations and their 20 latest messages, replies by text within
// 24 hours of the customer's last message (7 days with the human agent tag). Folders
// (Primary/General/Requests) aren't shared.

/** Who "we" are in a chat: the account's Instagram id and username. */
export interface Me { id: string; username?: string }

const FIELDS = 'id,created_time,from,to,message,attachments{image_data,video_data,file_url,name},story,shares{name,description,type,url,id},reactions,is_unsupported'
// If Instagram refuses one of the detailed fields, ask again for the plain ones.
const PLAIN_FIELDS = 'id,created_time,from,to,message,attachments,story,shares'

interface RawUser { id?: string; username?: string; name?: string }
interface RawMedia { url?: string; preview_url?: string }
export interface RawMessage {
  id: string; created_time: string; from?: RawUser; message?: string; is_unsupported?: boolean
  attachments?: { data?: { image_data?: RawMedia; video_data?: RawMedia; file_url?: string; name?: string; mime_type?: string }[] }
  story?: unknown
  shares?: { data?: { url?: string; link?: string; name?: string; description?: string; type?: string; id?: string; image_url?: string }[] }
  reactions?: { data?: { reaction?: string; emoji?: string }[] }
}
interface RawConversation { id: string; updated_time: string; participants?: { data?: RawUser[] }; messages?: { data?: RawMessage[] } }

/** Story mention or story reply, in either shape Instagram uses ({mention: …} or a list of typed items). */
function storyOf(story: unknown): { kind: 'story_mention' | 'story_reply'; link?: string } | null {
  if (!story || typeof story !== 'object') return null
  const items = Array.isArray(story) ? story : (story as { data?: unknown[] }).data ?? [story]
  for (const it of items as Record<string, { link?: string; url?: string } | string | undefined>[]) {
    const mention = it.mention as { link?: string; url?: string } | undefined
    const reply = it.reply_to as { link?: string; url?: string } | undefined
    if (mention) return { kind: 'story_mention', link: mention.link ?? mention.url }
    if (reply) return { kind: 'story_reply', link: reply.link ?? reply.url }
    const type = String(it.type ?? '').toLowerCase()
    if (type.includes('mention')) return { kind: 'story_mention', link: (it.link ?? it.url) as string | undefined }
    if (type.includes('reply')) return { kind: 'story_reply', link: (it.link ?? it.url) as string | undefined }
  }
  return null
}

/** One Instagram message, as the Messages page shows it. */
export function toInboxMessage(m: RawMessage, me: Me): InboxMessage {
  const fromMe = !!m.from && (m.from.id === me.id || (!!me.username && m.from.username === me.username))
  const base = { id: m.id, at: m.created_time, fromMe, text: m.message ?? '' }
  const reactions = (m.reactions?.data ?? []).map(r => r.emoji ?? r.reaction ?? '').filter(Boolean)
  const extra = reactions.length ? { reactions } : {}
  if (m.is_unsupported) return { ...base, kind: 'unsupported', ...extra }
  const story = storyOf(m.story)
  if (story) return { ...base, kind: story.kind, mediaUrl: story.link, ...extra }
  const share = m.shares?.data?.[0]
  if (share) return { ...base, kind: 'share', link: share.url ?? share.link, mediaUrl: share.image_url, text: base.text || share.name || share.description || '', ...extra }
  const a = m.attachments?.data?.[0]
  if (a) {
    const kind: MessageKind = a.video_data ? 'video' : a.image_data ? 'image' : /audio/.test(a.mime_type ?? '') ? 'audio' : 'file'
    return { ...base, kind, mediaUrl: a.video_data?.preview_url ?? a.video_data?.url ?? a.image_data?.url ?? a.image_data?.preview_url ?? a.file_url, ...extra }
  }
  return { ...base, kind: 'text', ...extra }
}

function toConversation(c: RawConversation, me: Me): InboxConversation {
  const people = c.participants?.data ?? []
  const other = people.find(p => p.id !== me.id && (!me.username || p.username !== me.username)) ?? people[0] ?? {}
  return {
    id: c.id, platform: 'instagram', updatedAt: c.updated_time,
    with: { id: other.id ?? '', username: other.username ?? 'instagram user', ...(other.name ? { name: other.name } : {}) },
    recent: (c.messages?.data ?? []).map(m => toInboxMessage(m, me)).sort((a, b) => b.at.localeCompare(a.at)),
  }
}

const detailed = <T>(cfg: InstagramConfig, path: (fields: string) => string) =>
  graph<T>(cfg, path(FIELDS)).catch(e => (/field|param/i.test(String(e)) ? graph<T>(cfg, path(PLAIN_FIELDS)) : Promise.reject(e)))

/** A customer's name and profile photo (Instagram's User Profile API; they must have messaged the business). */
export interface Person { name?: string; username?: string; picture?: string }

const PERSON_TTL_S = 6 * 3600
// Workers' cache (absent in tests and local Node): profile photos are links that last a few days, so
// each person is looked up at most every 6 hours rather than on every inbox refresh.
const edgeCache = () => (globalThis as { caches?: { default?: Cache } }).caches?.default

/** Who an Instagram-scoped id is; never throws (no photo is better than no inbox). */
export async function person(cfg: InstagramConfig, igsid: string): Promise<Person> {
  if (!igsid) return {}
  const cache = edgeCache()
  const key = `https://instagram-person.cache/${encodeURIComponent(cfg.userId)}/${encodeURIComponent(igsid)}`
  const hit = await cache?.match(key).catch(() => undefined)
  if (hit) return hit.json() as Promise<Person>
  let found: Person = {}
  let ttl = PERSON_TTL_S
  try {
    const p = await graph<{ name?: string; username?: string; profile_pic?: string }>(cfg, `${encodeURIComponent(igsid)}?fields=name,username,profile_pic`)
    found = { ...(p.name ? { name: p.name } : {}), ...(p.username ? { username: p.username } : {}), ...(p.profile_pic ? { picture: p.profile_pic } : {}) }
  } catch {
    ttl = 3600 // blocked us, or Instagram is busy: try again in an hour
  }
  await cache?.put(key, new Response(JSON.stringify(found), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttl}` } })).catch(() => {})
  return found
}

/** The chat's other person with their name and photo filled in where Instagram shares them. */
async function withPerson(cfg: InstagramConfig, c: InboxConversation): Promise<InboxConversation> {
  const p = await person(cfg, c.with.id)
  const name = p.name ?? c.with.name
  return { ...c, with: { id: c.with.id, username: p.username ?? c.with.username, ...(name ? { name } : {}), ...(p.picture ? { picture: p.picture } : {}) } }
}

/** The latest chats, newest first, each with its latest few messages. */
export async function conversations(cfg: InstagramConfig, me: Me): Promise<InboxConversation[]> {
  const res = await detailed<{ data: RawConversation[] }>(cfg,
    f => `me/conversations?platform=instagram&limit=25&fields=id,updated_time,participants,messages.limit(5){${f}}`)
  const chats = await Promise.all(res.data.map(c => withPerson(cfg, toConversation(c, me))))
  return chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** One chat with its 20 latest messages (all Instagram shares), oldest first. */
export async function conversation(cfg: InstagramConfig, me: Me, id: string) {
  const c = await detailed<RawConversation>(cfg, f => `${encodeURIComponent(id)}?fields=id,updated_time,participants,messages.limit(20){${f}}`)
  const chat = await withPerson(cfg, toConversation({ ...c, id }, me))
  return { conversation: { ...chat, recent: chat.recent.slice(0, 5) }, messages: [...chat.recent].reverse() }
}

/**
 * Reply by text. Within 24 hours of the customer's last message it goes as a normal reply; up to 7
 * days, a person replying sends it with the HUMAN_AGENT tag (the Meta app needs the Human Agent feature).
 */
export async function sendText(cfg: InstagramConfig, to: string, text: string, tag?: 'HUMAN_AGENT') {
  const sent = await graph<{ message_id?: string }>(cfg, 'me/messages', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recipient: { id: to }, message: { text }, ...(tag ? { messaging_type: 'MESSAGE_TAG', tag } : {}) }),
  })
  return sent.message_id ?? null
}

/** Posts other accounts tagged the business in. */
export async function tagged(cfg: InstagramConfig): Promise<TaggedPost[]> {
  const res = await graph<{ data: { id: string; username?: string; caption?: string; media_url?: string; thumbnail_url?: string; permalink: string; timestamp: string }[] }>(cfg,
    'me/tags?fields=id,username,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12')
  return res.data.map(p => ({ id: p.id, username: p.username, caption: p.caption, mediaUrl: p.thumbnail_url ?? p.media_url, permalink: p.permalink, at: p.timestamp }))
}
