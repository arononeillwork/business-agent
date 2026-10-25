// The render service's recipes (docs/SOCIAL_MUSIC_PLAN.md): how a post's photo or video and a
// music track become the MP4 that goes to Instagram. Pure: it checks the job and builds ffmpeg
// arguments; render/server.ts downloads the files and runs them. Shared with the app's Worker
// (worker/render.ts), so both agree on what a job is.

/** What the app asks for. Volumes are 0–100; times are seconds. */
export interface RenderJob {
  /** Stories and reels are both 1080×1920 (9:16). */
  kind: 'story' | 'reel'
  /** The post's photo or video, at a public address. */
  source: { url: string; type: 'image' | 'video' }
  /** A reel made from several photos, cut to the beat: each photo's address, in order. */
  photos?: string[]
  /** Where each of `photos` starts, from 0 (the first is 0). */
  cuts?: number[]
  /** The music, and where in it the chosen part starts. */
  track: { url: string; start: number }
  /** How long a photo (or photos) plays; a video keeps its own length, up to this. */
  seconds: number
  music_volume: number
  /** The video's own sound (photos have none). */
  original_volume: number
  fade_in: boolean
  fade_out: boolean
  /** Drawn on photos as a "now playing" label, e.g. "♫ Sunday Morning · Easy Beans". */
  label?: string
}

/** A problem with the job itself, shown as it is. */
export class RenderError extends Error {}

export const SIZE = { width: 1080, height: 1920 } as const
/** Instagram: stories up to 60 s; reels 3 s to 15 min (photo reels kept to 3 minutes). */
export const LIMITS = { story: 60, reel: 900, photoReel: 180, min: 3 } as const
/** As many as a carousel holds (a reel made from one). */
const MAX_PHOTOS = 10

const num = (v: unknown, lo: number, hi: number, what: string) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < lo || n > hi) throw new RenderError(`${what} must be between ${lo} and ${hi}`)
  return n
}
const https = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !/^https?:\/\//.test(v)) throw new RenderError(`${what} needs a web address`)
  return v
}

/** The job as sent, checked: anything wrong is a RenderError in plain words. */
export function checkJob(raw: unknown): RenderJob {
  const j = (raw ?? {}) as Record<string, unknown>
  const kind = j.kind === 'story' || j.kind === 'reel' ? j.kind : null
  if (!kind) throw new RenderError('kind must be story or reel')
  const src = (j.source ?? {}) as Record<string, unknown>
  const type = src.type === 'image' || src.type === 'video' ? src.type : null
  if (!type) throw new RenderError('source.type must be image or video')
  const track = (j.track ?? {}) as Record<string, unknown>
  const photos = Array.isArray(j.photos) ? j.photos.map((p, i) => https(p, `photos[${i}]`)) : undefined
  if (photos && (photos.length < 2 || photos.length > MAX_PHOTOS)) throw new RenderError(`A reel from photos takes 2 to ${MAX_PHOTOS} photos`)
  const max = type === 'video' ? (kind === 'story' ? LIMITS.story : LIMITS.reel) : kind === 'story' ? LIMITS.story : LIMITS.photoReel
  const seconds = num(j.seconds, LIMITS.min, max, 'seconds')
  let cuts: number[] | undefined
  if (photos) {
    cuts = Array.isArray(j.cuts) ? j.cuts.map(Number) : photos.map((_, i) => (i * seconds) / photos.length)
    if (cuts.length !== photos.length || cuts[0] !== 0 || cuts.some((c, i) => !Number.isFinite(c) || (i > 0 && c <= cuts![i - 1]) || c >= seconds)) {
      throw new RenderError('cuts must start at 0, go up, and stay inside the length')
    }
  }
  const label = typeof j.label === 'string' && j.label.trim() ? j.label.trim().slice(0, 80) : undefined
  return {
    kind, source: { url: https(src.url, 'source.url'), type }, ...(photos ? { photos, cuts } : {}),
    track: { url: https(track.url, 'track.url'), start: num(track.start ?? 0, 0, 3600, 'track.start') },
    seconds, music_volume: num(j.music_volume ?? 100, 0, 100, 'music_volume'),
    original_volume: num(j.original_volume ?? 100, 0, 100, 'original_volume'),
    fade_in: j.fade_in !== false, fade_out: j.fade_out !== false, ...(label ? { label } : {}),
  }
}

const fix = (n: number) => Number(n.toFixed(3))

/** The music, cut to its part: volume, fades, and one stereo 44.1 kHz format to mix or encode. */
export function musicChain(j: Pick<RenderJob, 'music_volume' | 'fade_in' | 'fade_out'>, seconds: number) {
  const parts = [`volume=${fix(j.music_volume / 100)}`]
  if (j.fade_in) parts.push(`afade=t=in:st=0:d=${fix(Math.min(0.8, seconds / 4))}`)
  const out = Math.min(1.5, seconds / 3)
  if (j.fade_out) parts.push(`afade=t=out:st=${fix(seconds - out)}:d=${fix(out)}`)
  parts.push('aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo')
  return parts.join(',')
}

/** The track as an input, from the chosen part, looping if it's shorter than the post. */
const trackInput = (path: string, start: number) => ['-stream_loop', '-1', '-ss', String(fix(start)), '-i', path]

const AUDIO_OUT = ['-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2']
const MP4_OUT = ['-movflags', '+faststart']

/**
 * One photo as a 9:16 frame: the photo whole in the middle, over a blurred, darkened fill of
 * itself (Instagram's own look), with the "now playing" label near the foot when there is one.
 * Made once as a still, so the video is just that frame held (fast to encode).
 */
