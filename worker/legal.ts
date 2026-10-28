// Legal page: the business's legal documents stay where they already are, in its own Google Drive or
// OneDrive (both can be connected; the admin chooses which to pick from). Nothing is copied: the
// database keeps where each file is (legal_documents) and the page shows a file by asking its storage
// for it, there and then.
//   Google Drive  files are chosen in Google's own picker in the browser (the app has drive.file, so
//                 it can open only what was picked); the picker gets a short-lived token from here.
//   OneDrive      the app can read the whole OneDrive (Files.ReadWrite), so its folders are browsed here.
// Admins pick and add; whoever can read a document's row (admins, a gestoría with finances access)
// can see the file.
import { Hono, type Context, type Next } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, requestDb, userClient, type Env } from './supabase'
import { connectorGrant, explain, lasting, markBroken } from './connections'
import * as google from './providers/google'
import * as ms from './providers/microsoft'
import { LEGAL_STORAGES, MAX_PICK, NO_GOOGLE_PICKER, SKIPPED, guessKind, previewOf, storageName, titleOf, type LegalDocument, type LegalSource, type LegalStorage, type StorageItem, type StorageListing } from '../shared/legalDocs'
import { ALREADY_ON_BRAND, BRAND_COLUMNS, brandTitleOf, type BrandDocument } from '../shared/brandDocs'

export const legal = new Hono<{ Bindings: Env; Variables: { token: string } }>()

/** A problem with what was asked (shown as is, 400), as opposed to the storage failing (502). */
class LegalError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 415 = 400) { super(message) }
}

const signedIn = async (c: Context<{ Bindings: Env; Variables: { token: string } }>, next: Next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  c.set('token', token)
  await next()
}
legal.use('/api/legal/*', signedIn)
// The Brand page's documents picked in Drive or OneDrive work the same way (brand_documents).
legal.use('/api/brand/*', signedIn)

async function needAdmin(env: Env, token: string, what = 'legal documents') {
  const { data } = await userClient(env, token, 'app').rpc('is_admin')
  if (!data) throw new LegalError(`Only admins add ${what}`, 403)
}

/** Which page's documents: the Legal page's, or the Brand page's. */
type Table = 'legal_documents' | 'brand_documents'

const isStorage = (s: unknown): s is LegalStorage => LEGAL_STORAGES.some(x => x.id === s)

/** Google's file picker needs a browser API key and the Google Cloud project's number (the start of the client id). */
const pickerSetup = (env: Env) => {
  const appId = env.GOOGLE_CLIENT_ID?.match(/^(\d+)-/)?.[1]
  return env.GOOGLE_PICKER_API_KEY && appId ? { key: env.GOOGLE_PICKER_API_KEY, appId } : null
}

/** The storage's access, fresh; it must be connected. */
async function grant(env: Env, db: SupabaseClient, storage: LegalStorage) {
  const { data } = await db.from('integrations').select('status').eq('provider', storage).maybeSingle()
  if (data?.status !== 'connected') {
    throw new LegalError(`${storageName(storage)} isn’t connected. Connect it on the Connections page to use the documents kept there.`, 409)
  }
  try {
    return (await connectorGrant(env, db, storage)).token
  } catch (e) {
    throw await broken(db, storage, e)
  }
}

/** The storage failed: its Connections card turns red when trying again won't fix it. */
async function broken(db: SupabaseClient, storage: LegalStorage, e: unknown) {
  if (e instanceof LegalError) return e
  if (lasting(storage, e)) await markBroken(db, storage, explain(storage, e))
  return new Error(explain(storage, e))
}

const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })
const status = (e: unknown) => (e instanceof LegalError ? e.status : 502)

// Where documents can be picked from: each storage, whether it's connected and how it's picked.
legal.get('/api/legal/sources', async c => {
  try {
    await needAdmin(c.env, c.get('token'))
    const { data } = await (await requestDb(c)).from('integrations').select('provider, status, account_label').in('provider', LEGAL_STORAGES.map(s => s.id))
    const sources: LegalSource[] = LEGAL_STORAGES.map(({ id }) => {
      const row = data?.find(r => r.provider === id)
      const connected = row?.status === 'connected'
      return { storage: id, connected, account: connected ? row?.account_label ?? null : null, how: id === 'google_drive' ? 'picker' : 'browse',
        problem: connected && id === 'google_drive' && !pickerSetup(c.env) ? NO_GOOGLE_PICKER : null }
    })
    return c.json({ sources })
  } catch (e) {
    return c.json(fail(e), status(e))
  }
})

