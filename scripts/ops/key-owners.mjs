// Which account each of the app's keys belongs to: Business Agent's own, Easy Beans Coffee's, or a
// personal one (GitHub Actions only: .github/workflows/key-owners.yml). Asks each provider, with
// read-only calls, whose account or app a key opens, and prints a table to the run's summary;
// scripts/ops/keyOwners.mjs decides whose it is and whether that suits the key. Never prints a key:
// only the names and ids the providers give back, with emails and phone numbers shortened. Also
// writes key-owners.json for the run's artifact. Always exits 0: a refused key is a finding, not a
// failed run.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { googleConsent, maskEmail, microsoftDirectory, ownerOf, phoneOf, scrub, summaryMarkdown, verdictOf } from './keyOwners.mjs'

const env = process.env
const REF = env.SUPABASE_PROJECT_REF ?? 'lhakrmmoxaareykglmtx'
const GRAPH = `https://graph.facebook.com/${env.META_GRAPH_VERSION || 'v23.0'}`
const SITE = env.SITE_URL || 'https://businesssagent.com'
const CALLBACK = `https://${REF}.supabase.co/auth/v1/callback`
const BROWSER = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'accept-language': 'en' }

const val = name => env[name]?.trim() || ''
const has = (...names) => names.every(n => val(n))
const enc = encodeURIComponent

