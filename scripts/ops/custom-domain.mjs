// Serves the app on its own domain (GitHub Actions only). The domain can be bought anywhere
// (it's registered at Vercel), but Cloudflare only attaches a Worker to a domain whose DNS it
// runs: add the domain in Cloudflare (free plan), then set the two nameservers it shows at the
// registrar. Until that's done this step says what's missing and the deploy carries on at
// workers.dev. Once the domain is active it attaches it to the Worker (Cloudflare makes the DNS
// record and certificate) and prints `site=https://<domain>` for the steps after it.
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (exported by cloudflare-token.mjs), APP_DOMAIN.
import { appendFileSync } from 'node:fs'

const DOMAIN = process.env.APP_DOMAIN ?? 'businesssagent.com'
const WORKER = 'business-agent'
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env
const summary = msg => { console.log(msg); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${msg}\n`) }
const output = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`) }

const cf = async (path, init = {}) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers },
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const errors = r => JSON.stringify(r.body?.errors ?? r.status)

if (!token || !account) { summary(`Custom domain: skipped (no Cloudflare account ID yet).`); process.exit(0) }

const zones = await cf(`/zones?name=${DOMAIN}&account.id=${account}`)
if (zones.status === 403 || !zones.body?.success) {
  summary(`Custom domain: the Cloudflare token can't read zones (${errors(zones)}). Add "Zone: Zone Read", "Zone: DNS Edit" and "Zone: Workers Routes Edit" for ${DOMAIN} to the token.`)
  process.exit(0)
}
const zone = zones.body.result?.[0]
if (!zone) {
  summary(`Custom domain: **${DOMAIN} is not in Cloudflare yet.** Cloudflare dashboard → Add a domain → ${DOMAIN} → Free plan, then set the two nameservers it shows at Vercel (Domains → ${DOMAIN} → Nameservers). The app stays on workers.dev until then.`)
  process.exit(0)
}
if (zone.status !== 'active') {
  summary(`Custom domain: ${DOMAIN} is in Cloudflare but waiting for its nameservers (status: ${zone.status}). At Vercel, set the nameservers to ${(zone.name_servers ?? []).join(' and ')}. It usually goes active within an hour.`)
  process.exit(0)
}

const attached = await cf(`/accounts/${account}/workers/domains`, {
  method: 'PUT', body: JSON.stringify({ environment: 'production', hostname: DOMAIN, service: WORKER, zone_id: zone.id }),
})
if (!attached.body?.success) {
  summary(`Custom domain: couldn't attach ${DOMAIN} to the Worker (${errors(attached)}). The token needs "Zone: Workers Routes Edit" and "Zone: DNS Edit" for ${DOMAIN}.`)
  process.exit(0)
}

// The certificate can take a minute or two on the first attach.
const site = `https://${DOMAIN}`
for (let i = 0; i < 12; i++) {
  const ok = await fetch(`${site}/api/health`).then(r => r.ok).catch(() => false)
  if (ok) {
    output('site', site)
    summary(`### Live at ${site}`)
    process.exit(0)
  }
  await new Promise(r => setTimeout(r, 10_000))
}
summary(`Custom domain: ${DOMAIN} is attached but doesn't answer yet (certificate still being issued). The next deploy picks it up.`)
