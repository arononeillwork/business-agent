// The render service's container (render/Dockerfile): POST /render with a RenderJob (JSON), get
// the MP4 back. It downloads the photo or video and the track, runs ffmpeg (render/ffmpeg.ts) and
// streams the result. Reached only through the render Worker (render/worker.ts), which checks the
// app's key. Run locally: `node --experimental-strip-types render/server.ts` (Node 24: no flag).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { RenderError, checkJob, clipArgs, holdArgs, holdFrames, photoArgs, probeArgs, readProbe, slideshowArgs, slideshowList, stillArgs, videoArgs, type RenderJob } from './ffmpeg.ts'

const PORT = Number(process.env.PORT ?? 8080)
/** Photos up to 8 MB and videos up to 100 MB come in (the app's own limits), tracks up to 20 MB. */
const MAX_BYTES = 110 * 1024 * 1024
const FFMPEG_TIMEOUT_MS = 5 * 60_000
/** Two at a time per container; more wait their turn. */
const AT_ONCE = 2
const FONTS = [process.env.FONT, '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']
const font = FONTS.find(f => f && existsSync(f))

/**
 * Download a file to disk, refusing anything over MAX_BYTES. Read whole rather than streamed to
 * disk: Node's fetch can crash the process when a paused body's connection closes (a server that
 * ends the connection after the file), and 110 MB fits easily in the instance's 4 GiB.
 */
async function download(url: string, to: string) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new RenderError(`Couldn’t fetch ${new URL(url).pathname.split('/').pop()} (${res.status})`)
  if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new RenderError('That file is too big')
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.length > MAX_BYTES) throw new RenderError('That file is too big')
  if (!bytes.length) throw new RenderError('That file is empty')
  await writeFile(to, bytes)
}

/** Run ffmpeg or ffprobe; resolves with stdout, rejects with the end of what it said. */
function run(cmd: 'ffmpeg' | 'ffprobe', args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmd === 'ffmpeg' ? ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args] : args)
    let out = ''
    let err = ''
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { err = (err + d).slice(-4000) })
    const timer = setTimeout(() => p.kill('SIGKILL'), FFMPEG_TIMEOUT_MS)
    p.on('error', e => { clearTimeout(timer); reject(e) })
    p.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(`${cmd} failed (${code ?? 'killed'}): ${err.trim().split('\n').slice(-3).join(' | ')}`))
    })
  })
}

/** One job, in its own folder (removed after): returns the MP4's path. */
async function render(j: RenderJob, dir: string): Promise<string> {
  const out = join(dir, 'out.mp4')
  const track = join(dir, 'track')
  await download(j.track.url, track)
  let labelFile: string | undefined
  if (j.label && font) await writeFile(labelFile = join(dir, 'label.txt'), j.label)
  if (j.photos?.length) {
    const counts = holdFrames(j.cuts!, j.seconds)
    const segments: string[] = []
    for (const [i, url] of j.photos.entries()) {
      const [photo, still, clip, segment] = ['photo', 'still.png', 'clip.mp4', 'hold.mp4'].map(f => join(dir, `${i}-${f}`))
      await download(url, photo)
      await run('ffmpeg', stillArgs(photo, still))
      await run('ffmpeg', clipArgs(still, clip))
      await run('ffmpeg', holdArgs(clip, counts[i], segment))
      segments.push(segment)
    }
    const list = join(dir, 'list.txt')
    await writeFile(list, slideshowList(segments))
    await run('ffmpeg', slideshowArgs(list, track, j, out))
  } else if (j.source.type === 'image') {
    const [photo, still, clip] = ['photo', 'still.png', 'clip.mp4'].map(f => join(dir, f))
    await download(j.source.url, photo)
    await run('ffmpeg', stillArgs(photo, still, { labelFile, font }))
    await run('ffmpeg', clipArgs(still, clip))
    await run('ffmpeg', photoArgs(clip, track, j, out))
  } else {
    const video = join(dir, 'video')
    await download(j.source.url, video)
    const probe = readProbe(await run('ffprobe', probeArgs(video)))
    await run('ffmpeg', videoArgs(video, probe, track, j, out))
  }
  return out
}

let busy = 0
const waiting: (() => void)[] = []
async function turn<T>(work: () => Promise<T>): Promise<T> {
  if (busy >= AT_ONCE) await new Promise<void>(r => waiting.push(r))
  busy++
  try { return await work() } finally { busy--; waiting.shift()?.() }
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 64_000) throw new RenderError('The job is too big')
  }
  return JSON.parse(body || '{}') as unknown
}

export const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, ffmpeg: true, busy })
  if (req.method !== 'POST' || req.url !== '/render') return json(res, 404, { error: 'Not found' })
  const started = Date.now()
  let dir: string | undefined
  try {
    const job = checkJob(await readBody(req))
    dir = await mkdtemp(join(tmpdir(), 'render-'))
    const out = await turn(() => render(job, dir!))
    const { size } = await stat(out)
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(size), 'x-render-ms': String(Date.now() - started) })
    await pipeline(createReadStream(out), res)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (!res.headersSent) json(res, e instanceof RenderError || e instanceof SyntaxError ? 400 : 500, { error: message })
    else res.destroy()
    console.error('render failed:', message)
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

if (process.env.RENDER_LISTEN !== '0') server.listen(PORT, () => console.log(`render service on :${PORT}${font ? '' : ' (no font: labels off)'}`))
