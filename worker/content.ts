// Content page (Marketing, admins): photos and videos brought in from Google Photos. Google's Photos
// Picker API is the only way in: the page opens Google Photos' own picker in a window of its own
// (it can't sit inside the page), the admin picks (up to 2000), and the page asks here until Google
// says they're done. Then it asks here to bring them in, a page of the pick (100) after another and a
// few at a time (each is a download from Google and an upload to storage, and a Worker run can only
// make so many requests): each one is copied into the
// café's storage (The Business Agent/Content in Google Drive or OneDrive, or R2), since Google's links
// to what was picked last only an hour, and listed on the page (content_items). Something picked
// before isn't brought in twice (Google keeps each item's id). Uploads from the device go through
// /api/integrations/media?folder=Content and the page adds their row itself.
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, businessDb, type Env } from './supabase'
import { connectorGrant, explain, lasting, markBroken, setIntegration } from './connections'
import * as photos from './providers/googlePhotos'
import { MediaError, checkFile, mediaStorage, storeMedia } from './media'
import { CONTENT_COLUMNS, CONTENT_FOLDER, IMPORT_BATCH, MAX_PICK, autoclose, titleFromFilename, type ContentItem, type GooglePhotosImport, type SkipReason } from '../shared/content'
import { signInCheck, signedInUser } from './signedIn'

type Vars = { userId: string; businessId: number }
export const content = new Hono<{ Bindings: Env; Variables: Vars }>()

/** A problem with what was asked or the state things are in (shown as is), as opposed to Google or storage failing (502). */
class ContentError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) { super(message) }
}

const NO_STORAGE = 'Connect Google Drive or OneDrive on the Connections page first: the photos and videos are kept in its The Business Agent folder.'

/** Admins only: the caller's token, role and business. */
content.use('/api/content/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const [{ data: user }, { data: isAdmin }, { data: businessId }] = await Promise.all([signedInUser(c.env, token), signInCheck(c.env, token, 'is_admin'), signInCheck(c.env, token, 'current_business_id')])
  if (!user.user || !isAdmin || !businessId) return c.json({ error: 'Only an admin can add photos and videos' }, 403)
  c.set('userId', user.user.id)
  c.set('businessId', businessId as number)
  await next()
})

/** Google failed: the Connections card turns red when trying again won't fix it. */
async function broken(db: SupabaseClient, e: unknown) {
  if (e instanceof ContentError) return e
  const why = explain('google_photos', e)
  if (lasting('google_photos', e)) await markBroken(db, 'google_photos', why)
  return new Error(why)
}

/** A fresh Google Photos access token; Google Photos must be connected. */
async function photosToken(env: Env, db: SupabaseClient) {
  const { data } = await db.from('integrations').select('status').eq('provider', 'google_photos').maybeSingle()
  if (data?.status !== 'connected') throw new ContentError('Connect Google Photos on the Connections page first.', 409)
  try {
    return (await connectorGrant(env, db, 'google_photos')).token
  } catch (e) {
    throw await broken(db, e)
  }
}

/**
 * Ask Google; its failures are put in words (and a lasting one marks the connection broken). `picking`:
 * a pick already under way, where FAILED_PRECONDITION means the admin hasn't pressed Done yet (starting
 * one, it means the account has no Google Photos: explain() says so).
 */
async function ask<T>(db: SupabaseClient, f: () => Promise<T>, picking = true) {
  try {
    return await f()
  } catch (e) {
    if (picking && e instanceof photos.PhotosError && e.status === 'FAILED_PRECONDITION') throw new ContentError('Finish picking in Google Photos first.', 409)
    if (e instanceof photos.PhotosError && e.code === 404) throw new ContentError('That Google Photos pick has ended. Pick again.', 404)
    if (e instanceof photos.PhotosError && e.status === 'PERMISSION_DENIED' && !/scope/i.test(e.message)) throw new ContentError('That Google Photos pick has run out of time. Pick again.', 409)
    throw await broken(db, e)
  }
}

const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })
const statusOf = (e: unknown) => (e instanceof ContentError ? e.status : 502)

// Start a pick: the page opens `picker_uri` in a new window (it closes itself once the admin is done).
content.post('/api/content/google-photos/sessions', async c => {
  const db = businessDb(c.env, c.get('businessId'))
  try {
    if (!await mediaStorage(c.env, db)) throw new ContentError(NO_STORAGE, 409)
    const token = await photosToken(c.env, db)
    const s = await ask(db, () => photos.createSession(token, MAX_PICK), false)
    return c.json({
      id: s.id, picker_uri: autoclose(s.pickerUri), expires_at: s.expireTime ?? null,
      poll_ms: photos.seconds(s.pollingConfig?.pollInterval, 5000), timeout_ms: photos.seconds(s.pollingConfig?.timeoutIn, 30 * 60_000),
    })
  } catch (e) {
    return c.json(fail(e), statusOf(e))
  }
})

// Has the admin finished picking?
content.get('/api/content/google-photos/sessions/:id', async c => {
  const db = businessDb(c.env, c.get('businessId'))
  try {
    const token = await photosToken(c.env, db)
    const s = await ask(db, () => photos.getSession(token, c.req.param('id')))
    return c.json({ picked: !!s.mediaItemsSet, poll_ms: photos.seconds(s.pollingConfig?.pollInterval, 5000) })
  } catch (e) {
    return c.json(fail(e), statusOf(e))
  }
})

/** What happened to one picked item: brought in, or why not. */
type Outcome = { item: ContentItem } | { skip: SkipReason }

