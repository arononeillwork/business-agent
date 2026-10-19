// LinkedIn, connected by the business with one click (Sign In with LinkedIn using OpenID Connect,
// Share on LinkedIn, and for company Pages the Community Management API): the owner signs in and
// allows posting, then picks the café's Page or their own profile. Posts go through the Posts API.
// Access lasts 60 days; only apps LinkedIn has approved for it get refresh tokens, so most
// businesses connect again every two months (the app warns a week before). docs/INTEGRATIONS.md.
const OAUTH = 'https://www.linkedin.com/oauth/v2'
const API = 'https://api.linkedin.com'

/** Posting as the person who signed in. */
export const MEMBER_SCOPES = ['openid', 'profile', 'w_member_social']
/** Posting to the company Pages they administer (needs the Community Management API on the app). */
export const PAGE_SCOPES = ['r_organization_admin', 'w_organization_social']

export interface LinkedInOAuthConfig {
  clientId: string; clientSecret: string; redirectUri: string
  /** Ask for company Pages too (off when the app doesn't have the Community Management API yet). */
  pages: boolean
  /** The Posts API version (YYYYMM); LinkedIn keeps each one for about a year. */
  version: string
}

export const scopesOf = (cfg: Pick<LinkedInOAuthConfig, 'pages'>) => [...MEMBER_SCOPES, ...(cfg.pages ? PAGE_SCOPES : [])]

export function authUrl(cfg: LinkedInOAuthConfig, state: string) {
  const p = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, redirect_uri: cfg.redirectUri, state, scope: scopesOf(cfg).join(' ') })
  return `${OAUTH}/authorization?${p}`
}

export interface LinkedInToken { access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string; error?: string; error_description?: string }

async function token(body: Record<string, string>) {
  const res = await fetch(`${OAUTH}/accessToken`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) })
  const json = await res.json().catch(() => ({})) as LinkedInToken
  if (!res.ok || !json.access_token) {
    throw new Error(json.error === 'invalid_grant' || (json.error === 'invalid_request' && /expired|revoked/i.test(json.error_description ?? ''))
      ? `invalid_grant: ${json.error_description ?? 'access revoked or expired'}` : `LinkedIn: ${json.error_description ?? json.error ?? res.status}`)
  }
  return json
}

export const exchangeCode = (cfg: LinkedInOAuthConfig, code: string) =>
  token({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret })
/** Only for apps LinkedIn has approved for refresh tokens. */
export const refreshAccess = (cfg: LinkedInOAuthConfig, refreshToken: string) =>
  token({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret })

/** What the person allowed: LinkedIn lists the scopes with commas (older answers: spaces). */
export const granted = (scope: string | undefined) => scope === undefined ? undefined : scope.split(/[,\s]+/).filter(Boolean)

async function call(version: string, accessToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: {
    authorization: `Bearer ${accessToken}`, 'LinkedIn-Version': version, 'X-Restli-Protocol-Version': '2.0.0', ...init.headers } })
  if (!res.ok) {
    const json = await res.json().catch(() => ({})) as { message?: string; code?: string; serviceErrorCode?: number }
    const said = json.message ?? json.code ?? String(res.status)
    // 401: revoked in LinkedIn's settings, or the 60 days are up.
    throw new Error(res.status === 401 ? `invalid_grant: LinkedIn: ${said}` : `LinkedIn: ${said}`)
  }
  return res
}
const api = async <T>(version: string, accessToken: string, path: string) => (await call(version, accessToken, path)).json() as Promise<T>

export interface LinkedInMember { id: string; name: string }
export interface LinkedInPage { id: string; name: string }

/** Who signed in (OpenID Connect userinfo): the member id is the `sub`. */
export async function member(version: string, accessToken: string): Promise<LinkedInMember> {
  const u = await api<{ sub: string; name?: string; given_name?: string; family_name?: string }>(version, accessToken, '/v2/userinfo')
  return { id: u.sub, name: u.name || [u.given_name, u.family_name].filter(Boolean).join(' ') || u.sub }
}

/** A company Page by id (its name; answering at all proves the access still works). */
export async function page(version: string, accessToken: string, id: string): Promise<LinkedInPage> {
  const o = await api<{ id: number | string; localizedName?: string; vanityName?: string }>(version, accessToken, `/rest/organizations/${encodeURIComponent(id)}`)
  return { id: String(o.id), name: o.localizedName ?? o.vanityName ?? `Page ${id}` }
}

/** The company Pages this person is an approved administrator of. */
export async function pages(version: string, accessToken: string): Promise<LinkedInPage[]> {
  const acl = await api<{ elements?: { organization?: string; organizationTarget?: string; state?: string }[] }>(version, accessToken,
    '/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100')
  const ids = [...new Set((acl.elements ?? []).map(e => (e.organization ?? e.organizationTarget ?? '').match(/urn:li:organization:(\d+)/)?.[1]).filter((x): x is string => !!x))]
  return Promise.all(ids.map(id => page(version, accessToken, id)))
}

/** Who a post is from: a company Page, or the person ('me'). */
export const authorUrn = (pageId: string, memberId: string) => pageId === 'me' ? `urn:li:person:${memberId}` : `urn:li:organization:${pageId}`

/**
 * Post text in LinkedIn's "little text" format: its reserved characters are escaped (otherwise the
 * text after a bracket or an @ can go missing) and #hashtags become real hashtags.
 */
export function littleText(text: string) {
  const esc = (s: string) => s.replace(/[\\|{}@[\]()<>#*_~]/g, c => `\\${c}`)
  return text.split(/(#[\p{L}\p{N}_]+)/u).map((part, i) => (i % 2 ? `{hashtag|\\#|${esc(part.slice(1))}}` : esc(part))).join('')
}

/** Upload a photo for a post (Images API: ask for an upload address, then PUT the bytes). Returns its urn:li:image. */
export async function uploadImage(version: string, accessToken: string, owner: string, image: { bytes: ArrayBuffer; type: string }) {
  const init = await (await call(version, accessToken, '/rest/images?action=initializeUpload', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initializeUploadRequest: { owner } }),
  })).json() as { value: { uploadUrl: string; image: string } }
  const put = await fetch(init.value.uploadUrl, { method: 'PUT', headers: { authorization: `Bearer ${accessToken}`, 'content-type': image.type }, body: image.bytes })
  if (!put.ok) throw new Error(`LinkedIn: the photo upload failed (${put.status})`)
  return init.value.image
}

/** Publish a post (text, and a photo when there is one) to the feed. Returns the post's link. */
export async function publish(version: string, accessToken: string, author: string, text: string, image?: { bytes: ArrayBuffer; type: string } | null) {
  const media = image ? await uploadImage(version, accessToken, author, image) : null
  const res = await call(version, accessToken, '/rest/posts', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      author, commentary: littleText(text), visibility: 'PUBLIC', lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(media ? { content: { media: { id: media } } } : {}),
    }),
  })
  // The new post's urn (urn:li:share:… or urn:li:ugcPost:…) comes back in a header.
  const urn = res.headers.get('x-restli-id') ?? res.headers.get('x-linkedin-id')
  if (!urn) throw new Error('LinkedIn: the post was accepted but no id came back')
  return `https://www.linkedin.com/feed/update/${urn}`
}
