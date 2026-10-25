// Tax for a Spanish SL: which returns are due when (Agencia Tributaria's calendar), and the
// documents kept for them in the café's own Google Drive or OneDrive ("Business Agent/Tax/…").
// The app doesn't file anything (AEAT has no filing API for this; the gestoría or the owner files
// with a digital certificate): it shows what's coming, records what was filed, and keeps the papers.
import { msg } from './i18n'

export type Quarter = 1 | 2 | 3 | 4

/** What the business does that decides which returns it files (Tax page → What you file). */
export interface TaxSettings {
  /** Pays staff or freelancers with income tax held back: modelo 111 each quarter, 190 each year. */
  withholding: boolean
  /** Rents its premises: modelo 115 each quarter, 180 each year. */
  rent: boolean
  /** Buys from or sells to businesses elsewhere in the EU: modelo 349. */
  intra_eu: boolean
  /** Pays corporate tax in instalments (from the second year, when the last return had tax to pay): modelo 202. */
  instalments: boolean
  /** The gestoría or accountant, to send them the quarter's documents. */
  gestor_email: string | null
}
export const DEFAULT_TAX_SETTINGS: TaxSettings = { withholding: true, rent: true, intra_eu: false, instalments: false, gestor_email: null }

export type FilingPeriod = '1T' | '2T' | '3T' | '4T' | '0A' | '1P' | '2P' | '3P'
export type FilingStatus = 'to_do' | 'with_gestor' | 'filed' | 'not_needed'
export const FILING_STATUSES: { id: FilingStatus; label: string }[] = [
  { id: 'to_do', label: msg('To do') },
  { id: 'with_gestor', label: msg('With the gestoría') },
  { id: 'filed', label: msg('Filed') },
  { id: 'not_needed', label: msg('Not needed') },
]

/** One return the business files, for one period. `year` is the tax year it's for, even when it's due the next January. */
export interface Filing {
  model: string
  year: number
  period: FilingPeriod
  name: string
  what: string
  /** First and last day to file (YYYY-MM-DD). A last day on a weekend moves to the Monday. */
  opens: string
  due: string
}

