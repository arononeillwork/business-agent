// Content page (Marketing, admins): synced folders (shared/contentFolders.ts). An admin looks through the
// business's OneDrive (or Google Drive, when Drive's folders may be read: the connection's
// external.reads_folders) and chooses a folder; its photos and videos are then listed on the page with
// addresses this Worker serves from the folder itself (/media, signed for each file), so nothing is copied.
// Each look at the folder (when it's added, when the page opens and it's due, or Sync now) adds what's new
// in it, three folders deep and up to 5,000, and takes off what's gone from it; one an admin took off the
// page stays hidden. The `content_folders` migration has the table.
import type { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { businessDb, type Env } from './supabase'
import { connectorGrant, explain, lasting, markBroken } from './connections'
import { mediaAddress } from './media'
import * as google from './providers/google'
import * as ms from './providers/microsoft'
import { titleFromFilename } from '../shared/content'
import {
  FOLDER_COLUMNS, FOLDER_DEPTH, MAX_FOLDER_FILES, NO_DRIVE_FOLDERS, PROVIDER_NAME, folderFileKind, syncPlan,
  type ContentFolder, type FolderFile, type FolderListing, type FolderProvider, type FolderSync,
} from '../shared/contentFolders'

/** A problem with what was asked or the state things are in (shown as is), as opposed to OneDrive or Drive failing (502). */
class FolderError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) { super(message) }
}
const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })
const statusOf = (e: unknown) => (e instanceof FolderError ? e.status : 502)
const isProvider = (p: unknown): p is FolderProvider => p === 'onedrive' || p === 'google_drive'

/** A fresh token for the provider, which must be connected (Google Drive: with its folders readable). */
async function folderToken(env: Env, db: SupabaseClient, provider: FolderProvider) {
  const { data } = await db.from('integrations').select('status, external').eq('provider', provider).maybeSingle()
  if (data?.status !== 'connected') throw new FolderError(`Connect ${PROVIDER_NAME[provider]} on the Connections page first.`, 409)
  if (provider === 'google_drive' && !(data.external as { reads_folders?: boolean } | null)?.reads_folders) throw new FolderError(NO_DRIVE_FOLDERS, 409)
  try {
    return (await connectorGrant(env, db, provider)).token
  } catch (e) {
    throw await broken(db, provider, e)
  }
}

/** OneDrive or Drive failed: the Connections card turns red when trying again won't fix it. */
async function broken(db: SupabaseClient, provider: FolderProvider, e: unknown) {
  if (e instanceof FolderError) return e
  const why = explain(provider, e)
  if (lasting(provider, e)) await markBroken(db, provider, why)
  return new Error(why)
}

/** A file or folder found, in one shape for both. */
interface Found { id: string; name: string; folder: boolean; mimeType: string | null; width: number | null; height: number | null; taken_at: string | null }

async function page(token: string, provider: FolderProvider, id: string, next?: string): Promise<{ items: Found[]; next: string | null }> {
  if (provider === 'onedrive') {
    const r = await ms.mediaPage(token, id, next)
    return {
      next: r.next,
      items: r.items.map(i => ({ id: i.id, name: i.name, folder: !!i.folder, mimeType: i.file?.mimeType ?? null,
        width: i.image?.width ?? i.video?.width ?? null, height: i.image?.height ?? i.video?.height ?? null,
        taken_at: i.photo?.takenDateTime ?? i.createdDateTime ?? null })),
    }
  }
  const r = await google.driveFolderPage(token, id, next)
  return {
    next: r.next,
    items: r.items.map(i => ({ id: i.id, name: i.name, folder: i.mimeType === google.DRIVE_FOLDER, mimeType: i.mimeType,
      width: i.imageMediaMetadata?.width ?? i.videoMediaMetadata?.width ?? null, height: i.imageMediaMetadata?.height ?? i.videoMediaMetadata?.height ?? null,
      taken_at: google.exifTime(i.imageMediaMetadata?.time) ?? i.createdTime ?? null })),
  }
}

