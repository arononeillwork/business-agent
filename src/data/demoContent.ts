// The demo's Content page: a few of Easy Beans' own photos and a video, and a Google Photos pick that
// brings in four more (one video Google is still getting ready, as the real one says). Mirrors the
// `content_library` migration (admins only) and worker/content.ts (the café's storage must be connected,
// and Google Photos for a pick; something picked before isn't brought in twice).
import type { Api } from './api'
import { FOLDER_DEPTH, NO_DRIVE_FOLDERS, folderFileKind, syncPlan, type ContentFolder, type FolderProvider, type FolderSync } from '../../shared/contentFolders'
import { IMPORT_BATCH, cleanTags, contentProblem, titleFromFilename, type ContentItem, type GooglePhotosImport, type SkipReason } from '../../shared/content'

interface Who {
  isAdmin: () => boolean
  uid: () => string
  nowIso: () => string
  /** The café's Drive or OneDrive, when connected. */
  storage: () => string | null
  photosConnected: () => boolean
  /** Whether a connection (OneDrive, Google Drive) is connected. */
  connected: (provider: string) => boolean
}

type ContentApi = Pick<Api, 'contentItems' | 'uploadContent' | 'saveContentItem' | 'deleteContentItem' | 'startGooglePhotosPick' | 'googlePhotosPicked'
  | 'importGooglePhotos' | 'cancelGooglePhotosPick' | 'contentFolders' | 'browseContentFolders' | 'addContentFolder' | 'syncContentFolder' | 'removeContentFolder'>

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

/** The demo's OneDrive: Pictures › Camera Roll (an iPhone photo in it, which can't be shown), and 2025 inside. */
const DRIVE: { id: string; name: string; parent: string; folder?: boolean; url?: string; width?: number; height?: number; taken?: number }[] = [
  { id: 'od-pictures', name: 'Pictures', parent: 'root', folder: true },
  { id: 'od-documents', name: 'Documents', parent: 'root', folder: true },
  { id: 'od-roll', name: 'Camera Roll', parent: 'od-pictures', folder: true },
  { id: 'od-1', name: 'IMG_0412.JPG', parent: 'od-roll', url: picture('#F6EBDD', '#8B5E3C', CUP, 'IMG_0412.jpg'), width: 3024, height: 4032, taken: 2 },
  { id: 'od-2', name: 'Banana bread.jpg', parent: 'od-roll', url: picture('#FBF1E2', '#B9824A', PASTRY, 'banana-bread.jpg'), width: 4032, height: 3024, taken: 2 },
  { id: 'od-3', name: 'Morning rush.mp4', parent: 'od-roll', url: '/video/day-in-the-life.mp4', width: 1080, height: 1920, taken: 6 },
  { id: 'od-4', name: 'IMG_0413.HEIC', parent: 'od-roll' },
  { id: 'od-2025', name: '2025', parent: 'od-roll', folder: true },
  { id: 'od-5', name: 'Opening day.jpg', parent: 'od-2025', url: picture('#E9DCC9', '#C9B79C', SUN, 'opening-day.jpg'), width: 4032, height: 3024, taken: 30 },
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
  // Synced folders: the demo's OneDrive has Pictures › Camera Roll, with a folder for 2025 in it.
  const folders: ContentFolder[] = []
  const hidden = new Set<string>()
  const needFolders = (provider: FolderProvider) => {
    needAdmin()
    if (provider === 'google_drive') throw new Error(NO_DRIVE_FOLDERS)
    if (!w.connected(provider)) throw new Error('Connect OneDrive on the Connections page first.')
  }
  /** Look at a folder: what's in it (three deep) comes in once; what's gone goes. */
  const syncFolder = (folder: ContentFolder): FolderSync => {
    const inside = (id: string, depth: number): typeof DRIVE => depth >= FOLDER_DEPTH ? []
      : DRIVE.filter(f => f.parent === id).flatMap(f => (f.folder ? inside(f.id, depth + 1) : [f]))
    const all = inside(folder.folder_id, 0)
    const files = all.filter(f => folderFileKind(f.name))
    const listed = rows.filter(r => r.folder_id === folder.id)
    const plan = syncPlan(listed.map(r => r.source_id!), files)
    for (const f of plan.add) {
      const k = folderFileKind(f.name)!
      rows.push({ id: w.uid(), kind: k.kind, url: f.url!, title: titleFromFilename(f.name), source: 'folder', source_id: f.id, folder_id: folder.id,
        width: f.width ?? null, height: f.height ?? null, taken_at: daysAgo(f.taken ?? 0), tags: [], added_by: null, created_at: w.nowIso() })
    }
    for (let j = rows.length - 1; j >= 0; j--) if (rows[j].folder_id === folder.id && plan.remove.includes(rows[j].source_id!)) rows.splice(j, 1)
    folder.last_synced_at = w.nowIso()
    return { added: plan.add.length, removed: plan.remove.length, total: files.length, skipped: all.length - files.length }
  }
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
    async contentItems() { return w.isAdmin() ? structuredClone(rows.filter(r => !hidden.has(r.id))) : [] },
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
      if (!w.isAdmin() || i < 0) return
      // One from a synced folder is hidden (still in the folder); anything else goes.
      if (rows[i].source === 'folder') hidden.add(id)
      else rows.splice(i, 1)
    },
    async contentFolders() { return w.isAdmin() ? structuredClone(folders) : [] },
    async browseContentFolders(provider, parent) {
      needFolders(provider)
      const at = parent ? DRIVE.find(f => f.id === parent && f.folder) : null
      if (parent && !at) throw new Error('That folder isn’t in the OneDrive any more.')
      return { provider, folder: { id: parent, name: at?.name ?? 'OneDrive' },
        folders: DRIVE.filter(f => f.folder && f.parent === (parent ?? 'root')).map(f => ({ id: f.id, name: f.name })) }
    },
    async addContentFolder({ provider, folder_id, path }) {
      needFolders(provider)
      const at = DRIVE.find(f => f.id === folder_id && f.folder)
      if (!at) throw new Error('That folder isn’t in the OneDrive any more.')
      let folder = folders.find(f => f.provider === provider && f.folder_id === folder_id)
      if (!folder) {
        folder = { id: w.uid(), provider, folder_id, name: at.name, path, last_synced_at: null, last_error: null, created_at: w.nowIso() }
        folders.push(folder)
      }
      return { folder: structuredClone(folder), sync: syncFolder(folder) }
    },
    async syncContentFolder(id) {
      const folder = folders.find(f => f.id === id)
      if (!folder) throw new Error('That folder isn’t on the page any more.')
      needFolders(folder.provider)
      return syncFolder(folder)
    },
    async removeContentFolder(id) {
      needAdmin()
      const i = folders.findIndex(f => f.id === id)
      if (i >= 0) folders.splice(i, 1)
      for (let j = rows.length - 1; j >= 0; j--) if (rows[j].folder_id === id) rows.splice(j, 1)
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
