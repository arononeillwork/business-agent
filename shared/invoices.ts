// Invoices: what's been received from suppliers (and sent to customers), whether it's paid, and the
// supplier it belongs to. Invoices come from the connected mailbox (an email with the invoice
// attached), an upload, or are typed in; the file is kept as a tax document (shared/tax.ts).
import { msg } from './i18n'
import type { Supplier } from './stock'

export type InvoiceDirection = 'in' | 'out'
export type InvoiceStatus = 'to_check' | 'to_pay' | 'paid' | 'disputed' | 'sent' | 'cancelled'
export const INVOICE_STATUSES: { id: InvoiceStatus; label: string; for: InvoiceDirection[] }[] = [
  { id: 'to_check', label: msg('To check'), for: ['in'] },
  { id: 'to_pay', label: msg('To pay'), for: ['in'] },
  { id: 'paid', label: msg('Paid'), for: ['in', 'out'] },
  { id: 'disputed', label: msg('Disputed'), for: ['in'] },
  { id: 'sent', label: msg('Sent, not paid yet'), for: ['out'] },
  { id: 'cancelled', label: msg('Cancelled'), for: ['in', 'out'] },
]

export interface Invoice {
  id: string
  direction: InvoiceDirection
  supplier_id: string | null
  party_name: string | null
  party_email: string | null
  party_tax_id: string | null
  number: string | null
  issued_on: string | null
  due_on: string | null
  net: number | null
  vat: number | null
  total: number | null
  currency: string
  category: string | null
  status: InvoiceStatus
  paid_on: string | null
  document_id: string | null
  source: 'manual' | 'upload' | 'email'
  email_id: string | null
  email_from: string | null
  email_subject: string | null
  email_at: string | null
  notes: string | null
  created_at: string
}
export type InvoiceInput = Partial<Omit<Invoice, 'id' | 'created_at'>> & { id?: string }

/** An email in the connected mailbox with files that could be invoices. */
export interface InboxInvoice {
  /** The message, as the mailbox names it. */
  id: string
  from: string
  from_name: string | null
  subject: string
  at: string
  attachments: { id: string; name: string; size: number; type: string; imported: boolean }[]
  /** The supplier it's from, when recognised. */
  supplier_id: string | null
}
export interface InboxState {
  mailbox: 'gmail' | 'outlook' | null
  /** The mailbox was connected without permission to read it (only to send). */
  can_read: boolean
  messages: InboxInvoice[]
  /** When the service was last asked (the Worker keeps its answer a while: shared/refresh.ts). */
  fetched_at?: string
}

/** The id an attachment is brought in under, so each one comes in once. */
export const emailId = (mailbox: string, message: string, attachment: string) => `${mailbox}:${message}:${attachment}`