export function stillArgs(photo: string, out: string, opts: { labelFile?: string; font?: string } = {}) {
  const { width: W, height: H } = SIZE
  let graph = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:3,eq=brightness=-0.08[bg];`
    + `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1`
  if (opts.labelFile && opts.font) {
    graph += `,drawtext=fontfile=${opts.font}:textfile=${opts.labelFile}:fontsize=42:fontcolor=white`
      + ':box=1:boxcolor=black@0.45:boxborderw=26:x=(w-text_w)/2:y=h-300'
  }
  return ['-y', '-i', photo, '-filter_complex', `${graph}[v]`, '-map', '[v]', '-frames:v', '1', '-update', '1', out]
}

// A photo is held still, so its video is encoded once as a 1-second clip (every frame decodable on
// its own run: one keyframe a second, no B-frames) and then repeated by copying, never encoded
// again. A 60-second story takes seconds instead of a minute on the container's half a CPU.
export const FPS = 30
/** Frames in a length of time (stories end on an exact frame, never past 60 s). */
export const frames = (seconds: number) => Math.round(seconds * FPS)

/** A held frame (from stillArgs) as a 1-second clip, for holdArgs and photoArgs to repeat. */
export function clipArgs(still: string, out: string) {
  return ['-y', '-loop', '1', '-framerate', String(FPS), '-i', still, '-frames:v', String(FPS),
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-g', String(FPS), '-bf', '0', '-an', out]
}

/** The clip repeated for a number of frames (one photo of a slideshow, until the next cut). */
export const holdArgs = (clip: string, count: number, out: string) =>
  ['-y', '-stream_loop', '-1', '-i', clip, '-frames:v', String(count), '-c', 'copy', '-an', out]

/** A photo story, or a reel from one photo: the clip held for the length, with the music. */
export function photoArgs(clip: string, track: string, j: RenderJob, out: string) {
  return ['-y', '-stream_loop', '-1', '-i', clip, ...trackInput(track, j.track.start),
    '-filter_complex', `[1:a]${musicChain(j, j.seconds)}[a]`, '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-frames:v', String(frames(j.seconds)), ...AUDIO_OUT, '-t', String(fix(j.seconds)), ...MP4_OUT, out]
}

/** How many frames each photo of a slideshow holds: cut to cut, adding up to the whole length. */
export function holdFrames(cuts: number[], seconds: number) {
  return cuts.map((c, i) => frames(cuts[i + 1] ?? seconds) - frames(c))
}

/** The concat list of a slideshow's held photos, in order. */
export const slideshowList = (segments: string[]) => `ffconcat version 1.0\n${segments.map(s => `file '${s}'`).join('\n')}\n`

/** A reel from several photos, each held until the next cut (on the beat), with the music. */
export function slideshowArgs(list: string, track: string, j: RenderJob, out: string) {
  return ['-y', '-f', 'concat', '-safe', '0', '-i', list, ...trackInput(track, j.track.start),
    '-filter_complex', `[1:a]${musicChain(j, j.seconds)}[a]`, '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-frames:v', String(frames(j.seconds)), ...AUDIO_OUT, '-t', String(fix(j.seconds)), ...MP4_OUT, out]
}

/** What ffprobe says about the post's video. */
export interface Probe { duration: number; codec: string; pixFmt: string; width: number; height: number; hasAudio: boolean }

export function readProbe(json: string): Probe {
  const p = JSON.parse(json) as { streams?: { codec_type?: string; codec_name?: string; pix_fmt?: string; width?: number; height?: number }[]; format?: { duration?: string } }
  const v = p.streams?.find(s => s.codec_type === 'video')
  if (!v) throw new RenderError('That file has no video in it')
  return {
    duration: Number(p.format?.duration ?? 0), codec: v.codec_name ?? '', pixFmt: v.pix_fmt ?? '',
    width: v.width ?? 0, height: v.height ?? 0, hasAudio: !!p.streams?.some(s => s.codec_type === 'audio'),
  }
}

export const probeArgs = (file: string) => ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt,width,height:format=duration', '-of', 'json', file]

/**
 * The post's video with the music. The picture is copied as it is when Instagram can take it
 * (H.264 or HEVC, 4:2:0: what phones record), otherwise re-encoded; the sound is the music, mixed
 * with the video's own at the chosen volumes (just the music when the video is silent or turned
 * all the way down).
 */
export function videoArgs(video: string, probe: Probe, track: string, j: RenderJob, out: string) {
  const seconds = Math.min(probe.duration || j.seconds, j.seconds)
  if (seconds < LIMITS.min) throw new RenderError(`The video is too short: at least ${LIMITS.min} seconds`)
  const music = `[1:a]${musicChain(j, seconds)}`
  const mix = probe.hasAudio && j.original_volume > 0
    ? `[0:a:0]volume=${fix(j.original_volume / 100)},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[o];${music}[m];[o][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`
    : `${music}[a]`
  const copy = ['h264', 'hevc'].includes(probe.codec) && ['yuv420p', 'yuvj420p'].includes(probe.pixFmt)
  // Even sides, no wider than Instagram's 1080 px. HEVC is tagged the way Apple and Instagram expect.
  const picture = copy ? ['-c:v', 'copy', ...(probe.codec === 'hevc' ? ['-tag:v', 'hvc1'] : [])]
    : ['-vf', 'scale=w=min(1080\\,iw):h=-2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-r', '30']
  return ['-y', '-i', video, ...trackInput(track, j.track.start), '-filter_complex', mix, '-map', '0:v:0', '-map', '[a]',
    ...picture, ...AUDIO_OUT, '-t', String(fix(seconds)), ...MP4_OUT, out]
}
