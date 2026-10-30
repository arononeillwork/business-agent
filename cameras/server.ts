// The camera upload server (cameras/Dockerfile, on Fly.io: cameras/fly.toml): every business's
// cameras log in here by FTP (cameras/ftp.ts) with the username and password from the Cameras page.
//   - Pictures: the latest from each camera is kept here, in memory only, for the Cameras page's
//     picture that refreshes every few seconds (GET /picture/<username>, through the app's Worker).
//   - Video: passed on to the app's Worker (POST /api/camera-uploads/clip), which keeps it in the
//     business's Google Drive or OneDrive. With the camera set to keep only movement, a piece of
//     video whose pictures show nothing moving is dropped here (cameras/motion.ts).
// Logins are checked with the Worker (and remembered for a few minutes: a camera sending a picture
// every 5 seconds logs in each time). Everything between here and the Worker carries the shared key
// (CAMERA_UPLOADS_KEY, set on both by .github/workflows/deploy-cameras.yml).
// Run locally: `APP_URL=http://localhost:8787 CAMERA_UPLOADS_KEY=x FTP_PORT=2121 node cameras/server.ts`.
import { createServer, type Server as HttpServer } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { lookup } from 'node:dns/promises'
import { Readable } from 'node:stream'
import { FtpServer, type Login, type Upload } from './ftp.ts'
import { AROUND_MS, keepVideo, moved, mp4Seconds, thumbnail, type Seen } from './motion.ts'

export interface Config {
  appUrl: string
  key: string
  ftpPort: number
  httpPort: number
  passivePorts: number[]
  publicIp?: string | null
  publicHost?: string | null
  tls?: { key: string | Buffer; cert: string | Buffer } | null
  proxyProtocol?: boolean
  maxBytes?: number
  /** Retries of a video the Worker couldn't take: wait this long first (ms), then longer each time. */
  retryMs?: number
  /** Pictures this long either side of a piece of video count for it (ms). */
  aroundMs?: number
  log?: (line: string) => void
}

interface CameraLogin extends Login { keep_video: 'motion' | 'all' }

interface CameraState {
  picture: { bytes: Uint8Array; at: number } | null
  thumb: Uint8Array | null
  seen: Seen[]
  videoAt: number | null
  day: string
  kept: number
  skipped: number
  toldAt: number
}

interface Job { user: string; file: string; size: number; name: string; endedAt: number; seconds: number | null; motion: boolean; tries: number; dueAt: number }

const PICTURE_TYPES = /\.(jpe?g)$/i
const VIDEO_TYPES = /\.(mp4|m4v)$/i
const PICTURE_MAX = 6 * 1024 * 1024
const LOGIN_MS = 5 * 60_000
const TELL_MS = 5 * 60_000
const KEEP_SEEN_MS = 60 * 60_000
const QUEUE_MAX_BYTES = 2 * 1024 * 1024 * 1024
const AT_ONCE = 2
/** Wrong logins from one address before it's turned away for a while (cameras get it right; guessers don't). */
const MAX_FAILS = 20
const FAIL_WINDOW_MS = 10 * 60_000

/** Ports from "30000-30015" (or "30000,30001"). */
export function portList(spec: string): number[] {
  const out: number[] = []
  for (const part of spec.split(',').map(s => s.trim()).filter(Boolean)) {
    const [a, b] = part.split('-').map(Number)
    for (let p = a; p <= (b || a); p++) if (p > 0 && p < 65536) out.push(p)
  }
  return out
}

const today = () => new Date().toISOString().slice(0, 10)

