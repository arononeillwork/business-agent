// Builds the Worker's secrets for `wrangler secret bulk` (GitHub Actions only).
//   node scripts/ops/worker-secrets.mjs <existing-secret-names.json> <out.json>
// - SUPABASE_SERVICE_ROLE_KEY: read from the Supabase Management API (needs SUPABASE_ACCESS_TOKEN)
// - INTEGRATION_KEY: generated once; never replaced (it encrypts stored tokens)
// - Anything else in PASSTHROUGH that is set in the environment (GitHub secrets)
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const REF = process.env.SUPABASE_PROJECT_REF ?? 'lhakrmmoxaareykglmtx'
const PASSTHROUGH = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'META_ACCESS_TOKEN', 'META_APP_SECRET',
  'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'INSTAGRAM_USER_ID', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET']
const existing = new Set(JSON.parse(readFileSync(process.argv[2], 'utf8') || '[]').map(s => s.name))
const out = {}

if (process.env.SUPABASE_ACCESS_TOKEN) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
    headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
  })
  if (!res.ok) throw new Error(`Supabase api-keys: ${res.status} ${await res.text()}`)
  const keys = await res.json()
  const key = keys.find(k => k.type === 'secret')?.api_key ?? keys.find(k => k.name === 'service_role')?.api_key
  if (!key) throw new Error('No secret/service_role key found for the project')
  out.SUPABASE_SERVICE_ROLE_KEY = key
} else if (!existing.has('SUPABASE_SERVICE_ROLE_KEY')) {
  console.log('::warning::SUPABASE_ACCESS_TOKEN not set: invites and the cron jobs need SUPABASE_SERVICE_ROLE_KEY')
}
if (!existing.has('INTEGRATION_KEY')) out.INTEGRATION_KEY = randomBytes(32).toString('base64url')
for (const k of PASSTHROUGH) if (process.env[k]) out[k] = process.env[k]

writeFileSync(process.argv[3], JSON.stringify(out))
console.log(`Worker secrets to set: ${Object.keys(out).join(', ') || 'none'}`)
