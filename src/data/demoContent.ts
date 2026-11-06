// The demo's Content page: a few of Easy Beans' own photos and a video, and a Google Photos pick that
// brings in four more (one video Google is still getting ready, as the real one says). Mirrors the
// `content_library` migration (admins only) and worker/content.ts (the café's storage must be connected,
// and Google Photos for a pick; something picked before isn't brought in twice).
import type { Api } from './api'
import { IMPORT_BATCH, cleanTags, contentProblem, type ContentItem, type GooglePhotosImport, type SkipReason } from '../../shared/content'

interface Who {
  isAdmin: () => boolean
  uid: () => string
  nowIso: () => string
  /** The café's Drive or OneDrive, when connected. */
  storage: () => string | null
  photosConnected: () => boolean
}

type ContentApi = Pick<Api, 'contentItems' | 'uploadContent' | 'saveContentItem' | 'deleteContentItem' | 'startGooglePhotosPick' | 'googlePhotosPicked'
  | 'importGooglePhotos' | 'cancelGooglePhotosPick'>

const RLS = 'new row violates row-level security policy for table "content_items"'
const NO_STORAGE = 'Connect Google Drive or OneDrive on the Connections page first: the photos and videos are kept in its The Business Agent folder.'

/**
 * A picture drawn for the demo. Its address ends in the file type the real one would have (the part after
 * # isn't part of the picture), so it can go on a post like a real JPEG.
 */