export function start(c: Config) {
  const log = c.log ?? ((l: string) => console.log(l))
  const cameras = new Map<string, CameraState>()
  const logins = new Map<string, { hash: string; login: CameraLogin | null; until: number }>()
  const queue: Job[] = []
  let running = 0
  let thumbs = 0
  let ip = c.publicIp ?? null

  const state = (user: string) => {
    let s = cameras.get(user)
    if (!s) cameras.set(user, s = { picture: null, thumb: null, seen: [], videoAt: null, day: today(), kept: 0, skipped: 0, toldAt: 0 })
    if (s.day !== today()) Object.assign(s, { day: today(), kept: 0, skipped: 0 })
    return s
  }

  const worker = (path: string, init: RequestInit & { duplex?: 'half' } = {}) =>
    fetch(`${c.appUrl}${path}`, { ...init, headers: { authorization: `Bearer ${c.key}`, ...init.headers } })

  const fails = new Map<string, { n: number; since: number }>()
  const turnedAway = (from: string | null) => {
    const f = from ? fails.get(from) : undefined
    return !!f && f.n >= MAX_FAILS && Date.now() - f.since < FAIL_WINDOW_MS
  }
  const failed = (from: string | null) => {
    if (!from) return
    const f = fails.get(from)
    if (!f || Date.now() - f.since >= FAIL_WINDOW_MS) fails.set(from, { n: 1, since: Date.now() })
    else f.n++
    if (fails.size > 10_000) fails.delete(fails.keys().next().value!)
  }

  async function login(user: string, password: string, from: string | null): Promise<Login | null> {
    if (turnedAway(from)) return null
    const who = await check(user, password)
    if (!who) failed(from)
    return who
  }

  async function check(user: string, password: string): Promise<Login | null> {
    if (!/^cam[0-9a-f]{8}$/.test(user) || password.length > 100) return null
    const hash = createHash('sha256').update(password).digest('hex')
    const kept = logins.get(user)
    if (kept && kept.hash === hash && kept.until > Date.now()) return kept.login
    const res = await worker('/api/camera-uploads/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user, password }) })
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      logins.set(user, { hash, login: null, until: Date.now() + 30_000 })
      return null
    }
    if (!res.ok) throw new Error(`the app answered ${res.status}`)
    const { camera } = await res.json() as { camera: { keep_video?: string } }
    const who: CameraLogin = { user, keep_video: camera.keep_video === 'all' ? 'all' : 'motion' }
    logins.set(user, { hash, login: who, until: Date.now() + LOGIN_MS })
    return who
  }

  /** The app hears a camera is sending, now and then (the Cameras page's "last seen"). */
  function tell(user: string, s: CameraState) {
    if (Date.now() - s.toldAt < TELL_MS) return
    s.toldAt = Date.now()
    worker('/api/camera-uploads/seen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user }) })
      .then(r => { if (!r.ok) s.toldAt = 0 }, () => { s.toldAt = 0 })
  }

  async function picture(u: Upload, s: CameraState) {
    if (u.size > PICTURE_MAX) return
    const bytes = new Uint8Array(await readFile(u.file))
    s.picture = { bytes, at: u.at.getTime() }
    // Compared with the last one, two at a time at most (a busy moment skips one: it counts as movement).
    let movedNow = true
    if (thumbs < 2) {
      thumbs++
      try {
        const t = await thumbnail(bytes)
        movedNow = s.thumb ? moved(s.thumb, t) : true
        s.thumb = t
      } catch {
        s.thumb = null
      } finally { thumbs-- }
    }
    s.seen.push({ at: u.at.getTime(), moved: movedNow })
    const since = Date.now() - KEEP_SEEN_MS
    while (s.seen.length && s.seen[0].at < since) s.seen.shift()
  }

  async function video(u: Upload & { login: CameraLogin }, s: CameraState) {
    const seconds = await mp4Seconds(u.file).catch(() => null)
    const endedAt = u.at.getTime()
    const startedAt = endedAt - (seconds ?? 0) * 1000
    const name = u.path.split('/').pop() || 'clip.mp4'
    const around = c.aroundMs ?? AROUND_MS
    const decide = async () => {
      const seen = keepVideo(s.seen, startedAt, endedAt, around)
      const { keep, motion } = u.login.keep_video === 'all' ? { keep: true, motion: seen.motion } : seen
      if (!keep) {
        s.skipped++
        await rm(u.file, { force: true })
        return
      }
      enqueue({ user: u.login.user, file: u.file, size: u.size, name, endedAt, seconds, motion, tries: 0, dueAt: Date.now() })
    }
    // The pictures just after it haven't come yet: wait for them before deciding.
    setTimeout(() => { void decide().catch(e => log(`video from ${u.login.user}: ${e instanceof Error ? e.message : String(e)}`)) }, Math.max(0, endedAt + around - Date.now()))
  }

  function enqueue(job: Job) {
    queue.push(job)
    let bytes = queue.reduce((n, j) => n + j.size, 0)
    while (bytes > QUEUE_MAX_BYTES && queue.length > 1) {
      const dropped = queue.shift()!
      bytes -= dropped.size
      log(`queue full: dropped ${dropped.name} from ${dropped.user}`)
      void rm(dropped.file, { force: true })
    }
    pump()
  }

  function pump() {
    const now = Date.now()
    while (running < AT_ONCE) {
      const i = queue.findIndex(j => j.dueAt <= now)
      if (i < 0) break
      const [job] = queue.splice(i, 1)
      running++
      void send(job).finally(() => { running--; pump() })
    }
  }
  const pumping = setInterval(pump, 5000)
  pumping.unref()

  /** A video to the Worker; tried again later when the Worker or storage is having trouble. */
  async function send(job: Job) {
    let status = 0
    let reason = ''
    try {
      const res = await worker('/api/camera-uploads/clip', {
        method: 'POST', duplex: 'half',
        headers: { 'content-type': 'video/mp4', 'content-length': String(job.size), 'x-camera': job.user, 'x-file-name': encodeURIComponent(job.name),
          'x-ended-at': new Date(job.endedAt).toISOString(), ...(job.seconds !== null ? { 'x-seconds': String(Math.round(job.seconds)) } : {}), 'x-motion': job.motion ? '1' : '0' },
        body: Readable.toWeb(createReadStream(job.file)) as ReadableStream,
      })
      status = res.status
      if (!res.ok) reason = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? String(res.status)
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e)
    }
    const s = state(job.user)
    if (status >= 200 && status < 300) {
      s.kept++
      s.videoAt = job.endedAt
      await rm(job.file, { force: true })
      return
    }
    // Turned away for good (camera switched off or deleted, file refused): not tried again.
    const lasting = status >= 400 && status < 500 && status !== 408 && status !== 429 && status !== 409
    if (lasting || job.tries >= 6) {
      log(`video from ${job.user} not kept: ${reason}`)
      await rm(job.file, { force: true })
      return
    }
    job.tries++
    const wait = (c.retryMs ?? 30_000) * 3 ** (job.tries - 1)
    job.dueAt = Date.now() + wait
    queue.push(job)
    setTimeout(pump, wait + 10).unref()
  }

  const ftp = new FtpServer({
    login,
    publicIp: () => ip,
    passivePorts: c.passivePorts,
    tls: c.tls,
    proxyProtocol: c.proxyProtocol,
    maxBytes: c.maxBytes ?? 95 * 1024 * 1024,
    log,
    onFile: u => {
      const s = state(u.login.user)
      tell(u.login.user, s)
      const done = PICTURE_TYPES.test(u.path) ? picture(u, s).finally(() => rm(u.file, { force: true }))
        : VIDEO_TYPES.test(u.path) ? video(u as Upload & { login: CameraLogin }, s)
        // Anything else (the camera app's test file): it reached us, that's all.
        : rm(u.file, { force: true })
      void done.catch(e => log(`upload from ${u.login.user} failed: ${e instanceof Error ? e.message : String(e)}`))
    },
  })

  const keyed = (header: string | undefined) => {
    if (!header?.startsWith('Bearer ')) return false
    const [a, b] = [header.slice(7), c.key].map(s => createHash('sha256').update(s).digest())
    return timingSafeEqual(a, b)
  }
  const http: HttpServer = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const json = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }
    if (url.pathname === '/health') return json(200, { ok: true, keyed: !!c.key, tls: !!c.tls, waiting: queue.length + running })
    if (!keyed(req.headers.authorization)) return json(401, { error: 'Not allowed' })
    const pic = url.pathname.match(/^\/picture\/(cam[0-9a-f]{8})$/)
    if (pic) {
      const p = cameras.get(pic[1])?.picture
      if (!p) return json(404, { error: 'No picture yet' })
      res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': String(p.bytes.length), 'cache-control': 'no-store', 'x-taken-at': new Date(p.at).toISOString() })
      return res.end(p.bytes)
    }
    if (url.pathname === '/status') {
      const out: Record<string, unknown> = {}
      for (const user of (url.searchParams.get('users') ?? '').split(',').filter(u => /^cam[0-9a-f]{8}$/.test(u)).slice(0, 100)) {
        const s = cameras.get(user)
        if (!s) continue
        const day = s.day === today()
        out[user] = { picture_at: s.picture ? new Date(s.picture.at).toISOString() : null, video_at: s.videoAt ? new Date(s.videoAt).toISOString() : null,
          kept_today: day ? s.kept : 0, skipped_today: day ? s.skipped : 0 }
      }
      return json(200, { cameras: out })
    }
    json(404, { error: 'Not found' })
  })

  const ready = (async () => {
    if (!ip && c.publicHost) ip = (await lookup(c.publicHost, { family: 4 }).catch(() => null))?.address ?? null
    await ftp.listen(c.ftpPort)
    await new Promise<void>(ok => http.listen(c.httpPort, () => ok()))
    log(`camera uploads: FTP on :${(ftp.control.address() as { port: number }).port}${c.tls ? ' (FTPS offered)' : ''}, passive ${c.passivePorts[0]}-${c.passivePorts.at(-1)}${ip ? ` at ${ip}` : ''}, HTTP on :${(http.address() as { port: number }).port}`)
  })()

  return {
    ready, ftp, http, cameras, queue,
    /** Ask the app again at the next login (tests: a camera's settings changed). */
    forgetLogins: () => logins.clear(),
    async close() {
      clearInterval(pumping)
      await ftp.close()
      await new Promise<void>(ok => http.close(() => ok()))
    },
  }
}

