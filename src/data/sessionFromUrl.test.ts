import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sessionFromUrl } from './supabaseApi'

// Stand-ins for the browser's location/history and the Supabase auth client.
function browserAt(href: string) {
  const url = new URL(href)
  const loc = { get pathname() { return url.pathname }, get search() { return url.search }, get hash() { return url.hash } }
  const replaceState = vi.fn((_s: unknown, _t: string, next: string) => {
    const u = new URL(next, url.origin); url.pathname = u.pathname; url.search = u.search; url.hash = ''
  })
  vi.stubGlobal('location', loc)
  vi.stubGlobal('history', { state: null, replaceState })
  return { url, replaceState }
}
const fakeSb = () => {
  const auth = { exchangeCodeForSession: vi.fn(async () => ({ error: null })), setSession: vi.fn(async () => ({ error: null })) }
  return { sb: { auth } as unknown as SupabaseClient, auth }
}

afterEach(() => vi.unstubAllGlobals())

describe('signing in from a link', () => {
  it('uses the invite email link (#access_token) and removes the tokens from the address bar', async () => {
    const { url } = browserAt('https://app.test/account#access_token=a1&refresh_token=r1&type=invite')
    const { sb, auth } = fakeSb()
    await sessionFromUrl(sb)
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: 'a1', refresh_token: 'r1' })
    expect(url.href).toBe('https://app.test/account')
  })
  it('exchanges the Google/Microsoft ?code= and keeps other query parameters', async () => {
    const { url } = browserAt('https://app.test/?code=c1&tab=x')
    const { sb, auth } = fakeSb()
    await sessionFromUrl(sb)
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('c1')
    expect(url.href).toBe('https://app.test/?tab=x')
  })
  it('explains an expired link', async () => {
    browserAt('https://app.test/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    await expect(sessionFromUrl(fakeSb().sb)).rejects.toThrow('expired or was already used')
  })
  it('does nothing on a normal page', async () => {
    const { replaceState } = browserAt('https://app.test/rota')
    const { sb, auth } = fakeSb()
    await sessionFromUrl(sb)
    expect(auth.setSession).not.toHaveBeenCalled()
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
  })
})
