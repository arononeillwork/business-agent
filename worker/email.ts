// The Email page: the business's connected Gmail or Outlook as a list, read only, with chips (unread,
// starred, important, with files, invoices & receipts, suppliers, customers & bookings), a search, a
// period and a supplier. Admins only, and only once reading the mailbox is allowed (the same
// permission as Invoices → From email). Each list is kept 5 minutes (provider_cache), so going back
// and forth between chips doesn't read the mailbox again each time; who each email is from (a
// supplier, a customer) is worked out on every request, so a supplier added shows straight away.
// An email opens in the app (its body, its files) and is replied to from there, in the same
// conversation, with the permission the mailbox was connected with (sending).
import { Hono, type Context } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, requestDb, userClient, type Env } from './supabase'
import { connectedOf, connectorGrant, explain, lasting, markBroken } from './connections'
import { cached } from './cache'
import { parseFrom } from './invoices'
import * as google from './providers/google'
import * as ms from './providers/microsoft'
import { matchSupplier } from '../shared/invoices'
import {
  DEFAULT_EMAIL_DAYS, EMAIL_FILTERS, EMAIL_PAGE_SIZE, applyEmailQuery, cleanEmailSearch, customerName, gmailLink, gmailSearch, isEmailFilter,
  supplierSenders, type EmailFilter, type EmailMessage, type EmailState,
  MAX_REPLY_LENGTH, htmlToText, placePictures, quotedReply, replyHtml, replyMime, replyRecipients, sniffType, toBase64Url, type EmailFull, type EmailReply,
} from '../shared/email'
import type { Supplier } from '../shared/stock'
import { MINUTES } from '../shared/refresh'

export const email = new Hono<{ Bindings: Env; Variables: { token: string } }>()

email.use('/api/email/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const { data: isAdmin } = await userClient(c.env, token, 'app').rpc('is_admin')
  if (!isAdmin) return c.json({ error: 'Only an admin can read the business’s email' }, 403)
  c.set('token', token)
  await next()
})

type Mailbox = 'gmail' | 'outlook'
/** The connected mailbox, its address, and whether reading it was allowed (not only sending). */
async function mailbox(db: SupabaseClient) {
  const p = await connectedOf(db, ['gmail', 'outlook'] as const)
  if (!p) return null
  const { data } = await db.from('integrations').select('external, account_label').eq('provider', p).single()
  return { provider: p as Mailbox, account: (data?.account_label as string | null) ?? null,
    canRead: (data?.external as { reads_mail?: boolean } | null)?.reads_mail === true }
}

/** What the mailbox gives, before it's matched to suppliers and customers (what's kept in provider_cache). */
type Listed = Omit<EmailMessage, 'from' | 'from_name' | 'link' | 'supplier_id' | 'customer_id' | 'customer_name'> & { from: string; link: string | null }
type SupplierRow = Pick<Supplier, 'id' | 'name' | 'email' | 'website' | 'active' | 'tax_id'>
type CustomerRow = { id: string; first_name: string | null; last_name: string | null; company: string | null; email: string }

/** The chips Outlook can narrow by itself; the others are worked out from what comes back. */
const OUTLOOK_ONLY: Partial<Record<EmailFilter, 'unread' | 'starred' | 'important' | 'attachments'>> = {
  unread: 'unread', starred: 'starred', important: 'important', attachments: 'attachments', invoices: 'attachments',
}

