// Facebook Pages, connected by the business with one click (Facebook Login): the owner signs in,
// allows posting, and picks the café's Page. We keep that Page's access token, which doesn't expire
// while the owner stays a Page admin. Uses the same Meta app as WhatsApp (docs/INTEGRATIONS.md).
export const FACEBOOK_SCOPES = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement']

export interface FacebookOAuthConfig { appId: string; appSecret: string; redirectUri: string; graphVersion: string }
export interface FacebookPage { id: string; name: string; access_token: string; tasks?: string[] }

const GRAPH = (v: string) => `https://graph.facebook.com/${v}`

export function authUrl(cfg: FacebookOAuthConfig, state: string) {
  const p = new URLSearchParams({ client_id: cfg.appId, redirect_uri: cfg.redirectUri, state, response_type: 'code', scope: FACEBOOK_SCOPES.join(',') })
  return `https://www.facebook.com/${cfg.graphVersion}/dialog/oauth?${p}`
}

async function graph<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string; code?: number } }
  if (!res.ok || json.error) throw new Error(`Facebook: ${json.error?.message ?? res.status}`)
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