async function call(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
  const text = await res.text()
  let body = text
  try { body = JSON.parse(text) } catch { /* a page, not JSON */ }
  return { ok: res.ok, status: res.status, body, text, headers: res.headers }
}
const form = fields => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) })
const graphError = r => r.body?.error?.message ?? `HTTP ${r.status}`
const supabase = path => call(`https://api.supabase.com/v1${path}`, { headers: { authorization: `Bearer ${val('SUPABASE_ACCESS_TOKEN')}` } })
const sql = query => call(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { authorization: `Bearer ${val('SUPABASE_ACCESS_TOKEN')}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query }),
})

// Supabase's sign-in settings: which Microsoft app sign-in uses, and where sign-in emails come from.
let authSettings
const auth = async () => {
  if (authSettings === undefined) {
    authSettings = null
    if (has('SUPABASE_ACCESS_TOKEN')) {
      const r = await supabase(`/projects/${REF}/config/auth`)
      if (r.ok) authSettings = r.body
    }
  }
  return authSettings
}

// ------------------------------------------------------------------------------------- platform

async function stripe() {
  const key = val('STRIPE_SECRET_KEY')
  const row = {
    account: 'Stripe: the account every business’s subscription is paid into',
    keys: ['STRIPE_SECRET_KEY', 'STRIPE_CLIENT_ID'], role: 'platform', set: !!key,
    fix: 'Open a Stripe account for Business Agent (its company and bank account), put its secret key in STRIPE_SECRET_KEY and deploy: the deploy makes the plans’ prices and the billing webhook there. Easy Beans keeps its own Stripe for its takings, connected on Connections.',
  }
  if (!key) return row
  const headers = { authorization: `Bearer ${key}` }
  const r = await call('https://api.stripe.com/v1/account', { headers })
  if (!r.ok) return { ...row, error: `Stripe refused the key (HTTP ${r.status})` }
  const a = r.body
  const name = a.settings?.dashboard?.display_name || a.business_profile?.name || ''
  const subs = await call('https://api.stripe.com/v1/subscriptions?status=all&limit=100', { headers })
  const ours = subs.ok ? subs.body.data.filter(s => s.items?.data?.some(i => i.price?.lookup_key?.startsWith('business_agent_'))) : null
  const paying = ours && `${ours.length === 0 ? 'no' : ours.length} Business Agent subscription${ours.length === 1 ? '' : 's'} in it${ours.length === 0 ? ', so nothing has to move' : ''}`
  return {
    ...row,
    owner: ownerOf(name, a.business_profile?.name, a.email),
    detail: [`“${name || 'no name'}” (${a.id}, ${/_live_/.test(key) ? 'live' : 'test'} mode${a.country ? `, ${a.country}` : ''})`, paying].filter(Boolean).join('; '),
  }
}

async function metaApp() {
  const id = val('META_APP_ID')
  const row = {
    account: 'Meta app: Facebook sign-in, Instagram, Facebook pages, Meta ads',
    keys: ['META_APP_ID', 'META_APP_SECRET'], role: 'platform', set: has('META_APP_ID', 'META_APP_SECRET'),
    fix: 'Name the app “Business Agent” (App settings → Basic) and give it to a Business Agent business portfolio verified with Business Agent’s company documents, before App Review. The app ID and secret stay the same.',
  }
  if (!row.set) return row
  const token = `${id}|${val('META_APP_SECRET')}`
  let r
  for (const fields of ['name,company,owner_business{name}', 'name,company', 'name']) {
    r = await call(`${GRAPH}/${id}?fields=${enc(fields)}&access_token=${enc(token)}`)
    if (r.ok) break
  }
  if (!r.ok) return { ...row, error: `Meta refused the app ID and secret: ${graphError(r)}` }
  const business = r.body.owner_business?.name || r.body.company || ''
  return {
    ...row,
    owner: ownerOf(r.body.name, business),
    detail: `App “${r.body.name}” (${id})${business ? `, business portfolio “${business}”` : ', Meta doesn’t show its business portfolio'}`,
  }
}

async function instagramApp() {
  const id = val('INSTAGRAM_APP_ID')
  const row = {
    account: 'Instagram app: Instagram sign-in, posting, messages, comments',
    keys: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'], role: 'platform', set: has('INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'),
    fix: 'It is the Instagram part of a Meta app and follows that app’s name and business portfolio: developers.facebook.com → the app → Instagram. Check it is the Business Agent app.',
  }
  if (!row.set) return row
  if (id === val('META_APP_ID')) return { ...row, owner: 'unknown', detail: 'The same app as the Meta app above' }
  const r = await call(`${GRAPH}/${id}?fields=name&access_token=${enc(`${id}|${val('INSTAGRAM_APP_SECRET')}`)}`)
  if (r.ok && r.body?.name) return { ...row, owner: ownerOf(r.body.name), detail: `App “${r.body.name}” (${id})` }
  return { ...row, owner: 'unknown', detail: `Instagram app ${id}; Meta doesn’t name it to its own keys` }
}

async function google() {
  const id = val('GOOGLE_CLIENT_ID')
  const row = {
    account: 'Google app: Google sign-in, Gmail, Drive, Calendar, Business Profile, YouTube, Search Console, Photos',
    keys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], role: 'platform', set: has('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'),
    fix: 'Keep the app and its keys. Google Cloud → the project → IAM: add the Business Agent Google account as Owner; Branding: a support email on businesssagent.com; then submit verification. Until Google verifies it, sign-in says “continue to” the Supabase address.',
  }
  if (!row.set) return row
  const t = await call('https://oauth2.googleapis.com/token', form({
    client_id: id, client_secret: val('GOOGLE_CLIENT_SECRET'), code: 'key-owners-check', grant_type: 'authorization_code', redirect_uri: `${SITE}/`,
  }))
  if (['invalid_client', 'unauthorized_client'].includes(t.body?.error)) return { ...row, error: `Google refused the client ID and secret (${t.body.error})` }
  const page = await call(`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: id, redirect_uri: CALLBACK, response_type: 'code', scope: 'openid email' })}`, { headers: BROWSER })
  const c = googleConsent(page.text)
  const byName = ownerOf(c.name), byEmail = ownerOf(c.email)
  // The name is what people see; a personal support email next to it still needs changing.
  const owner = [byName, byEmail].includes('easy-beans') ? 'easy-beans'
    : byName === 'business-agent' && byEmail === 'personal' ? 'personal'
      : c.name || c.email ? ownerOf(c.name, c.email) : 'unknown'
  const detail = [
    c.name ? `App “${c.name}”` : 'App name not shown',
    `Cloud project ${id.split('-')[0]}`,
    c.email && `support email ${maskEmail(c.email)}`,
    c.shownAs && ownerOf(c.shownAs) !== 'business-agent' && `sign-in says “continue to ${c.shownAs}” (not verified yet)`,
  ].filter(Boolean).join(', ')
  return { ...row, owner, detail }
}

async function microsoft() {
  const settings = await auth()
  const id = settings?.external_azure_client_id || ''
  const name = /APP_NAME:\s*(.+)/.exec(readFileSync('.github/workflows/setup-microsoft-login.yml', 'utf8'))?.[1]?.trim() ?? ''
  const row = {
    account: 'Microsoft app: Microsoft sign-in, Outlook, OneDrive',
    keys: ['Supabase sign-in settings', 'Worker secrets MS_CLIENT_ID, MS_CLIENT_SECRET'], role: 'platform', set: !!(settings?.external_azure_enabled && id),
    fix: 'Create it again in a Business Agent Microsoft directory: change APP_NAME in setup-microsoft-login.yml to “Business Agent” and run that workflow with its tenant input, then verify the publisher. Easy Beans reconnects Outlook and OneDrive once.',
  }
  if (!row.set) return row
  const page = await call(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: CALLBACK, scope: 'openid email' })}`, { headers: BROWSER })
  const directory = microsoftDirectory(page.text)
  return {
    ...row,
    owner: ownerOf(name, directory),
    detail: `App “${name}” (named by setup-microsoft-login.yml; ${id}), in the directory “${directory ?? 'not shown'}”${directory === 'Default Directory' ? ', the one a personal Microsoft account gets' : ''}`,
  }
}

