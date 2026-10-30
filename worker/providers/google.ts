// Google Business Profile: keep opening hours, holiday closures and phone in sync with the app,
// and publish posts. OAuth 2.0 with offline access (refresh token) for the listing owner.
import type { CalendarEvent, OpeningHours } from '../../shared/types'
import { DAY_KEYS } from '../../shared/types'

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/business.manage', 'openid', 'email']

const DAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const

interface GTime { hours?: number; minutes?: number }
interface GPeriod { openDay: string; openTime: GTime; closeDay: string; closeTime: GTime }
interface GDate { year: number; month: number; day: number }
export interface GSpecialPeriod { startDate: GDate; endDate?: GDate; closed?: boolean; openTime?: GTime; closeTime?: GTime }

const toTime = (hm: string): GTime => {
  const [h, m] = hm.split(':').map(Number)
  return m ? { hours: h, minutes: m } : { hours: h }
}
const fromTime = (t: GTime) => `${String(t.hours ?? 0).padStart(2, '0')}:${String(t.minutes ?? 0).padStart(2, '0')}`
const toDate = (d: string): GDate => {
  const [year, month, day] = d.split('-').map(Number)
  return { year, month, day }
}

/** App opening hours → Google regularHours. */
export function toGoogleHours(hours: OpeningHours): { periods: GPeriod[] } {
  const periods: GPeriod[] = []
  DAY_KEYS.forEach((k, i) => {
    const h = hours[k]
    if (h) periods.push({ openDay: DAY_NAMES[i], openTime: toTime(h.open), closeDay: DAY_NAMES[i], closeTime: toTime(h.close) })
  })
  return { periods }
}

/** Google regularHours → app opening hours (first period per day). */
export function fromGoogleHours(regular: { periods?: GPeriod[] } | undefined): OpeningHours {
  const out: OpeningHours = {}
  DAY_KEYS.forEach(k => { out[k] = null })
  for (const p of regular?.periods ?? []) {
    const i = DAY_NAMES.indexOf(p.openDay as typeof DAY_NAMES[number])
    if (i >= 0 && !out[DAY_KEYS[i]]) out[DAY_KEYS[i]] = { open: fromTime(p.openTime), close: fromTime(p.closeTime) }
  }
  return out
}

/** Same opening hours every day ("8:00" and "08:00" match; a missing day is closed). */
export function sameHours(a: OpeningHours, b: OpeningHours) {
  const day = (h: { open: string; close: string } | null | undefined) => (h ? `${h.open.padStart(5, '0')}-${h.close.padStart(5, '0')}` : 'closed')
  return DAY_KEYS.every(k => day(a[k]) === day(b[k]))
}

/**
 * Days the café is closed that Google should show: public holidays it closes on, and business
 * closures. Future dates only. Holidays count as closed only when `closedOnHolidays` is true.
 */
export function toSpecialHours(events: CalendarEvent[], fromDate: string, closedOnHolidays: boolean): { specialHourPeriods: GSpecialPeriod[] } {
  const closing = events.filter(e => e.confirmed && (e.ends_on ?? e.starts_on) >= fromDate &&
    (e.category === 'business' ? /closed|cerrad|closure/i.test(e.title)
      : closedOnHolidays && ['national', 'regional', 'local'].includes(e.category)))
  return {
    specialHourPeriods: closing.map(e => ({
      startDate: toDate(e.starts_on),
      ...(e.ends_on && e.ends_on !== e.starts_on ? { endDate: toDate(e.ends_on) } : {}),
      closed: true,
    })),
  }
}

export interface GoogleOAuthConfig { clientId: string; clientSecret: string; redirectUri: string }

export function authUrl(cfg: GoogleOAuthConfig, state: string, scopes = GOOGLE_SCOPES) {
  const p = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', scope: scopes.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: scopes === GOOGLE_SCOPES ? 'true' : 'false', state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body),
  })
  // `scope`: what the person actually allowed (Google lets them untick boxes on the consent screen).
  const json = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string; error?: string }
  if (!res.ok || !json.access_token) {
    // Keep the error code: invalid_grant means the access was revoked or expired.
    throw new Error(json.error === 'invalid_grant' ? `invalid_grant: ${json.error_description ?? 'access revoked or expired'}` : (json.error_description ?? json.error ?? 'Google sign-in failed'))
  }
  return json
}

export const exchangeCode = (cfg: GoogleOAuthConfig, code: string) =>
  tokenRequest({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code' })

export const refreshAccess = (cfg: GoogleOAuthConfig, refreshToken: string) =>
  tokenRequest({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token' })

async function gfetch<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers } })
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message ?? `Google error ${res.status}`)
  return json
}

