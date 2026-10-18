// Points Stripe's billing events at the live site (runs in the Deploy workflow).
//   node scripts/ops/stripe-billing.mjs <site-url>
// Needs STRIPE_SECRET_KEY (the platform's Stripe account, the same one the app bills with). Safe to
// run on every deploy: the endpoint is made once and its events kept up to date. The Worker
// fetches each event back from Stripe before acting on it, so no signing secret is needed.
const key = process.env.STRIPE_SECRET_KEY
const site = process.argv[2]?.replace(/\/$/, '')
if (!key) { console.log('::warning::STRIPE_SECRET_KEY not set: paid plans are off until it is (docs/billing.md)'); process.exit(0) }
if (!site) { console.log('No site URL; skipping Stripe webhook'); process.exit(0) }

const EVENTS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated',
  'customer.subscription.deleted', 'customer.subscription.trial_will_end', 'invoice.paid', 'invoice.payment_failed']
const stripe = async (method, path, params) => {
  const body = params ? new URLSearchParams(params) : undefined
  const res = await fetch(`https://api.stripe.com/v1${path}`, { method, body,
    headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) } })
  const json = await res.json()
  if (!res.ok) throw new Error(`Stripe ${method} ${path}: ${json.error?.message ?? res.status}`)
  return json
}
const url = `${site}/api/billing/webhook`
const events = Object.fromEntries(EVENTS.map((e, i) => [`enabled_events[${i}]`, e]))
const { data } = await stripe('GET', '/webhook_endpoints?limit=100')
const existing = data.find(e => e.url === url)
if (existing) await stripe('POST', `/webhook_endpoints/${existing.id}`, { ...events, disabled: 'false' })
else await stripe('POST', '/webhook_endpoints', { url, ...events, api_version: '2024-06-20', description: 'Business Agent subscriptions' })
const mode = key.startsWith('sk_live') || key.startsWith('rk_live') ? 'live' : 'test'
console.log(`Stripe billing: ${existing ? 'updated' : 'created'} webhook ${url} (${mode} mode, ${EVENTS.length} events)`)
