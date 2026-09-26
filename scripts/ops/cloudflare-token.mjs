// Checks CLOUDFLARE_API_TOKEN before deploying (GitHub Actions only). Handles:
//  - stray spaces/newlines copied with the token (trimmed, then exported for later steps)
//  - user tokens (My Profile → API Tokens) and account-owned tokens (Manage Account → API Tokens),
//    finding the account ID for the latter
// Prints a diagnosis on failure, never the token itself.
import { appendFileSync } from 'node:fs'

const raw = process.env.CF_TOKEN_SECRET ?? ''
const token = raw.trim().replace(/^Bearer\s+/i, '')
const out = (k, v) => appendFileSync(process.env.GITHUB_ENV, `${k}=${v}\n`)
const cf = async path => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: { authorization: `Bearer ${token}` } })
  return res.json().catch(() => ({ success: false, errors: [{ message: `HTTP ${res.status}` }] }))
}
const errs = r => (r.errors ?? []).map(e => `${e.code}: ${e.message}`).join('; ')

if (token !== raw) console.log('Token had surrounding spaces, line breaks or a "Bearer " prefix; trimmed it.')
console.log(`::add-mask::${token}`)
out('CLOUDFLARE_API_TOKEN', token)

const user = await cf('/user/tokens/verify')
if (user.success && user.result?.status === 'active') {
  console.log('Cloudflare user API token is active.')
  if (process.env.CF_ACCOUNT_SECRET?.trim()) out('CLOUDFLARE_ACCOUNT_ID', process.env.CF_ACCOUNT_SECRET.trim())
  process.exit(0)
}

let accountId = process.env.CF_ACCOUNT_SECRET?.trim()
if (!accountId) {
  const accounts = await cf('/accounts')
  if (accounts.success && accounts.result?.length) {
    accountId = accounts.result[0].id
    if (accounts.result.length > 1) console.log(`Token sees ${accounts.result.length} accounts; using the first (${accounts.result[0].name}). Set CLOUDFLARE_ACCOUNT_ID to choose.`)
  }
}
if (accountId) {
  const acct = await cf(`/accounts/${accountId}/tokens/verify`)
  if (acct.success && acct.result?.status === 'active') {
    console.log('Cloudflare account API token is active.')
    out('CLOUDFLARE_ACCOUNT_ID', accountId)
    process.exit(0)
  }
}

const hint = /^[0-9a-f]{37}$/.test(token) ? 'It looks like the Global API Key, which does not work as a token.'
  : token.length < 30 ? 'It is too short to be an API token (maybe the token ID or name was copied).'
  : 'The token may have been deleted, expired, or copied incompletely.'
console.log(`Token length ${token.length}. Cloudflare said: ${errs(user) || 'not active'}. ${hint}`)
console.log('::error::Cloudflare rejected CLOUDFLARE_API_TOKEN. Create one at dash.cloudflare.com/profile/api-tokens with the "Edit Cloudflare Workers" template and paste the value shown once after creating it.')
process.exit(1)