export interface GoogleLocation { name: string; title: string; account: string; address?: string }

/** All locations the signed-in Google user manages. */
export async function listLocations(token: string): Promise<GoogleLocation[]> {
  const { accounts = [] } = await gfetch<{ accounts?: { name: string }[] }>(token,
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts')
  const out: GoogleLocation[] = []
  for (const a of accounts) {
    const { locations = [] } = await gfetch<{ locations?: { name: string; title: string; storefrontAddress?: { addressLines?: string[]; locality?: string } }[] }>(token,
      `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`)
    for (const l of locations) {
      out.push({ name: l.name, title: l.title, account: a.name,
        address: [...(l.storefrontAddress?.addressLines ?? []), l.storefrontAddress?.locality].filter(Boolean).join(', ') })
    }
  }
  return out
}

export async function getLocationHours(token: string, location: string) {
  const l = await gfetch<{ regularHours?: { periods?: GPeriod[] } }>(token,
    `https://mybusinessbusinessinformation.googleapis.com/v1/${location}?readMask=regularHours`)
  return fromGoogleHours(l.regularHours)
}

export async function updateLocation(token: string, location: string, patch: {
  regularHours?: { periods: GPeriod[] }; specialHours?: { specialHourPeriods: GSpecialPeriod[] }; phone?: string | null
}) {
  const body: Record<string, unknown> = {}
  const mask: string[] = []
  if (patch.regularHours) { body.regularHours = patch.regularHours; mask.push('regularHours') }
  if (patch.specialHours) { body.specialHours = patch.specialHours; mask.push('specialHours') }
  if (patch.phone) { body.phoneNumbers = { primaryPhone: patch.phone }; mask.push('phoneNumbers.primaryPhone') }
  return gfetch(token, `https://mybusinessbusinessinformation.googleapis.com/v1/${location}?updateMask=${mask.join(',')}`,
    { method: 'PATCH', body: JSON.stringify(body) })
}

/** Google Business post. Events show dates on the listing. */
export async function createPost(token: string, account: string, location: string, post: {
  caption: string; image_url?: string | null; title?: string | null; starts_on?: string | null; ends_on?: string | null
}) {
  const locationId = location.split('/').pop()
  const body: Record<string, unknown> = { languageCode: 'es', summary: post.caption.slice(0, 1500), topicType: 'STANDARD' }
  if (post.title && post.starts_on) {
    body.topicType = 'EVENT'
    body.event = { title: post.title.slice(0, 58), schedule: { startDate: toDate(post.starts_on), endDate: toDate(post.ends_on ?? post.starts_on) } }
  }
  if (post.image_url) body.media = [{ mediaFormat: 'PHOTO', sourceUrl: post.image_url }]
  return gfetch<{ name: string }>(token, `https://mybusiness.googleapis.com/v4/${account}/locations/${locationId}/localPosts`,
    { method: 'POST', body: JSON.stringify(body) })
}

// Reviews on the business's own profile. Still on the v4 host: Google moved the rest of this API to
// v1 and left reviews behind. Needs the same business.manage permission as hours and posts.
export interface GoogleReview {
  name: string; reviewId?: string; starRating?: string; comment?: string; createTime?: string; updateTime?: string
  reviewer?: { displayName?: string; isAnonymous?: boolean }
  reviewReply?: { comment?: string; updateTime?: string }
}

/** Every review of the listing, newest first (up to `max`, 50 a page). */
export async function listReviews(token: string, account: string, location: string, max = 500): Promise<GoogleReview[]> {
  const locationId = location.split('/').pop()
  const out: GoogleReview[] = []
  let page: string | undefined
  do {
    const q = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc', ...(page ? { pageToken: page } : {}) })
    const r = await gfetch<{ reviews?: GoogleReview[]; nextPageToken?: string }>(token,
      `https://mybusiness.googleapis.com/v4/${account}/locations/${locationId}/reviews?${q}`)
    out.push(...(r.reviews ?? []))
    page = r.nextPageToken
  } while (page && out.length < max)
  return out
}

/** Reply to a review (or change the reply): `name` is the review's accounts/…/locations/…/reviews/… path. */
export const replyToReview = (token: string, name: string, comment: string) =>
  gfetch<{ comment?: string; updateTime?: string }>(token, `https://mybusiness.googleapis.com/v4/${name}/reply`, { method: 'PUT', body: JSON.stringify({ comment }) })

export const deleteReviewReply = (token: string, name: string) =>
  gfetch(token, `https://mybusiness.googleapis.com/v4/${name}/reply`, { method: 'DELETE' })

/** The listing's name, phone, address and hours, to compare with the app and the website. */
export async function listingFacts(token: string, location: string) {
  const l = await gfetch<{ title?: string; phoneNumbers?: { primaryPhone?: string }; regularHours?: { periods?: GPeriod[] }
    storefrontAddress?: { addressLines?: string[]; postalCode?: string; locality?: string } }>(token,
    `https://mybusinessbusinessinformation.googleapis.com/v1/${location}?readMask=title,phoneNumbers,storefrontAddress,regularHours`)
  const a = l.storefrontAddress
  return {
    name: l.title ?? null, phone: l.phoneNumbers?.primaryPhone ?? null,
    address: a ? [...(a.addressLines ?? []), [a.postalCode, a.locality].filter(Boolean).join(' ')].filter(Boolean).join(', ') : null,
    hours: l.regularHours ? fromGoogleHours(l.regularHours) : null,
  }
}

// ---------------------------------------------------------------------------------------------
// Gmail and Google Drive: the café's mailbox sends alerts; exports are saved to its Drive.
// ---------------------------------------------------------------------------------------------
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'openid', 'email']
// drive.file: only files this app creates (a "Business Agent" folder), never the rest of the Drive.
export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email']

