// Photo storage for Instagram / Google posts (Cloudflare R2). R2 has to be switched on once in
// the Cloudflare dashboard (it asks the account owner to accept its terms). After that this step
// creates the bucket if needed and connects it to the Worker by enabling the binding in
// wrangler.jsonc for this build. Until then it says so and the deploy carries on without it.
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (exported by cloudflare-token.mjs).
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'

const BUCKET = 'business-agent-media'
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env
const summary = msg => { console.log(msg); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${msg}\n`) }

const cf = async (path, init = {}) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
    ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers },
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

if (!token || !account) { summary('Photo storage: skipped (no Cloudflare account ID yet).'); process.exit(0) }
const list = await cf(`/r2/buckets?name_contains=${BUCKET}`)
const code = list.body?.errors?.[0]?.code
if (code === 10042) {
  summary('Photo storage: **R2 is not switched on** in Cloudflare yet (Dashboard → R2 → Get started). Posting photos stays off until then.')
  process.exit(0)
}
if (list.status === 403 || code === 10000) {
  summary('Photo storage: the Cloudflare token can\'t manage R2. Add "Workers R2 Storage: Edit" to the token. Posting photos stays off until then.')
  process.exit(0)
}
if (!list.body?.success) { summary(`Photo storage: skipped (${JSON.stringify(list.body?.errors ?? list.status)}).`); process.exit(0) }
const exists = (list.body.result?.buckets ?? []).some(b => b.name === BUCKET)
if (!exists) {
  const made = await cf('/r2/buckets', { method: 'POST', body: JSON.stringify({ name: BUCKET, locationHint: 'weur' }) })
  if (!made.body?.success) { summary(`Photo storage: couldn't create the bucket (${JSON.stringify(made.body?.errors)}).`); process.exit(0) }
  console.log(`Created R2 bucket ${BUCKET}`)
}
const cfg = readFileSync('wrangler.jsonc', 'utf8')
const on = cfg.replace(/^(\s*)\/\/\s*("r2_buckets":.*)$/m, '$1$2')
if (on === cfg && !/^\s*"r2_buckets"/m.test(cfg)) { summary('Photo storage: bucket ready, but the r2_buckets line in wrangler.jsonc was not found.'); process.exit(0) }
writeFileSync('wrangler.jsonc', on)
summary(`Photo storage: on (R2 bucket ${BUCKET}).`)
