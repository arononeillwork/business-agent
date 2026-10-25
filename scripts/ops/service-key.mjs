// Exports the project's secret (service) key to later GitHub Actions steps, masked in logs.
// Needs SUPABASE_ACCESS_TOKEN. Used by the live end-to-end tests.
import { appendFileSync } from 'node:fs'
const REF = process.env.SUPABASE_PROJECT_REF ?? 'lhakrmmoxaareykglmtx'
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
  headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
})
if (!res.ok) throw new Error(`Supabase api-keys: ${res.status}`)
const keys = await res.json()
const key = keys.find(k => k.type === 'secret')?.api_key ?? keys.find(k => k.name === 'service_role')?.api_key
if (!key) throw new Error('No secret/service_role key found')
console.log(`::add-mask::${key}`)
appendFileSync(process.env.GITHUB_ENV, `SUPABASE_SERVICE_ROLE_KEY=${key}\n`)
console.log('Service key ready for the live tests.')
