// The demo's cameras: the counter (a Reolink E1 Zoom inside) and the terrace (an E1 Outdoor), each
// with the last few days' clips and a drawn picture standing in for the camera's own, with the time
// along the bottom as a camera prints it.
import type { Camera, CameraClip } from '../../shared/cameras'
import { formatLocal } from '../../shared/time'

const DAY = 86_400_000

export function demoCameras(now: number): Camera[] {
  const ago = (ms: number) => new Date(now - ms).toISOString()
  return [
    { id: 'cam-counter', name: 'Counter', placement: 'indoor', ftp_user: 'cam5e1c0a7f', ftp_password: '7d2f9a41c0b86e35', keep_days: 30, keep_video: 'motion', active: true,
      created_at: ago(12 * DAY), updated_at: ago(2 * DAY), last_seen_at: ago(90_000), last_clip_at: ago(11 * 60_000), last_error: null },
    { id: 'cam-terrace', name: 'Terrace', placement: 'outdoor', ftp_user: 'cam9b3d2e10', ftp_password: 'a1f04c6e93b25d78', keep_days: 14, keep_video: 'motion', active: true,
      created_at: ago(12 * DAY), updated_at: ago(12 * DAY), last_seen_at: ago(4 * 60_000), last_clip_at: ago(48 * 60_000), last_error: null },
  ]
}

/** The last three days of clips: something moving every half hour or so while the café's open. */
export function demoClips(now: number, tz: string): CameraClip[] {
  const out: CameraClip[] = []
  for (const [camera, every, mb] of [['cam-counter', 37, 14], ['cam-terrace', 71, 9]] as const) {
    for (let at = now - 3 * DAY, n = 0; at < now - 5 * 60_000; at += every * 60_000, n++) {
      const hour = Number(formatLocal(new Date(at).toISOString(), 'H', tz))
      if (hour < 8 || hour >= 19) continue
      const started = new Date(at).toISOString()
      const id = `${camera}-clip-${n}`
      out.push({ id, camera_id: camera, started_at: started, seconds: 20 + (n * 7) % 40, bytes: Math.round((mb + (n % 5)) * 1024 * 1024), storage: 'google_drive',
        file_id: `gd-${id}`, file_name: `${formatLocal(started, 'HH.mm.ss', tz)}.mp4`, link: `https://drive.google.com/file/d/gd-${id}/view`, motion: true,
        kept: false, note: null, created_at: started })
    }
  }
  // One kept for an incident: the night the terrace chairs were moved.
  const kept = out.find(c => c.camera_id === 'cam-terrace')
  if (kept) Object.assign(kept, { kept: true, note: 'Two chairs taken from the terrace: shown to the Policía Local' })
  return out
}

/** A drawing for a camera's picture: the counter or the terrace, with the time along the bottom. */
export function demoCameraPicture(placement: 'indoor' | 'outdoor', at: Date, tz: string): Blob {
  const stamp = formatLocal(at.toISOString(), 'yyyy-MM-dd HH:mm:ss', tz)
  const sway = (at.getTime() / 1000) % 20
  const scene = placement === 'indoor'
    ? `<rect width="640" height="360" fill="#3a3330"/><rect y="230" width="640" height="130" fill="#6b4f3a"/><rect x="40" y="200" width="560" height="40" fill="#8a6a4f"/>
       <rect x="80" y="120" width="90" height="80" rx="6" fill="#9aa3a8"/><circle cx="125" cy="150" r="14" fill="#d9d4cf"/>
       <rect x="420" y="150" width="40" height="50" rx="4" fill="#efe6dc"/><rect x="470" y="160" width="34" height="40" rx="4" fill="#e7c9a9"/>
       <circle cx="${300 + sway * 3}" cy="150" r="22" fill="#c69c7d"/><rect x="${276 + sway * 3}" y="172" width="48" height="60" rx="18" fill="#556b6f"/>`
    : `<rect width="640" height="360" fill="#7fa7c9"/><rect y="200" width="640" height="160" fill="#c9b79c"/><rect x="0" y="80" width="200" height="140" fill="#e8e0d4"/>
       <rect x="60" y="130" width="70" height="90" fill="#5b4a3d"/>${[260, 380, 500].map(x => `<ellipse cx="${x}" cy="260" rx="40" ry="10" fill="#f2efe9"/><rect x="${x - 4}" y="260" width="8" height="40" fill="#999"/>`).join('')}
       <circle cx="${520 - sway * 6}" cy="200" r="16" fill="#b98a6a"/><rect x="${506 - sway * 6}" y="216" width="28" height="50" rx="12" fill="#3f5a7a"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${scene}
    <rect x="0" y="330" width="640" height="30" fill="rgba(0,0,0,0.45)"/><text x="12" y="351" font-family="monospace" font-size="16" fill="#fff">${stamp}</text></svg>`
  return new Blob([svg], { type: 'image/svg+xml' })
}
