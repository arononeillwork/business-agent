// Cameras: the business's CCTV cameras (Reolink plug-in Wi-Fi and PoE ones, which upload by FTP).
// Each logs in to Business Agent's upload server (cameras/) with its own username and password and
// sends a picture every few seconds (the Cameras page's picture, kept only on that server) and
// video, kept in the business's Google Drive or OneDrive (Business Agent/Cameras/<camera>/<day>/)
// for the camera's days, then deleted. Shared by the app and the Worker.
import { msg } from './i18n'
import { addDays, formatLocal, zonedIso } from './time'

export type Placement = 'indoor' | 'outdoor'
export type KeepVideo = 'motion' | 'all'

export interface Camera {
  id: string
  name: string
  placement: Placement
  /** Its login on the upload server (typed into the camera's app). */
  ftp_user: string
  ftp_password: string
  /** Days its video is kept (Spain: a month at most). */
  keep_days: number
  /** 'motion': only video with something moving in it; 'all': everything it sends. */
  keep_video: KeepVideo
  /** Off: its uploads are turned away. */
  active: boolean
  created_at: string
  updated_at: string
  /** When a picture or video last came in (noted every few minutes), and the last video kept. */
  last_seen_at: string | null
  last_clip_at: string | null
  /** Why the last video couldn't be kept (storage not connected or failing), until one is. */
  last_error: string | null
}

export type CameraInput = Pick<Camera, 'name' | 'placement' | 'keep_days' | 'keep_video' | 'active'> & { id?: string }

export interface CameraClip {
  id: string
  camera_id: string
  started_at: string
  seconds: number | null
  bytes: number
  storage: 'google_drive' | 'onedrive'
  file_id: string
  file_name: string
  /** The file's page in Drive or OneDrive. */
  link: string | null
  /** Kept because something moved (false: the camera keeps everything). */
  motion: boolean
  /** Kept for an incident: not deleted when the camera's days are up. */
  kept: boolean
  note: string | null
  created_at: string
}

/** The upload server, as the Cameras page shows it: where cameras send to (null: not switched on yet). */
export interface CameraService { ftp: { host: string; port: number } | null }

/** What the upload server has from a camera right now (it keeps this in memory). */
export interface CameraLive {
  picture_at: string | null
  video_at: string | null
  kept_today: number
  skipped_today: number
}

export const MAX_KEEP_DAYS = 30
export const KEEP_DAY_CHOICES = [1, 3, 7, 14, 30]
/** How often the camera sends a picture (its FTP "Interval"), and how often the page asks for it. */
export const PICTURE_SECONDS = 5
/** The camera's "Max File Size": each piece of video, small enough to pass on quickly. */
export const VIDEO_PIECE_MB = 20
/** A picture this recent: the camera is sending now. */
export const LIVE_MS = 2 * 60_000
/** Video the upload server takes (a bigger piece is turned away; the camera's Max File Size is lower). */
export const MAX_CLIP_BYTES = 95 * 1024 * 1024

export const PLACEMENTS: { id: Placement; label: string }[] = [
  { id: 'indoor', label: msg('Indoor') },
  { id: 'outdoor', label: msg('Outdoor') },
]

export const newCamera = (name: string, placement: Placement = 'indoor'): CameraInput =>
  ({ name, placement, keep_days: MAX_KEEP_DAYS, keep_video: 'motion', active: true })

/** What's wrong with a camera's settings, in words for the person (null: nothing). */
export function cameraProblem(c: Pick<CameraInput, 'name' | 'keep_days'>): string | null {
  const name = c.name.trim()
  if (!name) return msg('Give the camera a name')
  if (name.length > 60) return msg('Keep the name to 60 characters')
  if (/[\\/:*?"<>|]/.test(name)) return msg('A camera’s name is its folder’s in your storage: leave out \\ / : * ? " < > |')
  if (!Number.isInteger(c.keep_days) || c.keep_days < 1 || c.keep_days > MAX_KEEP_DAYS) return msg('Keep video for between 1 and 30 days')
  return null
}

/** Is the camera sending now (a picture in the last couple of minutes)? */
export const isLive = (live: CameraLive | undefined, now = Date.now()) =>
  !!live?.picture_at && now - Date.parse(live.picture_at) < LIVE_MS

/** The camera's time in a file name ("Counter_00_20261030101500.mp4": 30 Oct 2026, 10:15:00), as local date and time. */
export function fileTime(name: string): { date: string; time: string } | null {
  const m = name.match(/(?:^|[^0-9])(20\d{2})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})(?![0-9])/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59 || +s > 59) return null
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}:${s}` }
}

/**
 * When a piece of video started: from the camera's time in its name when that agrees with when it
 * arrived (within two hours: the camera's clock is right), else from when it arrived less its length.
 */
export function clipStart(name: string, endedAt: string, seconds: number | null, tz: string): string {
  const arrived = Date.parse(endedAt) - (seconds ?? 0) * 1000
  const own = fileTime(name)
  if (own) {
    const at = Date.parse(zonedIso(own.date, own.time.slice(0, 5), tz)) + Number(own.time.slice(6)) * 1000
    if (Math.abs(at - arrived) < 2 * 3600_000) return new Date(at).toISOString()
  }
  return new Date(arrived).toISOString()
}

/** Where a clip goes in the storage: Cameras/<camera>/<day>, named by the local time it started. */
export function clipPlace(camera: string, startedAt: string, tz: string) {
  return { folder: ['Cameras', camera, formatLocal(startedAt, 'yyyy-MM-dd', tz)], name: `${formatLocal(startedAt, 'HH.mm.ss', tz)}.mp4` }
}

/** The days with clips, newest first, each with its clips (newest first), in local time. */
export function clipsByDay(clips: CameraClip[], tz: string): { day: string; clips: CameraClip[] }[] {
  const days = new Map<string, CameraClip[]>()
  for (const c of [...clips].sort((a, b) => b.started_at.localeCompare(a.started_at))) {
    const day = formatLocal(c.started_at, 'yyyy-MM-dd', tz)
    days.set(day, [...(days.get(day) ?? []), c])
  }
  return [...days].map(([day, clips]) => ({ day, clips }))
}

/** The day a camera's oldest clips are deleted after (its days back from today). */
export const keptSince = (today: string, keepDays: number) => addDays(today, -keepDays)

/** About how much space the video takes a day, from the last week's (bytes; null with under a day of it). */
export function bytesPerDay(clips: Pick<CameraClip, 'started_at' | 'bytes'>[], now = Date.now()): number | null {
  const week = clips.filter(c => now - Date.parse(c.started_at) < 7 * 86_400_000)
  if (!week.length) return null
  const oldest = Math.min(...week.map(c => Date.parse(c.started_at)))
  const days = Math.max(1, (now - oldest) / 86_400_000)
  return week.reduce((n, c) => n + c.bytes, 0) / days
}

/** A size for people: "820 KB", "4.2 MB", "1.3 GB". */
export function sizeText(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
