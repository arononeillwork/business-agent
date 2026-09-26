// Configures Supabase Auth through the Management API (runs in GitHub Actions, never locally
// with real tokens in chat). Needs SUPABASE_ACCESS_TOKEN.
//   node scripts/ops/supabase-auth.mjs <site-url>
// Optional env: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, AZURE_CLIENT_ID + AZURE_CLIENT_SECRET
// switch on those providers. Prints only which methods are on, never the secrets.
const REF = process.env.SUPABASE_PROJECT_REF ?? 'lhakrmmoxaareykglmtx'
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) { console.log('::warning::SUPABASE_ACCESS_TOKEN not set; skipping Supabase Auth setup'); process.exit(0) }
const site = process.argv[2]?.replace(/\/$/, '')

const api = async (method, body) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Supabase ${method} auth config: ${res.status} ${await res.text()}`)
  return res.json()
}

const current = await api('GET')
const patch = {}
if (site) {
  patch.site_url = site
  const allow = new Set((current.uri_allow_list ?? '').split(',').map(s => s.trim()).filter(Boolean))
  allow.add(`${site}/**`); allow.add('http://localhost:5173/**')
  patch.uri_allow_list = [...allow].join(',')
}
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) Object.assign(patch, {
  external_google_enabled: true, external_google_client_id: GOOGLE_CLIENT_ID, external_google_secret: GOOGLE_CLIENT_SECRET,
})
if (AZURE_CLIENT_ID && AZURE_CLIENT_SECRET) Object.assign(patch, {
  external_azure_enabled: true, external_azure_client_id: AZURE_CLIENT_ID, external_azure_secret: AZURE_CLIENT_SECRET,
  external_azure_url: 'https://login.microsoftonline.com/common',
})
const after = Object.keys(patch).length ? await api('PATCH', patch) : current
console.log(`Supabase Auth: site ${after.site_url}`)
console.log(`Redirects allowed: ${after.uri_allow_list}`)
console.log(`Sign-in methods on: email=${!!after.external_email_enabled} google=${!!after.external_google_enabled} microsoft=${!!after.external_azure_enabled}`)
