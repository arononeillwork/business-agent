// Documents hub: every file the business keeps in its own Google Drive or OneDrive, wherever it came
// from (the Tax page, an invoice brought in by email, a licence's document, the hub's own uploads),
// with what each one belongs to, and a browser of the whole "Business Agent" folder there.
import { msg } from './i18n'
import type { TaxDocument } from './tax'

/** A kept document with what it belongs to (an invoice or a licence point at it). */
export interface KeptDocument extends TaxDocument {
  invoices?: { id: string; number: string | null; party_name: string | null; supplier?: { name: string } | null }[]
  licences?: { id: string; name: string; expires_on: string | null }[]
}

export type LinkedTo = 'invoice' | 'licence' | 'tax' | 'none'
export const LINKED_TO: { id: LinkedTo; label: string }[] = [
  { id: 'invoice', label: msg('An invoice') },
  { id: 'licence', label: msg('A licence') },
  { id: 'tax', label: msg('Tax papers') },
  { id: 'none', label: msg('Nothing else') },
]

/** What a document belongs to: an invoice or a licence first; else the Tax page's papers (in Tax/…); else nothing. */
export function linkedTo(d: Pick<KeptDocument, 'invoices' | 'licences' | 'folder'>): LinkedTo {
  if (d.invoices?.length) return 'invoice'
  if (d.licences?.length) return 'licence'
  return d.folder[0] === 'Tax' ? 'tax' : 'none'
}

/** When it runs out: its own expiry, or the soonest of its licences'. */
export const expiryOf = (d: Pick<KeptDocument, 'expires_on' | 'licences'>) =>
  d.expires_on ?? d.licences?.map(l => l.expires_on).filter((x): x is string => !!x).sort()[0] ?? null

/** Runs out within `days` (or already has). */
export function expiresSoon(d: Pick<KeptDocument, 'expires_on' | 'licences'>, today: string, days = 60) {
  const e = expiryOf(d)
  if (!e) return false
  return (Date.parse(`${e}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000 <= days
}

export interface DocumentFilter { q: string; kind: string; year: number | 'all'; linked: LinkedTo | 'all' }

/** The documents that match a search (name, title, tags, notes, folder, what it belongs to) and the filters. */
export function filterDocuments<T extends KeptDocument>(list: T[], f: DocumentFilter): T[] {
  const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return list.filter(d => {
    if (f.kind !== 'all' && d.kind !== f.kind) return false
    if (f.year !== 'all' && d.year !== f.year) return false
    if (f.linked !== 'all' && linkedTo(d) !== f.linked) return false
    const hay = [d.name, d.title ?? '', ...(d.tags ?? []), d.notes ?? '', d.folder.join('/'),
      ...(d.invoices ?? []).flatMap(i => [i.number ?? '', i.party_name ?? '', i.supplier?.name ?? '']), ...(d.licences ?? []).map(l => l.name)]
      .join(' ').toLowerCase()
    return words.every(w => hay.includes(w))
  })
}

/** Tags as typed ("seguro, local , 2026") → tidy, once each, at most 20 of up to 40 characters. */
export function cleanTags(typed: string | string[]): string[] {
  const parts = Array.isArray(typed) ? typed : typed.split(',')
  return [...new Set(parts.map(t => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 20)
}

/** One entry in a folder of the café's storage (Browse storage). */
export interface StorageEntry {
  id: string
  name: string
  folder: boolean
  size: number | null
  modified: string | null
  type: string | null
  link: string | null
  /** The kept document this file is, when it is one. */
  kept_id: string | null
}
export interface StorageFolder {
  storage: 'google_drive' | 'onedrive'
  /** Under Business Agent ([] = the Business Agent folder itself). */
  path: string[]
  link: string | null
  entries: StorageEntry[]
}

/** Folders first, then files, each by name. */
export const sortEntries = (list: StorageEntry[]) =>
  [...list].sort((a, b) => (a.folder === b.folder ? a.name.localeCompare(b.name) : a.folder ? -1 : 1))
