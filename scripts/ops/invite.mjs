// Sends a Supabase invite email (GitHub Actions only; needs SUPABASE_ACCESS_TOKEN).
//   node scripts/ops/invite.mjs <email> <full name> <site url> [business]
// The very first account becomes the admin (see handle_new_user); later ones join as employees
// unless invited from the Team page. The link lands on /account to set a password.
// [business]: the business to join, by its number or "hq" (Business Agent HQ, the hq_reps migration);
// the first person in a business with no admin runs it. Without it, the third line of
// ops/invite.txt is used when the email is the one on its first line.
import { readFileSync } from 'node:fs'
const REF = process.env.SUPABASE_PROJECT_REF ?? 'lhakrmmoxaareykglmtx'
const [email, name, site, given] = process.argv.slice(2)
if (!email || !site) throw new Error('Usage: invite.mjs <email> <name> <site> [business]')
const fromFile = (() => {
  try {
    const [first, , third] = readFileSync(new URL('../../ops/invite.txt', import.meta.url), 'utf8').split('\n').map(l => l.trim())
    return first?.toLowerCase() === email.toLowerCase() && third && !third.startsWith('#') ? third : undefined
  } catch { return undefined }
})()
const business = (given || fromFile || '').trim()
if (business && !/^(hq|\d+)$/i.test(business)) throw new Error(`Business must be a number or "hq", not "${business}"`)

const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
  headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
})).json()
const key = keys.find(k => k.type === 'secret')?.api_key ?? keys.find(k => k.name === 'service_role')?.api_key
if (!key) throw new Error('Could not read the project secret key')

/** The business to join: its number, or HQ's, waiting a few minutes for the deploy that makes HQ. */
async function businessId() {
  if (!business) return undefined
  if (/^\d+$/.test(business)) return business
  for (let i = 0; i < 16; i++) {
    const res = await fetch(`https://${REF}.supabase.co/rest/v1/business?is_hq=eq.true&select=id`, { headers: { apikey: key, authorization: `Bearer ${key}` } })
    const rows = res.ok ? await res.json() : []
    if (rows[0]?.id) return String(rows[0].id)
    console.log('Business Agent HQ isn\'t there yet (its migration goes out with the deploy); looking again in 15 seconds.')
    await new Promise(r => setTimeout(r, 15_000))
  }
  console.log('::error::Business Agent HQ isn\'t in the database yet. Once the deploy has finished, run Actions → Send an invite again with the same email.')
  process.exit(1)
}
const joins = await businessId()

const res = await fetch(`https://${REF}.supabase.co/auth/v1/invite?redirect_to=${encodeURIComponent(`${site.replace(/\/$/, '')}/account`)}`, {
  method: 'POST',
  headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  body: JSON.stringify({ email, data: { full_name: name || email.split('@')[0], ...(joins ? { business_id: joins } : {}) } }),
})
const body = await res.json().catch(() => ({}))
const already = !res.ok && /already.*(registered|exists)|email_exists/i.test(JSON.stringify(body))
if (already) {
  // Existing account: send a sign-in link instead (lands on /account to set a password).
  const rec = await fetch(`https://${REF}.supabase.co/auth/v1/recover?redirect_to=${encodeURIComponent(`${site.replace(/\/$/, '')}/account`)}`, {
    method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ email }),
  })
  if (!rec.ok) { console.log(`::error::Could not send a sign-in link (${rec.status}): ${await rec.text()}`); process.exit(1) }
  console.log(`${email} already has an account; sent a sign-in link that opens ${site}/account to set a password.`)
  process.exit(0)
}
if (!res.ok) {
  const msg = body.msg ?? body.message ?? body.error_description ?? JSON.stringify(body)
  console.log(`::error::Invite failed (${res.status}): ${msg}`)
  if (/not authorized|authorized/i.test(msg)) console.log('Supabase\'s built-in email only sends to members of the Supabase organisation. Add custom SMTP (Authentication → Emails → SMTP) to email anyone else.')
  process.exit(1)
}
console.log(`Invite sent to ${email}${joins ? ` (business ${joins})` : ''}. The link opens ${site}/account to choose a password.`)
