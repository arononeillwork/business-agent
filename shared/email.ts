// The Email page: the business's connected mailbox (Gmail or Outlook) as a list, read only, with a
// few simple filters. The filters, what each one asks Gmail for, and the words that make an email an
// invoice or a booking live here, so the Worker, the demo and the tests agree on them.
import { msg } from './i18n'
import { matchSupplier } from './invoices'
import type { Supplier } from './stock'

export type EmailFilter = 'all' | 'unread' | 'starred' | 'important' | 'attachments' | 'invoices' | 'suppliers' | 'customers'

/** The chips at the top of the page, in order (one at a time). */
export const EMAIL_FILTERS: { id: EmailFilter; label: string }[] = [
  { id: 'all', label: msg('All') },
  { id: 'unread', label: msg('Unread') },
  { id: 'starred', label: msg('Starred') },
  { id: 'important', label: msg('Important') },
  { id: 'attachments', label: msg('With attachments') },
  { id: 'invoices', label: msg('Invoices & receipts') },
  { id: 'suppliers', label: msg('Suppliers') },
  { id: 'customers', label: msg('Customers & bookings') },
]
export const isEmailFilter = (v: unknown): v is EmailFilter => EMAIL_FILTERS.some(f => f.id === v)

/** How far back the list goes. */
export const EMAIL_PERIODS: { days: number; label: string }[] = [
  { days: 7, label: msg('Last 7 days') },
  { days: 30, label: msg('Last 30 days') },
  { days: 90, label: msg('Last 90 days') },
  { days: 365, label: msg('Last 12 months') },
]
export const DEFAULT_EMAIL_DAYS = 30
/** Emails read at a time ("Show more" reads the next ones). */
export const EMAIL_PAGE_SIZE = 25
/** Counts on the chips stop here ("500+"): Gmail lists up to 500 at once. */
export const EMAIL_COUNT_CAP = 500

export interface EmailAttachment { name: string; size: number; type: string }

export interface EmailMessage {
  /** The message, as the mailbox names it. */
  id: string
  thread_id: string
  /** Who sent it: the address, and their name when the email gives one. */
  from: string
  from_name: string | null
  to: string
  subject: string
  /** The first line or two, as the mailbox shows it in its list. */
  snippet: string
  at: string
  unread: boolean
  starred: boolean
  important: boolean
  /** The mailbox's own labels or categories (Gmail: INBOX, CATEGORY_UPDATES…). */
  labels: string[]
  attachments: EmailAttachment[]
  /** Opens it in Gmail or Outlook. */
  link: string
  /** The supplier it's from (Suppliers page), matched by address or company domain. */
  supplier_id: string | null
  /** The customer or lead it's from (Customers page), matched by address. */
  customer_id: string | null
  customer_name: string | null
}

/** What the page asks for. `page`: the `next_page` of the list before, for "Show more". */
export interface EmailQuery {
  filter?: EmailFilter
  q?: string
  days?: number
  supplier?: string | null
  page?: string | null
}

export interface EmailState {
  mailbox: 'gmail' | 'outlook' | null
  /** The mailbox's address (easybeanscafe@gmail.com). */
  account: string | null
  /** False until the admin allows reading the mailbox (it's connected to send email only at first). */
  can_read: boolean
  messages: EmailMessage[]
  next_page: string | null
  /** How many emails each chip has, up to EMAIL_COUNT_CAP (Gmail only; not given for Outlook). */
  counts?: Partial<Record<EmailFilter, number>>
  /** When the mailbox was last asked (the Worker keeps each list 5 minutes). */
  fetched_at?: string
}

/** Lower case and without accents, so "Factura" and "factura", "Recibo" and "recibo" compare plainly. */
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Words that make an email with a file attached an invoice or a receipt. */
export const INVOICE_WORDS = ['factura', 'facturas', 'invoice', 'invoices', 'receipt', 'receipts', 'recibo', 'recibos']
/** Words that make an email a booking or an enquiry. */
export const BOOKING_WORDS = ['reserva', 'reservas', 'reservar', 'reservation', 'reservations', 'booking', 'bookings', 'enquiry', 'enquiries', 'inquiry', 'inquiries']

/** Any of the words, as a whole word ("factura" in "Factura_0142.pdf", not in "facturación"). */
export function hasWord(text: string, words: string[]) {
  const s = plain(text)
  return words.some(w => new RegExp(`(?:^|[^\\p{L}\\p{N}])${w}(?:$|[^\\p{L}\\p{N}])`, 'u').test(s))
}

/** An invoice or a receipt: a file is attached, and the subject, the preview or a file's name says so. */
export const isInvoiceEmail = (m: Pick<EmailMessage, 'subject' | 'snippet' | 'attachments'>) =>
  m.attachments.length > 0 && hasWord([m.subject, m.snippet, ...m.attachments.map(a => a.name)].join(' '), INVOICE_WORDS)

