// Configures Supabase Auth through the Management API (runs in GitHub Actions, never locally
// with real tokens in chat). Needs SUPABASE_ACCESS_TOKEN.
//   node scripts/ops/supabase-auth.mjs <site-url> [workers-dev-url]
// Optional env switches on sign-in providers (docs/sign-in-setup.md):
//   GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET            Google
//   AZURE_CLIENT_ID + AZURE_CLIENT_SECRET              Microsoft
//   META_APP_ID + META_APP_SECRET + FACEBOOK_SIGN_IN=on Facebook (the Meta app the Facebook Page connection uses)
//   APPLE_CLIENT_ID + APPLE_TEAM_ID + APPLE_KEY_ID + APPLE_PRIVATE_KEY   Apple
// Prints only which methods are on, never the secrets.
const REF = process.env.SUPABASE_PROJECT_REF ?? 'lhakrmmoxaareykglmtx'
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) { console.log('::warning::SUPABASE_ACCESS_TOKEN not set; skipping Supabase Auth setup'); process.exit(0) }
const site = process.argv[2]?.replace(/\/$/, '')
// The Worker's own workers.dev URL. It stays in the redirect allow list even once the custom
// domain is the site URL, so signing in with Google (or any outside sign-in) from workers.dev
// comes back to workers.dev: sent back to another origin, the sign-in can't finish (the code
// verifier lives in the browser storage of the origin that started it).
const dev = process.argv[3]?.replace(/\/$/, '')
// The backup address on Vercel (ops/vercel-backup), for when Spanish providers block Cloudflare's
// addresses during football matches. Same reason: a sign-in started there has to come back there.
const backup = 'https://businesssagent.vercel.app'

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
  allow.add('http://localhost:5173/**')
  // Each address bare as well: the app asks to come back to location.origin, with no path, which
  // "https://x/**" doesn't match, so a sign-in from any address but the site URL went there instead.
  for (const a of new Set([site, dev, backup].filter(Boolean))) { allow.add(a); allow.add(`${a}/**`) }
  patch.uri_allow_list = [...allow].join(',')
}
// Sign-in emails carry a 6-digit code (typed into the app), not just a link: links expire, get
// opened by mail scanners, or get clicked in an older email of the same thread.
Object.assign(patch, {
  mailer_subjects_magic_link: 'Your sign-in code for The Business Agent',
  mailer_templates_magic_link_content: `<h2>Your sign-in code</h2>
<p>Type this code into The Business Agent:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>It works once, for one hour. If you didn't ask for it, ignore this email.</p>`,
  mailer_subjects_invite: "You're invited to The Business Agent",
  mailer_templates_invite_content: `<h2>Welcome to The Business Agent</h2>
<p><a href="{{ .ConfirmationURL }}">Accept the invite</a> to sign in and choose a password.</p>
<p>If the link says it has expired, open {{ .SiteURL }}, type this email address and tap
<b>Forgot password?</b> to set one.</p>`,
})
// New and changed passwords that have turned up in a data breach (Have I Been Pwned) are refused,
// as Supabase's security advisor asks. Existing passwords still sign in.
patch.password_hibp_enabled = true
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, META_APP_ID, META_APP_SECRET, FACEBOOK_SIGN_IN,
  APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = process.env
