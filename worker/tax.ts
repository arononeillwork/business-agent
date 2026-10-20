// Tax page: documents go into the café's own Google Drive or OneDrive, under "Business Agent/Tax/…"
// (sorted by year, quarter and kind, or into a folder the admin picks or makes there), and the
// database keeps where each one is (tax_documents). Admins with pay access only, as Finances.
// With Drive's drive.file permission the app sees only folders it made, so folders are found by
// their path under "Business Agent" on both Drive and OneDrive.
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { connectedOf, connectorGrant, explain, lasting, markBroken, setIntegration } from './connections'
import * as google from './providers/google'
import * as ms from './providers/microsoft'
import { cleanFolderName, cleanFolderPath, isDocKind, safeFileName, taxFileProblem, taxFileType, MAX_TAX_FILE_BYTES } from '../shared/tax'

type Storage = 'google_drive' | 'onedrive'

export const tax = new Hono<{ Bindings: Env; Variables: { token: string } }>()

/** A problem with what was sent (shown as is), as opposed to storage failing. */
class TaxError extends Error {}

tax.use('/api/tax/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const { data: allowed } = await userClient(c.env, token, 'app').rpc('can_see_pay')
  if (!allowed) return c.json({ error: 'Only admins with pay access manage tax documents' }, 403)
  c.set('token', token)
  await next()
})

/** The connected Drive or OneDrive, with a fresh access token. */
async function storage(env: Env, db: SupabaseClient): Promise<{ storage: Storage; token: string }> {
  const p = await connectedOf(db, ['google_drive', 'onedrive'] as const)
  if (!p) throw new TaxError('Connect Google Drive or OneDrive on the Connections page to keep tax documents. They go in its Business Agent/Tax folder.')
  try {
    return { storage: p, token: (await connectorGrant(env, db, p)).token }
  } catch (e) {
    throw await broken(db, p, e)
  }
}

/** Storage failed: the Connections card turns red when trying again won't fix it. */
async function broken(db: SupabaseClient, p: Storage, e: unknown) {
  if (e instanceof TaxError) return e
  if (lasting(p, e)) await markBroken(db, p, explain(p, e))
  return new Error(explain(p, e))
}

const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })
const status = (e: unknown) => (e instanceof TaxError ? 400 : 502)

/** ?path=Tax/2026/Q4: a folder under Business Agent (Tax when none is given). */
function pathParam(raw: string | undefined) {
  const path = cleanFolderPath((raw || 'Tax').split('/'))
  if (!path) throw new TaxError('That folder isn’t in the Tax folder')
  return path
}

// The folders inside one (made if missing), and a link to open it in Drive or OneDrive.
tax.get('/api/tax/folders', async c => {
  const db = serviceClient(c.env)
  try {
    const path = pathParam(c.req.query('path'))
    const s = await storage(c.env, db)
    try {
      if (s.storage === 'google_drive') {
        const id = await google.folderPath(s.token, path)
        return c.json({ storage: s.storage, path, folders: await google.listFolders(s.token, id), link: google.folderLink(id) })
      }
      return c.json({ storage: s.storage, path, ...await ms.listFolders(s.token, path) })
    } catch (e) {
      throw await broken(db, s.storage, e)
    }
  } catch (e) {
    return c.json(fail(e), status(e))
  }
})

// A new folder inside one: { path: ["Tax", "2026"], name: "Gestoría" } → its path.
tax.post('/api/tax/folders', async c => {
  const db = serviceClient(c.env)
  try {
    const body = await c.req.json<{ path?: unknown; name?: unknown }>().catch(() => ({} as { path?: unknown; name?: unknown }))
    const parent = cleanFolderPath(body.path ?? ['Tax'])
    const name = typeof body.name === 'string' ? cleanFolderName(body.name) : null
    if (!parent) throw new TaxError('That folder isn’t in the Tax folder')
    if (!name) throw new TaxError('Give the folder a name (up to 100 characters)')
    const path = [...parent, name]
    if (path.length > 8) throw new TaxError('That’s too many folders deep')
    const s = await storage(c.env, db)
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

/**
 * Upload one document: the file's bytes, with ?name, kind, year, quarter (none: the whole year),
 * folder (Tax/2026/Q4/Purchase invoices) and sha256 (its fingerprint, so a file already kept is
 * refused). Returns the saved tax_documents row.
 */
tax.post('/api/tax/upload', async c => {
  const db = serviceClient(c.env)
  const asPerson = userClient(c.env, c.get('token'), 'app')
  try {
    const q = (k: string) => c.req.query(k) ?? ''
    const name = safeFileName(q('name'))
    const kind = q('kind')
    const year = Number(q('year'))
    const quarter = q('quarter') ? Number(q('quarter')) : null
    const sha256 = q('sha256').toLowerCase() || null
    const folder = pathParam(q('folder'))
    const declared = Number(c.req.header('content-length') ?? '') || null
    if (!q('name')) throw new TaxError('The file needs a name')
    if (!isDocKind(kind)) throw new TaxError('Choose what kind of document it is')
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new TaxError('Choose the year it’s for')
    if (quarter !== null && ![1, 2, 3, 4].includes(quarter)) throw new TaxError('Choose the quarter it’s for')
    if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) throw new TaxError('The file’s fingerprint is wrong')
    const problem = taxFileProblem(name, declared ?? 1)
    if (problem) throw new TaxError(problem)
    if (sha256) {
      const { data: kept } = await asPerson.from('tax_documents').select('name').eq('sha256', sha256).maybeSingle()
      if (kept) return c.json({ error: `Already kept as “${(kept as { name: string }).name}”` }, 409)
    }

    // A known size streams straight through to storage; otherwise it's read first (up to 25 MB).
    const Fixed = (globalThis as { FixedLengthStream?: new (n: number) => TransformStream }).FixedLengthStream
    const body = declared && c.req.raw.body && Fixed ? c.req.raw.body.pipeThrough(new Fixed(declared)) : await c.req.arrayBuffer()
    const size = body instanceof ArrayBuffer ? body.byteLength : declared!
    if (size === 0) throw new TaxError('That file is empty')
    if (size > MAX_TAX_FILE_BYTES) throw new TaxError('Files can be up to 25 MB')
    const type = taxFileType(name)!

    const s = await storage(c.env, db)
    let file: { id: string; link: string | null }
    try {
      if (s.storage === 'google_drive') {
        const id = await google.uploadToDrive(s.token, await google.folderPath(s.token, folder), name, type, size, body)
        file = { id, link: google.fileLink(id) }
      } else {
        const item = await ms.uploadItem(s.token, folder, name, size, body)
        file = { id: item.id, link: item.webUrl }
      }
    } catch (e) {
      throw await broken(db, s.storage, e)
    }
    await setIntegration(db, s.storage, { last_sync_at: new Date().toISOString(), last_error: null })

    // Saved as the person, so the database's rules (and the audit log) apply.
    const { data, error } = await asPerson.from('tax_documents').insert({
      name, kind, year, quarter, size, sha256, storage: s.storage, file_id: file.id, folder, link: file.link,
    }).select('*').single()
    if (error) throw new TaxError(/duplicate|unique/i.test(error.message) ? 'That file is already kept' : error.message)
    return c.json({ document: data })
  } catch (e) {
    return c.json(fail(e), status(e))
  }
})