/** A booking or an enquiry: the subject or the preview says so. */
export const isBookingEmail = (m: Pick<EmailMessage, 'subject' | 'snippet'>) => hasWord(`${m.subject} ${m.snippet}`, BOOKING_WORDS)

/** Does an email belong under a chip? Customers & bookings: from a customer, or a booking or enquiry. */
export function matchesEmailFilter(m: EmailMessage, filter: EmailFilter) {
  switch (filter) {
    case 'all': return true
    case 'unread': return m.unread
    case 'starred': return m.starred
    case 'important': return m.important
    case 'attachments': return m.attachments.length > 0
    case 'invoices': return isInvoiceEmail(m)
    case 'suppliers': return !!m.supplier_id
    case 'customers': return !!m.customer_id || isBookingEmail(m)
  }
}

/** Every word typed is in who sent it, the subject, the preview or a file's name. */
export function matchesEmailSearch(m: EmailMessage, q: string) {
  const text = plain([m.from, m.from_name ?? '', m.subject, m.snippet, ...m.attachments.map(a => a.name)].join(' '))
  return plain(q).split(/\s+/).filter(Boolean).every(w => text.includes(w))
}

/** The emails that pass a filter, a search, a period and a supplier (the demo, and Outlook, which can't search for all of it). */
export function applyEmailQuery(messages: EmailMessage[], o: { filter: EmailFilter; q?: string; days: number; supplier?: string | null }, now = Date.now()) {
  const since = now - o.days * 86_400_000
  return messages.filter(m => Date.parse(m.at) >= since && matchesEmailFilter(m, o.filter)
    && (!o.supplier || m.supplier_id === o.supplier) && (!o.q?.trim() || matchesEmailSearch(m, o.q)))
}

const hostOf = (url: string | null | undefined) => {
  if (!url?.trim()) return null
  try { return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '') } catch { return null }
}
const EMAIL = /^[\w.+-]+@[a-z0-9.-]+\.[a-z]{2,}$/
const DOMAIN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/

/**
 * Who a supplier's emails come from, to search the mailbox for: its company's domain when anyone
 * writing from there counts as them (as matchSupplier decides: not gmail.com and the like), else
 * its address. Empty when the Suppliers page has neither.
 */
export function supplierSenders(s: Pick<Supplier, 'id' | 'email' | 'website' | 'active' | 'tax_id'>): string[] {
  const email = s.email?.trim().toLowerCase() ?? ''
  const domains = [...new Set([email.split('@')[1], hostOf(s.website)])].filter((d): d is string =>
    !!d && DOMAIN.test(d) && matchSupplier([{ ...s, active: true }], { email: `someone@${d}` }) === s.id)
  return EMAIL.test(email) && !domains.includes(email.split('@')[1]) ? [...domains, email] : domains
}

const anyOf = (terms: string[]) => (terms.length === 1 ? terms[0] : `{${terms.join(' ')}}`)
const fromAny = (senders: string[]) => anyOf(senders.map(s => `from:${s}`))

/** What's typed, made safe to add to a Gmail search: one line, at most 200 characters. */
export const cleanEmailSearch = (q: string | null | undefined) => (q ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)

/**
 * Gmail's search for a chip, plus what's typed, the period and a supplier. Received email only (not
 * sent, drafts or chats; Gmail leaves out spam and the bin itself). Null when nothing can match: the
 * Suppliers chip or a supplier with no address to look for.
 */
export function gmailSearch(o: { filter: EmailFilter; q?: string | null; days: number; suppliers: string[]; customers: string[]; supplier?: string[] | null }): string | null {
  const parts = [`newer_than:${o.days}d`, '-in:sent', '-in:drafts', '-in:chats']
  if (o.supplier) {
    if (!o.supplier.length) return null
    parts.push(fromAny(o.supplier))
  }
  if (o.filter === 'unread') parts.push('is:unread')
  if (o.filter === 'starred') parts.push('is:starred')
  if (o.filter === 'important') parts.push('is:important')
  if (o.filter === 'attachments') parts.push('has:attachment')
  if (o.filter === 'invoices') parts.push('has:attachment', anyOf(INVOICE_WORDS))
  if (o.filter === 'suppliers') {
    if (!o.suppliers.length) return null
    parts.push(fromAny(o.suppliers))
  }
  if (o.filter === 'customers') parts.push(anyOf([...BOOKING_WORDS, ...o.customers.filter(c => EMAIL.test(c)).map(c => `from:${c}`)]))
  const typed = cleanEmailSearch(o.q)
  if (typed) parts.push(typed)
  return parts.join(' ')
}

/** Opens a conversation in Gmail, in the café's own account when the browser is signed in to several. */
export const gmailLink = (threadId: string, account?: string | null) =>
  `https://mail.google.com/mail/${account ? `?authuser=${encodeURIComponent(account)}` : 'u/0/'}#all/${encodeURIComponent(threadId)}`

/** A customer's name as the page shows it: first and last name, else the company. */
export const customerName = (c: { first_name: string | null; last_name: string | null; company: string | null }) =>
  [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || null
