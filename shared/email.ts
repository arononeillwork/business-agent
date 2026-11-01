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

// ---------------------------------------------------------------------------------------------
// One email opened in the app (the reader), its files, and replies from the connected mailbox.
// Reading uses the read permission (gmail.readonly / Mail.Read); replying uses the send one the
// mailbox was connected with (gmail.send / Mail.Send). Neither can mark an email read, so opening
// one leaves it as it was in the mailbox.
// ---------------------------------------------------------------------------------------------

/** A file on an opened email, with the id the mailbox gives it (to fetch its bytes). */
export interface EmailFile extends EmailAttachment { id: string }

/** One email opened in the app: who it's from and to, its body and its files. */
export interface EmailFull {
  id: string
  thread_id: string
  from: string
  from_name: string | null
  /** Who it went to and who was copied, as the email says ("Ana Ruiz <ana@x.es>, bob@y.com"). */
  to: string
  cc: string
  /** Where replies go, when the email asks for somewhere other than who sent it. */
  reply_to: string | null
  subject: string
  at: string
  /** The body: HTML (shown in a sandbox: pictures, no scripts) and/or plain text. */
  html: string | null
  text: string | null
  attachments: EmailFile[]
  /** Opens it in Gmail or Outlook. */
  link: string
}

/** A reply from the reader: its words, and whether it goes to everyone the email went to. */
export interface EmailReply { text: string; all?: boolean }
/** The longest reply the reader sends (a few pages). */
export const MAX_REPLY_LENGTH = 20_000

export interface EmailAddress { name: string | null; email: string }

/** "Ana Ruiz <Ana@X.es>, "Ruiz, Bob" <bob@y.com>; c@z.com" → each name and address (lower case). */
export function parseAddresses(list: string | null | undefined): EmailAddress[] {
  const pieces: string[] = []
  let cur = '', quoted = false, angled = false, escaped = false
  for (const ch of list ?? '') {
    if (escaped) { cur += ch; escaped = false; continue }
    if (ch === '\\' && quoted) { cur += ch; escaped = true; continue }
    if (ch === '"') quoted = !quoted
    else if (ch === '<' && !quoted) angled = true
    else if (ch === '>' && !quoted) angled = false
    else if ((ch === ',' || ch === ';') && !quoted && !angled) { pieces.push(cur); cur = ''; continue }
    cur += ch
  }
  pieces.push(cur)
  return pieces.flatMap(p => {
    const m = p.match(/^\s*([\s\S]*?)\s*<([^<>]*)>\s*$/)
    const email = (m ? m[2] : p).trim().toLowerCase()
    if (!/^[^\s<>,;"@]+@[^\s<>,;"@]+$/.test(email)) return []
    const name = m?.[1].replace(/^"([\s\S]*)"$/, '$1').replace(/\\(.)/g, '$1').trim() || null
    return [{ name: name && name.toLowerCase() !== email ? name : null, email }]
  })
}

/** An address as the page shows it: "Ana Ruiz <ana@x.es>", or the address alone. */
export const showAddress = (a: EmailAddress) => (a.name ? `${a.name} <${a.email}>` : a.email)

/**
 * Who a reply goes to: the email's Reply-To, else who sent it (and for one the café sent itself,
 * who it went to). Reply all copies everyone else it went to or was copied to. The café's own
 * address (`me`) is never on it, and no one is on it twice.
 */
export function replyRecipients(m: Pick<EmailFull, 'from' | 'from_name' | 'reply_to' | 'to' | 'cc'>, me: string | null, all = false) {
  const self = me?.trim().toLowerCase() || null
  const mine = (a: EmailAddress) => a.email === self
  const sender = parseAddresses(m.from_name ? `"${m.from_name.replace(/["\\]/g, '\\$&')}" <${m.from}>` : m.from)
  const replyTo = parseAddresses(m.reply_to)
  let to = replyTo.length ? replyTo : sender
  if (to.length && to.every(mine)) {
    const others = parseAddresses(m.to).filter(a => !mine(a))
    if (others.length) to = others
  }
  const seen = new Set(to.map(a => a.email))
  const cc: EmailAddress[] = []
  if (all) {
    for (const a of [...parseAddresses(m.to), ...parseAddresses(m.cc)]) {
      if (mine(a) || seen.has(a.email)) continue
      seen.add(a.email)
      cc.push(a)
    }
  }
  return { to, cc }
}

/** "Re: " before the subject, once ("RE:", "AW:" and the like count as already there). */
export const replySubject = (subject: string) => (/^\s*(re|aw|sv|rv)\s*:/i.test(subject) ? subject.trim() : `Re: ${subject.trim()}`.trim())

/** Bytes as base64, a piece at a time (String.fromCharCode(...all) overflows on a long email). */
export function toBase64(bytes: Uint8Array) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
/** base64url, as Gmail wants a raw message. */
export const toBase64Url = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const utf8Base64 = (s: string) => toBase64(new TextEncoder().encode(s))
const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s)
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

/** Header text: as it is in plain ASCII, else RFC 2047 encoded words of at most 45 bytes each, folded. */
function headerText(s: string) {
  if (isAscii(s)) return s
  const words: string[] = []
  let cur = ''
  for (const ch of s) {
    if (cur && new TextEncoder().encode(cur + ch).length > 45) { words.push(cur); cur = '' }
    cur += ch
  }
  if (cur) words.push(cur)
  return words.map(w => `=?UTF-8?B?${utf8Base64(w)}?=`).join('\r\n ')
}