// Facebook waits for FACEBOOK_SIGN_IN=on: until Supabase's callback is added to the Meta app's
// Facebook Login redirect URIs, the button would lead to Facebook's "URL blocked" page.
if (META_APP_ID && META_APP_SECRET && FACEBOOK_SIGN_IN === 'on') Object.assign(patch, {
  external_facebook_enabled: true, external_facebook_client_id: META_APP_ID, external_facebook_secret: META_APP_SECRET,
})
// Apple's client secret is a JWT that lives at most 6 months, so a fresh one is signed on every deploy.
if (APPLE_CLIENT_ID && APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY) {
  const { createPrivateKey, sign } = await import('node:crypto')
  const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'ES256', kid: APPLE_KEY_ID })}.${b64({ iss: APPLE_TEAM_ID, iat: now, exp: now + 180 * 86400, aud: 'https://appleid.apple.com', sub: APPLE_CLIENT_ID })}`
  const key = createPrivateKey(APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'))
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  Object.assign(patch, { external_apple_enabled: true, external_apple_client_id: APPLE_CLIENT_ID, external_apple_secret: `${unsigned}.${signature}` })
}
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) Object.assign(patch, {
  external_google_enabled: true, external_google_client_id: GOOGLE_CLIENT_ID, external_google_secret: GOOGLE_CLIENT_SECRET,
})
if (AZURE_CLIENT_ID && AZURE_CLIENT_SECRET) Object.assign(patch, {
  external_azure_enabled: true, external_azure_client_id: AZURE_CLIENT_ID, external_azure_secret: AZURE_CLIENT_SECRET,
  external_azure_url: 'https://login.microsoftonline.com/common',
})
// Sign-in emails (invites, codes, resets) through the Worker (worker/authEmail.ts): from
// noreply@businesssagent.com once Cloudflare Email Sending is on (EMAIL_SENDING=true, from the
// "Email sending" step: scripts/ops/email-sending.mjs), else from the person's business's own
// Gmail/Outlook, and for everyone else from The Business Agent HQ's (thebusinesssagent@gmail.com, on
// HQ's Connections page); with no mailbox anywhere, Supabase sends them itself. The hook's secret is
// derived from the service key, which the Worker has too.
const sending = process.env.EMAIL_SENDING === 'true'
// The sign-up check needs both Turnstile keys (the site key for the form, the secret for the Worker).
const captcha = !!(process.env.TURNSTILE_SITE_KEY?.trim() && process.env.TURNSTILE_SECRET_KEY?.trim())
let mailbox = null
let hqMailbox = null
if (site) {
  const keys = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { authorization: `Bearer ${token}` } })
    .then(r => r.ok ? r.json() : []).catch(() => [])
  const serviceKey = keys.find(k => k.type === 'secret')?.api_key ?? keys.find(k => k.name === 'service_role')?.api_key
  if (serviceKey) {
    const read = path => fetch(`https://${REF}.supabase.co/rest/v1/${path}`, { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } })
      .then(r => r.ok ? r.json() : []).catch(() => [])
    const rows = await read('integrations?select=business_id,provider,account_label&status=eq.connected&provider=in.(gmail,outlook)')
    const [hq] = await read('business?select=id&is_hq=eq.true&limit=1')
    hqMailbox = rows.find(r => hq && r.business_id === hq.id) ?? null
    mailbox = hqMailbox ?? rows[0] ?? null
    const { createHmac } = await import('node:crypto')
    const secret = `v1,whsec_${createHmac('sha256', serviceKey).update('business-agent:send-email-hook').digest('base64')}`
    Object.assign(patch, sending || mailbox
      ? { hook_send_email_enabled: true, hook_send_email_uri: `${site}/api/auth/send-email`, hook_send_email_secrets: secret }
      : { hook_send_email_enabled: false })
    // The sign-up form's check (worker/signupCheck.ts): on once the Turnstile keys are set, with its own secret.
    const signupSecret = `v1,whsec_${createHmac('sha256', serviceKey).update('business-agent:before-user-created-hook').digest('base64')}`
    Object.assign(patch, captcha
      ? { hook_before_user_created_enabled: true, hook_before_user_created_uri: `${site}/api/auth/before-user-created`, hook_before_user_created_secrets: signupSecret }
      : { hook_before_user_created_enabled: false })
  }
}
const after = Object.keys(patch).length ? await api('PATCH', patch) : current
// Who sends for people outside a business with a mailbox: HQ's mailbox, or (until HQ connects one) the founding business's.
const fallback = hqMailbox
  ? `from The Business Agent HQ's ${hqMailbox.account_label ?? 'mailbox'}`
  : mailbox
  ? 'still from the founding business’s mailbox until The Business Agent HQ connects thebusinesssagent@gmail.com (switch to HQ → Connections → Gmail), then deploy'
  : null
console.log(after.hook_send_email_enabled && sending
  ? `Sign-in emails: sent from noreply@businesssagent.com (Cloudflare Email Sending)${fallback ? `; if that fails, from each business's own mailbox, else ${fallback}` : ''}`
  : after.hook_send_email_enabled
  ? `Sign-in emails: sent from each business's own Gmail or Outlook; for everyone else, ${fallback}`
  : "Sign-in emails: sent by Supabase (connect thebusinesssagent@gmail.com on The Business Agent HQ's Connections page, then deploy)")
console.log(after.hook_before_user_created_enabled
  ? 'Sign-up check: on (Cloudflare Turnstile on the sign-up form)'
  : 'Sign-up check: off (no Turnstile keys yet: the "Sign-up check" step above says what it needs)')
console.log(`Leaked-password protection: ${after.password_hibp_enabled ? 'on' : 'off (Supabase refused it: it needs the Pro plan)'}`)
console.log(`Supabase Auth: site ${after.site_url}`)
console.log(`Redirects allowed: ${after.uri_allow_list}`)
console.log(`Sign-in methods on: email=${!!after.external_email_enabled} google=${!!after.external_google_enabled} microsoft=${!!after.external_azure_enabled} facebook=${!!after.external_facebook_enabled} apple=${!!after.external_apple_enabled}`)
if (!after.external_google_enabled) {
  console.log('::warning::Google sign-in is OFF: add the GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET repo secrets, then run Deploy again (docs/sign-in-setup.md)')
}
// Read back: the sign-in email must carry the code (the app API can still send one).
const check = await api('GET')
const hasCode = String(check.mailer_templates_magic_link_content ?? '').includes('{{ .Token }}')
console.log(`Sign-in email shows the 6-digit code: ${hasCode}`)
if (!hasCode) { console.log('::error::Supabase did not keep the sign-in email template (it may need custom SMTP)'); process.exit(1) }