// What Google's picker needs in the browser: a short-lived Drive token (drive.file only), the key and the project.
legal.get('/api/legal/google/picker', async c => {
  try {
    await needAdmin(c.env, c.get('token'))
    const setup = pickerSetup(c.env)
    if (!setup) throw new LegalError(NO_GOOGLE_PICKER)
    const token = await grant(c.env, await requestDb(c), 'google_drive')
    c.header('cache-control', 'no-store')
    return c.json({ token, key: setup.key, app_id: setup.appId })
  } catch (e) {
    return c.json(fail(e), status(e))
  }
})

/** Which of these files are already on the page (file id → its document), as the person sees them. */
async function added(asPerson: SupabaseClient, storage: LegalStorage, ids: string[], table: Table = 'legal_documents') {
  const out = new Map<string, { id: string; title: string }>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await asPerson.from(table).select('id,file_id,title').eq('storage', storage).in('file_id', ids.slice(i, i + 100))
    if (error) throw new Error(error.message)
    for (const d of (data ?? []) as { id: string; file_id: string; title: string }[]) out.set(d.file_id, { id: d.id, title: d.title })
  }
  return out
}

// A folder of the café's OneDrive (?folder=<id>; none: the top), folders first, each file marked when it's already on the page.
legal.get('/api/legal/onedrive/browse', async c => {
  const db = await requestDb(c)
  try {
    await needAdmin(c.env, c.get('token'))
    const id = c.req.query('folder') || 'root'
    if (id.length > 200) throw new LegalError('That folder isn’t in OneDrive', 404)
    const token = await grant(c.env, db, 'onedrive')
    let folder: ms.DriveItem | null, inside: ms.DriveItem[] = []
    try {
      // The folder first: OneDrive refuses to list what's inside a file.
      folder = await ms.item(token, id)
      if (folder?.folder) inside = await ms.children(token, id)
    } catch (e) {
      throw await broken(db, 'onedrive', e)
    }
    if (!folder?.folder) throw new LegalError('That folder isn’t in OneDrive any more', 404)
    // ?for=brand: marked when they're on the Brand page instead.
    const kept = await added(userClient(c.env, c.get('token'), 'app'), 'onedrive', inside.filter(i => !i.folder).map(i => i.id),
      c.req.query('for') === 'brand' ? 'brand_documents' : 'legal_documents')
    const items: StorageItem[] = inside.map(i => ({
      id: i.id, name: i.name, folder: !!i.folder, size: i.folder ? null : i.size ?? null, modified: i.lastModifiedDateTime ?? null,
      type: i.file?.mimeType ?? null, added_id: kept.get(i.id)?.id ?? null,
    })).sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name))
    const top = id === 'root'
    const listing: StorageListing = { storage: 'onedrive', folder: { id: top ? null : folder.id, name: top ? 'OneDrive' : folder.name }, items }
    return c.json(listing)
  } catch (e) {
    return c.json(fail(e), status(e))
  }
})

type Row = Omit<LegalDocument, 'id' | 'added_by' | 'added_at'>

/** A picked file's details from its storage, as a row to keep (or why it can't be kept, and its name when known). */
async function describe(storage: LegalStorage, token: string, id: string): Promise<Row | { why: string; name: string | null }> {
  if (storage === 'google_drive') {
    const f = await google.fileInfo(token, id)
    if (!f || f.trashed) return { why: SKIPPED.unshared, name: f?.name ?? null }
    if (f.mimeType === 'application/vnd.google-apps.folder') return { why: SKIPPED.folder, name: f.name }
    return { title: titleOf(f.name), kind: guessKind(f.name), storage, file_id: f.id, file_name: f.name, mime_type: f.mimeType, size: f.size ? Number(f.size) : null,
      modified_at: f.modifiedTime ?? null, link: f.webViewLink ?? google.fileLink(f.id), location: null, notes: null }
  }
  const i = await ms.item(token, id)
  if (!i) return { why: SKIPPED.gone, name: null }
  if (i.folder || !i.file) return { why: SKIPPED.folder, name: i.name }
  return { title: titleOf(i.name), kind: guessKind(i.name), storage, file_id: i.id, file_name: i.name, mime_type: i.file.mimeType ?? null, size: i.size ?? null,
    modified_at: i.lastModifiedDateTime ?? null, link: i.webUrl?.startsWith('https://') ? i.webUrl : null, location: ms.folderOf(i) || null, notes: null }
}

