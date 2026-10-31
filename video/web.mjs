// The rendered master (out/landing-master.mp4) made small for the landing page: H.264 + AAC with the
// index first (plays while it downloads), and the poster from the opening's "seven places" frame.
//   npm run render && npm run web    (in video/)
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const master = join(here, 'out', 'landing-master.mp4')
const out = join(here, '..', 'public', 'video')
mkdirSync(out, { recursive: true })
const ff = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' })
ff('-i', master, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', join(out, 'business-agent-demo.mp4'))
ff('-ss', '5.5', '-i', master, '-frames:v', '1', '-vf', 'scale=1600:-1', '-q:v', '4', join(out, 'business-agent-demo.jpg'))
for (const f of ['business-agent-demo.mp4', 'business-agent-demo.jpg']) console.log(f, `${(statSync(join(out, f)).size / 1e6).toFixed(1)} MB`)
