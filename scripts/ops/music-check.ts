// A listening check before AI music goes live (Actions → Music check; needs ELEVENLABS_API_KEY).
//   node --experimental-strip-types scripts/ops/music-check.ts <out-dir>
// Makes the same café prompts on each model in MODELS (default: the API's default and v2.5), 20
// seconds each, saves the MP3s for listening (the workflow uploads them) and prints how long each
// took. About $0.30 of ElevenLabs credit.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { compose } from '../../worker/providers/elevenlabs.ts'

const PROMPTS = [
  'Warm acoustic guitar and soft brushed drums, a sunny morning in a specialty café in Marbella, relaxed, 90 bpm',
  'Upbeat Latin house with Spanish guitar and light percussion, summer evening on a terrace, lively, 118 bpm',
  'Mellow lo-fi jazz piano with vinyl crackle and rain, a cosy afternoon with coffee, calm, 75 bpm',
]
const MODELS = (process.env.MODELS ?? 'music_v1,music_v2_5').split(',').map(m => m.trim()).filter(Boolean)
const apiKey = process.env.ELEVENLABS_API_KEY
if (!apiKey) { console.log('::error::ELEVENLABS_API_KEY is not set'); process.exit(1) }
const out = process.argv[2] ?? 'music-check'
mkdirSync(out, { recursive: true })

console.log('| Model | Prompt | Seconds to make | Size |\n|---|---|---|---|')
let failed = 0
for (const model of MODELS) {
  for (const [i, prompt] of PROMPTS.entries()) {
    const started = Date.now()
    try {
      const track = await compose({ apiKey, model }, { prompt, seconds: 20 })
      writeFileSync(join(out, `${model}-${i + 1}.mp3`), new Uint8Array(track.bytes))
      console.log(`| ${model} | ${i + 1} | ${((Date.now() - started) / 1000).toFixed(1)} | ${(track.bytes.byteLength / 1024).toFixed(0)} KB |`)
    } catch (e) {
      failed++
      console.log(`| ${model} | ${i + 1} | failed: ${e instanceof Error ? e.message : e} | |`)
    }
  }
}
process.exit(failed === MODELS.length * PROMPTS.length ? 1 : 0)
