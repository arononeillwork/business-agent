import { describe, expect, it } from 'vitest'
// @ts-expect-error: a plain .mjs ops script, without types
import { googleConsent, maskEmail, microsoftDirectory, ownerOf, phoneOf, scrub, summaryMarkdown, verdictOf } from './keyOwners.mjs'

describe('whose a key is', () => {
  it('reads the owner from the names a provider gives back', () => {
    expect(ownerOf('Easy Beans Coffee')).toBe('easy-beans')
    expect(ownerOf('easybeanscafe@gmail.com')).toBe('easy-beans')
    expect(ownerOf('Business Agent')).toBe('business-agent')
    expect(ownerOf('BusinessAgent', 'hello@businesssagent.com')).toBe('business-agent')
    expect(ownerOf("Aron O'Neill")).toBe('personal')
    expect(ownerOf("arononeill's org")).toBe('personal')
    expect(ownerOf('Default Directory')).toBe('personal')
    expect(ownerOf('Acme Ltd')).toBe('other')
    expect(ownerOf(null, '')).toBe('unknown')
  })

  it('says Easy Beans wherever its name appears, even next to The Business Agent', () => {
    expect(ownerOf('Business Agent', 'Easy Beans Coffee')).toBe('easy-beans')
  })

  it('judges each key by what it is for', () => {
    expect(verdictOf({ role: 'platform', set: true, owner: 'business-agent' })).toBe('ready')
    expect(verdictOf({ role: 'platform', set: true, owner: 'easy-beans' })).toBe('move')
    expect(verdictOf({ role: 'platform', set: true, owner: 'personal' })).toBe('move')
    expect(verdictOf({ role: 'infra', set: true, owner: 'personal' })).toBe('personal')
    expect(verdictOf({ role: 'platform', set: true, owner: 'unknown' })).toBe('check')
    expect(verdictOf({ role: 'business', set: true, owner: 'easy-beans' })).toBe('connection')
    expect(verdictOf({ role: 'platform', set: false, owner: 'unknown' })).toBe('missing')
    expect(verdictOf({ role: 'platform', set: true, owner: 'unknown', error: 'refused' })).toBe('broken')
  })
})

describe('what the check prints', () => {
  it('shortens emails and phone numbers, and spots Meta’s test numbers', () => {
    expect(maskEmail('arononeillwork@gmail.com')).toBe('aron…@gmail.com')
    expect(maskEmail('bob@x.com')).toBe('bob@x.com')
    expect(maskEmail('not an email')).toBe('')
    expect(phoneOf('+1 555-667-1618')).toEqual({ last4: '…1618', test: true })
    expect(phoneOf('+34 600 123 456')).toEqual({ last4: '…3456', test: false })
  })

  it('never prints a secret, even if a provider echoes one', () => {
    expect(scrub('token sk_live_abcdef123 in here', ['sk_live_abcdef123', '', undefined])).toBe('token *** in here')
  })

  it('reads the app name and support email off Google’s sign-in page', () => {
    const html = `<script class="ds:5">AF_initDataCallback({key: 'ds:5', hash: '3', data:[null,null,null,[[null,"The Business Agent"]]], sideChannel: {}});</script>
      to continue to <button data-app-name="abc.supabase.co" data-third-party-email="arononeillwork@gmail.com">abc.supabase.co</button>`
    expect(googleConsent(html)).toEqual({ name: 'The Business Agent', email: 'arononeillwork@gmail.com', shownAs: 'abc.supabase.co' })
    expect(googleConsent('<html></html>')).toEqual({ name: null, email: null, shownAs: null })
  })

  it('reads the directory off Microsoft’s sign-in page', () => {
    expect(microsoftDirectory('{"sCompanyDisplayName":"Default Directory","x":1}')).toBe('Default Directory')
    expect(microsoftDirectory('AADSTS700038')).toBeNull()
  })

  it('counts what is where it should be, worst first, leaving out keys that aren’t set', () => {
    const md = summaryMarkdown([
      { account: 'Cloudflare', keys: ['CLOUDFLARE_API_TOKEN'], role: 'infra', owner: 'personal', verdict: 'personal', detail: 'Account “x”', fix: 'Later' },
      { account: 'Stripe', keys: ['STRIPE_SECRET_KEY'], role: 'platform', owner: 'easy-beans', verdict: 'move', detail: '“Easy Beans Coffee”', fix: 'Open one' },
      { account: 'Spotify', keys: ['SPOTIFY_CLIENT_ID'], role: 'platform', owner: 'unknown', verdict: 'missing', fix: 'n/a' },
    ])
    expect(md).toContain('**1 of 2**')
    expect(md.indexOf('Stripe')).toBeLessThan(md.indexOf('Cloudflare'))
    expect(md).toContain('Move to The Business Agent')
  })
})
