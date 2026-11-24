// A rendered master made small for the landing page: H.264 + AAC with the index first (plays while it
// downloads), and its poster.
//   npm run render && npm run web            the demo        out/landing-master.mp4 → public/video/business-agent-demo.*
//   npm run render:day && npm run web:day    a day in life   out/day-master.mp4     → public/video/day-in-the-life.*
//   npm run render:owner && npm run web:owner  one place     out/owner-master.mp4   → public/video/run-your-cafe.*
//   npm run render:say && npm run web:say      just say it   out/say-master.mp4     → public/video/just-say-it.*
//   npm run render:waste && npm run web:waste  food waste    out/waste-master.mp4   → public/video/food-waste.*
//   npm run render:listing && npm run web:listing  on Google  out/listing-master.mp4 → public/video/google-listing.*
//   npm run render:competitors && npm run web:competitors  competitors  out/competitors-master.mp4 → public/video/competitors.*
//   npm run render:regulars && npm run web:regulars  regulars  out/regulars-master.mp4 → public/video/regulars.*
//   npm run render:costing && npm run web:costing  costing  out/costing-master.mp4 → public/video/costing.*
//   npm run render:social && npm run web:social  social  out/social-master.mp4 → public/video/social.*
//   npm run render:rota && npm run web:rota  rota  out/rota-master.mp4 → public/video/rota.*
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VIDEOS = {
  landing: { master: 'landing-master.mp4', name: 'business-agent-demo', poster: 7.0 }, // the opening's pile of things to do
  day: { master: 'day-master.mp4', name: 'day-in-the-life', poster: 103.5 },           // the two days side by side
  owner: { master: 'owner-master.mp4', name: 'run-your-cafe', poster: 9.0 },             // Today and the advisor in the middle, everything round them
  say: { master: 'say-master.mp4', name: 'just-say-it', poster: 25.0 },                   // the typed request, Business Agent called, the answer
  waste: { master: 'waste-master.mp4', name: 'food-waste', poster: 59.0 },                // the banana bread's offer on the café TV
  listing: { master: 'listing-master.mp4', name: 'google-listing', poster: 30.0 },        // the new hours on Google Maps and the website
  competitors: { master: 'competitors-master.mp4', name: 'competitors', poster: 35.0 },   // the cappuccino against the street
  regulars: { master: 'regulars-master.mp4', name: 'regulars', poster: 45.0 },         // the quiet-day message to the regulars
  costing: { master: 'costing-master.mp4', name: 'costing', poster: 29.0 },            // a flat white: €0,61 to make, €2,30 to you
  social: { master: 'social-master.mp4', name: 'social', poster: 63.0 },               // six o'clock: the post on Instagram and TikTok
  rota: { master: 'rota-master.mp4', name: 'rota', poster: 68.0 },                     // WhatsApp: each person's shifts and the team's group
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