const picture = (bg: string, fg: string, shape: string, file: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><rect width="640" height="480" fill="${bg}"/>${shape.replaceAll('FG', fg)}</svg>`)}#${file}`
const CUP = '<circle cx="320" cy="250" r="150" fill="#fff"/><circle cx="320" cy="250" r="118" fill="FG"/><path d="M270 238c30-45 70-45 100 0-30 45-70 45-100 0z" fill="#F4E7D7"/>'
const SUN = '<circle cx="470" cy="130" r="70" fill="#F7C873"/><rect y="330" width="640" height="150" fill="FG"/><rect x="120" y="250" width="140" height="80" rx="10" fill="#fff"/><rect x="380" y="250" width="140" height="80" rx="10" fill="#fff"/>'
const PASTRY = '<ellipse cx="320" cy="300" rx="220" ry="70" fill="#fff"/><path d="M180 290c40-110 240-110 280 0z" fill="FG"/><path d="M230 250c30-40 150-40 180 0" stroke="#F4E7D7" stroke-width="14" fill="none"/>'
const BEANS = '<ellipse cx="250" cy="240" rx="70" ry="100" fill="FG"/><ellipse cx="390" cy="240" rx="70" ry="100" fill="FG"/><path d="M250 150c-25 60 25 120 0 180M390 150c-25 60 25 120 0 180" stroke="#F4E7D7" stroke-width="10" fill="none"/>'

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

/** What the demo's Google Photos pick holds (some taken upright, as phones do: the page shows each at its own shape). */
const PICKS: { id: string; type: 'photo' | 'video'; title: string; url: string; ready: boolean; taken: number; width: number; height: number }[] = [
  { id: 'gp-terrace', type: 'photo', title: 'Terrace in the sun', url: picture('#E9DCC9', '#C9B79C', SUN, 'terrace.jpg'), ready: true, taken: 3, width: 2560, height: 1920 },
  { id: 'gp-flat-white', type: 'photo', title: 'Flat white', url: picture('#F4E7D7', '#8B5E3C', CUP, 'flat-white.jpg'), ready: true, taken: 4, width: 1920, height: 2560 },
  { id: 'gp-croissants', type: 'photo', title: 'Croissants out of the oven', url: picture('#FBEFE3', '#D9A35B', PASTRY, 'croissants.jpg'), ready: true, taken: 5, width: 2560, height: 1920 },
  { id: 'gp-pour', type: 'video', title: 'Pour over', url: '/video/run-your-cafe.mp4', ready: false, taken: 1, width: 1080, height: 1920 },
]

export function demoContentApi(w: Who): ContentApi {
  const rows: ContentItem[] = [
    { id: 'content-1', kind: 'photo', url: picture('#F1E4E6', '#A85A68', CUP, 'iced-latte.jpg'), title: 'Iced oat latte', source: 'upload', source_id: null,
      width: 1440, height: 1080, taken_at: null, tags: ['drinks', 'summer'], added_by: null, created_at: daysAgo(9) },
    { id: 'content-2', kind: 'photo', url: picture('#E7EFE4', '#5E7D4F', BEANS, 'ethiopia-beans.jpg'), title: 'Ethiopia Guji beans', source: 'upload', source_id: null,
      width: 1440, height: 1080, taken_at: null, tags: ['coffee'], added_by: null, created_at: daysAgo(12) },
    { id: 'content-3', kind: 'video', url: '/video/day-in-the-life.mp4', title: 'A day at Easy Beans', source: 'upload', source_id: null,
      width: 1920, height: 1080, taken_at: null, tags: ['team', 'behind the scenes'], added_by: null, created_at: daysAgo(20) },
  ]
  // Picks under way: whether Google says they're done yet (the demo's admin "picks" straight away).
  const picks = new Map<string, { asked: number }>()
  let next = 1

  const needAdmin = () => { if (!w.isAdmin()) throw new Error(RLS) }
  const needPhotos = () => {
    needAdmin()
    if (!w.storage()) throw new Error(NO_STORAGE)
    if (!w.photosConnected()) throw new Error('Connect Google Photos on the Connections page first.')
  }

  return {
    async contentItems() { return w.isAdmin() ? structuredClone(rows) : [] },
    async uploadContent(file, info) {
      needAdmin()
      if (!w.storage()) throw new Error(NO_STORAGE)
      const video = file.type.startsWith('video/')
      if (!video && !/^image\/(jpeg|png|webp)$/.test(file.type) || video && !/^video\/(mp4|quicktime)$/.test(file.type)) {
        throw new Error('Use a JPEG, PNG or WebP photo, or an MP4 or MOV video')
      }
      const ext = video ? (file.type === 'video/quicktime' ? 'mov' : 'mp4') : file.type.split('/')[1].replace('jpeg', 'jpg')
      const item: ContentItem = { id: w.uid(), kind: video ? 'video' : 'photo', url: `${URL.createObjectURL(file)}#upload.${ext}`, title: info.title?.trim() || null,
        source: 'upload', source_id: null, width: info.width, height: info.height, taken_at: null, tags: [], added_by: null, created_at: w.nowIso() }
      rows.unshift(item)
      return structuredClone(item)
    },
    async saveContentItem({ id, title, tags }) {
      needAdmin()
      const row = rows.find(r => r.id === id)
      if (!row) throw new Error('That isn’t here any more')
      const next = { title: title?.trim() || null, tags: cleanTags(tags) }
      const problem = contentProblem(next)
      if (problem) throw new Error(problem)
      Object.assign(row, next)
    },
    async deleteContentItem(id) {
      const i = rows.findIndex(r => r.id === id)
      if (w.isAdmin() && i >= 0) rows.splice(i, 1)
    },
    async startGooglePhotosPick() {
      needPhotos()
      const id = `pick-${next++}`
      picks.set(id, { asked: 0 })
      // The demo opens no Google window: an empty address tells the page there's nothing to open.
      return { id, picker_uri: '', poll_ms: 600, timeout_ms: 5 * 60_000, expires_at: null }
    },
    async googlePhotosPicked(id) {
      needPhotos()
      const p = picks.get(id)
      if (!p) throw new Error('That Google Photos pick has ended. Pick again.')
      p.asked++
      return { picked: p.asked >= 1, poll_ms: 600 }
    },
    async importGooglePhotos(id, skip) {
      needPhotos()
      if (!picks.has(id)) throw new Error('That Google Photos pick has ended. Pick again.')
      const have = new Set(rows.map(r => r.source_id))
      const todo = PICKS.filter(p => !have.has(p.id) && !skip.includes(p.id))
      const added: ContentItem[] = []
      const skipped: GooglePhotosImport['skipped'] = []
      for (const p of todo.slice(0, IMPORT_BATCH)) {
        if (!p.ready) { skipped.push({ id: p.id, name: `${p.title}.mp4`, reason: 'processing' satisfies SkipReason }); continue }
        const item: ContentItem = { id: w.uid(), kind: p.type, url: p.url, title: p.title, source: 'google_photos', source_id: p.id,
          width: p.width, height: p.height, taken_at: daysAgo(p.taken), tags: [], added_by: null, created_at: w.nowIso() }
        rows.unshift(item)
        added.push(structuredClone(item))
      }
      const left = Math.max(0, todo.length - IMPORT_BATCH)
      if (!left) picks.delete(id)
      return { added, skipped, left, already: PICKS.filter(p => have.has(p.id)).length }
    },
    async cancelGooglePhotosPick(id) { picks.delete(id) },
  }
}
