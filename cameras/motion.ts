// Which video a camera sends is worth keeping. A Reolink camera can't send a picture every few
// seconds and video only on movement: with its picture timer on, its video comes all the time. So
// each picture is made tiny and grey and compared with the one before; a piece of video is kept when
// something moved in the pictures around it, or when no pictures came around it at all (the camera
// sends on movement only, so its video is the movement).
import { spawn } from 'node:child_process'
import { open } from 'node:fs/promises'

/** Thumbnails are this size (grey, one byte a pixel). */
export const THUMB_W = 64
export const THUMB_H = 36
/** A pixel has changed when it's this much lighter or darker (of 255), after the whole picture's change in light is taken off. */
const PIXEL_CHANGE = 22
/** Something moved when this share of the pixels changed. */
const MOVED_SHARE = 0.006
/** Pictures this long before and after a piece of video count for it. */
export const AROUND_MS = 10_000
/** No pictures within this long of a piece of video: the camera isn't sending them, so keep the video. */
const NO_PICTURES_MS = 60_000

/** Did something move between two thumbnails? (A change of light over the whole picture isn't movement.) */
export function moved(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length || !a.length) return true
  let shift = 0
  for (let i = 0; i < a.length; i++) shift += b[i] - a[i]
  shift /= a.length
  let changed = 0
  for (let i = 0; i < a.length; i++) if (Math.abs(b[i] - a[i] - shift) > PIXEL_CHANGE) changed++
  return changed / a.length > MOVED_SHARE
}

export interface Seen { at: number; moved: boolean }

/** Keep a piece of video filmed from `start` to `end` (ms), given the pictures seen? */
export function keepVideo(pictures: Seen[], start: number, end: number, around = AROUND_MS): { keep: boolean; motion: boolean } {
  const near = pictures.some(p => p.at >= start - NO_PICTURES_MS && p.at <= end + NO_PICTURES_MS)
  if (!near) return { keep: true, motion: true }
  const motion = pictures.some(p => p.moved && p.at >= start - around && p.at <= end + around)
  return { keep: motion, motion }
}

/** A JPEG as a THUMB_W × THUMB_H grey thumbnail (ffmpeg decodes it at an eighth of its size: quick). */
export function thumbnail(jpeg: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-lowres', '3', '-f', 'image2pipe', '-c:v', 'mjpeg', '-i', 'pipe:0',
      '-vf', `scale=${THUMB_W}:${THUMB_H},format=gray`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'])
    const out: Buffer[] = []
    p.stdout.on('data', (d: Buffer) => out.push(d))
    p.stdin.on('error', () => {})
    const timer = setTimeout(() => p.kill('SIGKILL'), 10_000)
    p.on('error', e => { clearTimeout(timer); reject(e) })
    p.on('close', code => {
      clearTimeout(timer)
      const bytes = Buffer.concat(out)
      if (code === 0 && bytes.length === THUMB_W * THUMB_H) resolve(new Uint8Array(bytes))
      else reject(new Error(`ffmpeg couldn’t read the picture (${code ?? 'killed'})`))
    })
    p.stdin.end(jpeg)
  })
}

/**
 * How long an MP4 is, in seconds, from its movie header (mvhd inside moov), wherever moov is in the
 * file; null when it can't be found. Reads only the boxes' headers, not the video.
 */
export async function mp4Seconds(path: string): Promise<number | null> {
  const f = await open(path, 'r')
  try {
    const { size } = await f.stat()
    const head = Buffer.alloc(16)
    const box = async (at: number) => {
      const { bytesRead } = await f.read(head, 0, 16, at)
      if (bytesRead < 8) return null
      let length = head.readUInt32BE(0)
      const type = head.toString('latin1', 4, 8)
      let header = 8
      if (length === 1 && bytesRead >= 16) { length = Number(head.readBigUInt64BE(8)); header = 16 }
      else if (length === 0) length = size - at
      return length >= header ? { type, length, header } : null
    }
    for (let at = 0; at < size;) {
      const b = await box(at)
      if (!b) return null
      if (b.type === 'moov') {
        for (let inner = at + b.header; inner < at + b.length;) {
          const c = await box(inner)
          if (!c) return null
          if (c.type === 'mvhd') {
            const body = Buffer.alloc(32)
            await f.read(body, 0, 32, inner + c.header)
            const v1 = body[0] === 1
            const scale = v1 ? body.readUInt32BE(20) : body.readUInt32BE(12)
            const units = v1 ? Number(body.readBigUInt64BE(24)) : body.readUInt32BE(16)
            return scale ? units / scale : null
          }
          inner += c.length
        }
        return null
      }
      at += b.length
    }
    return null
  } finally {
    await f.close()
  }
}
