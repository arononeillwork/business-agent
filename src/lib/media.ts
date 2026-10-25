// Photos and videos picked in the browser, made ready for posting before they're uploaded:
// photos become JPEG (the only kind Instagram takes), no wider than 1440 px (Instagram's own
// size), and feed photos are cropped to a shape Instagram accepts (between 4:5 and 1.91:1).
import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, feedCrop } from '../../shared/social'

const VIDEO = /^video\/(mp4|quicktime)$/

/** A photo as a JPEG ready to post; `crop`: fit Instagram's feed shapes (posts and carousels). */
export async function readyPhoto(file: File, crop: boolean): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('That isn’t a photo')
  const img = await createImageBitmap(file).catch(() => { throw new Error('That photo can’t be read here. Use a JPEG or PNG.') })
  const area = crop ? feedCrop(img.width, img.height) : { width: img.width, height: img.height }
  const scale = Math.min(1, 1440 / area.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(area.width * scale)
  canvas.height = Math.round(area.height * scale)
  const g = canvas.getContext('2d')!
  // Cropped from the middle.
  g.drawImage(img, (img.width - area.width) / 2, (img.height - area.height) / 2, area.width, area.height, 0, 0, canvas.width, canvas.height)
  img.close()
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.9))
  if (!blob) throw new Error('That photo can’t be read here. Use a JPEG or PNG.')
  if (blob.size > MAX_PHOTO_BYTES) throw new Error('That photo is too big (over 8 MB). Try a smaller one.')
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
}

/** A video's length in seconds (null when the browser can't tell). */
export function videoSeconds(file: File): Promise<number | null> {
  return new Promise(resolve => {
    const v = document.createElement('video')
    const url = URL.createObjectURL(file)
    const done = (n: number | null) => { URL.revokeObjectURL(url); resolve(n) }
    v.preload = 'metadata'
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null)
    v.onerror = () => done(null)
    v.src = url
  })
}

/**
 * What the browser works out about a track, once (then kept with it): how long it is, its shape
 * for the part picker (peaks from 0 to 1), where its loudest stretch of `window` seconds starts
 * (its best part), and roughly its tempo (for cutting photos on the beat).
 */
export interface AudioFacts { duration: number; waveform: number[]; highlight: number; bpm: number | null }

const ANALYSIS_RATE = 11025

export async function analyzeAudio(src: Blob | string, window = 15, points = 200): Promise<AudioFacts> {
  const bytes = typeof src === 'string' ? await (await fetch(src)).arrayBuffer() : await src.arrayBuffer()
  // An offline context decodes without needing a tap first, resampled down: plenty for this.
  const audio = await new OfflineAudioContext(1, 1, ANALYSIS_RATE).decodeAudioData(bytes)
    .catch(() => { throw new Error('That track can’t be read here. Use an MP3 or M4A.') })
  const ch = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i))
  const n = audio.length
  const rate = audio.sampleRate
  const sample = (i: number) => ch.reduce((s, c) => s + c[i], 0) / ch.length

  // Peaks for the waveform.
  const per = Math.max(1, Math.floor(n / points))
  const peaks = Array.from({ length: Math.min(points, n) }, (_, b) => {
    let peak = 0
    for (let i = b * per; i < Math.min(n, (b + 1) * per); i += 4) peak = Math.max(peak, Math.abs(sample(i)))
    return peak
  })
  const top = Math.max(...peaks, 1e-6)
  const waveform = peaks.map(p => Math.round((p / top) * 100) / 100)

  // Loudness every 10 ms; the best part is the loudest stretch of `window` seconds.
  const STEP = 0.01
  const hop = Math.max(1, Math.round(rate * STEP))
  const energy: number[] = []
  for (let i = 0; i + hop <= n; i += hop) {
    let e = 0
    for (let j = i; j < i + hop; j++) e += sample(j) ** 2
    energy.push(e)
  }
  const span = Math.min(energy.length, Math.round(window / STEP))
  let sum = energy.slice(0, span).reduce((a, b) => a + b, 0)
  let best = sum, at = 0
  for (let k = span; k < energy.length; k++) {
    sum += energy[k] - energy[k - span]
    if (sum > best) { best = sum; at = k - span + 1 }
  }
  const duration = n / rate
  const highlight = Math.round(Math.min(at * STEP, Math.max(0, duration - window)) * 10) / 10

  return { duration: Math.round(duration * 10) / 10, waveform, highlight, bpm: tempo(energy, STEP) }
}

/** The tempo that best explains when the sound gets louder (autocorrelation of the onsets), 60–180 bpm. */
export function tempo(energy: number[], step: number): number | null {
  const onsets = energy.map((e, i) => Math.max(0, e - (energy[i - 1] ?? e)))
  if (onsets.length * step < 4) return null
  const mean = onsets.reduce((a, b) => a + b, 0) / onsets.length
  const centred = onsets.map(o => o - mean)
  // Each whole-frame lag once (neighbouring tempos share one at this resolution). Twice or half
  // the beat repeat almost as well as the beat itself, so tempos near the usual ~110 bpm are
  // preferred (a log-normal weight, half an octave wide).
  let best = 0, bestLag = 0
  const longest = Math.round(60 / 60 / step), shortest = Math.round(60 / 180 / step)
  for (let l = shortest; l <= longest; l++) {
    let score = 0
    for (let i = l; i < centred.length; i++) score += centred[i] * centred[i - l]
    score *= Math.exp(-0.5 * (Math.log2(60 / (l * step) / 110) / 0.5) ** 2)
    if (score > best) { best = score; bestLag = l }
  }
  return bestLag ? Math.round(60 / (bestLag * step)) : null
}

/** A video checked for posting: MP4 or MOV, up to 100 MB. */
export function readyVideo(file: File): File {
  if (!VIDEO.test(file.type)) throw new Error('Use an MP4 or MOV video')
  if (file.size > MAX_VIDEO_BYTES) throw new Error('That video is too big (over 100 MB). Trim it or export it smaller.')
  return file
}