// Add files picked in a storage: { storage, ids }. Each is looked up there first (so only real files the
// app can open are kept); ones already on the page, folders and ones that can't be opened are skipped.
legal.post('/api/legal/documents', async c => {
  const db = await requestDb(c)
  const asPerson = userClient(c.env, c.get('token'), 'app')
  try {
    await needAdmin(c.env, c.get('token'))
    const body = await c.req.json<{ storage?: unknown; ids?: unknown }>().catch(() => ({} as { storage?: unknown; ids?: unknown }))
    if (!isStorage(body.storage)) throw new LegalError('Choose Google Drive or OneDrive')
    const storage = body.storage
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((i): i is string => typeof i === 'string' && i.length > 0 && i.length <= 200))] : []
    if (!ids.length) throw new LegalError('Choose at least one file')
    if (ids.length > MAX_PICK) throw new LegalError(`Choose up to ${MAX_PICK} files at a time`)
    const token = await grant(c.env, db, storage)
    const already = await added(asPerson, storage, ids)
    const rows: Row[] = []
    const skipped: { id: string; name: string | null; why: string }[] = []
    for (const id of ids) {
      const kept = already.get(id)
      if (kept) { skipped.push({ id, name: kept.title, why: SKIPPED.already }); continue }
      let got: Awaited<ReturnType<typeof describe>>
      try {
        got = await describe(storage, token, id)
      } catch (e) {
        throw await broken(db, storage, e)
      }
      if ('why' in got) skipped.push({ id, ...got })
      else rows.push(got)
    }
    let documents: LegalDocument[] = []
    if (rows.length) {
      const { data, error } = await asPerson.from('legal_documents').insert(rows).select('*')
      if (error) throw new LegalError(/duplicate|unique/i.test(error.message) ? 'One of those files is already on the Legal page' : error.message)
      documents = (data ?? []) as LegalDocument[]
    }
    return c.json({ added: documents, skipped })
  } catch (e) {
    return c.json(fail(e), status(e))
  }
})

/** "inline; filename=…" that keeps accents (RFC 6266). */
const inline = (name: string) => `inline; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`

// The file itself, for showing in the page: asked of its storage now and passed straight through
// (a PDF as it is or made by the storage, or a picture). Anyone who can read the document's row.
legal.get('/api/legal/documents/:id/file', async c => {
  const db = await requestDb(c)
  try {
    const id = c.req.param('id')
    if (id.length > 64) throw new LegalError('That document isn’t on the Legal page', 404)
    const { data } = await userClient(c.env, c.get('token'), 'app').from('legal_documents').select('storage, file_id, file_name, mime_type').eq('id', id).maybeSingle()
    const d = data as Pick<LegalDocument, 'storage' | 'file_id' | 'file_name' | 'mime_type'> | null
    if (!d) throw new LegalError('That document isn’t on the Legal page', 404)
    return await fromStorage(c.env, db, d)
  } catch (e) {
    return c.json(fail(e), status(e))
  }
})