/** What's been done about a return (tax_filings). */
export interface FilingRecord {
  id?: string
  model: string
  year: number
  period: FilingPeriod
  status: FilingStatus
  amount: number | null
  filed_on: string | null
  reference: string | null
  notes: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const lastOfFebruary = (y: number) => (new Date(Date.UTC(y, 2, 0)).getUTCDate())

/** A deadline on a Saturday or Sunday moves to the next Monday (national holidays move it too; AEAT's calendar has those). */
export function nextWorkingDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`)
  const day = d.getUTCDay()
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2)
  if (day === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

interface ModelInfo { model: string; name: string; what: string; when: (s: TaxSettings) => boolean }
const QUARTERLY: ModelInfo[] = [
  { model: '303', name: msg('VAT return'), what: msg('IVA charged on sales minus IVA paid on purchases.'), when: () => true },
  { model: '111', name: msg('Income tax held back from pay'), what: msg('IRPF withheld from payslips and freelancers’ invoices.'), when: s => s.withholding },
  { model: '115', name: msg('Income tax held back from rent'), what: msg('IRPF withheld from the premises’ rent.'), when: s => s.rent },
  { model: '349', name: msg('EU trade summary'), what: msg('Purchases from and sales to businesses elsewhere in the EU.'), when: s => s.intra_eu },
]
const ANNUAL: (ModelInfo & { due: (y: number) => [string, string] })[] = [
  { model: '390', name: msg('VAT year summary'), what: msg('The year’s IVA, quarter by quarter.'), when: () => true,
    due: y => [ymd(y + 1, 1, 1), ymd(y + 1, 1, 30)] },
  { model: '190', name: msg('Year summary of income tax held back'), what: msg('Everyone the 111 returns held tax back from, for the year.'), when: s => s.withholding,
    due: y => [ymd(y + 1, 1, 1), ymd(y + 1, 1, 31)] },
  { model: '180', name: msg('Year summary of rent withholding'), what: msg('The landlord and the tax held back from the rent, for the year.'), when: s => s.rent,
    due: y => [ymd(y + 1, 1, 1), ymd(y + 1, 1, 31)] },
  { model: '347', name: msg('Customers and suppliers over €3,005.06'), what: msg('Anyone the business bought from or sold to for more than €3,005.06 in the year.'), when: () => true,
    due: y => [ymd(y + 1, 2, 1), ymd(y + 1, 2, lastOfFebruary(y + 1))] },
  { model: '200', name: msg('Corporate tax return'), what: msg('Impuesto sobre Sociedades for the year.'), when: () => true,
    due: y => [ymd(y + 1, 7, 1), ymd(y + 1, 7, 25)] },
  { model: 'CCAA', name: msg('Annual accounts'), what: msg('Approved by the partners by 30 June, then lodged at the Registro Mercantil within a month.'), when: () => true,
    due: y => [ymd(y + 1, 7, 1), ymd(y + 1, 7, 30)] },
]

/** Quarterly returns: filed in the 20 days after the quarter (the last quarter, 303 and 349: to 30 January). */
function quarterly(m: ModelInfo, y: number, q: Quarter): Filing {
  const [opens, due] = q === 4
    ? [ymd(y + 1, 1, 1), ymd(y + 1, 1, m.model === '303' || m.model === '349' ? 30 : 20)]
    : [ymd(y, q * 3 + 1, 1), ymd(y, q * 3 + 1, 20)]
  return { model: m.model, year: y, period: `${q}T` as FilingPeriod, name: m.name, what: m.what, opens, due: nextWorkingDay(due) }
}

/** Corporate tax instalments (202): April, October and December, 1st to 20th. */
const INSTALMENT_MONTHS = [4, 10, 12] as const

/** Every return for the tax year, in the order they fall due. */
export function filingsFor(year: number, s: TaxSettings): Filing[] {
  const out: Filing[] = []
  for (const m of QUARTERLY) if (m.when(s)) for (const q of [1, 2, 3, 4] as Quarter[]) out.push(quarterly(m, year, q))
  if (s.instalments) {
    INSTALMENT_MONTHS.forEach((month, i) => out.push({ model: '202', year, period: `${i + 1}P` as FilingPeriod, name: msg('Corporate tax instalment'),
      what: msg('A payment on account of this year’s corporate tax.'), opens: ymd(year, month, 1), due: nextWorkingDay(ymd(year, month, 20)) }))
  }
  for (const m of ANNUAL) if (m.when(s)) {
    const [opens, due] = m.due(year)
    out.push({ model: m.model, year, period: '0A', name: m.name, what: m.what, opens, due: nextWorkingDay(due) })
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.model.localeCompare(b.model))
}

export const filingKey = (f: { model: string; year: number; period: string }) => `${f.model}:${f.year}:${f.period}`

/** The returns still to do from `today` on (filed or not needed ones left out), soonest first. */
export function upcoming(filings: Filing[], records: FilingRecord[], today: string) {
  const done = new Set(records.filter(r => r.status === 'filed' || r.status === 'not_needed').map(filingKey))
  return filings.filter(f => f.due >= today && !done.has(filingKey(f)))
}

/** Returns whose last day has passed without being marked filed (or not needed). */
export function overdue(filings: Filing[], records: FilingRecord[], today: string) {
  const done = new Set(records.filter(r => r.status === 'filed' || r.status === 'not_needed').map(filingKey))
  return filings.filter(f => f.due < today && !done.has(filingKey(f)))
}

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

// ---------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------

export type TaxDocKind = 'sales_invoice' | 'purchase_invoice' | 'receipt' | 'payslip' | 'bank_statement' | 'tax_return' | 'contract' | 'other'

/** Kinds of document, each with its own folder (the folder names stay as they are, in any language). */
export const DOC_KINDS: { id: TaxDocKind; label: string; folder: string }[] = [
  { id: 'purchase_invoice', label: msg('Purchase invoices'), folder: 'Purchase invoices' },
  { id: 'sales_invoice', label: msg('Sales invoices'), folder: 'Sales invoices' },
  { id: 'receipt', label: msg('Receipts and tickets'), folder: 'Receipts' },
  { id: 'payslip', label: msg('Payslips'), folder: 'Payslips' },
  { id: 'bank_statement', label: msg('Bank statements'), folder: 'Bank statements' },
  { id: 'tax_return', label: msg('Tax returns filed'), folder: 'Tax returns' },
  { id: 'contract', label: msg('Contracts'), folder: 'Contracts' },
  { id: 'other', label: msg('Other'), folder: 'Other' },
]
export const isDocKind = (k: unknown): k is TaxDocKind => DOC_KINDS.some(d => d.id === k)
export const kindInfo = (k: TaxDocKind) => DOC_KINDS.find(d => d.id === k)!

/** A document kept for tax (tax_documents). The file itself is in the café's Drive or OneDrive. */
export interface TaxDocument {
  id: string
  name: string
  kind: TaxDocKind
  year: number
  /** Null: for the whole year (a contract, the annual accounts). */
  quarter: Quarter | null
  size: number
  sha256: string | null
  storage: 'google_drive' | 'onedrive'
  file_id: string
  /** Where it is under Business Agent, e.g. ["Tax", "2026", "Q4", "Purchase invoices"]. */
  folder: string[]
  link: string | null
  notes: string | null
  uploaded_by: string | null
  uploaded_at: string
}

/** Words in a file name that say what it is (Spanish and English). */
const KIND_WORDS: [TaxDocKind, RegExp][] = [
  ['tax_return', /\bmodelo\b|\b(303|111|115|130|180|190|200|202|347|349|390)\b|justificante|declaraci[oó]n|tax[ _-]?return/i],
  ['payslip', /n[oó]mina|payslip|pay[ _-]?slip|salary/i],
  ['bank_statement', /extracto|statement|movimientos|\bbank\b|banco/i],
  ['contract', /contrato|contract|alquiler|lease|arrendamiento/i],
  ['receipt', /ticket|recibo|receipt|tique/i],
  ['sales_invoice', /factura[ _-]?(emitida|venta)|sales[ _-]?invoice|\bventa/i],
  ['purchase_invoice', /factura|invoice|fra[ _.-]|proveedor|supplier/i],
]

/** A first guess at the kind of document from its name; the person can change it before uploading. */
export function guessKind(name: string): TaxDocKind {
  return KIND_WORDS.find(([, r]) => r.test(name))?.[0] ?? 'purchase_invoice'
}

export const quarterOf = (date: string): Quarter => (Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1) as Quarter

/**
 * Which year and quarter a document is for: a date in its name (2026-10-03, 03-10-2026, 20261003),
 * a quarter (1T 2026, Q3-2026), or else the day the file was last changed.
 */
export function guessPeriod(name: string, lastModified: number): { year: number; quarter: Quarter } {
  const q = name.match(/\b([1-4])\s?T[ _-]?(20\d\d)\b/i) ?? name.match(/\bQ([1-4])[ _-]?(20\d\d)\b/i)
  if (q) return { year: Number(q[2]), quarter: Number(q[1]) as Quarter }
  const q2 = name.match(/\b(20\d\d)[ _-]?(?:Q|T)([1-4])\b/i)
  if (q2) return { year: Number(q2[1]), quarter: Number(q2[2]) as Quarter }
  const valid = (y: number, m: number, d: number) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31
  const iso = name.match(/(20\d\d)[-_.]?(\d\d)[-_.]?(\d\d)/)
  if (iso && valid(+iso[1], +iso[2], +iso[3])) return { year: +iso[1], quarter: quarterOf(`${iso[1]}-${iso[2]}-01`) }
  const eu = name.match(/\b(\d\d)[-_.](\d\d)[-_.](20\d\d)\b/)
  if (eu && valid(+eu[3], +eu[2], +eu[1])) return { year: +eu[3], quarter: quarterOf(`${eu[3]}-${eu[2]}-01`) }
  const d = new Date(lastModified).toISOString().slice(0, 10)
  return { year: Number(d.slice(0, 4)), quarter: quarterOf(d) }
}

/** Where a document goes when it's sorted automatically: Tax/<year>/Q<n>/<kind's folder>. */
export const autoFolder = (kind: TaxDocKind, year: number, quarter: Quarter | null) =>
  ['Tax', String(year), quarter ? `Q${quarter}` : 'Whole year', kindInfo(kind).folder]

/** Files kept for tax: PDFs, photos and scans, spreadsheets, documents and e-invoices (Facturae XML). */
export const TAX_FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp',
  xml: 'application/xml', xsig: 'application/xml', csv: 'text/csv', txt: 'text/plain',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
}
export const MAX_TAX_FILE_BYTES = 25 * 1024 * 1024

/** The content type to store a file as, from its name (browsers don't always know HEIC or XML); null: not taken. */
export function taxFileType(name: string): string | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  return (ext && TAX_FILE_TYPES[ext]) || null
}

/** A problem with a file before it goes anywhere, in words for the person; null when it's fine. */
export function taxFileProblem(name: string, size: number): string | null {
  if (!taxFileType(name)) return msg('Use a PDF, a photo (JPEG, PNG, HEIC), a spreadsheet, a document or an e-invoice (XML)')
  if (size === 0) return msg('That file is empty')
  if (size > MAX_TAX_FILE_BYTES) return msg('Files can be up to 25 MB')
  return null
}

/** A name that's safe in Drive and OneDrive: no slashes or other characters they refuse, not too long. */
export function safeFileName(name: string) {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim()
  if (clean.length <= 180) return clean || 'document'
  const ext = clean.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? ''
  return clean.slice(0, 180 - ext.length) + ext
}

/** A folder name typed by the person, tidied; null when it can't be used. */
export function cleanFolderName(name: string): string | null {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!clean || clean === '.' || clean === '..' || clean.length > 100) return null
  return clean
}

/** A folder path from the app (under Business Agent): each part tidied, Tax first. Null when any part can't be used. */
export function cleanFolderPath(parts: unknown): string[] | null {
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > 8) return null
  const clean = parts.map(p => (typeof p === 'string' ? cleanFolderName(p) : null))
  if (clean.some(p => p === null) || clean[0] !== 'Tax') return null
  return clean as string[]
}
