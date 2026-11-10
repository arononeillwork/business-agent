import { describe, expect, it } from 'vitest'
// @ts-expect-error: a plain .mjs ops script, without types
import { ensureWidget, widgetHosts, WIDGET_NAME } from './turnstileWidget.mjs'

type Call = { method: string; path: string; body?: Record<string, unknown> }
/** A Cloudflare account's Turnstile API, in memory. */
function account(widgets: Record<string, unknown>[] = [], status = 200) {
  const calls: Call[] = []
  const cf = async (method: string, path: string, body?: Record<string, unknown>) => {
    calls.push({ method, path, body })
    if (status !== 200) return { status, body: { success: false, errors: [{ code: 10000, message: 'Authentication error' }] } }
    if (method === 'GET' && path.startsWith('/challenges/widgets?')) return { status, body: { success: true, result: widgets.map(({ secret: _, ...w }) => w) } }
    if (method === 'POST') {
      const w = { ...body, sitekey: '0x4AAAnew', secret: '0x4AAAnew-secret' }
      widgets.push(w)
      return { status, body: { success: true, result: w } }
    }
    const key = path.split('/').pop()
    const w = widgets.find(x => x.sitekey === key)
    if (method === 'PUT' && w) Object.assign(w, body)
    return w ? { status, body: { success: true, result: w } } : { status: 404, body: { success: false, errors: [{ code: 10404, message: 'not found' }] } }
  }
  return { cf, calls, widgets }
}

const HOSTS = ['businesssagent.com', 'www.businesssagent.com', 'business-agent.example.workers.dev']

describe('the sign-up check\'s Turnstile widget', () => {
  it('allows the site, its www and the workers.dev address', () => {
    expect(widgetHosts('https://businesssagent.com', 'https://business-agent.example.workers.dev')).toEqual(HOSTS)
    expect(widgetHosts('https://www.example.com/', '')).toEqual(['www.example.com'])
    expect(widgetHosts('', 'not a url')).toEqual([])
  })

  it('is made the first time, managed, for every hostname', async () => {
    const a = account()
    expect(await ensureWidget(a.cf, HOSTS)).toEqual({ state: 'made', sitekey: '0x4AAAnew', secret: '0x4AAAnew-secret', hosts: HOSTS })
    expect(a.calls.find(c => c.method === 'POST')?.body).toEqual({ name: WIDGET_NAME, domains: HOSTS, mode: 'managed' })
  })

  it('is found by name after that, with its secret, and nothing is made', async () => {
    const a = account([{ sitekey: '0x4AAAold', secret: 'old-secret', name: WIDGET_NAME, domains: HOSTS, mode: 'managed' }])
    expect(await ensureWidget(a.cf, HOSTS)).toMatchObject({ state: 'found', sitekey: '0x4AAAold', secret: 'old-secret' })
    expect(a.calls.map(c => c.method)).toEqual(['GET', 'GET'])
  })

  it('is found by the site\'s hostname when it was made by hand under another name, and gets the missing hostnames', async () => {
    const a = account([{ sitekey: '0x4AAAhand', secret: 'hand-secret', name: 'Sign-up', domains: ['businesssagent.com'], mode: 'invisible', region: 'world' }])
    expect(await ensureWidget(a.cf, HOSTS)).toEqual({ state: 'found', sitekey: '0x4AAAhand', secret: 'hand-secret', hosts: HOSTS })
    const put = a.calls.find(c => c.method === 'PUT')
    expect(put?.body).toEqual({ name: 'Sign-up', mode: 'invisible', region: 'world', domains: HOSTS })
  })

  it('says so when the token may not manage Turnstile', async () => {
    expect(await ensureWidget(account([], 403).cf, HOSTS)).toEqual({ state: 'no-permission' })
  })
})
