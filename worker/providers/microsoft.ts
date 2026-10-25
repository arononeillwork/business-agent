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

// Outlook, read (Invoices): emails with files attached that could be invoices. Needs Mail.Read.
/** Emails from the last `days` with attachments, newest first, each with who sent it and its files. */
export async function outlookWithAttachments(token: string, days: number, max = 40) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const filter = encodeURIComponent(`hasAttachments eq true and receivedDateTime ge ${since}`)
  const list = await graph<{ value: { id: string; subject?: string; receivedDateTime: string; from?: { emailAddress?: { name?: string; address?: string } } }[] }>(token,
    `/me/messages?$filter=${filter}&$orderby=receivedDateTime desc&$top=${max}&$select=id,subject,receivedDateTime,from`)
  const out = []
  for (const m of list.value) {
    const files = await graph<{ value: { id: string; name: string; size: number; contentType?: string; '@odata.type'?: string }[] }>(token,
      `/me/messages/${encodeURIComponent(m.id)}/attachments?$select=id,name,size,contentType`)
    const a = m.from?.emailAddress
    out.push({ id: m.id, from: a?.name ? `${a.name} <${a.address ?? ''}>` : a?.address ?? '', subject: m.subject ?? '', at: m.receivedDateTime,
      files: files.value.filter(f => !f['@odata.type'] || f['@odata.type'] === '#microsoft.graph.fileAttachment')
        .map(f => ({ id: f.id, name: f.name, size: f.size, type: f.contentType ?? '' })) })
  }
  return out
}

/** An attachment's bytes. */
export async function outlookAttachment(token: string, message: string, attachment: string) {
  const res = await fetch(`${GRAPH}/me/messages/${encodeURIComponent(message)}/attachments/${encodeURIComponent(attachment)}/$value`, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Microsoft: the attachment couldn’t be read (${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
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

/** OneDrive takes big files in pieces; each piece a multiple of 320 KiB (here 10 MiB). */
const PIECE = 32 * 320 * 1024

/** The bytes of a body in pieces of `size` (the last one shorter), without holding it all. */
export async function* pieces(body: ReadableStream<Uint8Array> | ArrayBuffer, size = PIECE): AsyncGenerator<Uint8Array> {
  if (body instanceof ArrayBuffer) {
    for (let i = 0; i < body.byteLength; i += size) yield new Uint8Array(body.slice(i, i + size))
    return
  }
  const reader = body.getReader()
  let buf = new Uint8Array(0)
  for (;;) {
    const { done, value } = await reader.read()
    if (value) {
      const next = new Uint8Array(buf.length + value.length)
      next.set(buf)
      next.set(value, buf.length)
      buf = next
      while (buf.length >= size) { yield buf.slice(0, size); buf = buf.slice(size) }
    }
    if (done) break
  }
  if (buf.length) yield buf
}

/** "Business Agent/<path…>" in OneDrive, each folder made if missing; returns the last one's id. */
export async function ensurePath(token: string, path: string[]) {
  let parent = await ensureFolder(token)
  let at = 'Business Agent'
  for (const name of path) {
    at = `${at}/${name}`
    const res = await fetch(`${GRAPH}/me/drive/root:/${at.split('/').map(encodeURIComponent).join('/')}`, { headers: { authorization: `Bearer ${token}` } })
    if (res.ok) { parent = ((await res.json()) as { id: string }).id; continue }
    parent = (await graph<{ id: string }>(token, `/me/drive/items/${parent}/children`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'replace' }),
    })).id
  }
  return parent
}

const pathOf = (path: string[]) => ['Business Agent', ...path].map(encodeURIComponent).join('/')

/** The folders inside "Business Agent/<path…>" (made if missing), by name, and OneDrive's page for it. */
export async function listFolders(token: string, path: string[]) {
  await ensurePath(token, path)
  const [children, self] = await Promise.all([
    graph<{ value: { name: string; folder?: unknown }[] }>(token, `/me/drive/root:/${pathOf(path)}:/children?$select=name,folder&$top=200`),
    graph<{ webUrl?: string }>(token, `/me/drive/root:/${pathOf(path)}`),
  ])
  return { folders: children.value.filter(i => i.folder).map(i => i.name).sort((a, b) => a.localeCompare(b)), link: self.webUrl ?? null }
}

export interface OneDriveItem { id: string; name: string; folder?: unknown; file?: { mimeType?: string }; size?: number; lastModifiedDateTime?: string; webUrl?: string }

/** Everything inside "Business Agent/<path…>" (nothing is made), and OneDrive's page for it; null when it isn't there. */
export async function listChildren(token: string, path: string[]) {
  const res = await fetch(`${GRAPH}/me/drive/root:/${pathOf(path)}:/children?$select=id,name,folder,file,size,lastModifiedDateTime,webUrl&$top=500`,
    { headers: { authorization: `Bearer ${token}` } })
  if (res.status === 404) return null
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Microsoft: ${err.error?.message ?? res.status}`)
  }
  const self = await graph<{ webUrl?: string }>(token, `/me/drive/root:/${pathOf(path)}`)
  return { items: ((await res.json()) as { value: OneDriveItem[] }).value, link: self.webUrl ?? null }
}

/** Upload a photo or video into "Business Agent/<path…>" in OneDrive (any size, in pieces); returns its id. */
export const uploadToOneDrive = async (token: string, path: string[], name: string, size: number, body: ReadableStream | ArrayBuffer) =>
  (await uploadItem(token, path, name, size, body)).id

/** The same, returning OneDrive's page for the file too. */
export async function uploadItem(token: string, path: string[], name: string, size: number, body: ReadableStream | ArrayBuffer) {
  await ensurePath(token, path)
  const at = ['Business Agent', ...path, name].map(encodeURIComponent).join('/')
  const { uploadUrl } = await graph<{ uploadUrl: string }>(token, `/me/drive/root:/${at}:/createUploadSession`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
  })
  let offset = 0
  let item: { id?: string; webUrl?: string } = {}
  for await (const piece of pieces(body)) {
    // The upload address carries its own permission: no sign-in header (OneDrive refuses one).
    const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-range': `bytes ${offset}-${offset + piece.byteLength - 1}/${size}` }, body: piece })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      throw new Error(`Microsoft: ${err.error?.message ?? res.status}`)
    }
    offset += piece.byteLength
    if (res.status === 200 || res.status === 201) item = await res.json() as { id?: string; webUrl?: string }
  }
  if (!item.id) throw new Error('Microsoft: the upload didn’t finish')
  return { id: item.id, webUrl: item.webUrl ?? null }
}

/** A file's content from OneDrive: it answers with a ready-signed download address, fetched without our sign-in. */
export async function oneDriveDownload(token: string, id: string, range?: string | null) {
  const res = await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(id)}/content`, { headers: { authorization: `Bearer ${token}` }, redirect: 'manual' })
  const to = res.headers.get('location')
  if (res.status >= 300 && res.status < 400 && to) return fetch(to, { headers: range ? { range } : {} })
  return res
}