/** The Google account's email address. */
export async function accountEmail(token: string): Promise<string | undefined> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${token}` } })
  return res.ok ? ((await res.json()) as { email?: string }).email : undefined
}

export async function sendGmail(token: string, raw: string) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ raw }),
  })
  const json = await res.json() as { id?: string; error?: { message?: string } }
  if (!res.ok || !json.id) throw new Error(`Gmail: ${json.error?.message ?? res.status}`)
  return json.id
}

async function drive<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })
  const json = await res.json() as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(`Google Drive: ${json.error?.message ?? res.status}`)
  return json
}

/** The folder with this name under `parent` (made by this app), if it's there. */
async function findFolder(token: string, name: string, parent: string) {
  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parent}' in parents and trashed = false`
  const found = await drive<{ files: { id: string }[] }>(token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`)
  return found.files[0]?.id ?? null
}

/** The folder with this name under `parent` (made by this app), created if missing. */
async function folder(token: string, name: string, parent = 'root') {
  const found = await findFolder(token, name, parent)
  if (found) return found
  const made = await drive<{ id: string }>(token, 'https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }),
  })
  return made.id
}

/** The app's "Business Agent" folder in the café's Drive (created if missing); returns its id. */
export const ensureDriveFolder = (token: string) => folder(token, 'Business Agent')

/** Is the folder still there (not deleted or in the bin)? */
export async function driveFolderAlive(token: string, id: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,trashed`, { headers: { authorization: `Bearer ${token}` } })
  if (res.status === 404) return false
  const json = await res.json() as { trashed?: boolean; error?: { message?: string } }
  if (!res.ok) throw new Error(`Google Drive: ${json.error?.message ?? res.status}`)
  return !json.trashed
}

/** "Business Agent/<path…>" in the café's Drive (each folder made if missing); returns the last one's id. */
export async function folderPath(token: string, path: string[]) {
  let parent = 'root'
  for (const name of ['Business Agent', ...path]) parent = await folder(token, name, parent)
  return parent
}

/**
 * Upload a photo or video into a Drive folder. Resumable, so a large video streams straight
 * through instead of being held in memory. Returns the file's id.
 */
export async function uploadToDrive(token: string, parent: string, name: string, type: string, size: number, body: ReadableStream | ArrayBuffer) {
  const start = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': type, 'x-upload-content-length': String(size) },
    body: JSON.stringify({ name, parents: [parent] }),
  })
  if (!start.ok) {
    const json = await start.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Google Drive: ${json.error?.message ?? start.status}`)
  }
  const session = start.headers.get('location')
  if (!session) throw new Error('Google Drive: no upload address')
  const put = await fetch(session, { method: 'PUT', headers: { 'content-type': type }, body, duplex: 'half' } as RequestInit)
  const json = await put.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
  if (!put.ok || !json.id) throw new Error(`Google Drive: ${json.error?.message ?? put.status}`)
  return json.id
}

/** "Business Agent/<path…>" in the café's Drive if it's there (nothing is made); its id, or null. */
export async function findFolderPath(token: string, path: string[]) {
  let parent: string | null = 'root'
  for (const name of ['Business Agent', ...path]) if (!(parent = await findFolder(token, name, parent))) return null
  return parent
}

export const DRIVE_FOLDER = 'application/vnd.google-apps.folder'
export interface DriveItem { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string }

/** Everything this app put inside a Drive folder, folders and files (drive.file sees only those). */
export async function listChildren(token: string, parent: string) {
  const q = `'${parent}' in parents and trashed = false`
  const found = await drive<{ files: DriveItem[] }>(token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
    '&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&orderBy=folder,name&pageSize=500')
  return found.files
}

/** The folders this app made inside a Drive folder, by name (drive.file sees only those). */
export async function listFolders(token: string, parent: string) {
  const q = `mimeType = 'application/vnd.google-apps.folder' and '${parent}' in parents and trashed = false`
  const found = await drive<{ files: { id: string; name: string }[] }>(token,
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=name&pageSize=200`)
  return found.files.map(f => f.name)
}

