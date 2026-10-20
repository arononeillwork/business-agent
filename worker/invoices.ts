// Invoices that come by email: the connected Gmail or Outlook is read (only when the admin allowed
// it, on the Invoices page) for emails with files that could be invoices, each matched to its
// supplier; bringing one in keeps the file as a tax document (Tax/<year>/Q<n>/Purchase invoices in
// the café's Drive or OneDrive) and adds the invoice, with what a Facturae e-invoice says filled in.
// Admins with pay access only, as Tax.
import { Hono } from 'hono'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { connectedOf, connectorGrant, explain, lasting, markBroken } from './connections'
import * as google from './providers/google'
import * as ms from './providers/microsoft'
import { keepTaxFile, TaxError } from './tax'
import { autoFolder, guessPeriod, safeFileName, taxFileType, MAX_TAX_FILE_BYTES, quarterOf } from '../shared/tax'
import { dueFrom, emailId, matchSupplier, numberFromName, readFacturae, type InboxInvoice, type InboxState } from '../shared/invoices'

export const invoices = new Hono<{ Bindings: Env; Variables: { token: string } }>()

invoices.use('/api/invoices/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const { data: allowed } = await userClient(c.env, token, 'app').rpc('can_see_pay')
  if (!allowed) return c.json({ error: 'Only admins with pay access manage invoices' }, 403)
  c.set('token', token)
  await next()
})

/** "Tostadores del Sur <pedidos@tostadores.es>" → its name and address. */
export function parseFrom(from: string) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  return m ? { name: m[1].trim() || null, email: m[2].trim().toLowerCase() } : { name: null, email: from.trim().toLowerCase() }
}

type Mailbox = 'gmail' | 'outlook'
async function mailbox(db: ReturnType<typeof serviceClient>) {
  const p = await connectedOf(db, ['gmail', 'outlook'] as const)
  if (!p) return null
  const { data } = await db.from('integrations').select('external').eq('provider', p).single()
  return { provider: p as Mailbox, canRead: (data?.external as { reads_mail?: boolean } | null)?.reads_mail === true }
}

/** The mailbox failed: its Connections card turns red when trying again won't fix it. */
async function broken(db: ReturnType<typeof serviceClient>, p: Mailbox, e: unknown) {
  if (e instanceof TaxError) return e
  if (lasting(p, e)) await markBroken(db, p, explain(p, e))
  return new Error(explain(p, e))
}

// Emails from the last ?days (60 by default) with files that could be invoices, each matched to a supplier.
invoices.get('/api/invoices/inbox', async c => {
  const db = serviceClient(c.env)
  const asPerson = userClient(c.env, c.get('token'), 'app')
  const box = await mailbox(db)
  if (!box || !box.canRead) return c.json({ mailbox: box?.provider ?? null, can_read: false, messages: [] } satisfies InboxState)
  const days = Math.min(Math.max(Number(c.req.query('days')) || 60, 1), 365)
  try {
    const { token } = await connectorGrant(c.env, db, box.provider)
    const found = box.provider === 'gmail' ? await google.gmailWithAttachments(token, days) : await ms.outlookWithAttachments(token, days)
    const [{ data: suppliers }, { data: done }] = await Promise.all([
      asPerson.from('suppliers').select('id, email, website, active, tax_id'),
      asPerson.from('invoices').select('email_id').eq('source', 'email'),
    ])
    const imported = new Set((done ?? []).map(r => (r as { email_id: string | null }).email_id))
    const messages: InboxInvoice[] = found.map(m => {
      const from = parseFrom(m.from)
      return {
        id: m.id, from: from.email, from_name: from.name, subject: m.subject, at: m.at,
        attachments: m.files.filter(f => taxFileType(f.name) && f.size <= MAX_TAX_FILE_BYTES)
          .map(f => ({ ...f, imported: imported.has(emailId(box.provider, m.id, f.id)) })),
        supplier_id: matchSupplier((suppliers ?? []) as never[], { email: from.email }),
      }
    }).filter(m => m.attachments.length)
    return c.json({ mailbox: box.provider, can_read: true, messages } satisfies InboxState)
  } catch (e) {
    const err = await broken(db, box.provider, e)
    return c.json({ error: err.message }, 502)
  }
})

