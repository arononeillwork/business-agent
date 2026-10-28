// Photos and videos for social posts. Instagram, Facebook, TikTok and Google don't take files from
// apps: each fetches the file from a public address when it posts. So the files live in the café's
// own storage, the connected Google Drive or OneDrive ("Business Agent/Social/<Posts|Carousels|
// Reels|Stories>"), or in R2 when the deploy has it, and /media/… hands them out. Drive and OneDrive
// addresses are signed and name the business whose storage the file is in (/media/<g|o>/<business>/
// <id>/<signature>.<ext>): only ones Business Agent made open anything, never another file there.
// Addresses from before there were several businesses have no business in them: those are the first's.
// The Menu page keeps its pictures the same way ("Business Agent/Menu"): menu photos, uploaded
// designs, and AI images copied from Higgsfield (which keeps them only a week).
import type { SupabaseClient } from '@supabase/supabase-js'
import { businessDb, businessIdOf, type Env } from './supabase'
import { connectorGrant, explain, lasting, markBroken } from './connections'
import * as google from './providers/google'
import * as ms from './providers/microsoft'
import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from '../shared/social'
import { MAX_AUDIO_BYTES } from '../shared/music'

export type MediaStorage = 'google_drive' | 'onedrive' | 'r2'
/** Music: the business's tracks for stories and reels (docs/SOCIAL_MUSIC_PLAN.md); only audio goes there. Menu: the menu's pictures. */
export const FOLDERS = ['Posts', 'Carousels', 'Reels', 'Stories', 'Menu', 'Music'] as const

const TYPES: Record<string, { ext: string; type: 'image' | 'video' | 'audio'; max: number }> = {
  'image/jpeg': { ext: 'jpg', type: 'image', max: MAX_PHOTO_BYTES },
  'video/mp4': { ext: 'mp4', type: 'video', max: MAX_VIDEO_BYTES },
  'video/quicktime': { ext: 'mov', type: 'video', max: MAX_VIDEO_BYTES },
  'audio/mpeg': { ext: 'mp3', type: 'audio', max: MAX_AUDIO_BYTES },
  'audio/mp4': { ext: 'm4a', type: 'audio', max: MAX_AUDIO_BYTES },
  'audio/x-m4a': { ext: 'm4a', type: 'audio', max: MAX_AUDIO_BYTES },
}
// Menu pictures are kept as they come (AI images are PNG or WebP; photos are made JPEG in the browser), and can be bigger.
const MENU_MAX_BYTES = 20 * 1024 * 1024
const MENU_TYPES: Record<string, { ext: string; type: 'image' | 'video' | 'audio'; max: number }> = {
  'image/jpeg': { ext: 'jpg', type: 'image', max: MENU_MAX_BYTES },
  'image/png': { ext: 'png', type: 'image', max: MENU_MAX_BYTES },
  'image/webp': { ext: 'webp', type: 'image', max: MENU_MAX_BYTES },
}
const CONTENT_TYPE: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4' }

/** A problem with the file itself (shown as is), as opposed to storage failing. */
export class MediaError extends Error {}

/** Where new photos and videos go: the connected Drive or OneDrive first (the café's own), else R2. */
export async function mediaStorage(env: Env, db: SupabaseClient): Promise<MediaStorage | null> {
  const { data } = await db.from('integrations').select('provider, status').in('provider', ['google_drive', 'onedrive'])
  const p = (['google_drive', 'onedrive'] as const).find(x => data?.some(r => r.provider === x && r.status === 'connected'))
  return p ?? (env.MEDIA ? 'r2' : null)
}

/**
 * Check a file before anything is stored: a JPEG photo up to 8 MB, an MP4/MOV video up to 100 MB, or an MP3/M4A track up to 20 MB
 * (the Menu folder: a JPEG, PNG or WebP picture up to 20 MB).
 */