/** Drive's own page for a file or folder. */
export const fileLink = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`
export const folderLink = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`

/** A file's content from Drive (a Range asked for by a video player is passed on). */
export const driveDownload = (token: string, id: string, range?: string | null) =>
  fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { headers: { authorization: `Bearer ${token}`, ...(range ? { range } : {}) } })

// Legal page: files the café chose in Google's picker. drive.file lets the app open those (and the
// ones it made), never the rest of the Drive.
export interface DriveFile { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string; trashed?: boolean }

/** A file's details, or null when the app can't see it (never picked, deleted, or no longer shared with the app). */
export async function fileInfo(token: string, id: string): Promise<DriveFile | null> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size,modifiedTime,webViewLink,trashed&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${token}` } })
  if (res.status === 404) return null
  const json = await res.json() as DriveFile & { error?: { message?: string } }
  if (!res.ok) throw new Error(`Google Drive: ${json.error?.message ?? res.status}`)
  return json
}

/** One of Google's own documents (Docs, Sheets, Slides, Drawings) as a PDF. */
export const driveExportPdf = (token: string, id: string) =>
  fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=application%2Fpdf`, { headers: { authorization: `Bearer ${token}` } })

// Gmail, read (Invoices): emails with files attached that could be invoices. Needs gmail.readonly.
interface GmailPart { filename?: string; mimeType?: string; body?: { attachmentId?: string; size?: number }; parts?: GmailPart[] }
interface GmailMessage { id: string; internalDate?: string; payload?: GmailPart & { headers?: { name: string; value: string }[] } }

async function gmail<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { authorization: `Bearer ${token}` } })
  const json = await res.json() as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(`Gmail: ${json.error?.message ?? res.status}`)
  return json
}

/** Emails from the last `days` with attachments, newest first, each with who sent it and its files. */
export async function gmailWithAttachments(token: string, days: number, max = 40) {
  const q = `has:attachment newer_than:${days}d -in:sent -in:chats`
  const list = await gmail<{ messages?: { id: string }[] }>(token, `messages?q=${encodeURIComponent(q)}&maxResults=${max}`)
  const out = []
  for (const { id } of list.messages ?? []) {
    const m = await gmail<GmailMessage>(token, `messages/${encodeURIComponent(id)}?format=full`)
    const header = (n: string) => m.payload?.headers?.find(h => h.name.toLowerCase() === n)?.value ?? ''
    const files: { id: string; name: string; size: number; type: string }[] = []
    const walk = (p?: GmailPart) => {
      if (!p) return
      if (p.filename && p.body?.attachmentId) files.push({ id: p.body.attachmentId, name: p.filename, size: p.body.size ?? 0, type: p.mimeType ?? '' })
      p.parts?.forEach(walk)
    }
    walk(m.payload)
    out.push({ id, from: header('from'), subject: header('subject'), at: new Date(Number(m.internalDate ?? Date.now())).toISOString(), files })
  }
  return out
}

/** An attachment's bytes. */
export async function gmailAttachment(token: string, message: string, attachment: string) {
  const a = await gmail<{ data: string }>(token, `messages/${encodeURIComponent(message)}/attachments/${encodeURIComponent(attachment)}`)
  const bin = atob(a.data.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

/** Save a file into "Business Agent/<sub>" in the café's Drive; returns its web link. */
export async function saveToDrive(token: string, sub: string, name: string, content: string, type: string) {
  // "Marketing/Competitions": a folder in a folder.
  const parent = await folderPath(token, sub.split('/').map(x => x.trim()).filter(x => x && x !== '.' && x !== '..'))
  const boundary = `ba${crypto.randomUUID()}`
  const body = [
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify({ name, parents: [parent] }),
    `--${boundary}`, `Content-Type: ${type}`, '', content, `--${boundary}--`, '',
  ].join('\r\n')
  const file = await drive<{ webViewLink: string }>(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=webViewLink', {
    method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body,
  })
  return file.webViewLink
}

/** Delete a file the app made (a camera's clip whose days are up); one already gone counts as deleted. */
export async function deleteDriveFile(token: string, id: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
  if (res.ok || res.status === 404) return
  const json = await res.json().catch(() => ({})) as { error?: { message?: string } }
  throw new Error(`Google Drive: ${json.error?.message ?? res.status}`)
}
