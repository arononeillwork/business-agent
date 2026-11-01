// Facebook Pages, connected by the business with one click (Facebook Login): the owner signs in,
// allows posting, and picks the café's Page. We keep that Page's access token, which doesn't expire
// while the owner stays a Page admin. Uses the same Meta app as WhatsApp (docs/INTEGRATIONS.md).
// pages_messaging (the Page's Messenger chats, on the Messages page) came later: a connection made
// before it still posts, and the Messages page asks for one reconnect.
import type { InboxConversation } from '../../shared/messages'
import { photo, remembered, toInboxMessage, type RawMessage } from './instagram'
import type { FacebookStats, MetaInsight } from '../../shared/socialAnalytics'

export const FACEBOOK_SCOPES = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'pages_messaging']
// read_insights (the Page's statistics, on the Analytics page) came later still, and is optional the same way;
// asked for only once the Meta app has it (STATS_SCOPES, worker/connections.ts).
export const FACEBOOK_STATS_SCOPES = ['read_insights']

export interface FacebookOAuthConfig { appId: string; appSecret: string; redirectUri: string; graphVersion: string }
export interface FacebookPage { id: string; name: string; access_token: string; tasks?: string[] }

const GRAPH = (v: string) => `https://graph.facebook.com/${v}`

export function authUrl(cfg: FacebookOAuthConfig, state: string, stats = false) {
  const p = new URLSearchParams({ client_id: cfg.appId, redirect_uri: cfg.redirectUri, state, response_type: 'code', scope: [...FACEBOOK_SCOPES, ...(stats ? FACEBOOK_STATS_SCOPES : [])].join(',') })
  return `https://www.facebook.com/${cfg.graphVersion}/dialog/oauth?${p}`
}

/** A Graph API error; `code` is Meta's (10, 200 and 230 are missing permissions). */
export class FacebookError extends Error { constructor(message: string, readonly code?: number) { super(message) } }

async function graph<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string; code?: number } }
  if (!res.ok || json.error) throw new FacebookError(`Facebook: ${json.error?.message ?? res.status}`, json.error?.code)
  return json
}

/** Code → a long-lived sign-in for the owner, the permissions they allowed, and the Pages they manage (each with its token). */
export async function exchangeCode(cfg: FacebookOAuthConfig, code: string) {
  const short = await graph<{ access_token: string }>(`${GRAPH(cfg.graphVersion)}/oauth/access_token?${new URLSearchParams({
    client_id: cfg.appId, client_secret: cfg.appSecret, redirect_uri: cfg.redirectUri, code })}`)
  const long = await graph<{ access_token: string }>(`${GRAPH(cfg.graphVersion)}/oauth/access_token?${new URLSearchParams({
    grant_type: 'fb_exchange_token', client_id: cfg.appId, client_secret: cfg.appSecret, fb_exchange_token: short.access_token })}`)
  const auth = { headers: { authorization: `Bearer ${long.access_token}` } }
  const [perms, pages] = await Promise.all([
    graph<{ data: { permission: string; status: string }[] }>(`${GRAPH(cfg.graphVersion)}/me/permissions`, auth),
    graph<{ data: FacebookPage[] }>(`${GRAPH(cfg.graphVersion)}/me/accounts?fields=id,name,access_token,tasks&limit=100`, auth),
  ])
  return { granted: perms.data.filter(p => p.status === 'granted').map(p => p.permission), pages: pages.data }
}

/** The Page answers with this token (name and followers). */
export const page = (graphVersion: string, pageId: string, token: string) =>
  graph<{ id: string; name: string; followers_count?: number; fan_count?: number }>(`${GRAPH(graphVersion)}/${pageId}?fields=id,name,followers_count,fan_count`,
    { headers: { authorization: `Bearer ${token}` } })

/** Publish to the Page: a photo post when there's a photo, otherwise a text post. Returns the post's link. */
export async function publish(graphVersion: string, pageId: string, token: string, caption: string, imageUrl?: string | null) {
  const form = new URLSearchParams(imageUrl ? { url: imageUrl, caption } : { message: caption })
  const made = await graph<{ id: string; post_id?: string }>(`${GRAPH(graphVersion)}/${pageId}/${imageUrl ? 'photos' : 'feed'}`,
    { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form })
  return `https://www.facebook.com/${made.post_id ?? made.id}`
}

// ---------------------------------------------------------------------------------------------
// Messenger: the Page's chats, read live with the Page token (nothing is stored), on the Messages page.
// ---------------------------------------------------------------------------------------------

export interface PageAccess { graphVersion: string; pageId: string; token: string }

const MESSAGE_FIELDS = 'id,created_time,from,to,message,attachments{image_data,video_data,file_url,name,mime_type}'
interface RawPerson { id?: string; name?: string; email?: string }
interface RawChat { id: string; updated_time: string; participants?: { data?: RawPerson[] }; messages?: { data?: RawMessage[] } }

const asPage = (s: PageAccess) => ({ headers: { authorization: `Bearer ${s.token}` } })

/** Who a chat is with when Messenger doesn't give a name. */
const NO_NAME = 'Facebook user'

