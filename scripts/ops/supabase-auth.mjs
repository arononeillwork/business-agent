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
// Sign-in emails carry a 6-digit code (typed into the app), not just a link: links expire, get
// opened by mail scanners, or get clicked in an older email of the same thread.
Object.assign(patch, {
  mailer_subjects_magic_link: 'Your Easy Beans sign-in code',
  mailer_templates_magic_link_content: `<h2>Your sign-in code</h2>
<p>Type this code into the Easy Beans team app:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>It works once, for one hour. If you didn't ask for it, ignore this email.</p>`,
  mailer_subjects_invite: "You're invited to the Easy Beans team app",
  mailer_templates_invite_content: `<h2>Welcome to the Easy Beans team app</h2>
<p><a href="{{ .ConfirmationURL }}">Accept the invite</a> to sign in and choose a password.</p>
<p>If the link says it has expired, open {{ .SiteURL }}, type this email address and tap
<b>Email me a sign-in code</b>.</p>`,
})
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
// Read back: the sign-in email must carry the code, or "Email me a sign-in code" can't work.
const check = await api('GET')
const hasCode = String(check.mailer_templates_magic_link_content ?? '').includes('{{ .Token }}')
console.log(`Sign-in email shows the 6-digit code: ${hasCode}`)
if (!hasCode) { console.log('::error::Supabase did not keep the sign-in email template (it may need custom SMTP)'); process.exit(1) }
