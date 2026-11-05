// Google Photos, through Google's Photos Picker API: the admin picks photos and videos in Google
// Photos' own picker (a window of Google's, never inside the app), and Business Agent may read just
// those. Since March 2025 that's the only way an app can read someone's Google Photos library; it
// can't browse or search the rest of it (photospicker.mediaitems.readonly). Signed in with the same
// Google app as Gmail and Drive. The picked items' addresses last an hour, so the Content page copies
// each into the café's own storage (worker/content.ts).
export const GOOGLE_PHOTOS_SCOPES = ['https://www.googleapis.com/auth/photospicker.mediaitems.readonly', 'openid', 'email']
const API = 'https://photospicker.googleapis.com/v1'

/** A picker session: the admin opens `pickerUri`, picks, and the app then reads what was picked. */
export interface PickingSession {
  id: string
  pickerUri: string
  /** While nothing is picked yet: how often to ask, and for how long ("5s", "1800s"). */
  pollingConfig?: { pollInterval?: string; timeoutIn?: string }
  expireTime?: string
  /** Picked and done: the items can be read. */
  mediaItemsSet?: boolean
}

export interface PickedMediaItem {
  id: string
  createTime?: string
  type?: 'TYPE_UNSPECIFIED' | 'PHOTO' | 'VIDEO'
  mediaFile?: {
    baseUrl: string
    mimeType?: string
    filename?: string
    mediaFileMetadata?: {
      width?: number; height?: number
      videoMetadata?: { fps?: number; processingStatus?: 'UNSPECIFIED' | 'PROCESSING' | 'READY' | 'FAILED' }
    }
  }
}

/** Google's error, kept with its status ("FAILED_PRECONDITION") so the caller can tell what happened. */
export class PhotosError extends Error {
  constructor(message: string, readonly status: string | undefined, readonly code: number) { super(message) }
}

async function photos<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string; status?: string } }
  if (!res.ok) throw new PhotosError(json.error?.message ?? `Google Photos error ${res.status}`, json.error?.status, res.status)
  return json
}

/** A new session; up to `max` items (Google allows 2000). */
export const createSession = (token: string, max = 100) =>
  photos<PickingSession>(token, '/sessions', { method: 'POST', body: { pickingConfig: { maxItemCount: String(Math.max(1, Math.min(2000, max))) } } })

export const getSession = (token: string, id: string) => photos<PickingSession>(token, `/sessions/${encodeURIComponent(id)}`)

/** Done with it (Google asks apps to delete each session once its items are read). Already gone is fine. */
export async function deleteSession(token: string, id: string) {
  try {
    await photos(token, `/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch (e) {
    if (!(e instanceof PhotosError && (e.code === 404 || e.status === 'NOT_FOUND'))) throw e
  }
}

/** Everything picked in the session (pages of 100). FAILED_PRECONDITION until the admin has finished picking. */
export async function pickedItems(token: string, sessionId: string): Promise<PickedMediaItem[]> {
  const items: PickedMediaItem[] = []
  let page: string | undefined
  do {
    const q = new URLSearchParams({ sessionId, pageSize: '100', ...(page ? { pageToken: page } : {}) })
    const r = await photos<{ mediaItems?: PickedMediaItem[]; nextPageToken?: string }>(token, `/mediaItems?${q}`)
    items.push(...(r.mediaItems ?? []))
    page = r.nextPageToken
  } while (page && items.length < 2000)
  return items
}

/** "5s", "3.5s" → milliseconds (`fallback` when Google didn't say). */
export function seconds(duration: string | undefined, fallback: number) {
  const n = Number(/^(\d+(?:\.\d+)?)s$/.exec(duration ?? '')?.[1])
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : fallback
}

/** How big a photo is copied (the longest side): plenty for posts (1440) and the café's screens. */
export const PHOTO_SIDE = 2560

/**
 * Where a picked item's bytes are. Google needs a size for a photo (it sends a JPEG no bigger than
 * that) and `=dv` for a video (a good-quality MP4). Either way the request carries the access token.
 */
export function downloadUrl(item: PickedMediaItem) {
  const base = item.mediaFile?.baseUrl
  if (!base) return null
  return item.type === 'VIDEO' ? `${base}=dv` : `${base}=w${PHOTO_SIDE}-h${PHOTO_SIDE}`
}

/** The picked item's file, from Google (its address lasts an hour). */
export async function download(token: string, item: PickedMediaItem): Promise<Response> {
  const url = downloadUrl(item)
  if (!url) throw new Error('Google Photos gave no address for this item')
  return fetch(url, { headers: { authorization: `Bearer ${token}`, accept: item.type === 'VIDEO' ? 'video/mp4,video/*' : 'image/jpeg,image/*;q=0.8' } })
}
