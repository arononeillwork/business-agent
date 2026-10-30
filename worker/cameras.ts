// Cameras: the business's CCTV cameras (Reolink and others that upload by FTP). They log in to
// Business Agent's camera upload server (cameras/, on Fly.io: Cloudflare can't take FTP), which
// keeps each camera's latest picture and passes the video on to here, with the shared key
// (CAMERA_UPLOADS_KEY). Here:
//   - the upload server's routes: is this username and password a camera, and whose; a camera was
//     seen; keep this piece of video, in the business's Google Drive or OneDrive
//     (Business Agent/Cameras/<camera>/<day>/HH.MM.SS.mp4) with a camera_clips row;
//   - the Cameras page's (admins): where cameras send to, each camera's latest picture and what the
//     upload server has from it, a clip to play (a signed address for the video player), deleting a
//     clip or a camera with its clips;
//   - every hour, deleting the clips whose camera's days are up, unless kept for an incident.
import { Hono, type Context } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, businessDb, requestDb, serviceClient, userClient, type Env } from './supabase'
import { connectorGrant, explain, lasting, markBroken } from './connections'
import { TaxError, broken, keptStorage } from './tax'
import * as google from './providers/google'
import * as ms from './providers/microsoft'
import { MAX_CLIP_BYTES, clipPlace, clipStart, type CameraLive } from '../shared/cameras'
import { TZ } from '../shared/time'

export const cameras = new Hono<{ Bindings: Env; Variables: { token: string } }>()

type Storage = 'google_drive' | 'onedrive'
const MISSING = 'Connect Google Drive or OneDrive on the Connections page to keep the cameras’ video. It goes in its Business Agent/Cameras folder.'
/** How long a clip's address for the video player works. */
const PLAY_MS = 2 * 3600_000

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** The same text, compared without leaking how much of it matched (their hashes, every byte looked at). */
async function same(a: string, b: string) {
  const enc = new TextEncoder()
  const [x, y] = (await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))))).map(d => new Uint8Array(d))
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

/** The upload server's key on a request. */
const fromUploads = async (env: Env, header: string | undefined) =>
  !!env.CAMERA_UPLOADS_KEY && !!header?.startsWith('Bearer ') && await same(header.slice(7), env.CAMERA_UPLOADS_KEY)

interface CameraRow { id: string; business_id: number; name: string; ftp_password: string; keep_video: string; active: boolean }

/** A camera by its username on the upload server, and whose it is. */
async function cameraByUser(env: Env, user: unknown): Promise<CameraRow | null> {
  if (typeof user !== 'string' || !/^cam[0-9a-f]{8}$/.test(user)) return null
  const { data } = await serviceClient(env).from('cameras').select('id, business_id, name, ftp_password, keep_video, active').eq('ftp_user', user).maybeSingle()
  return (data as CameraRow | null) ?? null
}

/** Note what's been heard from a camera (its status row, the Worker's own). */
async function noteStatus(db: SupabaseClient, camera: string, patch: Record<string, unknown>) {
  const { error } = await db.from('camera_status').upsert({ camera_id: camera, ...patch }, { onConflict: 'camera_id' })
  if (error) console.error('camera status not noted', error.message)
}

// ---------------------------------------------------------------------------------------------
// The upload server's routes (its key, no sign-in).
// ---------------------------------------------------------------------------------------------
cameras.use('/api/camera-uploads/*', async (c, next) => {
  if (!await fromUploads(c.env, c.req.header('authorization'))) return c.json({ error: 'Not allowed' }, 401)
  await next()
})

// A camera logging in: is it one, with this password, and switched on?
cameras.post('/api/camera-uploads/login', async c => {
  const body = await c.req.json<{ user?: unknown; password?: unknown }>().catch(() => ({} as { user?: unknown; password?: unknown }))
  const cam = await cameraByUser(c.env, body.user)
  if (!cam || typeof body.password !== 'string' || !await same(body.password, cam.ftp_password)) return c.json({ error: 'Username or password not right' }, 401)
  if (!cam.active) return c.json({ error: 'That camera is switched off on the Cameras page' }, 403)
  return c.json({ camera: { keep_video: cam.keep_video } })
})

// A camera sent something (every few minutes at most): the Cameras page's "last seen".
cameras.post('/api/camera-uploads/seen', async c => {
  const body = await c.req.json<{ user?: unknown }>().catch(() => ({} as { user?: unknown }))
  const cam = await cameraByUser(c.env, body.user)
  if (!cam) return c.json({ error: 'No such camera' }, 404)
  await noteStatus(businessDb(c.env, cam.business_id), cam.id, { last_seen_at: new Date().toISOString() })
  return c.json({ ok: true })
})