/** Copy one picked photo or video into the café's storage and list it. */
async function bringIn(env: Env, db: SupabaseClient, origin: string, token: string, uid: string, p: photos.PickedMediaItem): Promise<Outcome> {
  if (p.type !== 'PHOTO' && p.type !== 'VIDEO') return { skip: 'kind' }
  const video = p.type === 'VIDEO'
  const meta = p.mediaFile?.mediaFileMetadata
  const status = meta?.videoMetadata?.processingStatus
  if (video && status && status !== 'READY') return { skip: 'processing' }
  const res = await photos.download(token, p)
  if (!res.ok || !res.body) return { skip: 'unreadable' }
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() || (p.mediaFile?.mimeType ?? '')
  const declared = Number(res.headers.get('content-length') ?? '') || null
  try {
    checkFile(type, declared, CONTENT_FOLDER)
  } catch (e) {
    await res.body.cancel().catch(() => {})
    if (e instanceof MediaError) return { skip: /up to/.test(e.message) ? 'too_big' : 'kind' }
    throw e
  }
  // A known size streams straight through to storage; otherwise it's read first (and checked again).
  const Fixed = (globalThis as { FixedLengthStream?: new (n: number) => TransformStream }).FixedLengthStream
  const body = declared && Fixed ? res.body.pipeThrough(new Fixed(declared)) : await res.arrayBuffer()
  const size = body instanceof ArrayBuffer ? body.byteLength : declared!
  try {
    checkFile(type, size, CONTENT_FOLDER)
  } catch (e) {
    if (e instanceof MediaError) return { skip: /up to/.test(e.message) ? 'too_big' : 'kind' }
    throw e
  }
  const stored = await storeMedia(env, db, origin, { type, size, body, folder: CONTENT_FOLDER })
  // A photo comes no bigger than Google was asked for: its size as kept.
  const w = meta?.width ?? null, h = meta?.height ?? null
  const scale = !video && w && h ? Math.min(1, photos.PHOTO_SIDE / Math.max(w, h)) : 1
  const { data, error } = await db.from('content_items').insert({
    kind: video ? 'video' : 'photo', url: stored.url, title: titleFromFilename(p.mediaFile?.filename), source: 'google_photos', source_id: p.id,
    width: w ? Math.round(w * scale) : null, height: h ? Math.round(h * scale) : null, taken_at: p.createTime ?? null, tags: [], added_by: uid,
  }).select(CONTENT_COLUMNS).single()
  if (error) throw new Error(error.message)
  return { item: data as ContentItem }
}

// Bring in what was picked, a page (100) at a time and a few of it at once: the page asks again with the
// same `page` while `left` is above 0, passing the ids it was told were skipped, then with `next_page`
// until there's none. Asked to `count` (the first round), it says how many were picked in all. Done,
// Google forgets the pick.
content.post('/api/content/google-photos/sessions/:id/import', async c => {
  const db = businessDb(c.env, c.get('businessId'))
  const id = c.req.param('id')
  const { skip, page, count } = await c.req.json<{ skip?: string[]; page?: string | null; count?: boolean }>()
    .catch(() => ({ skip: undefined, page: undefined, count: undefined }))
  try {
    if (!await mediaStorage(c.env, db)) throw new ContentError(NO_STORAGE, 409)
    const token = await photosToken(c.env, db)
    const [listed, total] = await Promise.all([
      ask(db, () => photos.pickedPage(token, id, page || undefined)),
      count ? ask(db, () => photos.pickedCount(token, id)) : Promise.resolve(null),
    ])
    const ids = listed.items.map(p => p.id)
    const { data: there } = ids.length
      ? await db.from('content_items').select('source_id').eq('source', 'google_photos').in('source_id', ids)
      : { data: [] as { source_id: string }[] }
    const have = new Set((there ?? []).map(r => r.source_id as string))
    const passed = new Set(skip ?? [])
    const todo = listed.items.filter(p => !have.has(p.id) && !passed.has(p.id))
    const origin = new URL(c.req.url).origin
    // A few side by side: each is a wait on Google and then on storage.
    const outs = await Promise.all(todo.slice(0, IMPORT_BATCH).map(p => bringIn(c.env, db, origin, token, c.get('userId'), p).then(out => ({ p, out }))))
    const added: ContentItem[] = []
    const skipped: GooglePhotosImport['skipped'] = []
    for (const { p, out } of outs) {
      if ('item' in out) added.push(out.item)
      else skipped.push({ id: p.id, name: p.mediaFile?.filename ?? null, reason: out.skip })
    }
    const left = Math.max(0, todo.length - IMPORT_BATCH)
    if (!left && !listed.next) await photos.deleteSession(token, id).catch(() => {})
    if (added.length) await setIntegration(db, 'google_photos', { last_sync_at: new Date().toISOString(), last_error: null })
    // `already`: of this page, picked but in the library from before.
    const out: GooglePhotosImport = { added, skipped, left, next_page: listed.next, already: listed.items.filter(p => have.has(p.id)).length, total }
    return c.json(out)
  } catch (e) {
    return c.json(fail(e), statusOf(e))
  }
})

// The admin closed the pick without finishing: Google forgets it.
content.delete('/api/content/google-photos/sessions/:id', async c => {
  const db = businessDb(c.env, c.get('businessId'))
  try {
    const token = await photosToken(c.env, db)
    await ask(db, () => photos.deleteSession(token, c.req.param('id')))
    return c.json({ ok: true })
  } catch (e) {
    return c.json(fail(e), statusOf(e))
  }
})
