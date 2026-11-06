import { describe, expect, it } from 'vitest'
import { MAX_ACCOUNTS, MAX_LOGO, forget, keep, opened, parseKept, serializeKept, shownAccounts, smallLogo, type KeptAccount } from './deviceAccounts'

const account = (userId: string, more: Partial<KeptAccount> = {}): KeptAccount => ({
  userId, name: `Person ${userId}`, email: `${userId}@example.com`, businessId: 1, business: `Business ${userId}`, logo: null,
  session: { access_token: `at-${userId}`, refresh_token: `rt-${userId}` }, ...more,
})

describe('businesses kept on this device', () => {
  it('reads back what it wrote, and nothing from anything else', () => {
    const list = [account('a'), account('b', { session: null, businessId: null, business: null })]
    expect(parseKept(serializeKept(list))).toEqual(list)
    expect(parseKept(null)).toEqual([])
    expect(parseKept('not json')).toEqual([])
    expect(parseKept(JSON.stringify({ v: 2, accounts: list }))).toEqual([])
    // An entry without an account, or with half a sign-in, is left out or kept signed out.
    expect(parseKept(JSON.stringify({ v: 1, accounts: [{ name: 'x' }, { userId: 'c', session: { access_token: 'only' } }] })))
      .toEqual([{ userId: 'c', name: '', email: null, businessId: null, business: null, logo: null, session: null }])
  })

  it('keeps each account once, in the order they were added, up to the limit', () => {
    let list = keep([], account('a'))
    list = keep(list, account('b'))
    list = keep(list, account('a', { business: 'Renamed' }))
    expect(list.map(a => [a.userId, a.business])).toEqual([['a', 'Renamed'], ['b', 'Business b']])
    for (let i = 0; i < MAX_ACCOUNTS + 2; i++) list = keep(list, account(`n${i}`))
    expect(list).toHaveLength(MAX_ACCOUNTS)
    expect(list[0].userId).not.toBe('a')
    expect(forget(list, list[0].userId)).toHaveLength(MAX_ACCOUNTS - 1)
  })

  it('shows the others, never their sign-ins, and the one open now holds none', () => {
    const list = opened([account('a'), account('b'), account('c', { session: null })], 'b')
    expect(list.find(a => a.userId === 'b')?.session).toBeNull()
    const shown = shownAccounts(list, 'b')
    expect(shown.map(a => [a.userId, a.signedOut])).toEqual([['a', false], ['c', true]])
    expect(JSON.stringify(shown)).not.toContain('rt-')
    // Signed out of the one that was open: the rest are all there to go back to.
    expect(shownAccounts(list).map(a => a.userId)).toEqual(['a', 'b', 'c'])
  })

  it('copies a logo only when it is a link or small', () => {
    expect(smallLogo('https://example.com/logo.png')).toBe('https://example.com/logo.png')
    expect(smallLogo(`data:image/png;base64,${'a'.repeat(100)}`)).toMatch(/^data:/)
    expect(smallLogo(`data:image/png;base64,${'a'.repeat(MAX_LOGO)}`)).toBeNull()
    expect(smallLogo(null)).toBeNull()
  })
})