/**
 * A piece of video to keep: its bytes (Content-Length needed), with x-camera (the username),
 * x-file-name (as the camera named it), x-ended-at (when it arrived), x-seconds and x-motion.
 * 409 when there's no storage to keep it in (the upload server tries again later).
 */
cameras.post('/api/camera-uploads/clip', async c => {
  const cam = await cameraByUser(c.env, c.req.header('x-camera'))
  if (!cam) return c.json({ error: 'No such camera' }, 404)
  if (!cam.active) return c.json({ error: 'That camera is switched off on the Cameras page' }, 403)
  const size = Number(c.req.header('content-length') ?? '')
  if (!Number.isInteger(size) || size <= 0) return c.json({ error: 'The video’s size is needed (Content-Length)' }, 411)
  if (size > MAX_CLIP_BYTES) return c.json({ error: 'That piece of video is too big: lower the camera’s Max File Size' }, 413)
  const endedAt = c.req.header('x-ended-at') ?? ''
  if (Number.isNaN(Date.parse(endedAt))) return c.json({ error: 'When it was filmed is needed (x-ended-at)' }, 400)
  const secondsRaw = Number(c.req.header('x-seconds') ?? '')
  const seconds = Number.isFinite(secondsRaw) && secondsRaw >= 0 && secondsRaw <= 86400 ? Math.round(secondsRaw) : null
  const original = decodeURIComponent(c.req.header('x-file-name') ?? '').slice(0, 200)

  const db = businessDb(c.env, cam.business_id)
  const { data: biz } = await db.from('business').select('timezone').maybeSingle()
  const tz = (biz as { timezone?: string } | null)?.timezone || TZ
  const started = clipStart(original, endedAt, seconds, tz)
  const place = clipPlace(cam.name, started, tz)

  let s: { storage: Storage; token: string }
  try {
    s = await keptStorage(c.env, db, MISSING)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await noteStatus(db, cam.id, { last_seen_at: new Date().toISOString(), last_error: message })
    return c.json({ error: message }, e instanceof TaxError ? 409 : 502)
  }
  // A known size streams straight through to storage; otherwise (tests) it's read first.
  const Fixed = (globalThis as { FixedLengthStream?: new (n: number) => TransformStream }).FixedLengthStream
  const body = c.req.raw.body && Fixed ? c.req.raw.body.pipeThrough(new Fixed(size)) : await c.req.arrayBuffer()
  let file: { id: string; link: string | null }
  try {
    file = s.storage === 'google_drive'
      ? await google.uploadToDrive(s.token, await google.folderPath(s.token, place.folder), place.name, 'video/mp4', size, body).then(id => ({ id, link: google.fileLink(id) }))
      : await ms.uploadItem(s.token, place.folder, place.name, size, body).then(i => ({ id: i.id, link: i.webUrl }))
  } catch (e) {
    const err = await broken(db, s.storage, e)
    await noteStatus(db, cam.id, { last_seen_at: new Date().toISOString(), last_error: err.message })
    return c.json({ error: err.message }, 502)
  }
  const { error } = await db.from('camera_clips').insert({
    camera_id: cam.id, started_at: started, seconds, bytes: size, storage: s.storage, file_id: file.id, file_name: place.name,
    link: file.link && /^https:\/\/\S+$/.test(file.link) ? file.link : null, motion: c.req.header('x-motion') !== '0',
  })
  if (error) return c.json({ error: error.message }, 500)
  const now = new Date().toISOString()
  await noteStatus(db, cam.id, { last_seen_at: now, last_clip_at: now, last_error: null })
  return c.json({ ok: true, folder: place.folder.join('/'), name: place.name })
})

// ---------------------------------------------------------------------------------------------
// The Cameras page's routes (admins).
// ---------------------------------------------------------------------------------------------
cameras.use('/api/cameras/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const { data: admin } = await userClient(c.env, token, 'app').rpc('is_admin')
  if (!admin) return c.json({ error: 'Only admins see the cameras' }, 403)
  c.set('token', token)
  await next()
})