async function tiktok() {
  const row = {
    account: 'TikTok app: TikTok posting',
    keys: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'], role: 'platform', set: has('TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'),
    fix: 'TikTok doesn’t say whose an app is. developers.tiktok.com → Manage apps: check the app is named Business Agent and sits in Business Agent’s organisation before the app audit.',
  }
  if (!row.set) return row
  const r = await call('https://open.tiktokapis.com/v2/oauth/token/', form({ client_key: val('TIKTOK_CLIENT_KEY'), client_secret: val('TIKTOK_CLIENT_SECRET'), grant_type: 'client_credentials' }))
  if (!r.ok || r.body?.error) return { ...row, error: `TikTok refused the client key and secret (${r.body?.error ?? `HTTP ${r.status}`})` }
  return { ...row, owner: 'unknown', detail: 'The keys work; TikTok doesn’t say whose the app is' }
}

async function square() {
  const id = val('SQUARE_APP_ID')
  const row = {
    account: 'Square app: Square takings, menu, customers, loyalty',
    keys: ['SQUARE_APP_ID', 'SQUARE_APP_SECRET', 'SQUARE_WEBHOOK_SIGNATURE_KEY', 'SQUARE_REDIRECT_URL'], role: 'platform', set: has('SQUARE_APP_ID', 'SQUARE_APP_SECRET'),
    fix: 'Square doesn’t say whose an app is: it sits in the Square login that made it. developer.squareup.com → Apps: if that is Easy Beans’ login, make a Square developer account for Business Agent, create the app there with the same redirect and webhook addresses, put its keys in the SQUARE_* secrets and deploy. Easy Beans reconnects Square once.',
  }
  if (!row.set) return row
  const where = id.startsWith('sandbox-') ? 'sandbox' : 'production'
  const merchant = has('SUPABASE_ACCESS_TOKEN')
    ? await sql(`select b.name, i.account_label from public.integrations i join public.business b on b.id = i.business_id where i.provider = 'square' and i.status = 'connected' order by b.id`)
    : null
  const connected = Array.isArray(merchant?.body) && merchant.body.length
    ? `; connected through it: ${merchant.body.map(m => `${m.name} (${m.account_label ?? 'Square'})`).join(', ')}` : ''
  return { ...row, owner: 'unknown', detail: `App ${id} (${where})${connected}` }
}

async function signInEmail() {
  const settings = await auth()
  const row = {
    account: 'Sign-in and sign-up emails',
    keys: ['Supabase sign-in settings'], role: 'platform', set: !!settings,
    fix: 'Send them from Business Agent: a transactional email service on businesssagent.com as Supabase’s custom SMTP, with Business Agent in the subjects. A business’s own mailbox then writes only to its own people.',
  }
  if (!settings) return row
  const names = [], parts = []
  if (settings.hook_send_email_enabled) {
    const r = await sql(`select b.name, i.provider, i.account_label from public.integrations i join public.business b on b.id = i.business_id where i.business_id = 1 and i.status = 'connected' and i.provider in ('gmail', 'outlook') limit 1`)
    const m = Array.isArray(r.body) ? r.body[0] : null
    if (m) {
      names.push(m.name, m.account_label)
      parts.push(`New sign-ups get theirs from ${m.name}’s ${m.provider === 'outlook' ? 'Outlook' : 'Gmail'} (${maskEmail(m.account_label)})`)
    } else parts.push('Sent through a business’s own mailbox')
  } else if (settings.smtp_host) {
    names.push(settings.smtp_sender_name, settings.smtp_admin_email)
    parts.push(`Custom SMTP (${settings.smtp_host}) as “${settings.smtp_sender_name ?? ''}” ${maskEmail(settings.smtp_admin_email)}`)
  } else parts.push('Supabase’s built-in sender, which allows only a few emails an hour')
  if (settings.mailer_subjects_magic_link) {
    names.push(settings.mailer_subjects_magic_link)
    parts.push(`subject “${settings.mailer_subjects_magic_link}”`)
  }
  return { ...row, owner: ownerOf(...names), detail: parts.join('; ') }
}

