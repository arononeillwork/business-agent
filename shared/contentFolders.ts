// Synced folders (Content, admins): a folder in the business's OneDrive (or Google Drive, once The Business
// Agent may read a folder there: FEATURES.driveFolders) whose photos and videos show on the Content page
// straight from there. Nothing is copied: each is listed (content_items, source 'folder') with an address
// the Worker serves from the folder itself, and the folder is looked at again when the page opens, so new
// ones show by themselves and ones taken out of the folder go. Taken off the page, one is hidden, not
// deleted, so the next look doesn't bring it back. The `content_folders` migration has the table.
import { msg } from './i18n'

export type FolderProvider = 'onedrive' | 'google_drive'

export interface ContentFolder {
  id: string
  provider: FolderProvider
  /** The folder's own id in OneDrive or Google Drive. */
  folder_id: string
  name: string
  /** Where it is, to show ("Pictures › Camera Roll"). */
  path: string | null
  last_synced_at: string | null
  /** Why the last look failed (null: it didn't). */
  last_error: string | null
  created_at: string
}
export const FOLDER_COLUMNS = 'id, provider, folder_id, name, path, last_synced_at, last_error, created_at'

/** A folder to choose, while looking through the OneDrive or Drive. */
export interface FolderEntry { id: string; name: string }
/** One step of looking through: the folder (id null: the top) and the folders in it. */
export interface FolderListing { provider: FolderProvider; folder: { id: string | null; name: string }; folders: FolderEntry[] }

/** What one look at a folder did. */
export interface FolderSync {
  added: number
  /** Gone from the folder, so off the page. */
  removed: number
  /** Photos and videos in the folder now (the page shows them all, but those hidden). */
  total: number
  /** Files of a kind the page can't show (HEIC photos, other files), by how many. */
  skipped: number
}

/** A folder is looked at again when the page opens, once it's been this long. */
export const RESYNC_MS = 5 * 60_000
/** How many photos and videos one folder brings at most (with its folders inside, three deep). */
export const MAX_FOLDER_FILES = 5000
export const FOLDER_DEPTH = 3

export const PROVIDER_NAME: Record<FolderProvider, string> = { onedrive: 'OneDrive', google_drive: 'Google Drive' }

/** The kinds a folder's files can be shown as, by their file type: what the page and /media hand out. */
const KINDS: Record<string, { kind: 'photo' | 'video'; ext: string }> = {
  jpg: { kind: 'photo', ext: 'jpg' }, jpeg: { kind: 'photo', ext: 'jpg' }, png: { kind: 'photo', ext: 'png' }, webp: { kind: 'photo', ext: 'webp' },
  mp4: { kind: 'video', ext: 'mp4' }, mov: { kind: 'video', ext: 'mov' },
}
const BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov' }

/** What a file in a folder is, from its type (or its name's ending): null when the page can't show it. */
export function folderFileKind(name: string, mimeType?: string | null): { kind: 'photo' | 'video'; ext: string } | null {
  const byType = mimeType ? BY_TYPE[mimeType.toLowerCase()] : undefined
  const ext = byType ?? /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase()
  return (ext && KINDS[ext]) || null
}

/** A file found in a folder, ready to list. */
export interface FolderFile { id: string; name: string; kind: 'photo' | 'video'; ext: string; width: number | null; height: number | null; taken_at: string | null }

/** What a look changes: the files to add (not listed yet) and the listed ones to take off (gone from the folder). */
export function syncPlan<T extends Pick<FolderFile, 'id'>>(listed: readonly string[], found: readonly T[]): { add: T[]; remove: string[] } {
  const have = new Set(listed)
  const there = new Set(found.map(f => f.id))
  return { add: found.filter(f => !have.has(f.id)), remove: listed.filter(id => !there.has(id)) }
}

/** Whether a folder is due a look (never looked at, or longer ago than RESYNC_MS). */
export const dueForSync = (f: Pick<ContentFolder, 'last_synced_at'>, now = Date.now()) =>
  !f.last_synced_at || now - Date.parse(f.last_synced_at) >= RESYNC_MS

/** Said when Google Drive can't be read folder by folder yet. */
export const NO_DRIVE_FOLDERS = msg('Google Drive folders need Google to approve The Business Agent reading your Drive. OneDrive folders work now.')
