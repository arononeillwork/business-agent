// A rendered master made small for the landing page: H.264 + AAC with the index first (plays while it
// downloads), and its poster.
//   npm run render && npm run web            the demo        out/landing-master.mp4 → public/video/business-agent-demo.*
//   npm run render:day && npm run web:day    a day in life   out/day-master.mp4     → public/video/day-in-the-life.*
//   npm run render:owner && npm run web:owner  one place     out/owner-master.mp4   → public/video/run-your-cafe.*
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VIDEOS = {
  landing: { master: 'landing-master.mp4', name: 'business-agent-demo', poster: 7.0 }, // the opening's pile of things to do
  day: { master: 'day-master.mp4', name: 'day-in-the-life', poster: 103.5 },           // the two days side by side
  owner: { master: 'owner-master.mp4', name: 'run-your-cafe', poster: 9.0 },             // Today and the advisor in the middle, everything round them
}
const which = VIDEOS[process.argv[2] ?? 'landing']
if (!which) throw new Error(`Which video? ${Object.keys(VIDEOS).join(', ')}`)
const here = dirname(fileURLToPath(import.meta.url))
const master = join(here, 'out', which.master)
const out = join(here, '..', 'public', 'video')
mkdirSync(out, { recursive: true })
const ff = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' })
ff('-i', master, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', join(out, `${which.name}.mp4`))
ff('-ss', String(which.poster), '-i', master, '-frames:v', '1', '-vf', 'scale=1600:-1', '-q:v', '4', join(out, `${which.name}.jpg`))
for (const f of [`${which.name}.mp4`, `${which.name}.jpg`]) console.log(f, `${(statSync(join(out, f)).size / 1e6).toFixed(1)} MB`)