async function googleKeys() {
  const keys = ['GOOGLE_PLACES_API_KEY', 'GOOGLE_PICKER_API_KEY', 'GOOGLE_PAGESPEED_API_KEY', 'GOOGLE_FONTS_API_KEY']
  const set = keys.filter(k => val(k))
  return {
    account: 'Google API keys: Competitors, Legal’s Drive picker, speed scores, fonts',
    keys, role: 'platform', set: set.length > 0, owner: 'unknown',
    detail: set.length ? `Set: ${set.join(', ')}` : '',
    fix: 'Make them in the Google app’s own Cloud project, once it is Business Agent’s.',
  }
}

// ------------------------------------------------------------------------------------- a business's own

async function whatsapp() {
  const token = val('META_ACCESS_TOKEN')
  const row = {
    account: 'WhatsApp number: chats and rota reminders',
    keys: ['META_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN'], role: 'business', set: has('META_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'),
    fix: 'One business’s number kept as a platform key, so only that business has WhatsApp. Each business should connect its own number (Meta’s Embedded Signup, through the Business Agent Meta app); then these three secrets go.',
  }
  if (!row.set) return row
  const r = await call(`${GRAPH}/${val('WHATSAPP_PHONE_NUMBER_ID')}?fields=display_phone_number,verified_name&access_token=${enc(token)}`)
  if (!r.ok) return { ...row, error: `Meta refused the token or number: ${graphError(r)}` }
  const phone = phoneOf(r.body.display_phone_number)
  const names = [r.body.verified_name]
  const parts = [`Number ${phone.last4} “${r.body.verified_name ?? ''}”${phone.test ? ', Meta’s free test number rather than a real one' : ''}`]
  if (has('META_APP_ID', 'META_APP_SECRET')) {
    const d = await call(`${GRAPH}/debug_token?input_token=${enc(token)}&access_token=${enc(`${val('META_APP_ID')}|${val('META_APP_SECRET')}`)}`)
    const t = d.body?.data
    if (t) {
      const expiry = !('expires_at' in t) ? '' : t.expires_at === 0 ? ', never expires' : `, expires ${new Date(t.expires_at * 1000).toISOString().slice(0, 10)}`
      parts.push(`token: ${(t.type ?? 'unknown type').toLowerCase().replace('_', ' ')} of the app “${t.application ?? t.app_id}”${t.is_valid === false ? ', not valid' : ''}${expiry}`)
    }
  }
  const me = await call(`${GRAPH}/me?fields=name&access_token=${enc(token)}`)
  if (me.ok && me.body?.name) { names.push(me.body.name); parts.push(`token user “${me.body.name}”`) }
  return { ...row, owner: ownerOf(...names), detail: parts.join('; ') }
}

async function placeId() {
  return {
    account: 'Google place ID: one business’s Google Maps listing',
    keys: ['GOOGLE_PLACE_ID'], role: 'business', set: has('GOOGLE_PLACE_ID'), owner: 'unknown',
    detail: has('GOOGLE_PLACE_ID') ? 'Set' : '',
    fix: 'One business’s listing kept as a key. Other businesses connect Google Maps on Connections; this can go once Easy Beans has too.',
  }
}

// ------------------------------------------------------------------------------------- hosting and tools

async function cloudflare() {
  const row = {
    account: 'Cloudflare: hosting, businesssagent.com, email routing, photo storage',
    keys: ['CLOUDFLARE_API_TOKEN'], role: 'infra', set: has('CLOUDFLARE_API_TOKEN'),
    fix: 'Fine for now. Later: add a Business Agent login as a member of this account, or move the Worker and domain to a Business Agent account.',
  }
  if (!row.set) return row
  const r = await call('https://api.cloudflare.com/client/v4/accounts', { headers: { authorization: `Bearer ${val('CLOUDFLARE_API_TOKEN')}` } })
  if (!r.ok || !r.body?.success) return { ...row, error: `Cloudflare refused the token (HTTP ${r.status})` }
  const names = r.body.result.map(a => a.name)
  return { ...row, owner: ownerOf(...names), detail: `Account “${names.join('”, “')}”` }
}

async function supabaseOrg() {
  const row = {
    account: 'Supabase: the database and sign-in',
    keys: ['SUPABASE_ACCESS_TOKEN'], role: 'infra', set: has('SUPABASE_ACCESS_TOKEN'),
    fix: 'Fine for now. Later: rename the organisation “Business Agent” (Organisation settings), and put Business Agent’s card on its billing.',
  }
  if (!row.set) return row
  const [orgs, project] = await Promise.all([supabase('/organizations'), supabase(`/projects/${REF}`)])
  if (!orgs.ok) return { ...row, error: `Supabase refused the token (HTTP ${orgs.status})` }
  const org = orgs.body.find(o => o.id === project.body?.organization_id) ?? orgs.body[0]
  return { ...row, owner: ownerOf(org?.name), detail: `Organisation “${org?.name ?? '?'}”, project “${project.body?.name ?? REF}”` }
}