/** A document's file, asked of its storage now and passed straight through (a PDF, made by the storage when need be, or a picture). */
async function fromStorage(env: Env, db: SupabaseClient, d: Pick<LegalDocument, 'storage' | 'file_id' | 'file_name' | 'mime_type'>) {
  const preview = previewOf(d)
  if (!preview) throw new LegalError(`This kind of file opens in ${storageName(d.storage)}`, 415)
  const token = await grant(env, db, d.storage)
  let res: Response
  try {
    res = d.storage === 'google_drive'
      ? await (preview.convert ? google.driveExportPdf(token, d.file_id) : google.driveDownload(token, d.file_id))
      : await (preview.convert ? ms.oneDrivePdf(token, d.file_id) : ms.oneDriveDownload(token, d.file_id))
  } catch (e) {
    throw await broken(db, d.storage, e)
  }
  if (res.status === 404 || res.status === 410) throw new LegalError(`It isn’t in ${storageName(d.storage)} any more (or Business Agent can no longer open it)`, 404)
  if (!res.ok) {
    const said = await res.json().catch(() => ({})) as { error?: { message?: string } | string }
    const why = typeof said.error === 'string' ? said.error : said.error?.message ?? String(res.status)
    throw await broken(db, d.storage, new Error(`${d.storage === 'google_drive' ? 'Google Drive' : 'Microsoft'}: ${why}`))
  }
  return new Response(res.body, {
    headers: {
      'content-type': preview.as === 'pdf' ? 'application/pdf' : d.mime_type!,
      'content-disposition': inline(preview.convert ? d.file_name.replace(/\.[^.]+$/, '') + '.pdf' : d.file_name),
      ...(res.headers.get('content-length') && !preview.convert ? { 'content-length': res.headers.get('content-length')! } : {}),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

// Brand page: add files picked in a storage, { storage, ids }, as on the Legal page (checked there first;
// ones already on the page, folders and ones that can't be opened are skipped, with why).
legal.post('/api/brand/documents', async c => {
  const db = await requestDb(c)
  const asPerson = userClient(c.env, c.get('token'), 'app')
  try {
    await needAdmin(c.env, c.get('token'), 'brand documents')
    const body = await c.req.json<{ storage?: unknown; ids?: unknown }>().catch(() => ({} as { storage?: unknown; ids?: unknown }))
    if (!isStorage(body.storage)) throw new LegalError('Choose Google Drive or OneDrive')
    const storage = body.storage
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((i): i is string => typeof i === 'string' && i.length > 0 && i.length <= 200))] : []
    if (!ids.length) throw new LegalError('Choose at least one file')
    if (ids.length > MAX_PICK) throw new LegalError(`Choose up to ${MAX_PICK} files at a time`)
    const token = await grant(c.env, db, storage)
    const already = await added(asPerson, storage, ids, 'brand_documents')
    const rows: Omit<BrandDocument, 'id' | 'added_by' | 'added_at'>[] = []
    const skipped: { id: string; name: string | null; why: string }[] = []
    for (const id of ids) {
      const kept = already.get(id)
      if (kept) { skipped.push({ id, name: kept.title, why: ALREADY_ON_BRAND }); continue }
      let got: Awaited<ReturnType<typeof describe>>
      try {
        got = await describe(storage, token, id)
      } catch (e) {
        throw await broken(db, storage, e)
      }
      if ('why' in got) { skipped.push({ id, ...got }); continue }
      rows.push({ title: brandTitleOf(got.file_name), storage, file_id: got.file_id, file_name: got.file_name, mime_type: got.mime_type, size: got.size,
        modified_at: got.modified_at, link: got.link, location: got.location })
    }
    let documents: BrandDocument[] = []
    if (rows.length) {
      const { data, error } = await asPerson.from('brand_documents').insert(rows).select(BRAND_COLUMNS)
      if (error) throw new LegalError(/duplicate|unique/i.test(error.message) ? 'One of those files is already on the Brand page' : error.message)
      documents = (data ?? []) as unknown as BrandDocument[]
    }
    return c.json({ added: documents, skipped })
  } catch (e) {
    return c.json(fail(e), status(e))
  }
})

// A Brand page document kept in Drive or OneDrive, shown from there (an upload is read straight from the database).
legal.get('/api/brand/documents/:id/file', async c => {
  const db = await requestDb(c)
  try {
    const id = c.req.param('id')
    if (id.length > 64) throw new LegalError('That document isn’t on the Brand page', 404)
    const { data } = await userClient(c.env, c.get('token'), 'app').from('brand_documents').select('storage, file_id, file_name, mime_type').eq('id', id).maybeSingle()
    const d = data as Pick<BrandDocument, 'storage' | 'file_id' | 'file_name' | 'mime_type'> | null
    if (!d) throw new LegalError('That document isn’t on the Brand page', 404)
    if (d.storage === 'upload' || !d.file_id) throw new LegalError('That one was uploaded: it’s read from the page', 400)
    return await fromStorage(c.env, db, { ...d, storage: d.storage, file_id: d.file_id })
  } catch (e) {
    return c.json(fail(e), status(e))
  }
})