/**
 * Bring one attachment in: { message, attachment, name, at, from, from_name, subject, supplier_id? }.
 * The file goes to Tax/<year>/Q<n>/Purchase invoices (the quarter of the email, or a date in the
 * file's name); a file already kept is linked rather than stored twice. Returns the new invoice.
 */
invoices.post('/api/invoices/import', async c => {
  const db = serviceClient(c.env)
  const asPerson = userClient(c.env, c.get('token'), 'app')
  type Body = { message?: string; attachment?: string; name?: string; at?: string; from?: string; from_name?: string | null; subject?: string; supplier_id?: string | null }
  const b = await c.req.json<Body>().catch(() => ({} as Body))
  if (!b.message || !b.attachment || !b.name) return c.json({ error: 'Choose a file from an email' }, 400)
  const type = taxFileType(b.name)
  if (!type) return c.json({ error: 'Use a PDF, a photo (JPEG, PNG, HEIC), a spreadsheet, a document or an e-invoice (XML)' }, 400)
  const box = await mailbox(db)
  if (!box?.canRead) return c.json({ error: 'Allow Business Agent to read the mailbox first (Invoices → From email).' }, 400)
  const id = emailId(box.provider, b.message, b.attachment)
  const { data: already } = await asPerson.from('invoices').select('id').eq('email_id', id).maybeSingle()
  if (already) return c.json({ error: 'That invoice is already in' }, 409)
  try {
    const { token } = await connectorGrant(c.env, db, box.provider)
    let bytes: Uint8Array
    try {
      bytes = box.provider === 'gmail' ? await google.gmailAttachment(token, b.message, b.attachment) : await ms.outlookAttachment(token, b.message, b.attachment)
    } catch (e) {
      throw await broken(db, box.provider, e)
    }
    if (!bytes.length) throw new TaxError('That file is empty')
    if (bytes.length > MAX_TAX_FILE_BYTES) throw new TaxError('Files can be up to 25 MB')
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('')

    // What it says, when it's a Facturae e-invoice.
    const facturae = /xml|xsig/i.test(b.name) ? readFacturae(new TextDecoder().decode(bytes)) : null
    const name = safeFileName(b.name)
    const at = (b.at ?? new Date().toISOString()).slice(0, 10)
    const issued = facturae?.issued_on ?? null
    const period = issued ? { year: Number(issued.slice(0, 4)), quarter: quarterOf(issued) } : /\d{4}/.test(name) ? guessPeriod(name, Date.parse(at)) : { year: Number(at.slice(0, 4)), quarter: quarterOf(at) }

    // Kept once: a file already on the Tax page is linked, not stored again.
    const { data: kept } = await asPerson.from('tax_documents').select('id').eq('sha256', sha256).maybeSingle()
    const document = (kept as { id: string } | null) ?? await keepTaxFile(c.env, db, asPerson, {
      name, kind: 'purchase_invoice', year: period.year, quarter: period.quarter, size: bytes.length, sha256, folder: autoFolder('purchase_invoice', period.year, period.quarter), type, body: bytes,
    })

    const { data: suppliers } = await asPerson.from('suppliers').select('id, email, website, active, tax_id, payment_terms')
    const from = parseFrom(b.from ?? '')
    const supplierId = b.supplier_id ?? matchSupplier((suppliers ?? []) as never[], { email: from.email, tax_id: facturae?.seller_tax_id })
    const terms = (suppliers ?? []).find(s => (s as { id: string }).id === supplierId) as { payment_terms?: string | null } | undefined
    const { data, error } = await asPerson.from('invoices').insert({
      direction: 'in', supplier_id: supplierId, party_name: facturae?.seller_name ?? b.from_name ?? null, party_email: from.email || null,
      party_tax_id: facturae?.seller_tax_id ?? null, number: facturae?.number ?? numberFromName(name), issued_on: issued,
      due_on: facturae?.due_on ?? dueFrom(issued, terms?.payment_terms), net: facturae?.net ?? null, vat: facturae?.vat ?? null, total: facturae?.total ?? null,
      currency: facturae?.currency ?? 'EUR', status: 'to_check', document_id: document.id, source: 'email', email_id: id,
      email_from: b.from ?? null, email_subject: b.subject ?? null, email_at: b.at ?? null,
    }).select('*').single()
    if (error) throw new TaxError(/duplicate|unique/i.test(error.message) ? 'That invoice is already in' : error.message)
    return c.json({ invoice: data })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, e instanceof TaxError ? 400 : 502)
  }
})