const domainOf = (s: string | null | undefined) => {
  if (!s) return null
  const host = s.includes('@') ? s.split('@').pop()! : s.replace(/^[a-z]+:\/\//i, '').split('/')[0]
  return host.toLowerCase().replace(/^www\./, '') || null
}
/** Email providers anyone can use: their domain says nothing about who sent it. */
const SHARED_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com', 'protonmail.com', 'telefonica.net'])

/**
 * The supplier an email or invoice is from: the same email address first (its contact email, or one
 * its invoices come from), then the same tax number, then the same company domain (their email's,
 * website's or invoice senders'; not gmail.com and the like).
 */
export function matchSupplier(suppliers: (Pick<Supplier, 'id' | 'email' | 'website' | 'active' | 'tax_id'> & { invoice_from?: string[] | null })[],
  from: { email?: string | null; tax_id?: string | null }): string | null {
  const active = suppliers.filter(s => s.active !== false)
  const email = from.email?.trim().toLowerCase()
  const byEmail = email && active.find(s => s.email?.toLowerCase() === email || (s.invoice_from ?? []).some(x => x.toLowerCase() === email))
  if (byEmail) return byEmail.id
  const tax = from.tax_id?.replace(/[\s.-]/g, '').toUpperCase()
  const byTax = tax && active.find(s => s.tax_id?.replace(/[\s.-]/g, '').toUpperCase() === tax)
  if (byTax) return byTax.id
  const domain = domainOf(email)
  if (!domain || SHARED_DOMAINS.has(domain)) return null
  return active.find(s => domainOf(s.email) === domain || domainOf(s.website) === domain
    || (s.invoice_from ?? []).some(x => !x.includes('@') && domainOf(x) === domain))?.id ?? null
}

/** The senders to look for a supplier's invoices under: its contact email and invoice senders (shared mail domains left as addresses). */
export function invoiceSenders(s: Pick<Supplier, 'email'> & { invoice_from?: string[] | null }): string[] {
  return [...new Set([s.email, ...(s.invoice_from ?? [])].map(x => x?.trim().toLowerCase()).filter((x): x is string => !!x)
    .filter(x => x.includes('@') || !SHARED_DOMAINS.has(x)))]
}

/** A Gmail search for one supplier's emails with files: from its senders, or naming it. */
export function supplierMailQuery(s: Pick<Supplier, 'name' | 'email'> & { invoice_from?: string[] | null }): string {
  const senders = invoiceSenders(s)
  const name = s.name.replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim()
  return `(${[...senders.map(x => `from:${x}`), ...(name ? [`"${name}"`] : [])].join(' OR ')})`
}

/** Due and not paid: overdue once the due day has passed. */
export const isOpen = (i: Pick<Invoice, 'direction' | 'status'>) => i.status === 'to_pay' || i.status === 'to_check' || i.status === 'disputed' || i.status === 'sent'
export const isOverdue = (i: Pick<Invoice, 'direction' | 'status' | 'due_on'>, today: string) => isOpen(i) && !!i.due_on && i.due_on < today

/** Totals per supplier (or per name, when not matched), biggest first: what was invoiced and what's still to pay. */
export function bySupplier(invoices: Invoice[], suppliers: Pick<Supplier, 'id' | 'name' | 'kind'>[]) {
  const rows = new Map<string, { key: string; supplier_id: string | null; name: string; kind: string | null; count: number; total: number; open: number }>()
  for (const i of invoices.filter(x => x.direction === 'in' && x.status !== 'cancelled')) {
    const s = i.supplier_id ? suppliers.find(x => x.id === i.supplier_id) : undefined
    const key = s?.id ?? `name:${(i.party_name ?? i.party_email ?? '').toLowerCase()}`
    const row = rows.get(key) ?? { key, supplier_id: s?.id ?? null, name: s?.name ?? i.party_name ?? i.party_email ?? '', kind: s?.kind ?? i.category, count: 0, total: 0, open: 0 }
    row.count++
    row.total += Number(i.total ?? 0)
    if (isOpen(i)) row.open += Number(i.total ?? 0)
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

/** "30 días", "60 days", "net 30": the days to pay in a supplier's payment terms (null: none said). */
export function termDays(terms: string | null | undefined): number | null {
  const m = terms?.match(/(\d{1,3})\s*(?:d[ií]as?|days?|d\b)/i) ?? terms?.match(/net\s*(\d{1,3})/i)
  return m ? Number(m[1]) : /contado|al recibir|on receipt|immediate|inmediato/i.test(terms ?? '') ? 0 : null
}

/** The due day: issued plus the supplier's payment terms (when both are known). */
export function dueFrom(issuedOn: string | null, terms: string | null | undefined): string | null {
  const days = termDays(terms)
  if (!issuedOn || days === null) return null
  const d = new Date(`${issuedOn}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** An invoice number in a file name ("Factura F2026-0142.pdf", "invoice_INV-88.pdf"). */
export function numberFromName(name: string): string | null {
  const m = name.match(/(?:factura|fra\.?|invoice|inv|n[ºo°]\.?)\s*[-_#:]?\s*([A-Z]{0,4}[-/]?\d[\w/-]{1,24})/i)
  return m ? m[1].replace(/[-_.]+$/, '') : null
}

/**
 * What a Facturae e-invoice (the Spanish XML invoice, .xml or signed .xsig) says: its number,
 * series, issue and due days, totals and the seller's tax number. Null when it isn't one.
 */
export function readFacturae(xml: string): { number: string | null; issued_on: string | null; due_on: string | null; net: number | null; vat: number | null;
  total: number | null; seller_tax_id: string | null; seller_name: string | null; currency: string | null } | null {
  if (!/<(?:\w+:)?Facturae\b/.test(xml)) return null
  const tag = (name: string, within = xml) => within.match(new RegExp(`<(?:\\w+:)?${name}>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`))?.[1] ?? null
  const num = (v: string | null) => (v === null || v === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100)
  const invoice = xml.match(/<(?:\w+:)?Invoice>([\s\S]*?)<\/(?:\w+:)?Invoice>/)?.[1] ?? xml
  const seller = xml.match(/<(?:\w+:)?SellerParty>([\s\S]*?)<\/(?:\w+:)?SellerParty>/)?.[1] ?? ''
  const series = tag('InvoiceSeriesCode', invoice)
  const number = tag('InvoiceNumber', invoice)
  const name = tag('CorporateName', seller) ?? [tag('Name', seller), tag('FirstSurname', seller)].filter(Boolean).join(' ') ?? null
  return {
    number: number ? `${series ?? ''}${series ? '-' : ''}${number}` : null,
    issued_on: tag('IssueDate', invoice),
    due_on: tag('InstallmentDueDate', invoice),
    net: num(tag('TotalGrossAmountBeforeTaxes', invoice)),
    vat: num(tag('TotalTaxOutputs', invoice)),
    total: num(tag('InvoiceTotal', invoice)),
    seller_tax_id: tag('TaxIdentificationNumber', seller),
    seller_name: name || null,
    currency: tag('InvoiceCurrencyCode', invoice),
  }
}