export function checkFile(type: string, size: number | null, folder?: string) {
  const t = (folder === 'Menu' ? MENU_TYPES : TYPES)[type]
  if (!t) throw new MediaError(folder === 'Menu' ? 'Use a JPEG, PNG or WebP picture' : 'Use a JPEG photo, an MP4 or MOV video, or an MP3 or M4A track')
  if (size === 0) throw new MediaError('That file is empty')
  if (size && size > t.max) throw new MediaError(`${t.type === 'image' ? 'Photos' : t.type === 'video' ? 'Videos' : 'Tracks'} can be up to ${t.max / 1024 / 1024} MB`)
  return t
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** The signature in a /media address: proof Business Agent made it, for this one file. */
async function sign(env: Env, what: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`media:${env.INTEGRATION_KEY}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(what)))).slice(0, 24)
}

export interface StoredMedia { url: string; type: 'image' | 'video' | 'audio'; storage: MediaStorage }

/** Store a photo, video or track in the folder for its kind; returns the public address. */
export async function storeMedia(env: Env, db: SupabaseClient, origin: string,
  f: { type: string; size: number; body: ReadableStream | ArrayBuffer; folder: string }): Promise<StoredMedia> {
  const folder = (FOLDERS as readonly string[]).includes(f.folder) ? f.folder : 'Posts'
  const t = checkFile(f.type, f.size, folder)
  if ((t.type === 'audio') !== (folder === 'Music')) throw new MediaError(t.type === 'audio' ? 'Tracks go in the music library' : 'The music library takes MP3 or M4A tracks')
  // Social posts and the music library under Social/<kind>; the menu's pictures in a folder of their own.
  const path = folder === 'Menu' ? ['Menu'] : ['Social', folder]
  const storage = await mediaStorage(env, db)
  if (!storage) throw new MediaError('Connect Google Drive or OneDrive on the Connections page to add photos and videos. They’re kept in its Business Agent folder.')
  if (storage === 'r2') {
    const key = `${folder === 'Menu' ? 'menu' : t.type === 'audio' ? 'music' : 'posts'}/${crypto.randomUUID()}.${t.ext}`
    await env.MEDIA!.put(key, f.body, { httpMetadata: { contentType: f.type } })
    return { url: `${origin}/media/${key}`, type: t.type, storage }
  }
  const name = `${new Date().toISOString().slice(0, 10)} ${crypto.randomUUID().slice(0, 8)}.${t.ext}`
  const business = businessIdOf(db)
  if (!business) throw new Error('Files are kept for a business: none to keep this for')
  try {
    const { token } = await connectorGrant(env, db, storage)
    remember(business, storage, token)
    const id = storage === 'google_drive'
      ? await google.uploadToDrive(token, await google.folderPath(token, path), name, f.type, f.size, f.body)
      : await ms.uploadToOneDrive(token, path, name, f.size, f.body)
    const p = storage === 'google_drive' ? 'g' : 'o'
    return { url: `${origin}/media/${p}/${business}/${encodeURIComponent(id)}/${await sign(env, `${p}:${business}:${id}`)}.${t.ext}`, type: t.type, storage }
  } catch (e) {
    if (lasting(storage, e)) await markBroken(db, storage, explain(storage, e))
    throw new Error(explain(storage, e))
  }
}

// Access tokens last an hour: kept for 45 minutes per Worker instance (each business's its own), so
// the network fetching a carousel's ten files doesn't renew the token ten times.
const tokens = new Map<string, { token: string; until: number }>()
const remember = (business: number, p: MediaStorage, token: string) => tokens.set(`${business}:${p}`, { token, until: Date.now() + 45 * 60_000 })
async function accessToken(env: Env, business: number, p: 'google_drive' | 'onedrive') {
  const kept = tokens.get(`${business}:${p}`)
  if (kept && kept.until > Date.now()) return kept.token
  const { token } = await connectorGrant(env, businessDb(env, business), p)
  remember(business, p, token)
  return token
}
/** Tests: start without kept tokens. */
export const forgetMediaTokens = () => tokens.clear()

/** The first business: whose files the addresses without a business in them are. */
const FIRST_BUSINESS = 1

/**
 * GET /media/<g|o>/<business>/<id>/<signature>.<ext>: the file, from that business's Drive or
 * OneDrive (`business` null: an address from before there were several businesses).
 */
export async function serveMedia(env: Env, req: Request, p: string, id: string, file: string, business: number | null = null): Promise<Response> {
  const [sig, ext] = file.split('.')
  const storage = p === 'g' ? 'google_drive' : p === 'o' ? 'onedrive' : null
  const signed = business === null ? `${p}:${id}` : `${p}:${business}:${id}`
  if (!storage || !ext || !CONTENT_TYPE[ext] || sig !== await sign(env, signed)) return new Response('Not found', { status: 404 })
  const owner = business ?? FIRST_BUSINESS
  let res: Response
  try {
    const token = await accessToken(env, owner, storage)
    const range = req.headers.get('range')
    res = storage === 'google_drive' ? await google.driveDownload(token, id, range) : await ms.oneDriveDownload(token, id, range)
  } catch {
    return new Response('Storage not reachable', { status: 502 })
  }
  if (res.status === 401) tokens.delete(`${owner}:${storage}`)
  if (!res.ok) return new Response(res.status === 404 ? 'Not found' : 'Storage not reachable', { status: res.status === 404 ? 404 : 502 })
  const headers = new Headers({ 'content-type': CONTENT_TYPE[ext], 'cache-control': 'public, max-age=86400', 'accept-ranges': 'bytes' })
  for (const h of ['content-length', 'content-range']) {
    const v = res.headers.get(h)
    if (v) headers.set(h, v)
  }
  return new Response(res.body, { status: res.status, headers })
}

/**
 * A post's photo as bytes, for networks that take an upload instead of fetching an address
 * (LinkedIn). Our own /media addresses are read straight from storage (a Worker can't always fetch
 * its own address); anything else is fetched.
 */
export async function mediaBytes(env: Env, url: string): Promise<{ bytes: ArrayBuffer; type: string }> {
  const path = new URL(url).pathname
  const own = path.match(/^\/media\/([go])\/(?:(\d+)\/)?([^/]+)\/([^/]+)$/)
  let res: Response
  if (own) res = await serveMedia(env, new Request(url), own[1], decodeURIComponent(own[3]), own[4], own[2] ? Number(own[2]) : null)
  else if (path.startsWith('/media/') && env.MEDIA) {
    const obj = await env.MEDIA.get(path.slice('/media/'.length))
    res = obj ? new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg' } }) : new Response('Not found', { status: 404 })
  } else res = await fetch(url)
  if (!res.ok) throw new Error(`The photo couldn’t be read (${res.status}). Add it to the post again.`)
  return { bytes: await res.arrayBuffer(), type: res.headers.get('content-type')?.split(';')[0] || 'image/jpeg' }
}
