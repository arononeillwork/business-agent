// The Email page: the business's connected Gmail or Outlook as a list, read only, with chips (unread,
// starred, important, with files, invoices & receipts, suppliers, customers & bookings), a search, a
// period and a supplier. Admins only, and only once reading the mailbox is allowed (the same
// permission as Invoices → From email). Each list is kept 5 minutes (provider_cache), so going back
// and forth between chips doesn't read the mailbox again each time; who each email is from (a
// supplier, a customer) is worked out on every request, so a supplier added shows straight away.
import { Hono } from 'hono'
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
        // The chips' counts come with the first page only ("Show more" keeps them).
        page ? null : cached(db, `${key}:counts`, MINUTES.email, async () => Object.fromEntries(await Promise.all(EMAIL_FILTERS.map(async f => {
          const s = search(f.id)
          return [f.id, s === null ? 0 : await google.gmailCount(await token(), s)] as const
        })))),
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
