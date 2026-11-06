// Content (Marketing, admins): the business's own photos and videos in one place, ready for posts,
// offers, the menu and the screens. They come from Google Photos (picked in Google's own picker and
// copied into the café's storage, since Google's links last only an hour) or are uploaded from the
// device; each is kept in the connected Google Drive or OneDrive, in The Business Agent/Content (or R2),
// and handed out at its own /media address. The `content_library` migration has the table.
import type { PostKind, PostMedia } from './types'
import { msg } from './i18n'

export type ContentKind = 'photo' | 'video'
export type ContentSource = 'google_photos' | 'upload' | 'folder'

export interface ContentItem {
  id: string
  kind: ContentKind
  /** Its public address in the café's storage (/media/…), ending in its file type (.jpg, .mp4…). */
  url: string
  title: string | null
  source: ContentSource
  /** Google Photos' own id for it: picking it again doesn't add it twice. */
  source_id: string | null
  /** From a synced folder (shared/contentFolders.ts): which one, shown from where it is. */
  folder_id?: string | null
  width: number | null
  height: number | null
  /** When the photo was taken or the video made (Google Photos), if known. */
  taken_at: string | null
  tags: string[]
  added_by: string | null
  created_at: string
}

/** The columns read for an item (the page and the Worker). */
export const CONTENT_COLUMNS = 'id, kind, url, title, source, source_id, width, height, taken_at, tags, added_by, created_at'

/** What an admin changes on one: its title and tags. */
export interface ContentChange { id: string; title: string | null; tags: string[] }
/** One uploaded from the device, once it's in storage. */
export interface ContentUpload { kind: ContentKind; url: string; title: string | null; width: number | null; height: number | null; tags: string[] }

/** Where photos and videos are kept: The Business Agent/Content in the café's storage (worker/media.ts). */
export const CONTENT_FOLDER = 'Content'
/** How many picked items one request copies, side by side (each is a download and an upload; a Worker run can only ask so much). */
export const IMPORT_BATCH = 5
/** How many items one Google Photos pick takes: Google's most, so a whole album or month comes in one go. */
export const MAX_PICK = 2000
/** How many picked items Google lists at a time; a pick is brought in one such page after another. */
export const PICK_PAGE = 100
export const MAX_TITLE = 200
export const MAX_TAGS = 12
export const MAX_TAG = 30

export const SOURCES: { id: ContentSource; label: string }[] = [
  { id: 'google_photos', label: msg('Google Photos') },
  { id: 'upload', label: msg('Uploaded') },
  { id: 'folder', label: msg('Synced folders') },
]

