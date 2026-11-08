// The check on the sign-up form (worker/signupCheck.ts): its Cloudflare Turnstile keys, for the steps
// after this one (the Worker's secrets and Supabase's "before user created" hook). Runs in the Deploy
// workflow, after the Worker is out and before its secrets are synced:
// - the repository secrets TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, when both are set;
// - otherwise the widget "The Business Agent sign-up" in the Cloudflare account, made the first time,
//   when the deploy's Cloudflare token may manage Turnstile (Account → Turnstile → Edit).
// Either way it exports both keys (the secret masked) to $GITHUB_ENV; without them the check stays off.
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (from cloudflare-token.mjs), SITE_URL, WORKER_URL,
//      SECRET_SITE_KEY, SECRET_SECRET_KEY (the repository secrets, if any).
import { appendFileSync, readFileSync } from 'node:fs'
import { ensureWidget, widgetHosts, WIDGET_NAME } from './turnstileWidget.mjs'

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env
const summary = msg => { console.log(msg); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${msg}\n\n`) }
const use = (siteKey, secret) => {
  console.log(`::add-mask::${secret}`)
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `TURNSTILE_SITE_KEY=${siteKey}\nTURNSTILE_SECRET_KEY=${secret}\n`)
}

const fromSecrets = [process.env.SECRET_SITE_KEY?.trim(), process.env.SECRET_SECRET_KEY?.trim()]
if (fromSecrets[0] && fromSecrets[1]) {
  use(fromSecrets[0], fromSecrets[1])
  summary('Sign-up check: Turnstile keys from the repository secrets.')
  process.exit(0)
}
if (!token || !account) { summary('Sign-up check: off (no Cloudflare account ID yet).'); process.exit(0) }

const site = process.env.SITE_URL || readFileSync('shared/business.config.ts', 'utf8').match(/appUrl:\s*'([^']+)'/)?.[1]
const hosts = widgetHosts(site, process.env.WORKER_URL)
const cf = async (method, path, body) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

const w = await ensureWidget(cf, hosts).catch(e => ({ state: 'error', detail: e instanceof Error ? e.message : String(e) }))
if (w.state === 'no-permission') {
  summary('Sign-up check: off. The Cloudflare token can\'t manage Turnstile: add **Account → Turnstile → Edit** to it (Cloudflare → My Profile → API Tokens → the deploy\'s token → Edit), then deploy. Or set the TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY repository secrets (docs/sign-in-setup.md).')
} else if (w.state === 'error') {
  summary(`Sign-up check: off. Cloudflare's Turnstile API said: ${w.detail}`)
} else {
  use(w.sitekey, w.secret)
  summary(`Sign-up check: Turnstile widget "${WIDGET_NAME}" ${w.state === 'made' ? 'made' : 'found'} in Cloudflare, for ${w.hosts.join(', ')}.${w.warning ? ` (${w.warning})` : ''}`)
}