// ?filter=unread&q=…&days=30&supplier=<id>&page=<next_page>: a page of emails, newest first.
email.get('/api/email/messages', async c => {
  const db = await requestDb(c)
  const box = await mailbox(db)
  if (!box?.canRead) {
    return c.json({ mailbox: box?.provider ?? null, account: box?.account ?? null, can_read: false, messages: [], next_page: null } satisfies EmailState)
  }
  const filter: EmailFilter = isEmailFilter(c.req.query('filter')) ? c.req.query('filter') as EmailFilter : 'all'
  const q = cleanEmailSearch(c.req.query('q'))
  const days = Math.min(Math.max(Math.round(Number(c.req.query('days'))) || DEFAULT_EMAIL_DAYS, 1), 365)
  const supplierId = c.req.query('supplier')?.trim() || null
  const page = c.req.query('page')?.trim().slice(0, 500) || null
  if (page && box.provider === 'outlook' && !/^\d{1,5}$/.test(page)) return c.json({ error: 'That page of emails isn’t there any more. Reload the page.' }, 400)

  const asPerson = userClient(c.env, c.get('token'), 'app')
  const [{ data: supplierRows }, { data: customerRows }] = await Promise.all([
    asPerson.from('suppliers').select('id, name, email, website, active, tax_id'),
    asPerson.from('customers').select('id, first_name, last_name, company, email').not('email', 'is', null).order('updated_at', { ascending: false }).limit(1000),
  ])
  const suppliers = (supplierRows ?? []) as SupplierRow[]
  const customers = (customerRows ?? []) as CustomerRow[]
  const picked = supplierId ? suppliers.find(s => s.id === supplierId) : undefined
  if (supplierId && !picked) return c.json({ error: 'That supplier isn’t on the Suppliers page any more' }, 400)

  // One sign-in for everything this request reads (the list and the chips' counts).
  let grant: Promise<string> | null = null
  const token = () => (grant ??= connectorGrant(c.env, db, box.provider).then(g => g.token))
  const key = `email:${box.provider}:${days}:${supplierId ?? ''}:${q}`
  try {
    let listed: { messages: Listed[]; next_page: string | null }
    let counts: Partial<Record<EmailFilter, number>> | undefined
    let fetchedAt: string
    if (box.provider === 'gmail') {
      // Gmail searches the whole period itself: each chip is a search (shared/email.ts).
      const search = (f: EmailFilter) => gmailSearch({
        filter: f, q, days, supplier: picked ? supplierSenders(picked) : null,
        suppliers: suppliers.filter(s => s.active !== false).flatMap(supplierSenders),
        // The customers most recently in touch (a search has to stay short).
        customers: customers.slice(0, 40).map(x => x.email.trim().toLowerCase()),
      })
      const wanted = search(filter)
      const [list, chips] = await Promise.all([
        cached(db, `${key}:${filter}:${page ?? ''}`, MINUTES.email, async () =>
          wanted === null ? { messages: [], next_page: null } : await google.gmailMessages(await token(), { q: wanted, max: EMAIL_PAGE_SIZE, pageToken: page })),
        // The chips' counts come with the first page only ("Show more" keeps them), a few at a time so
        // Gmail isn't asked too much at once. They're extra: if Gmail won't count, the list still shows.
        page ? null : cached(db, `${key}:counts`, MINUTES.email, async () => {
          const out: Partial<Record<EmailFilter, number>> = {}
          for (let i = 0; i < EMAIL_FILTERS.length; i += 4) {
            await Promise.all(EMAIL_FILTERS.slice(i, i + 4).map(async f => {
              const s = search(f.id)
              out[f.id] = s === null ? 0 : await google.gmailCount(await token(), s)
            }))
          }
          return out
        }).catch(e => {
          // A sign-in that's gone is the list's to say (it fails the same way).
          if (lasting(box.provider, e)) throw e
          return null
        }),
      ])
      listed = list.data
      counts = chips?.data
      fetchedAt = list.fetched_at
    } else {
      // Outlook narrows by date and flags; the words, suppliers and customers are sorted here.
      const since = new Date(Date.now() - days * 86_400_000).toISOString()
      const list = await cached(db, `${key}:${OUTLOOK_ONLY[filter] ?? 'all'}:${page ?? ''}`, MINUTES.email, async () =>
        await ms.outlookMessages(await token(), { since, only: OUTLOOK_ONLY[filter], search: q || undefined, top: EMAIL_PAGE_SIZE, skip: Number(page ?? 0) }))
      listed = list.data
      fetchedAt = list.fetched_at
    }

    const byEmail = new Map(customers.map(x => [x.email.trim().toLowerCase(), x]))
    let messages: EmailMessage[] = listed.messages.map(m => {
      const from = parseFrom(m.from)
      const customer = byEmail.get(from.email)
      return {
        ...m, from: from.email, from_name: from.name, link: m.link ?? gmailLink(m.thread_id, box.account),
        supplier_id: matchSupplier(suppliers, { email: from.email }), customer_id: customer?.id ?? null, customer_name: customer ? customerName(customer) : null,
      }
    })
    // Outlook searched for what's typed itself (bodies too); the period, chip and supplier are checked here.
    if (box.provider === 'outlook') messages = applyEmailQuery(messages, { filter, days, supplier: supplierId })
    return c.json({ mailbox: box.provider, account: box.account, can_read: true, messages, next_page: listed.next_page, counts, fetched_at: fetchedAt } satisfies EmailState)
  } catch (e) {
    // A connection that won't work again until it's connected again turns its Connections card red.
    if (lasting(box.provider, e)) await markBroken(db, box.provider, explain(box.provider, e))
    return c.json({ error: explain(box.provider, e) }, 502)
  }
})