/** Tags as typed ("Terrace, latte art,  terrace") → ["terrace", "latte art"]: trimmed, lower case, each once. */
export function cleanTags(typed: string | readonly string[]): string[] {
  const parts = typeof typed === 'string' ? typed.split(/[,#\n]/) : typed
  const out: string[] = []
  for (const p of parts) {
    const tag = p.trim().replace(/\s+/g, ' ').toLowerCase()
    if (tag && !out.includes(tag)) out.push(tag)
  }
  return out
}

/** What's wrong with a title and tags (null: nothing). The database checks the same. */
export function contentProblem(c: { title: string | null; tags: readonly string[] }): string | null {
  if ((c.title ?? '').trim().length > MAX_TITLE) return msg('Keep the title to 200 characters')
  if (c.tags.length > MAX_TAGS) return msg('Up to 12 tags')
  if (c.tags.some(t => t.length > MAX_TAG)) return msg('Keep each tag to 30 characters')
  return null
}

/** A file's name as a title: "IMG_2041.HEIC" → "IMG_2041", "terrace-sunset.jpg" → "terrace sunset". */
export function titleFromFilename(name: string | null | undefined): string | null {
  const base = (name ?? '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+(?=[a-z])/gi, ' ').trim()
  return base ? base.slice(0, MAX_TITLE) : null
}

export interface ContentFilter {
  kind: 'all' | ContentKind
  source: 'all' | ContentSource
  /** Only those with this tag. */
  tag: string | null
  /** In the title or a tag. */
  search: string
}
export const NO_FILTER: ContentFilter = { kind: 'all', source: 'all', tag: null, search: '' }

/** The items that match, newest first (by when they were taken, else when they were added). */
export function filterContent(items: readonly ContentItem[], f: ContentFilter): ContentItem[] {
  const words = f.search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return items
    .filter(i => (f.kind === 'all' || i.kind === f.kind) && (f.source === 'all' || i.source === f.source) && (!f.tag || i.tags.includes(f.tag)))
    .filter(i => {
      const text = [i.title ?? '', ...i.tags].join(' ').toLowerCase()
      return words.every(w => text.includes(w))
    })
    .sort((a, b) => (b.taken_at ?? b.created_at).localeCompare(a.taken_at ?? a.created_at) || b.created_at.localeCompare(a.created_at))
}

/** Every tag in use, the most used first. */
export function allTags(items: readonly ContentItem[]): { tag: string; count: number }[] {
  const n = new Map<string, number>()
  for (const i of items) for (const t of i.tags) n.set(t, (n.get(t) ?? 0) + 1)
  return [...n].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** The file type its address ends in ("jpg", "mp4"…). */
export const extensionOf = (url: string) => /\.([a-z0-9]{2,4})(?:[?#].*)?$/i.exec(url)?.[1]?.toLowerCase() ?? null

/**
 * Whether it can go on a social post: the networks take JPEG photos and MP4 or MOV videos (a PNG or
 * WebP picture still suits the screens and the menu).
 */
export const postable = (i: Pick<ContentItem, 'kind' | 'url'>) =>
  i.kind === 'video' ? ['mp4', 'mov'].includes(extensionOf(i.url) ?? '') : ['jpg', 'jpeg'].includes(extensionOf(i.url) ?? '')

/**
 * The post that suits what's chosen: one photo a post, one video a reel, two to ten a carousel
 * (null: nothing to post, or more than a carousel takes).
 */
export function postFor(chosen: readonly Pick<ContentItem, 'kind' | 'url'>[]): { kind: PostKind; media: PostMedia[] } | null {
  const ok = chosen.filter(postable)
  if (!ok.length || ok.length > 10) return null
  const media = ok.map(i => ({ url: i.url, type: i.kind === 'video' ? 'video' as const : 'image' as const }))
  if (ok.length > 1) return { kind: 'carousel', media }
  return { kind: ok[0].kind === 'video' ? 'reel' : 'post', media }
}

/** A Google Photos picker address that closes its window once the admin has picked (Google's own option). */
export const autoclose = (pickerUri: string) => pickerUri.replace(/\/+$/, '') + '/autoclose'

/** Why a picked item wasn't brought in, in words for the admin. */
export type SkipReason = 'processing' | 'too_big' | 'unreadable' | 'kind'
export const SKIP_TEXT: Record<SkipReason, string> = {
  processing: msg('Google Photos is still getting this video ready. Pick it again in a little while.'),
  too_big: msg('Too big to keep here (videos up to 100 MB).'),
  unreadable: msg('Google Photos didn’t send this one. Pick it again.'),
  kind: msg('Only photos and videos can be brought in.'),
}

/** A Google Photos pick under way: open `picker_uri` in a new window, then ask whether it's done every `poll_ms`. */
export interface GooglePhotosPick { id: string; picker_uri: string; poll_ms: number; timeout_ms: number; expires_at: string | null }
/**
 * One round of bringing a pick in, a page of it (up to 100) at a time: what was added, what wasn't and why,
 * how many of the page are still to come (ask again with the same page), and the next page once it's done.
 */
export interface GooglePhotosImport {
  added: ContentItem[]
  skipped: { id: string; name: string | null; reason: SkipReason }[]
  /** Still to bring in from this page: ask again with the same page. */
  left: number
  /** The next page to ask for once this one's done; null: this was the last. */
  next_page: string | null
  /** Of this page, picked but in the library from before. */
  already: number
  /** How many were picked in all, when asked to count (the first round); null otherwise. */
  total: number | null
}
