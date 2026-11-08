// The parts of the "Sign-up check" deploy step (scripts/ops/turnstile.mjs) that need no deploy: finding
// or making the Turnstile widget the sign-up form uses, through Cloudflare's API, so nobody has to copy
// its keys into repository secrets.

export const WIDGET_NAME = 'The Business Agent sign-up'

/** The hostnames the widget must allow: the site, its www, and the Worker's workers.dev address. */
export function widgetHosts(siteUrl, workerUrl) {
  const host = u => { try { return u ? new URL(u).hostname : null } catch { return null } }
  const site = host(siteUrl)
  return [...new Set([site, site && !site.startsWith('www.') ? `www.${site}` : null, host(workerUrl)].filter(Boolean))]
}

const forbidden = r => r.status === 401 || r.status === 403 || (r.body?.errors ?? []).some(e => e.code === 10000)
const errors = r => (r.body?.errors ?? []).map(e => `${e.code}: ${e.message}`).join('; ') || `HTTP ${r.status}`

/**
 * The widget's keys, made if there's none yet and its hostnames topped up if one is missing.
 * `cf(method, path, body)` calls the account's API and resolves to { status, body }.
 * → { state: 'made' | 'found', sitekey, secret, hosts } | { state: 'no-permission' } | { state: 'error', detail }
 */
export async function ensureWidget(cf, hosts) {
  const list = await cf('GET', '/challenges/widgets?per_page=50')
  if (forbidden(list)) return { state: 'no-permission' }
  if (!list.body?.success) return { state: 'error', detail: errors(list) }
  const widgets = list.body.result ?? []
  const mine = widgets.find(w => w.name === WIDGET_NAME) ?? widgets.find(w => (w.domains ?? []).includes(hosts[0]))
  if (!mine) {
    const made = await cf('POST', '/challenges/widgets', { name: WIDGET_NAME, domains: hosts, mode: 'managed' })
    if (forbidden(made)) return { state: 'no-permission' }
    if (!made.body?.success || !made.body.result?.secret) return { state: 'error', detail: errors(made) }
    return { state: 'made', sitekey: made.body.result.sitekey, secret: made.body.result.secret, hosts }
  }
  const got = await cf('GET', `/challenges/widgets/${mine.sitekey}`)
  if (forbidden(got)) return { state: 'no-permission' }
  if (!got.body?.success || !got.body.result?.secret) return { state: 'error', detail: errors(got) }
  const w = got.body.result
  const missing = hosts.filter(h => !(w.domains ?? []).includes(h))
  if (missing.length) {
    const { name, mode, region, bot_fight_mode, offlabel, clearance_level } = w
    const keep = Object.fromEntries(Object.entries({ region, bot_fight_mode, offlabel, clearance_level }).filter(([, v]) => v !== undefined))
    const put = await cf('PUT', `/challenges/widgets/${w.sitekey}`, { ...keep, name, mode, domains: [...(w.domains ?? []), ...missing] })
    // The keys still work for the hostnames it had; say so rather than stop.
    if (!put.body?.success) return { state: 'found', sitekey: w.sitekey, secret: w.secret, hosts: w.domains ?? [], warning: `couldn't add ${missing.join(', ')} (${errors(put)})` }
  }
  return { state: 'found', sitekey: w.sitekey, secret: w.secret, hosts: [...new Set([...(w.domains ?? []), ...missing])] }
}
