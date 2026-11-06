import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error: a plain .mjs ops script, without types
import { onboarded, withSending } from './emailSending.mjs'

const dns = (answer: unknown[] | undefined, ok = true) => (async () => ({ ok, json: async () => ({ Status: 0, Answer: answer }) })) as unknown as typeof fetch

describe('sign-in emails from the domain (Cloudflare Email Sending)', () => {
  it('is ready once onboarding has put an MX record on cf-bounce', async () => {
    expect(await onboarded('businesssagent.com', dns([{ name: 'cf-bounce.businesssagent.com.', type: 15, data: '10 route1.mx.cloudflare.net.' }]))).toBe(true)
  })

  it('is not ready without one, when DNS fails, or when the lookup throws', async () => {
    expect(await onboarded('businesssagent.com', dns(undefined))).toBe(false)
    expect(await onboarded('businesssagent.com', dns([{ type: 16, data: '"v=spf1"' }]))).toBe(false)
    expect(await onboarded('businesssagent.com', dns([], false))).toBe(false)
    expect(await onboarded('businesssagent.com', (async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBe(false)
  })

  it('switches on the send_email line wrangler.jsonc keeps commented out', () => {
    const cfg = readFileSync('wrangler.jsonc', 'utf8')
    expect(cfg).toMatch(/^\s*\/\/\s*"send_email": \[\{ "name": "EMAIL" \}\],$/m)
    const on = withSending(cfg)
    expect(on).toMatch(/^\s*"send_email": \[\{ "name": "EMAIL" \}\],$/m)
    expect(withSending(on)).toBe(on)
    // Still valid once switched on: the line is a property like the others.
    expect(on.split('\n').length).toBe(cfg.split('\n').length)
  })
})
