// Legal page: the business's legal documents (the lease, the company's deeds, insurance, contracts,
// licences, its own policies). Each is a file that stays where it is in the café's own Google Drive or
// OneDrive; the database keeps only where it is and what it is (legal_documents, migration 65).
// Shared by the Worker (which checks and adds picked files, and streams them to the page) and the app.
// (shared/legal.ts is something else: who runs Business Agent, for its own privacy policy and terms.)
import { msg } from './i18n'

/** Where documents can be picked from: the file storage apps on the Connections page. */
export type LegalStorage = 'google_drive' | 'onedrive'
export const LEGAL_STORAGES: { id: LegalStorage; name: string }[] = [
  { id: 'google_drive', name: 'Google Drive' },
  { id: 'onedrive', name: 'OneDrive' },
]
export const storageName = (s: LegalStorage) => LEGAL_STORAGES.find(x => x.id === s)!.name

export type LegalKind = 'lease' | 'company' | 'insurance' | 'contract' | 'licence' | 'employment' | 'policy' | 'other'
/** The kinds, in the order the page groups them. */
export const LEGAL_KINDS: { id: LegalKind; label: string }[] = [
  { id: 'lease', label: msg('Lease and premises') },
  { id: 'company', label: msg('Company and registrations') },
  { id: 'insurance', label: msg('Insurance') },
  { id: 'contract', label: msg('Contracts and agreements') },
  { id: 'licence', label: msg('Licences and permits') },
  { id: 'employment', label: msg('Staff and employment') },
  { id: 'policy', label: msg('Policies and terms') },
  { id: 'other', label: msg('Other documents') },
]
export const isLegalKind = (k: unknown): k is LegalKind => LEGAL_KINDS.some(x => x.id === k)

export interface LegalDocument {
  id: string
  title: string
  kind: LegalKind
  storage: LegalStorage
  /** The file's id in its storage. */
  file_id: string
  file_name: string
  mime_type: string | null
  size: number | null
  modified_at: string | null
  /** The file's own page in Drive or OneDrive. */
  link: string | null
  /** The folder it's in there ("Documents/Legal"), when the storage says. */
  location: string | null
  notes: string | null
  added_by: string | null
  added_at: string
}
export type LegalDocumentPatch = Partial<Pick<LegalDocument, 'title' | 'kind' | 'notes'>>

/**
 * A storage the page can pick from. Google Drive files are chosen in Google's own picker (that's
 * what lets Business Agent open a file with its drive.file permission); OneDrive is browsed here.
 */
export interface LegalSource {
  storage: LegalStorage
  connected: boolean
  /** The account it's connected as (email). */
  account: string | null
  how: 'picker' | 'browse'
  /** Connected but picking can't work yet, and why (shown as is). */
  problem: string | null
}

/** One thing in a folder of a storage being browsed. */
export interface StorageItem {
  id: string
  name: string
  folder: boolean
  size: number | null
  modified: string | null
  type: string | null
  /** Already on the Legal page: its document's id. */
  added_id: string | null
}
export interface StorageListing {
  storage: LegalStorage
  /** The folder shown; `id` null is the top of the storage. (The page keeps the way back as it opens folders.) */
  folder: { id: string | null; name: string }
  items: StorageItem[]
}

/** At most this many files are added in one go. */
export const MAX_PICK = 50

/** Said on the page when Google Drive is connected but Business Agent has no key for Google's picker (GOOGLE_PICKER_API_KEY). */
export const NO_GOOGLE_PICKER = msg('Choosing files from Google Drive isn’t switched on for Business Agent yet (it needs Google’s file picker). OneDrive works meanwhile.')

/** Why a picked file wasn't added (shown next to its name). */
export const SKIPPED = {
  already: msg('It’s already on the Legal page'),
  folder: msg('It’s a folder: choose the files in it'),
  unshared: msg('Google Drive didn’t share it with Business Agent: choose it again in the picker'),
  gone: msg('It isn’t there any more'),
}

/** A document's name on the page to start with: its file's name without the extension ("Contrato.pdf" → "Contrato"). */
export const titleOf = (fileName: string) => fileName.replace(/\.[a-z0-9]{2,5}$/i, '').trim() || fileName

/** A first guess at what a document is, from its file name (Spanish or English); the admin can change it. */
export function guessKind(name: string): LegalKind {
  // Accents off, and "Contrato_arrendamiento-2026.pdf" read as words.
  const n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_\-.]+/g, ' ')
  if (/arrendamiento|alquiler|\blease|tenancy|\blocal\b|fianza/.test(n)) return 'lease'
  if (/escritura|estatutos|constitucion|registro mercantil|\bcif\b|\bnif\b|\b03[67]\b|modelo 03[67]|deeds|incorporation|poderes/.test(n)) return 'company'
  if (/seguro|poliza|insurance/.test(n)) return 'insurance'
  if (/licencia|permiso|autorizacion|licen[cs]e|permit|sgae|terraza/.test(n)) return 'licence'
  if (/nomina|laboral|contrato de trabajo|empleo|employment|payroll|convenio/.test(n)) return 'employment'
  if (/politica|privacidad|rgpd|lopd|gdpr|terminos|condiciones|aviso legal|policy|terms|privacy/.test(n)) return 'policy'
  if (/contrato|acuerdo|contract|agreement|\bnda\b|prestacion de servicios/.test(n)) return 'contract'
  return 'other'
}

const IMAGE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
// Google's own documents, which Drive can hand over as a PDF.
const GOOGLE_DOCS = new Set(['application/vnd.google-apps.document', 'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation', 'application/vnd.google-apps.drawing'])
// Files OneDrive can turn into a PDF on the way out (Microsoft Graph's ?format=pdf).
const ONEDRIVE_TO_PDF = /\.(docx?|odt|rtf|xlsx?|xlsm|ods|pptx?|ppsx?|odp|html?|md|eml|msg|epub|tiff?)$/i

/**
 * How the page can show a file inside it: as a PDF (as it is, or turned into one by the storage), as a
 * picture, or not at all (then it opens in Drive or OneDrive). `convert`: the storage makes the PDF.
 */
export function previewOf(d: Pick<LegalDocument, 'storage' | 'mime_type' | 'file_name'>): { as: 'pdf' | 'image'; convert: boolean } | null {
  const type = (d.mime_type ?? '').toLowerCase()
  if (type === 'application/pdf' || (!type && /\.pdf$/i.test(d.file_name))) return { as: 'pdf', convert: false }
  if (IMAGE.has(type)) return { as: 'image', convert: false }
  if (d.storage === 'google_drive' && GOOGLE_DOCS.has(type)) return { as: 'pdf', convert: true }
  if (d.storage === 'onedrive' && ONEDRIVE_TO_PDF.test(d.file_name)) return { as: 'pdf', convert: true }
  return null
}

/** Does a document match what's typed in the search box (its title, file name, folder or notes)? */
export function matchesSearch(d: LegalDocument, query: string) {
  const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = fold(query.trim())
  return !q || [d.title, d.file_name, d.location ?? '', d.notes ?? ''].some(s => fold(s).includes(q))
}

/** The documents grouped by kind, in the page's order (kinds with none left out), each group by title. */
export function byKind(docs: LegalDocument[]) {
  return LEGAL_KINDS.map(k => ({ ...k, docs: docs.filter(d => d.kind === k.id).sort((a, b) => a.title.localeCompare(b.title)) }))
    .filter(g => g.docs.length > 0)
}
