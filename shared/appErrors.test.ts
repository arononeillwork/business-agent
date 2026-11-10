import { describe, expect, it } from 'vitest'
import { cleanReport, clientReport, describeError, fingerprintOf, LIMITS, normalise, scrub, scrubPath } from './appErrors'

describe('what an error report keeps', () => {
  it('no sign-ins, keys, email addresses, query strings or secret links', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl'
    expect(scrub(`Bearer ${jwt}`)).toBe('Bearer [token]')
    expect(scrub(`session ${jwt} ended`)).toBe('session [token] ended')
    expect(scrub('Authorization: Bearer ba_9xY2kLm3Pq7Rt')).toBe('Authorization: Bearer [token]')
    expect(scrub('key sk_live_51Hx9AbCdEf and sb_secret_AbC123xyz')).toBe('key [key] and [key]')
    expect(scrub('No account for maría.lópez+cafe@example.co.uk')).toBe('No account for [email]')
    expect(scrub('GET https://app.test/api/x?token=abc#access_token=zzz failed')).toBe('GET https://app.test/api/x failed')
    expect(scrub('redirected with code=4/0AbCd and state=xyz')).toBe('redirected with code=[…] and state=[…]')
    expect(scrub('at https://app.test/display/9f8e7d6c5b4a39281706f5e4d3c2b1a0/menu')).toBe('at https://app.test/display/:token/menu')
    // A code file's name and an ordinary long word stay as they are.
    expect(scrub('at https://app.test/assets/RotaPage-C81kq2Lm93Zx-r2.js:1:2')).toBe('at https://app.test/assets/RotaPage-C81kq2Lm93Zx-r2.js:1:2')
    expect(scrub('in hq_set_complimentary_for_business')).toBe('in hq_set_complimentary_for_business')
  })

  it('a page’s path without its query string, fragment or secret parts', () => {
    expect(scrubPath('/rota?week=2026-09-28#today')).toBe('/rota')
    expect(scrubPath('/rep/c0ffee00c0ffee00c0ffee00c0ffee00')).toBe('/rep/:token')
    expect(scrubPath('/display-menu/counter-tv')).toBe('/display-menu/counter-tv')
    expect(scrubPath(`/${'a'.repeat(300)}`)).toHaveLength(LIMITS.path)
  })

  it('what was thrown, never an object’s other fields', () => {
    expect(describeError(new TypeError('boom'))).toMatchObject({ message: 'boom', stack: expect.stringContaining('TypeError: boom') })
    expect(describeError('plain words')).toEqual({ message: 'plain words', stack: null })
    expect(describeError({ message: 'from Supabase', details: 'Key (email)=(maria@example.com) exists', password: 'x' }))
      .toEqual({ message: 'from Supabase', stack: null })
    expect(describeError({ form: { name: 'Maria' } })).toEqual({ message: 'Unknown error', stack: null })
    expect(describeError(null)).toEqual({ message: 'Unknown error', stack: null })
    expect(describeError(Object.assign(new Error(''), { name: 'AbortError' })).message).toBe('AbortError')
  })

  it('a report as the Worker takes it: checked, cleaned and short', () => {
    expect(cleanReport(null)).toBeNull()
    expect(cleanReport('boom')).toBeNull()
    expect(cleanReport({ message: '   ' })).toBeNull()
    const r = cleanReport({ kind: 'nonsense', message: `boom ${'x'.repeat(900)}`, stack: Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n'),
      path: 'https://elsewhere.test/rota', build: '<script>', user_agent: `Mozilla\u0000${'y'.repeat(400)}`, form: { email: 'maria@example.com' } })!
    expect(r.kind).toBe('error')
    expect(r.message).toHaveLength(LIMITS.message)
    expect(r.stack!.split('\n')).toHaveLength(LIMITS.stackLines)
    expect(r.path).toBeNull()
    expect(r.build).toBeNull()
    expect(r.user_agent).toHaveLength(LIMITS.userAgent)
    expect(r.user_agent).not.toContain('\u0000')
    expect(Object.keys(r).sort()).toEqual(['build', 'kind', 'message', 'path', 'stack', 'user_agent'])
  })

  it('what the app sends: the error, the path, the build and the browser', () => {
    expect(clientReport(new Error('boom'), 'promise', { path: '/rota?x=1', build: 'index-Abc1-r2', userAgent: 'Mozilla/5.0' }))
      .toMatchObject({ kind: 'promise', message: 'boom', path: '/rota', build: 'index-Abc1-r2', user_agent: 'Mozilla/5.0' })
  })
})

describe('grouping errors', () => {
  it('takes out what changes from one time to the next', () => {
    expect(normalise('Shift 123 not found (8f14e45f-ceea-467f-a0e6-3f9f4f2b1c11) at https://app.test/rota/12'))
      .toBe('Shift <n> not found (<id>) at <url>')
    expect(normalise('Invoice a3f9c2e1b4d5 failed after 2.5 s, at 12:30:01')).toBe('Invoice <id> failed after <n> s, at <n>')
    expect(normalise('  two\n\tlines  ')).toBe('two lines')
  })

  it('one fingerprint for the same fault in the same place, another anywhere else', async () => {
    const a = await fingerprintOf('app', 'Shift 123 not found')
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(await fingerprintOf('app', 'Shift 98 not found')).toBe(a)
    expect(await fingerprintOf(' app ', 'Shift 98   not found')).toBe(a)
    expect(await fingerprintOf('cron: outbox', 'Shift 98 not found')).not.toBe(a)
    expect(await fingerprintOf('app', 'Shift has no position')).not.toBe(a)
  })
})