/** The upload server: its address for the Worker, and where cameras send to (null: not set up). */
const uploads = (env: Env) => (env.CAMERA_UPLOADS_URL && env.CAMERA_UPLOADS_KEY ? env.CAMERA_UPLOADS_URL.replace(/\/+$/, '') : null)
const ftpHost = (env: Env) => env.CAMERA_FTP_HOST || (uploads(env) ? new URL(uploads(env)!).hostname : null)
const askUploads = (env: Env, path: string) => fetch(`${uploads(env)}${path}`, { headers: { authorization: `Bearer ${env.CAMERA_UPLOADS_KEY}` } })

// Where cameras send to, for the camera's app (null: camera uploads aren't switched on yet).
cameras.get('/api/cameras/service', c => {
  const host = ftpHost(c.env)
  return c.json({ ftp: uploads(c.env) && host ? { host, port: 21 } : null })
})

/** The person's own cameras (their business's), as the database lets them see them. */
async function ownCameras(c: Context<{ Bindings: Env; Variables: { token: string } }>) {
  const { data } = await userClient(c.env, c.get('token'), 'app').from('cameras').select('id, ftp_user')
  return (data ?? []) as { id: string; ftp_user: string }[]
}

// What the upload server has from each camera right now (its latest picture's time, video today).
cameras.get('/api/cameras/live', async c => {
  if (!uploads(c.env)) return c.json({ cameras: {} })
  const mine = await ownCameras(c)
  if (!mine.length) return c.json({ cameras: {} })
  try {
    const res = await askUploads(c.env, `/status?users=${mine.map(m => m.ftp_user).join(',')}`)
    if (!res.ok) throw new Error(String(res.status))
    const { cameras: live } = await res.json() as { cameras: Record<string, CameraLive> }
    return c.json({ cameras: Object.fromEntries(mine.filter(m => live[m.ftp_user]).map(m => [m.id, live[m.ftp_user]])) }, 200, { 'cache-control': 'no-store' })
  } catch {
    return c.json({ cameras: {}, error: 'The camera upload server isn’t answering just now' }, 200, { 'cache-control': 'no-store' })
  }
})

