// Documents hub: a look inside the café's own "Business Agent" folder in Google Drive or OneDrive
// (its folders and files, each file marked when it's a kept document), and uploads and new folders
// under "Business Agent/Documents/…" (contracts, insurance, the lease, certificates). Browsing makes
// nothing. Admins with pay access only, as the Tax page; files are kept as tax_documents rows.
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, requestDb, userClient, type Env } from './supabase'
import { connectedOf } from './connections'
import * as google from './providers/google'
import * as ms from './providers/microsoft'
import { broken, fail, keepTaxFile, keptStorage, pathParam, readUpload, status, TaxError } from './tax'
import { cleanFolderName, cleanFolderPath } from '../shared/tax'
import { cleanTags, sortEntries, type StorageEntry, type StorageFolder } from '../shared/documents'

export const files = new Hono<{ Bindings: Env; Variables: { token: string } }>()

const MISSING = 'Connect Google Drive or OneDrive on the Connections page to keep documents. They go in its Business Agent/Documents folder.'

files.use('/api/files/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const { data: allowed } = await userClient(c.env, token, 'app').rpc('can_see_pay')
  if (!allowed) return c.json({ error: 'Only admins with pay access manage documents' }, 403)
  c.set('token', token)
  await next()
})

/** ?path=Documents/Contracts: any folder under Business Agent ('' is Business Agent itself), as it's named there. */
function browsePath(raw: string | undefined) {
  const path = (raw ?? '').split('/').filter(Boolean)
  // Nothing that climbs out, or that Drive's search can't take (a quote is escaped there; a backslash isn't).
  if (path.length > 8 || path.some(p => p === '.' || p === '..' || p.length > 255 || /[\\\u0000-\u001f]/.test(p))) {
    throw new TaxError('That folder isn’t in Business Agent')
  }
  return path
}

type Found = { link: string | null; entries: Omit<StorageEntry, 'kept_id'>[] }

async function fromDrive(token: string, path: string[]): Promise<Found> {
  const id = await google.findFolderPath(token, path)
  if (!id) return { link: null, entries: [] }
  return {
    link: google.folderLink(id),
    entries: (await google.listChildren(token, id)).map(f => {
      const folder = f.mimeType === google.DRIVE_FOLDER
      return { id: f.id, name: f.name, folder, size: f.size ? Number(f.size) : null, modified: f.modifiedTime ?? null,
        type: folder ? null : f.mimeType, link: f.webViewLink ?? (folder ? google.folderLink(f.id) : google.fileLink(f.id)) }
    }),
  }
}

async function fromOneDrive(token: string, path: string[]): Promise<Found> {
  const got = await ms.listChildren(token, path)
  if (!got) return { link: null, entries: [] }
  return {
    link: got.link,
    entries: got.items.map(i => ({ id: i.id, name: i.name, folder: !!i.folder, size: i.folder ? null : i.size ?? null,
      modified: i.lastModifiedDateTime ?? null, type: i.file?.mimeType ?? null, link: i.webUrl ?? null })),
  }
}

/** Which of these files are kept documents (file id → its row's id), as the person sees them. */
async function keptAmong(asPerson: SupabaseClient, storage: string, ids: string[]) {
  const kept = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await asPerson.from('tax_documents').select('id,file_id').eq('storage', storage).in('file_id', ids.slice(i, i + 100))
    if (error) throw new Error(error.message)
    for (const d of (data ?? []) as { id: string; file_id: string }[]) kept.set(d.file_id, d.id)
  }
  return kept
}

// What's inside a folder under Business Agent: its folders and files (none when it isn't there yet).
files.get('/api/files/browse', async c => {
  const db = await requestDb(c)
  try {
    const path = browsePath(c.req.query('path'))
    const s = await keptStorage(c.env, db, MISSING)
    let found: Found
    try {
      found = s.storage === 'google_drive' ? await fromDrive(s.token, path) : await fromOneDrive(s.token, path)
    } catch (e) {
      throw await broken(db, s.storage, e)
    }
    const kept = await keptAmong(userClient(c.env, c.get('token'), 'app'), s.storage, found.entries.filter(e => !e.folder).map(e => e.id))
    const folder: StorageFolder = { storage: s.storage, path, link: found.link,
      entries: sortEntries(found.entries.map(e => ({ ...e, kept_id: e.folder ? null : kept.get(e.id) ?? null }))) }
    return c.json(folder)
  } catch (e) {
    return c.json(fail(e), status(e))
  }
})

// A new folder inside Documents: { path: ["Documents"], name: "Seguros" } → its path.
files.post('/api/files/folders', async c => {
  const db = await requestDb(c)
  try {
    const body = await c.req.json<{ path?: unknown; name?: unknown }>().catch(() => ({} as { path?: unknown; name?: unknown }))
    const parent = cleanFolderPath(body.path ?? ['Documents'], ['Documents'])
    const name = typeof body.name === 'string' ? cleanFolderName(body.name) : null
    if (!parent) throw new TaxError('That folder isn’t in the Documents folder')
    if (!name) throw new TaxError('Give the folder a name (up to 100 characters)')
    const path = [...parent, name]
    if (path.length > 8) throw new TaxError('That’s too many folders deep')
    const s = await keptStorage(c.env, db, MISSING)
    try {
      if (s.storage === 'google_drive') await google.folderPath(s.token, path)
      else await ms.ensurePath(s.token, path)
    } catch (e) {
      throw await broken(db, s.storage, e)
    }
    return c.json({ path })
  } catch (e) {
    return c.json(fail(e), status(e))
  }
})

/** The hub's own details of an upload: ?title, tags (comma-separated) and expires_on (YYYY-MM-DD). */
function details(q: (k: string) => string) {
  const title = q('title').trim()
  const expires = q('expires_on')
  if (title.length > 200) throw new TaxError('Keep the title to 200 characters')
  if (expires && (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || Number.isNaN(Date.parse(`${expires}T12:00:00Z`)) || expires < '1990-01-01' || expires > '2100-12-31')) {
    throw new TaxError('That date isn’t right')
  }
  return { title: title || null, tags: cleanTags(q('tags')), expires_on: expires || null }
}

/**
 * Upload one document into Documents/<folder…>: the file's bytes, with ?name, kind, year, folder,
 * sha256 (a file already kept is refused), title, tags and expires_on. Returns the saved row.
 */
files.post('/api/files/upload', async c => {
  const db = await requestDb(c)
  const asPerson = userClient(c.env, c.get('token'), 'app')
  try {
    const folder = pathParam(c.req.query('folder'), 'Documents')
    const extra = details(k => c.req.query(k) ?? '')
    if (!await connectedOf(db, ['google_drive', 'onedrive'] as const)) throw new TaxError(MISSING)
    return c.json({ document: await keepTaxFile(c.env, db, asPerson, { ...await readUpload(c, asPerson, folder), extra }) })
  } catch (e) {
    return c.json(fail(e), status(e))
  }
})
