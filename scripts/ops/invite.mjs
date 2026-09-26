// Sends a Supabase invite email (GitHub Actions only; needs SUPABASE_ACCESS_TOKEN).
//   node scripts/ops/invite.mjs <email> <full name> <site url>
// The very first account becomes the admin (see handle_new_user); later ones join as employees
// unless invited from the Team page. The link lands on /account to set a password.
const REF = process.env.SUPABASE_PROJECT_REF ?? 'lhakrmmoxaareykglmtx'
const [email, name, site] = process.argv.slice(2)
if (!email || !site) throw new Error('Usage: invite.mjs <email> <name> <site>')

const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
  headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
})).json()
const key = keys.find(k => k.type === 'secret')?.api_key ?? keys.find(k => k.name === 'service_role')?.api_key
if (!key) throw new Error('Could not read the project secret key')

const res = await fetch(`https://${REF}.supabase.co/auth/v1/invite?redirect_to=${encodeURIComponent(`${site.replace(/\/$/, '')}/account`)}`, {
  method: 'POST',
  headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  body: JSON.stringify({ email, data: { full_name: name || email.split('@')[0] } }),
})
const body = await res.json().catch(() => ({}))
if (!res.ok) {
  const msg = body.msg ?? body.message ?? body.error_description ?? JSON.stringify(body)
  console.log(`::error::Invite failed (${res.status}): ${msg}`)
  if (/not authorized|authorized/i.test(msg)) console.log('Supabase\'s built-in email only sends to members of the Supabase organisation. Add custom SMTP (Authentication → Emails → SMTP) to email anyone else.')
  process.exit(1)
}
console.log(`Invite sent to ${email}. The link opens ${site}/account to choose a password.`)