// A camera's latest picture (404: none yet, or the upload server isn't set up).
cameras.get('/api/cameras/:id/picture', async c => {
  const cam = (await ownCameras(c)).find(m => m.id === c.req.param('id'))
  if (!cam) return c.json({ error: 'No such camera' }, 404)
  if (!uploads(c.env)) return c.json({ error: 'Camera uploads aren’t switched on yet' }, 404)
  const res = await askUploads(c.env, `/picture/${cam.ftp_user}`).catch(() => null)
  if (!res?.ok) return c.json({ error: 'No picture from this camera yet' }, 404)
  return new Response(res.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store', 'x-taken-at': res.headers.get('x-taken-at') ?? '' } })
})

/** The signature in a clip's address: proof it was made here, for this clip until then. */
async function sign(env: Env, what: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`camera-clip:${env.INTEGRATION_KEY}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(what)))).slice(0, 32)
}

// A clip's address for the video player (it can't send the sign-in), working for a couple of hours.
cameras.get('/api/cameras/clips/:id/play', async c => {
  const id = c.req.param('id')
  const { data: clip } = await userClient(c.env, c.get('token'), 'app').from('camera_clips').select('id, business_id').eq('id', id).maybeSingle()
  if (!clip) return c.json({ error: 'No such clip' }, 404)
  const business = (clip as { business_id: number }).business_id
  const until = Date.now() + PLAY_MS
  return c.json({ url: `/api/camera-clips/${business}/${encodeURIComponent(id)}/${until}/${await sign(c.env, `${business}:${id}:${until}`)}.mp4` })
})

// Access tokens last an hour: kept for 45 minutes per Worker instance, so a video player asking for
// the clip piece by piece doesn't renew the token each time.
const tokens = new Map<string, { token: string; until: number }>()
async function accessToken(env: Env, business: number, p: Storage) {
  const kept = tokens.get(`${business}:${p}`)
  if (kept && kept.until > Date.now()) return kept.token
  const { token } = await connectorGrant(env, businessDb(env, business), p)
  tokens.set(`${business}:${p}`, { token, until: Date.now() + 45 * 60_000 })
  return token
}
/** Tests: start without kept tokens. */
export const forgetCameraTokens = () => tokens.clear()

// A clip, from the business's storage, for its signed address (a Range from the video player is passed on).
cameras.get('/api/camera-clips/:business/:id/:until/:file', async c => {
  const business = Number(c.req.param('business'))
  const id = c.req.param('id')
  const until = Number(c.req.param('until'))
  const [sig, ext] = c.req.param('file').split('.')
  if (!Number.isInteger(business) || ext !== 'mp4' || !(until > Date.now()) || sig !== await sign(c.env, `${business}:${id}:${until}`)) {
    return c.text('Not found', 404)
  }
  const db = businessDb(c.env, business)
  const { data: clip } = await db.from('camera_clips').select('storage, file_id').eq('id', id).maybeSingle()
  if (!clip) return c.text('Not found', 404)
  const { storage, file_id } = clip as { storage: Storage; file_id: string }
  let res: Response
  try {
    const token = await accessToken(c.env, business, storage)
    const range = c.req.header('range')
    res = storage === 'google_drive' ? await google.driveDownload(token, file_id, range) : await ms.oneDriveDownload(token, file_id, range)
  } catch {
    return c.text('Storage not reachable', 502)
  }
  if (res.status === 401) tokens.delete(`${business}:${storage}`)
  if (!res.ok) return c.text(res.status === 404 ? 'That clip is no longer in your storage' : 'Storage not reachable', res.status === 404 ? 404 : 502)
  const headers = new Headers({ 'content-type': 'video/mp4', 'cache-control': 'private, max-age=3600', 'accept-ranges': 'bytes' })
  for (const h of ['content-length', 'content-range']) {
    const v = res.headers.get(h)
    if (v) headers.set(h, v)
  }
  return new Response(res.body, { status: res.status, headers })
})

/** Delete clips from their storage, then their rows; returns how many went (a lasting storage problem stops it). */
async function deleteClips(env: Env, db: SupabaseClient, clips: { id: string; storage: string; file_id: string }[]) {
  const gone: string[] = []
  const grants = new Map<string, string | null>()
  for (const clip of clips) {
    const p = clip.storage as Storage
    if (!grants.has(p)) grants.set(p, await connectorGrant(env, db, p).then(g => g.token, async e => {
      if (lasting(p, e)) await markBroken(db, p, explain(p, e))
      return null
    }))
    const token = grants.get(p)
    if (!token) continue
    try {
      if (p === 'google_drive') await google.deleteDriveFile(token, clip.file_id)
      else await ms.deleteOneDriveItem(token, clip.file_id)
      gone.push(clip.id)
    } catch (e) {
      if (lasting(p, e)) { await markBroken(db, p, explain(p, e)); grants.set(p, null) }
    }
  }
  for (let i = 0; i < gone.length; i += 100) {
    const { error } = await db.from('camera_clips').delete().in('id', gone.slice(i, i + 100))
    if (error) throw new Error(error.message)
  }
  return gone.length
}

// Delete one clip (from the storage too).
cameras.delete('/api/cameras/clips/:id', async c => {
  const { data: clip } = await userClient(c.env, c.get('token'), 'app').from('camera_clips').select('id, storage, file_id').eq('id', c.req.param('id')).maybeSingle()
  if (!clip) return c.json({ error: 'No such clip' }, 404)
  const db = await requestDb(c)
  if (!await deleteClips(c.env, db, [clip as { id: string; storage: string; file_id: string }])) {
    return c.json({ error: 'The clip couldn’t be deleted from your storage just now. Try again in a minute.' }, 502)
  }
  return c.json({ ok: true })
})

// Delete a camera, with all its clips (from the storage first: none is left behind).
cameras.delete('/api/cameras/:id', async c => {
  const id = c.req.param('id')
  if (!(await ownCameras(c)).some(m => m.id === id)) return c.json({ error: 'No such camera' }, 404)
  const db = await requestDb(c)
  const { data } = await db.from('camera_clips').select('id, storage, file_id').eq('camera_id', id)
  const clips = (data ?? []) as { id: string; storage: string; file_id: string }[]
  if (clips.length && await deleteClips(c.env, db, clips) < clips.length) {
    return c.json({ error: 'Some of its clips couldn’t be deleted from your storage just now. Try again in a minute.' }, 502)
  }
  const { error } = await db.from('cameras').delete().eq('id', id)
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ ok: true, clips: clips.length })
})

/**
 * Every hour: the clips whose camera's days are up (not kept for an incident), deleted from the
 * business's storage and from here. A few hundred at a time; the rest the next hour.
 */
export async function purgeCameraClips(env: Env, db: SupabaseClient) {
  const { data, error } = await db.rpc('camera_clips_due', { p_limit: 300 })
  if (error) throw new Error(error.message)
  const due = (data ?? []) as { id: string; storage: string; file_id: string }[]
  return due.length ? deleteClips(env, db, due) : 0
}