// Legal page: the café's OneDrive, looked through folder by folder (Files.ReadWrite reads all of it),
// and the files picked there.
export interface DriveItem {
  id: string; name: string; size?: number; webUrl?: string; lastModifiedDateTime?: string
  folder?: { childCount?: number }; file?: { mimeType?: string }; parentReference?: { id?: string; path?: string }
}
const ITEM_FIELDS = 'id,name,size,webUrl,lastModifiedDateTime,folder,file,parentReference'
const itemPath = (id: string) => (id === 'root' ? '/me/drive/root' : `/me/drive/items/${encodeURIComponent(id)}`)

/** A file or folder by its id ('root': the top of the OneDrive); null when it isn't there. */
export async function item(token: string, id: string): Promise<DriveItem | null> {
  const res = await fetch(`${GRAPH}${itemPath(id)}?$select=${ITEM_FIELDS}`, { headers: { authorization: `Bearer ${token}` } })
  if (res.status === 404) return null
  const json = await res.json().catch(() => ({})) as DriveItem & { error?: { message?: string } }
  if (!res.ok) throw new Error(`Microsoft: ${json.error?.message ?? res.status}`)
  return json
}

/** What's in a folder ('root': the top), page by page, up to 1,000 things. */
export async function children(token: string, id: string) {
  const out: DriveItem[] = []
  let next: string | undefined = `${GRAPH}${itemPath(id)}/children?$select=${ITEM_FIELDS}&$top=200`
  while (next && out.length < 1000) {
    const res = await fetch(next, { headers: { authorization: `Bearer ${token}` } })
    const page = await res.json().catch(() => ({})) as { value?: DriveItem[]; '@odata.nextLink'?: string; error?: { message?: string } }
    if (!res.ok) throw new Error(`Microsoft: ${page.error?.message ?? res.status}`)
    out.push(...page.value ?? [])
    next = page['@odata.nextLink']
  }
  return out
}

/** The folder an item is in, by names from the top ("/drive/root:/Documents/Legal" → "Documents/Legal"; "" at the top). */
export function folderOf(i: DriveItem): string | null {
  const path = i.parentReference?.path
  const at = path?.indexOf('root:') ?? -1
  return path && at >= 0 ? decodeURIComponent(path.slice(at + 'root:'.length).replace(/^\//, '')) : null
}

/** A Word, Excel or PowerPoint file (and others OneDrive can convert) as a PDF, fetched like oneDriveDownload. */
export async function oneDrivePdf(token: string, id: string) {
  const res = await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(id)}/content?format=pdf`, { headers: { authorization: `Bearer ${token}` }, redirect: 'manual' })
  const to = res.headers.get('location')
  return res.status >= 300 && res.status < 400 && to ? fetch(to) : res
}

/** Save a small file (under 4 MB) into "Business Agent/<folder>" in OneDrive; returns its web link. */
export async function saveFile(token: string, folder: string, name: string, content: string, type: string) {
  // "Marketing/Competitions": a folder in a folder.
  const path = ['Business Agent', ...folder.split('/').map(x => x.trim()).filter(x => x && x !== '.' && x !== '..'), name].filter(Boolean).map(encodeURIComponent).join('/')
  const item = await graph<{ webUrl: string }>(token, `/me/drive/root:/${path}:/content`, {
    method: 'PUT', headers: { 'content-type': type }, body: content,
  })
  return item.webUrl
}