/** Every photo and video in a folder and the folders in it (three deep), up to 5,000; and how many files couldn't be shown. */
export async function folderFiles(token: string, provider: FolderProvider, folderId: string): Promise<{ files: FolderFile[]; skipped: number }> {
  const files: FolderFile[] = []
  let skipped = 0
  const queue = [{ id: folderId, depth: 0 }]
  while (queue.length && files.length < MAX_FOLDER_FILES) {
    const { id, depth } = queue.shift()!
    let next: string | null = null
    do {
      const got = await page(token, provider, id, next ?? undefined)
      for (const f of got.items) {
        if (f.folder) {
          if (depth + 1 < FOLDER_DEPTH) queue.push({ id: f.id, depth: depth + 1 })
          continue
        }
        const k = folderFileKind(f.name, f.mimeType)
        if (!k) { skipped++; continue }
        files.push({ id: f.id, name: f.name, kind: k.kind, ext: k.ext, width: f.width || null, height: f.height || null, taken_at: f.taken_at })
      }
      next = got.next
    } while (next && files.length < MAX_FOLDER_FILES)
  }
  return { files: files.slice(0, MAX_FOLDER_FILES), skipped }
}

/** The files a folder's rows name now, a thousand at a time. */
async function listedIds(db: SupabaseClient, folder: string) {
  const ids: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('content_items').select('source_id').eq('folder_id', folder).order('source_id').range(from, from + 999)
    if (error) throw new Error(error.message)
    ids.push(...(data ?? []).map(r => r.source_id as string))
    if ((data ?? []).length < 1000) return ids
  }
}

/** Look at a folder again: list what's new in it, take off what's gone, and note when (or why it couldn't). */
export async function syncFolder(env: Env, db: SupabaseClient, origin: string, business: number, folder: ContentFolder): Promise<FolderSync> {
  const token = await folderToken(env, db, folder.provider)
  const now = new Date().toISOString()
  try {
    const { files, skipped } = await folderFiles(token, folder.provider, folder.folder_id)
    const plan = syncPlan(await listedIds(db, folder.id), files)
    for (let i = 0; i < plan.add.length; i += 500) {
      const rows = await Promise.all(plan.add.slice(i, i + 500).map(async f => ({
        kind: f.kind, url: await mediaAddress(env, origin, folder.provider, business, f.id, f.ext), title: titleFromFilename(f.name),
        source: 'folder', source_id: f.id, folder_id: folder.id, width: f.width, height: f.height, taken_at: f.taken_at, tags: [], added_by: null,
      })))
      const { error } = await db.from('content_items').insert(rows)
      if (error) throw new Error(error.message)
    }
    for (let i = 0; i < plan.remove.length; i += 100) {
      const { error } = await db.from('content_items').delete().eq('folder_id', folder.id).in('source_id', plan.remove.slice(i, i + 100))
      if (error) throw new Error(error.message)
    }
    await db.from('content_folders').update({ last_synced_at: now, last_error: null }).eq('id', folder.id)
    return { added: plan.add.length, removed: plan.remove.length, total: files.length, skipped }
  } catch (e) {
    const err = await broken(db, folder.provider, e)
    await db.from('content_folders').update({ last_synced_at: now, last_error: err.message.slice(0, 500) }).eq('id', folder.id)
    throw err
  }
}

/** Looking through the OneDrive or Drive: a folder (null: the top) and the folders in it. */
async function browse(token: string, provider: FolderProvider, parent: string | null): Promise<FolderListing> {
  if (provider === 'onedrive') {
    const at = parent ? await ms.item(token, parent) : null
    if (parent && !at?.folder) throw new FolderError('That folder isn’t in the OneDrive any more.', 404)
    const kids = await ms.children(token, parent ?? 'root')
    return { provider, folder: { id: parent, name: at?.name ?? 'OneDrive' },
      folders: kids.filter(k => k.folder).map(k => ({ id: k.id, name: k.name })).sort((a, b) => a.name.localeCompare(b.name)) }
  }
  const at = parent ? await google.driveItem(token, parent) : null
  if (parent && at?.mimeType !== google.DRIVE_FOLDER) throw new FolderError('That folder isn’t in the Drive any more.', 404)
  const folders: { id: string; name: string }[] = []
  let next: string | null = null
  do {
    const got = await google.driveFolderPage(token, parent ?? 'root', next ?? undefined)
    folders.push(...got.items.filter(i => i.mimeType === google.DRIVE_FOLDER).map(i => ({ id: i.id, name: i.name })))
    next = got.next
  } while (next && folders.length < 1000)
  return { provider, folder: { id: parent, name: at?.name ?? 'My Drive' }, folders: folders.sort((a, b) => a.name.localeCompare(b.name)) }
}