/** A Messenger chat as the Messages page shows it; Messenger has names, not @handles. */
function toChat(c: RawChat, s: PageAccess): InboxConversation {
  const people = c.participants?.data ?? []
  const other = people.find(p => p.id !== s.pageId) ?? people[0] ?? {}
  const name = other.name ?? NO_NAME
  return {
    id: c.id, platform: 'messenger', updatedAt: c.updated_time, with: { id: other.id ?? '', username: name, name },
    recent: (c.messages?.data ?? []).map(m => toInboxMessage(m, { id: s.pageId })).sort((a, b) => b.at.localeCompare(a.at)),
  }
}

/** A customer's name and profile photo, from Messenger's User Profile API (they must have messaged the Page). */
export interface Profile { name?: string; picture?: string }
export interface RawProfile { first_name?: string; last_name?: string; name?: string; profile_pic?: string }

/** What the User Profile API says, as the Messages page shows it: their full name, and their photo when it's a link the page can show. */
export function toProfile(p: RawProfile): Profile {
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name
  const picture = photo(p.profile_pic)
  return { ...(name ? { name } : {}), ...(picture ? { picture } : {}) }
}

/** Who a Page-scoped id is, with the Page token; looked up at most every few hours, and never throws. */
export async function profile(s: PageAccess, psid: string): Promise<Profile> {
  if (!psid) return {}
  return remembered<Profile>(`https://messenger-person.cache/${encodeURIComponent(s.pageId)}/${encodeURIComponent(psid)}`, async () =>
    toProfile(await graph<RawProfile>(`${GRAPH(s.graphVersion)}/${encodeURIComponent(psid)}?fields=first_name,last_name,profile_pic`, asPage(s))))
}

/** The chat's other person with their photo where Messenger shares it (and their name, when the chat had none). */
export async function withProfile(s: PageAccess, c: InboxConversation): Promise<InboxConversation> {
  const p = await profile(s, c.with.id)
  const name = c.with.name === NO_NAME && p.name ? p.name : c.with.name
  return { ...c, with: { ...c.with, ...(name ? { name, username: name } : {}), ...(p.picture ? { picture: p.picture } : {}) } }
}

/** The Page's latest Messenger chats, newest first, each with its latest few messages and the person's photo (none yet is an empty list). */
export async function conversations(s: PageAccess): Promise<InboxConversation[]> {
  const res = await graph<{ data?: RawChat[] }>(`${GRAPH(s.graphVersion)}/${s.pageId}/conversations?${new URLSearchParams({
    platform: 'messenger', limit: '25', fields: `id,updated_time,participants,messages.limit(5){${MESSAGE_FIELDS}}` })}`, asPage(s))
  const chats = await Promise.all((res.data ?? []).map(c => withProfile(s, toChat(c, s))))
  return chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** One chat with its 20 latest messages, oldest first. */
export async function conversation(s: PageAccess, id: string) {
  const c = await graph<RawChat>(`${GRAPH(s.graphVersion)}/${encodeURIComponent(id)}?${new URLSearchParams({
    fields: `id,updated_time,participants,messages.limit(20){${MESSAGE_FIELDS}}` })}`, asPage(s))
  const chat = await withProfile(s, toChat({ ...c, id }, s))
  return { conversation: { ...chat, recent: chat.recent.slice(0, 5) }, messages: [...chat.recent].reverse() }
}

/** Reply by text: within 24 hours of their last message a normal reply; up to 7 days with the HUMAN_AGENT tag. */
export async function sendText(s: PageAccess, to: string, text: string, tag?: 'HUMAN_AGENT') {
  const sent = await graph<{ message_id?: string }>(`${GRAPH(s.graphVersion)}/${s.pageId}/messages`, {
    method: 'POST', headers: { authorization: `Bearer ${s.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ recipient: { id: to }, messaging_type: tag ? 'MESSAGE_TAG' : 'RESPONSE', ...(tag ? { tag } : {}), message: { text } }),
  })
  return sent.message_id ?? null
}

// ---------------------------------------------------------------------------------------------
// Statistics: the Page's insights (read_insights) and its posts in a period, with the Page token (Analytics page).
// ---------------------------------------------------------------------------------------------

/** The Page's name, link and followers. */
export async function pageStats(s: PageAccess): Promise<FacebookStats['page']> {
  const p = await graph<{ id: string; name: string; link?: string; followers_count?: number; fan_count?: number }>(
    `${GRAPH(s.graphVersion)}/${s.pageId}?fields=id,name,link,followers_count,fan_count`, asPage(s))
  return { id: p.id, name: p.name, link: p.link ?? null, followers: p.followers_count ?? p.fan_count ?? null }
}

/** One Page metric day by day over since–until (Unix seconds, at most 93 days apart). */
export async function pageInsight(s: PageAccess, metric: string, since: number, until: number) {
  const r = await graph<{ data?: MetaInsight[] }>(`${GRAPH(s.graphVersion)}/${s.pageId}/insights?${new URLSearchParams({
    metric, period: 'day', since: String(since), until: String(until) })}`, asPage(s))
  return r.data?.find(m => m.name === metric) ?? null
}

/** The Page's posts over since–until, with their reactions, comments and shares (up to 50). */
export async function pagePosts(s: PageAccess, since: number, until: number) {
  const r = await graph<{ data?: FacebookStats['posts'] }>(`${GRAPH(s.graphVersion)}/${s.pageId}/posts?${new URLSearchParams({
    fields: 'id,message,created_time,permalink_url,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
    since: String(since), until: String(until), limit: '50' })}`, asPage(s))
  return r.data ?? []
}
