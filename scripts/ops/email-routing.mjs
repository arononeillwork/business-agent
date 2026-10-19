// Business Agent's own email addresses (GitHub Actions only): hello@, sales@ and support@ the
// domain forward to one Gmail inbox, with Cloudflare Email Routing (free). Replies go out from the
// same addresses through Gmail's "Send mail as", so this also lets Google send for the domain (SPF)
// and adds a DMARC policy. Each part says what's missing and the deploy carries on without it.
//
// Needs: the repo secret EMAIL_FORWARD_TO (the Gmail address), and on the Cloudflare token
// "Zone: Email Routing Rules: Edit" and "Account: Email Routing Addresses: Edit" (it already has
// "Zone: DNS: Edit"). The first time, Cloudflare emails that Gmail to confirm it may forward there:
// open it and press "Verify email address"; mail is delivered from then on.
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (exported by cloudflare-token.mjs), APP_DOMAIN, EMAIL_FORWARD_TO.
import { appendFileSync } from 'node:fs'

const DOMAIN = process.env.APP_DOMAIN ?? 'businesssagent.com'
const BOXES = ['hello', 'sales', 'support']
const to = (process.env.EMAIL_FORWARD_TO ?? '').trim().toLowerCase()
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env
const summary = msg => { console.log(msg); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${msg}\n`) }

const cf = async (path, init = {}) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers },
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const errors = r => JSON.stringify(r.body?.errors ?? r.status)
const denied = r => r.status === 403 || r.body?.errors?.some(e => [10000, 9109].includes(e.code))

if (!token || !account) { summary('Business email: skipped (no Cloudflare account ID yet).'); process.exit(0) }
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  summary(`Business email: add the repo secret **EMAIL_FORWARD_TO** (the Gmail address that should receive ${BOXES.map(b => `${b}@${DOMAIN}`).join(', ')}), then deploy again.`)
  process.exit(0)
}
const zones = await cf(`/zones?name=${DOMAIN}&account.id=${account}`)
const zone = zones.body?.result?.[0]
if (!zone || zone.status !== 'active') { summary(`Business email: ${DOMAIN} isn't active in Cloudflare yet (see "Custom domain").`); process.exit(0) }

// 1. Email Routing on (Cloudflare adds its MX records and an SPF record).
const settings = await cf(`/zones/${zone.id}/email/routing`)
if (denied(settings)) {
  summary(`Business email: the Cloudflare token can't manage Email Routing. Add **Zone → Email Routing Rules → Edit** and **Account → Email Routing Addresses → Edit** to the token (My Profile → API Tokens), then deploy again.`)
  process.exit(0)
}
if (!settings.body?.result?.enabled) {
  let on = await cf(`/zones/${zone.id}/email/routing/dns`, { method: 'POST', body: '{}' })
  if (!on.body?.success) on = await cf(`/zones/${zone.id}/email/routing/enable`, { method: 'POST', body: '{}' })
  if (!on.body?.success) {
    summary(`Business email: couldn't switch on Email Routing (${errors(on)}). In Cloudflare: ${DOMAIN} → Email → Email Routing → Get started, then deploy again.`)
    process.exit(0)
  }
  console.log('Email Routing switched on')
}

// 2. The Gmail inbox as a destination (Cloudflare asks it to confirm, once).
const list = await cf(`/accounts/${account}/email/routing/addresses?per_page=50`)
if (denied(list)) { summary('Business email: the token needs **Account → Email Routing Addresses → Edit**.'); process.exit(0) }
let dest = (list.body?.result ?? []).find(a => a.email?.toLowerCase() === to)
if (!dest) {
  const made = await cf(`/accounts/${account}/email/routing/addresses`, { method: 'POST', body: JSON.stringify({ email: to }) })
  if (!made.body?.success) { summary(`Business email: couldn't add ${to} as a destination (${errors(made)}).`); process.exit(0) }
  dest = made.body.result
}

// 3. hello@, sales@ and support@ forward there.
const rules = await cf(`/zones/${zone.id}/email/routing/rules?per_page=50`)
const have = new Set((rules.body?.result ?? []).flatMap(r => (r.matchers ?? []).map(m => String(m.value ?? '').toLowerCase())))
for (const box of BOXES) {
  const address = `${box}@${DOMAIN}`
  if (have.has(address)) continue
  const made = await cf(`/zones/${zone.id}/email/routing/rules`, { method: 'POST', body: JSON.stringify({
    name: `Business Agent ${box}`, enabled: true,
    matchers: [{ type: 'literal', field: 'to', value: address }],
    actions: [{ type: 'forward', value: [to] }],
  }) })
  if (!made.body?.success) summary(`Business email: couldn't create ${address} (${errors(made)}).`)
}

// 4. Gmail may send as these addresses (SPF), and a DMARC policy (report only, to start with).
const txt = async name => (await cf(`/zones/${zone.id}/dns_records?type=TXT&name=${name}`)).body?.result ?? []
const spf = (await txt(DOMAIN)).find(r => /^"?v=spf1/i.test(r.content))
if (spf && !/include:_spf\.google\.com/.test(spf.content)) {
  const content = spf.content.replace(/"/g, '').replace(/\s*([~?-]all)\s*$/, ' include:_spf.google.com $1')
  const put = await cf(`/zones/${zone.id}/dns_records/${spf.id}`, { method: 'PATCH', body: JSON.stringify({ content }) })
  if (!put.body?.success) summary(`Business email: couldn't add Google to the SPF record (${errors(put)}).`)
}
if (!(await txt(`_dmarc.${DOMAIN}`)).some(r => /v=DMARC1/i.test(r.content))) {
  await cf(`/zones/${zone.id}/dns_records`, { method: 'POST', body: JSON.stringify({
    type: 'TXT', name: `_dmarc.${DOMAIN}`, content: `v=DMARC1; p=none; rua=mailto:hello@${DOMAIN}`, ttl: 1,
  }) })
}

const boxes = BOXES.map(b => `${b}@${DOMAIN}`).join(', ')
summary(dest?.verified
  ? `Business email: on. ${boxes} → ${to}.`
  : `Business email: ${boxes} → ${to}, waiting for **${to}** to confirm: open Cloudflare's "Verify email address" email in that inbox.`)