/** An address for a header: Name <a@b>, with the name quoted or encoded when it has to be. */
export function mimeAddress(a: EmailAddress) {
  if (!a.name) return a.email
  const name = oneLine(a.name)
  const shown = !isAscii(name) ? headerText(name) : /[()<>@,;:\\".[\]]/.test(name) ? `"${name.replace(/[\\"]/g, '\\$&')}"` : name
  return `${shown} <${a.email}>`
}

/** A Message-ID as a header wants it (<…@…>), or null when it isn't one. */
export function messageId(s: string | null | undefined) {
  const v = oneLine(s ?? '')
  if (/^<[^<>\s]+>$/.test(v)) return v
  return /^[^<>\s]+@[^<>\s]+$/.test(v) ? `<${v}>` : null
}

/**
 * A plain-text reply as an RFC 2822 message for Gmail's send API: In-Reply-To and References name
 * the email it answers, so it stays in the same conversation for everyone (Gmail also wants the
 * thread's id, and the subject as it was with "Re: ").
 */
export function replyMime(o: { from?: string | null; to: EmailAddress[]; cc: EmailAddress[]; subject: string; text: string; inReplyTo: string | null; references: string | null }) {
  const answers = messageId(o.inReplyTo)
  const refs = [...new Set([...(o.references ?? '').split(/\s+/).map(messageId), answers].filter((x): x is string => !!x))].slice(-20)
  const lines = [
    ...(o.from ? [`From: ${oneLine(o.from)}`] : []),
    `To: ${o.to.map(mimeAddress).join(',\r\n ')}`,
    ...(o.cc.length ? [`Cc: ${o.cc.map(mimeAddress).join(',\r\n ')}`] : []),
    `Subject: ${headerText(oneLine(replySubject(o.subject)))}`,
    ...(answers ? [`In-Reply-To: ${answers}`] : []),
    ...(refs.length ? [`References: ${refs.join('\r\n ')}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    utf8Base64(o.text.replace(/\r?\n/g, '\r\n')).replace(/.{1,76}/g, '$&\r\n').trimEnd(),
  ]
  return lines.join('\r\n')
}

/** The reply's words with the email it answers quoted under them ("On …, Ana <ana@x.es> wrote:"). */
export function quotedReply(text: string, original: { date: string; from: string; body: string }) {
  const lines = original.body.replace(/\r\n?/g, '\n').trim().split('\n')
  const quoted = lines.slice(0, 400).map(l => (l ? `> ${l}` : '>')).join('\n')
  return original.body.trim() ? `${text.trimEnd()}\n\nOn ${original.date}, ${original.from} wrote:\n${quoted}` : text.trimEnd()
}

/** A reply's words as the HTML Outlook puts above the email it answers. */
export const replyHtml = (text: string) =>
  text.trimEnd().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!).replace(/\r?\n/g, '<br>')

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', euro: '€', copy: '©', reg: '®', trade: '™', hellip: '…', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', bull: '•', middot: '·', deg: '°', ordm: 'º', ordf: 'ª', iexcl: '¡', iquest: '¿',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ccedil: 'ç', agrave: 'à', egrave: 'è', ograve: 'ò',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü', Ccedil: 'Ç',
}
/** &amp;, &#39;, &aacute; and the like as the characters they stand for. */
export const decodeEntities = (s: string) => s.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (all, e: string) => {
  if (e[0] !== '#') return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? all
  const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all
})

/** An HTML email's words, a paragraph a line (to quote it in a reply). */
export function htmlToText(html: string) {
  return decodeEntities(html
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, ''))
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** What an email's HTML may load in the reader: pictures, styles and fonts from anywhere; never scripts, frames, forms or plugins. */
export const EMAIL_CSP = 'default-src \'none\'; img-src https: http: data: blob:; style-src \'unsafe-inline\' https: http:; font-src https: http: data:; form-action \'none\''
const EMAIL_STYLE = 'html{background:#fff;color-scheme:light}body{margin:0;padding:16px;color:#222;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap}'

/**
 * An email's HTML as the page for the reader's frame (srcdoc, sandboxed without scripts): its
 * scripts, refreshes and base address taken out, links opening in a new tab without saying where
 * they came from, under EMAIL_CSP.
 */
export function emailDocument(html: string) {
  const body = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${EMAIL_CSP}">`
    + `<meta name="referrer" content="no-referrer"><base target="_blank"><style>${EMAIL_STYLE}</style></head><body>${body}</body></html>`
}

/** How the reader shows a file: PDFs and pictures (that every browser shows) in the page; anything else is downloaded. */
export function attachmentView(a: Pick<EmailAttachment, 'name' | 'type'>): 'pdf' | 'image' | null {
  const type = a.type.toLowerCase().split(';')[0].trim()
  const ext = a.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (/^image\/(png|jpe?g|gif|webp)$/.test(type) || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image'
  return null
}

/** What a file really is, from its first bytes: a PDF or a picture a browser shows safely; null for anything else. */
export function sniffType(head: Uint8Array): 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((b, j) => head[i + j] === b)
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf' // %PDF-
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif' // GIF8
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp' // RIFF....WEBP
  return null
}

/** The pictures inside an email (cid: links: a logo, a signature) put in place as data: addresses; only real pictures. */
export function placePictures(html: string, pictures: { cid: string; bytes: Uint8Array }[]) {
  let out = html
  for (const p of pictures) {
    const type = sniffType(p.bytes)
    if (!p.cid || !type?.startsWith('image/')) continue
    out = out.split(`cid:${p.cid}`).join(`data:${type};base64,${toBase64(p.bytes)}`)
  }
  return out
}