/** The routes, on the Content page's app (worker/content.ts: admins only, `userId` and `businessId` set). */
export function folderRoutes(app: Hono<{ Bindings: Env; Variables: { userId: string; businessId: number } }>) {
  // Look through the OneDrive or Drive for a folder to show.
  app.get('/api/content/folders/browse', async c => {
    const db = businessDb(c.env, c.get('businessId'))
    const provider = c.req.query('provider')
    try {
      if (!isProvider(provider)) throw new FolderError('Choose OneDrive or Google Drive')
      const token = await folderToken(c.env, db, provider)
      return c.json(await browse(token, provider, c.req.query('parent') || null).catch(async e => { throw await broken(db, provider, e) }))
    } catch (e) {
      return c.json(fail(e), statusOf(e))
    }
  })

  // Show a folder on the page (it's checked first), and look at it straight away.
  app.post('/api/content/folders', async c => {
    const business = c.get('businessId')
    const db = businessDb(c.env, business)
    const b = await c.req.json<{ provider?: string; folder_id?: string; name?: string; path?: string | null }>().catch(() => ({} as Record<string, undefined>))
    try {
      if (!isProvider(b.provider) || !b.folder_id) throw new FolderError('Choose a folder')
      const token = await folderToken(c.env, db, b.provider)
      const at = b.provider === 'onedrive' ? await ms.item(token, b.folder_id).catch(async e => { throw await broken(db, 'onedrive', e) })
        : await google.driveItem(token, b.folder_id).catch(async e => { throw await broken(db, 'google_drive', e) })
      const isFolder = !!at && (b.provider === 'onedrive' ? !!(at as ms.DriveItem).folder : (at as { mimeType: string }).mimeType === google.DRIVE_FOLDER)
      if (!isFolder) throw new FolderError(`That folder isn’t in the ${PROVIDER_NAME[b.provider]} any more.`, 404)
      const { data: there } = await db.from('content_folders').select(FOLDER_COLUMNS).eq('provider', b.provider).eq('folder_id', b.folder_id).maybeSingle()
      let folder = there as ContentFolder | null
      if (!folder) {
        const { data, error } = await db.from('content_folders')
          .insert({ provider: b.provider, folder_id: b.folder_id, name: at!.name, path: b.path?.slice(0, 1000) || null, created_by: c.get('userId') })
          .select(FOLDER_COLUMNS).single()
        if (error) throw new Error(error.message)
        folder = data as ContentFolder
      }
      const sync = await syncFolder(c.env, db, new URL(c.req.url).origin, business, folder)
      return c.json({ folder: { ...folder, last_synced_at: new Date().toISOString(), last_error: null }, sync })
    } catch (e) {
      return c.json(fail(e), statusOf(e))
    }
  })

  // Look at a folder again now (the page asks when it opens and the folder is due, and on Sync now).
  app.post('/api/content/folders/:id/sync', async c => {
    const business = c.get('businessId')
    const db = businessDb(c.env, business)
    try {
      const { data } = await db.from('content_folders').select(FOLDER_COLUMNS).eq('id', c.req.param('id')).maybeSingle()
      if (!data) throw new FolderError('That folder isn’t on the page any more.', 404)
      return c.json(await syncFolder(c.env, db, new URL(c.req.url).origin, business, data as ContentFolder))
    } catch (e) {
      return c.json(fail(e), statusOf(e))
    }
  })
}