const file = (path: string | undefined) => { try { return path ? readFileSync(path) : null } catch { return null } }

if (process.env.CAMERAS_LISTEN !== '0' && process.argv[1]?.endsWith('server.ts')) {
  const e = process.env
  if (!e.APP_URL || !e.CAMERA_UPLOADS_KEY) {
    console.error('Set APP_URL (the app’s address) and CAMERA_UPLOADS_KEY (shared with the app’s Worker).')
    process.exit(1)
  }
  const key = file(e.TLS_KEY_FILE)
  const cert = file(e.TLS_CERT_FILE)
  const s = start({
    appUrl: e.APP_URL.replace(/\/+$/, ''), key: e.CAMERA_UPLOADS_KEY,
    ftpPort: Number(e.FTP_PORT ?? 21), httpPort: Number(e.PORT ?? 8080), passivePorts: portList(e.PASV_PORTS ?? '30000-30015'),
    publicIp: e.PUBLIC_IP || null, publicHost: e.PUBLIC_HOST || null, tls: key && cert ? { key, cert } : null,
    proxyProtocol: e.PROXY_PROTOCOL === '1', maxBytes: Number(e.MAX_MB ?? 95) * 1024 * 1024,
  })
  s.ready.catch(err => { console.error(err); process.exit(1) })
  // Whatever's waiting on disk when the machine stops is lost; the camera's own card still has it.
  for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => { void s.close().finally(() => process.exit(0)) })
}