// ---------------------------------------------------------------------------------------------
// One email opened in the app, its files, and a reply. Nothing is kept: each is read from the
// mailbox when it's asked for. Opening an email doesn't mark it read (the read permission can't).
// ---------------------------------------------------------------------------------------------
type Ctx = Context<{ Bindings: Env; Variables: { token: string } }>

/** An id as the mailbox gives it (Gmail's are hex, its files' long base64url; Outlook's base64, with - _ = + /). */
const MAIL_ID = /^[\w=+/-]{1,4096}$/
const GONE = /Requested entity was not found|ErrorItemNotFound|object was not found|Invalid id/i

/** The mailbox an email is read from, once reading it is allowed; otherwise the answer to give. */
async function readableMailbox(c: Ctx) {
  const db = await requestDb(c)
  const box = await mailbox(db)
  if (!box) return { refused: c.json({ error: 'Connect Gmail or Outlook on Connections first' }, 400) }
  if (!box.canRead) return { refused: c.json({ error: `Allow Business Agent to read ${box.provider === 'gmail' ? 'Gmail' : 'Outlook'} first, on the Email page.` }, 400) }
  return { db, box }
}

/** The mailbox failed: an email that's gone says so; a connection that won't work again turns its card red. */
async function mailboxFailed(c: Ctx, db: SupabaseClient, p: Mailbox, e: unknown) {
  if (GONE.test(e instanceof Error ? e.message : String(e))) return c.json({ error: 'That email isn’t in the mailbox any more' }, 404)
  if (lasting(p, e)) await markBroken(db, p, explain(p, e))
  return c.json({ error: explain(p, e) }, 502)
}

/** The first bytes of a stream (to see what the file really is), and the whole stream to pass on. */
async function peek(body: ReadableStream<Uint8Array>, n = 16) {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let got = 0
  while (got < n) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    got += value.length
  }
  const head = new Uint8Array(got)
  chunks.reduce((at, chunk) => { head.set(chunk, at); return at + chunk.length }, 0)
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) { if (head.length) ctrl.enqueue(head) },
    async pull(ctrl) {
      const { done, value } = await reader.read()
      if (done) ctrl.close()
      else ctrl.enqueue(value)
    },
    cancel(why) { return reader.cancel(why) },
  })
  return { head, stream }
}

// One email: who it's from and to, its HTML (with the pictures inside it) or text, and its files.
email.get('/api/email/messages/:id', async c => {
  const id = c.req.param('id')
  if (!MAIL_ID.test(id)) return c.json({ error: 'That email isn’t in the mailbox any more' }, 404)
  const open = await readableMailbox(c)
  if ('refused' in open) return open.refused
  const { db, box } = open
  try {
    const { token } = await connectorGrant(c.env, db, box.provider)
    const m = box.provider === 'gmail' ? await google.gmailMessage(token, id) : await ms.outlookMessage(token, id, { pictures: google.PICTURES })
    const from = parseFrom(m.from)
    return c.json({
      id: m.id, thread_id: m.thread_id, from: from.email, from_name: from.name, to: m.to, cc: m.cc, reply_to: m.reply_to, subject: m.subject, at: m.at,
      html: m.html === null ? null : placePictures(m.html, m.pictures), text: m.text, attachments: m.attachments, link: m.link ?? gmailLink(m.thread_id, box.account),
    } satisfies EmailFull)
  } catch (e) {
    return mailboxFailed(c, db, box.provider, e)
  }
})