async function anthropic() {
  const row = {
    account: 'Anthropic: the assistant',
    keys: ['ANTHROPIC_API_KEY'], role: 'infra', set: has('ANTHROPIC_API_KEY'),
    fix: 'Anthropic doesn’t give the organisation’s name to a key. console.anthropic.com → Settings → Organization: check it is Business Agent’s, with Business Agent’s card; every business’s assistant use is billed there.',
  }
  if (!row.set) return row
  const r = await call('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': val('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' } })
  if (!r.ok) return { ...row, error: `Anthropic refused the key (HTTP ${r.status})` }
  const org = r.headers.get('anthropic-organization-id')
  return { ...row, owner: 'unknown', detail: org ? `The key works, organisation ${org}` : 'The key works' }
}

async function github() {
  const owner = env.GITHUB_REPOSITORY_OWNER || 'arononeillwork'
  const r = await call(`https://api.github.com/users/${owner}`, { headers: { accept: 'application/vnd.github+json', ...(env.GITHUB_TOKEN && { authorization: `Bearer ${env.GITHUB_TOKEN}` }) } })
  const type = r.ok ? r.body.type : null
  return {
    account: 'GitHub: the code, deploys and these secrets',
    keys: ['the repository'], role: 'infra', set: true,
    owner: type === 'User' ? 'personal' : ownerOf(owner, r.body?.name),
    detail: `${env.GITHUB_REPOSITORY || `${owner}/business-agent`}, under ${type === 'Organization' ? 'the organisation' : 'the personal account'} ${owner}`,
    fix: 'Fine for now. Later: a Business Agent organisation on GitHub (Settings → Transfer), which keeps the history and secrets.',
  }
}

async function forwarding() {
  const to = val('EMAIL_FORWARD_TO')
  return {
    account: 'Business email: hello@, sales@, support@ forwarded to',
    keys: ['EMAIL_FORWARD_TO'], role: 'infra', set: !!to,
    owner: to ? ownerOf(to) : 'unknown', detail: to ? maskEmail(to) : '',
    fix: 'Forward to a mailbox Business Agent keeps, not a café’s.',
  }
}

const notYet = (account, keys, role = 'platform') => async () => ({
  account, keys, role, set: keys.some(k => val(k)), owner: 'unknown',
  detail: keys.filter(k => val(k)).length ? `Set: ${keys.filter(k => val(k)).join(', ')}` : '',
  fix: 'Check in the provider’s dashboard that the app or account is Business Agent’s.',
})

const CHECKS = [
  stripe, google, metaApp, instagramApp, microsoft, tiktok, square, signInEmail, googleKeys,
  notYet('Spotify app: Spotify on Music', ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET']),
  notYet('LinkedIn app: LinkedIn posting', ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET']),
  notYet('SumUp app: SumUp takings', ['SUMUP_CLIENT_ID', 'SUMUP_CLIENT_SECRET']),
  notYet('Apple: Sign in with Apple', ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']),
  notYet('Google Ads developer token', ['GOOGLE_ADS_DEVELOPER_TOKEN']),
  notYet('ElevenLabs: AI music', ['ELEVENLABS_API_KEY'], 'infra'),
  notYet('Fly.io: camera uploads', ['FLY_API_TOKEN'], 'infra'),
  whatsapp, placeId,
  cloudflare, supabaseOrg, anthropic, github, forwarding,
]

const rows = []
for (const check of CHECKS) {
  let row
  try { row = await check() } catch (e) { row = { account: check.name, keys: [], role: 'platform', set: true, error: `The check failed: ${e.message}` } }
  rows.push({ owner: 'unknown', ...row, verdict: verdictOf({ owner: 'unknown', ...row }) })
}

// Nothing a provider sends back should contain a key, but make sure no secret's value is printed.
const secrets = Object.entries(env).filter(([k]) => /KEY|SECRET|TOKEN|PASSWORD/.test(k) && !/^HAS_/.test(k)).map(([, v]) => v?.trim())
const markdown = scrub(summaryMarkdown(rows), secrets)
console.log(markdown)
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n`)
writeFileSync('key-owners.json', scrub(JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2), secrets))
