// Sign-in emails from noreply@<domain> through Cloudflare Email Sending (GitHub Actions only;
// docs/business-email.md). Sending to anyone needs the Workers Paid plan and the domain onboarded once
// in the Cloudflare dashboard, and a Worker can't even deploy with the send_email binding before
// that. So this step looks for the records onboarding adds and, once they're there, switches the
// binding on in wrangler.jsonc for this build and tells the steps after it (sending=true): the
// sign-in settings step then sends sign-in emails through the Worker. Until then it says what's
// missing, the deploy carries on, and sign-in emails go out as before.
// Env: APP_DOMAIN (default businesssagent.com).
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { onboarded, withSending } from './emailSending.mjs'

const DOMAIN = process.env.APP_DOMAIN ?? 'businesssagent.com'
const summary = msg => { console.log(msg); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${msg}\n`) }
const output = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`) }

if (!await onboarded(DOMAIN)) {
  summary(`Sign-in emails from noreply@${DOMAIN}: **not set up yet.** Cloudflare → Workers & Pages → Plans: the Workers Paid plan; then Compute → Email Service → Email Sending → Onboard Domain → ${DOMAIN}. The next deploy after that switches it on. Until then they go from a business's own mailbox.`)
  output('sending', 'false')
  process.exit(0)
}
const cfg = readFileSync('wrangler.jsonc', 'utf8')
const on = withSending(cfg)
if (!/^\s*"send_email"/m.test(on)) {
  summary('Sign-in emails: the domain is ready, but the send_email line in wrangler.jsonc was not found.')
  output('sending', 'false')
  process.exit(0)
}
writeFileSync('wrangler.jsonc', on)
output('sending', 'true')
summary(`Sign-in emails: from noreply@${DOMAIN} (Cloudflare Email Sending).`)