// A file on an email (?name=: what to call it when it's saved), as the bytes themselves. Sent as
// what it really is when that's a PDF or a picture (from its first bytes, not what the email
// claims), else as a download; nothing a browser would run.
email.get('/api/email/messages/:id/attachments/:attachment', async c => {
  const { id, attachment } = c.req.param()
  if (!MAIL_ID.test(id) || !MAIL_ID.test(attachment)) return c.json({ error: 'That file isn’t on the email any more' }, 404)
  const open = await readableMailbox(c)
  if ('refused' in open) return open.refused
  const { db, box } = open
  const name = (c.req.query('name') ?? '').replace(/[\p{Cc}/\\"]+/gu, ' ').trim().slice(0, 200) || 'attachment'
  try {
    const { token } = await connectorGrant(c.env, db, box.provider)
    let head: Uint8Array
    let body: BodyInit
    if (box.provider === 'gmail') {
      const bytes = await google.gmailAttachment(token, id, attachment)
      head = bytes
      body = bytes as Uint8Array<ArrayBuffer>
    } else {
      const peeked = await peek(await ms.outlookAttachmentStream(token, id, attachment))
      head = peeked.head
      body = peeked.stream
    }
    const type = sniffType(head)
    return new Response(body, { headers: {
      'content-type': type ?? 'application/octet-stream',
      'content-disposition': `${type ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store', 'content-security-policy': 'sandbox',
    } })
  } catch (e) {
    return mailboxFailed(c, db, box.provider, e)
  }
})

// A reply { text, all? } from the mailbox, in the email's conversation: to who sent it (or its
// Reply-To), and with all, everyone else it went to. Gmail: a message in its thread, the email
// quoted under it; Outlook: its own reply, which quotes the email itself.
email.post('/api/email/messages/:id/reply', async c => {
  const id = c.req.param('id')
  if (!MAIL_ID.test(id)) return c.json({ error: 'That email isn’t in the mailbox any more' }, 404)
  const b = await c.req.json<Partial<EmailReply>>().catch(() => ({} as Partial<EmailReply>))
  const text = typeof b.text === 'string' ? b.text.trim() : ''
  if (!text) return c.json({ error: 'Write your reply first' }, 400)
  if (text.length > MAX_REPLY_LENGTH) return c.json({ error: 'That reply is too long to send from here' }, 400)
  const open = await readableMailbox(c)
  if ('refused' in open) return open.refused
  const { db, box } = open
  try {
    const { token } = await connectorGrant(c.env, db, box.provider)
    if (box.provider === 'gmail') {
      const m = await google.gmailMessage(token, id, { pictures: false })
      const from = parseFrom(m.from)
      const { to, cc } = replyRecipients({ from: from.email, from_name: from.name, reply_to: m.reply_to, to: m.to, cc: m.cc }, box.account, b.all === true)
      if (!to.length) return c.json({ error: 'This email has no address to reply to' }, 400)
      const said = m.text ?? (m.html ? htmlToText(m.html) : '')
      const raw = replyMime({ to, cc, subject: m.subject, inReplyTo: m.message_id, references: m.references,
        text: quotedReply(text, { date: m.date || new Date(m.at).toUTCString(), from: m.from, body: said }) })
      await google.sendGmail(token, toBase64Url(new TextEncoder().encode(raw)), m.thread_id)
    } else {
      await ms.outlookReply(token, id, replyHtml(text), b.all === true)
    }
    return c.json({ sent: true })
  } catch (e) {
    return mailboxFailed(c, db, box.provider, e)
  }
})
