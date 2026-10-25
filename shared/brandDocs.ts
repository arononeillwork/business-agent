// Brand page: the brand's documents (the guidelines PDF, logo packs, templates), next to its logo,
// colours and fonts. Each is uploaded here, and kept in the database (brand_documents), or picked
// where it already is in the café's Google Drive or OneDrive and shown from there, as on the Legal
// page (shared/legalDocs.ts). Everyone on the team reads them; admins add, rename and remove them.
import { msg } from './i18n'
import { previewOf as legalPreview, storageName, type LegalStorage } from './legalDocs'

/** Where a document is: uploaded here, or in a connected storage. */
export type BrandDocSource = 'upload' | LegalStorage

export interface BrandDocument {
  id: string
  title: string
  storage: BrandDocSource
  /** The file's id in Drive or OneDrive; null for an upload. */
  file_id: string | null
  file_name: string
  mime_type: string | null
  size: number | null
  modified_at: string | null
  /** The file's own page in Drive or OneDrive. */
  link: string | null
  /** The folder it's in there, when the storage says. */
  location: string | null
  added_by: string | null
  added_at: string
}

/** Everything but an upload's file, for listing them. */
export const BRAND_COLUMNS = 'id,title,storage,file_id,file_name,mime_type,size,modified_at,link,location,added_by,added_at'

/** Uploads are kept in the database, as a data: URL: up to 10 MB. */
export const MAX_BRAND_UPLOAD = 10 * 1024 * 1024

/** Said next to a picked file that's already on the page. */
export const ALREADY_ON_BRAND = msg('It’s already on the Brand page')

/** "Google Drive", "OneDrive", or null for an upload. */
export const brandSourceName = (s: BrandDocSource) => (s === 'upload' ? null : storageName(s))

/** How it can be shown in the page (a PDF or a picture), or null when it only downloads or opens elsewhere. */
export function brandPreview(d: Pick<BrandDocument, 'storage' | 'mime_type' | 'file_name'>): { as: 'pdf' | 'image'; convert: boolean } | null {
  if (d.storage !== 'upload') return legalPreview({ storage: d.storage, mime_type: d.mime_type, file_name: d.file_name })
  const type = (d.mime_type ?? '').toLowerCase()
  if (type === 'application/pdf' || (!type && /\.pdf$/i.test(d.file_name))) return { as: 'pdf', convert: false }
  if (/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(type)) return { as: 'image', convert: false }
  return null
}

/** A file's name as the document's first title: without the extension, underscores as spaces ("EB_Brand_Guidelines.pdf" → "EB Brand Guidelines"). */
export const brandTitleOf = (fileName: string) => fileName.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || fileName

/** Why an upload can't be kept (shown as is), or null. */
export function uploadProblem(f: { size: number; name: string }): string | null {
  if (!f.size) return msg('That file is empty')
  if (f.size > MAX_BRAND_UPLOAD) return msg('Files can be up to 10 MB. Put a bigger one in Google Drive or OneDrive and choose it from there.')
  if (f.name.length > 255) return msg('That file’s name is too long')
  return null
}
