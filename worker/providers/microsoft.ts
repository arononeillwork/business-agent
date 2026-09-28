// Microsoft 365 / Outlook.com: send email from the café's mailbox (Outlook) and save files to its
// OneDrive (personal or work). OAuth 2.0 with offline access through the Microsoft identity platform.
export interface MicrosoftOAuthConfig { clientId: string; clientSecret: string; redirectUri: string }

export const MS_SCOPES = {
  outlook: ['offline_access', 'openid', 'email', 'User.Read', 'Mail.Send'],
  onedrive: ['offline_access', 'openid', 'email', 'User.Read', 'Files.ReadWrite'],
} as const

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0'
const GRAPH = 'https://graph.microsoft.com/v1.0'

export function authUrl(cfg: MicrosoftOAuthConfig, state: string, scopes: readonly string[]) {
  const p = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', response_mode: 'query',
    scope: scopes.join(' '), state, prompt: 'select_account',
  })
  return `${AUTHORITY}/authorize?${p}`
}

async function tokenRequest(cfg: MicrosoftOAuthConfig, body: Record<string, string>) {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, ...body }),
  })
  // `scope`: what was actually granted (a work account's admin can block some permissions).
  const json = await res.json() as { access_token?: string; refresh_token?: string; scope?: string; error_description?: string; error?: string }
  if (!res.ok || !json.access_token) {
    const said = (json.error_description ?? 'Microsoft sign-in failed').split('\r\n')[0]
    throw new Error(json.error === 'invalid_grant' ? `invalid_grant: ${said}` : said)
  }
  return json
}

export const exchangeCode = (cfg: MicrosoftOAuthConfig, code: string) => tokenRequest(cfg, { grant_type: 'authorization_code', code })
export const refreshAccess = (cfg: MicrosoftOAuthConfig, refreshToken: string) => tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken })

async function graph<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Microsoft: ${err.error?.message ?? res.status}`)
  }
  return (res.status === 202 || res.status === 204 ? {} : await res.json()) as T
}

/** The signed-in mailbox, for the Connections page. */
export const me = (token: string) => graph<{ mail?: string; userPrincipalName?: string; displayName?: string }>(token, '/me')

export async function sendMail(token: string, m: { to: string; subject: string; text: string }) {
  await graph(token, '/me/sendMail', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: { subject: m.subject, body: { contentType: 'Text', content: m.text }, toRecipients: [{ emailAddress: { address: m.to } }] }, saveToSentItems: true }),
  })
}

/** The app's "Business Agent" folder in OneDrive (created if missing); returns its id. */
export async function ensureFolder(token: string) {
  const res = await fetch(`${GRAPH}/me/drive/root:/Business%20Agent`, { headers: { authorization: `Bearer ${token}` } })
  if (res.ok) return ((await res.json()) as { id: string }).id
  if (res.status !== 404) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string; code?: string } }
    throw new Error(`Microsoft: ${err.error?.message ?? err.error?.code ?? res.status}`)
  }
  const made = await graph<{ id: string }>(token, '/me/drive/root/children', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Business Agent', folder: {}, '@microsoft.graph.conflictBehavior': 'replace' }),
  })
  return made.id
}

/** Save a small file (under 4 MB) into "Business Agent/<folder>" in OneDrive; returns its web link. */
export async function saveFile(token: string, folder: string, name: string, content: string, type: string) {
  const path = ['Business Agent', folder, name].filter(Boolean).map(encodeURIComponent).join('/')
  const item = await graph<{ webUrl: string }>(token, `/me/drive/root:/${path}:/content`, {
    method: 'PUT', headers: { 'content-type': type }, body: content,
  })
  return item.webUrl
}
