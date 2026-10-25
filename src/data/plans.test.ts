import sql from '../../supabase/migrations/20261019000036_billing_plans.sql?raw'
import musicSql from '../../supabase/migrations/20261104000085_social_music.sql?raw'
import { describe, expect, it } from 'vitest'
import { COMPARE, PAY_PER_USE, PLANS, effectivePlan, mostIncluded, payPerUse, paymentProblem, perUsePrice, type Billing } from '../../shared/plans'

describe('plans', () => {
  it('match the limits the database enforces (migration 36)', () => {
    const rows = [...sql.matchAll(/\('(\w+)',\s+(null|\d+),\s+(\d+),\s+(null|\d+),\s+'\{([^}]*)\}'\)/g)]
    const num = (s: string) => (s === 'null' ? null : Number(s))
    const db = Object.fromEntries(rows.map(([, plan, people, social, posts, features]) =>
      [plan, { people: num(people), socialAccounts: Number(social), postsPerMonth: num(posts), features: features ? features.split(',') : [] }]))
    expect(db).toEqual(Object.fromEntries(PLANS.map(p => [p.id, { ...p.limits, features: p.features }])))
  })

  it('cost less per month on yearly billing, and each plan includes the one below', () => {
    for (const [i, p] of PLANS.entries()) {
      expect(p.yearly).toBeLessThanOrEqual(p.monthly * 12)
      if (i) expect(p.features).toEqual(expect.arrayContaining(PLANS[i - 1].features))
    }
  })

  it('compare every plan on every row, with the custom MCP connection on all', () => {
    for (const g of COMPARE) for (const r of g.rows) expect(Object.keys(r.values).sort()).toEqual(PLANS.map(p => p.id).sort())
    const mcp = COMPARE.flatMap(g => g.rows).find(r => /MCP/.test(r.label))!
    expect(Object.values(mcp.values).every(Boolean)).toBe(true)
  })
})

describe('pay per use', () => {
  it('is on every paid plan and not on Free (the pricing page says "any paid plan")', () => {
    for (const u of PAY_PER_USE) {
      for (const p of PLANS) expect(u.included[p.id] !== undefined, `${u.id} on ${p.id}`).toBe(p.monthly > 0)
      expect(u.price).toBeGreaterThan(0)
    }
  })

  it('gives the top plan 1 AI music track free a month, and charges per track on the others', () => {
    const music = payPerUse('ai_music')
    expect(mostIncluded(music)?.id).toBe('business')
    expect(perUsePrice(music, 'business')).toBe('1 free a month, then €0.99 per track')
    expect(perUsePrice(music, 'pro')).toBe('€0.99 per track')
    expect(perUsePrice(music, 'starter')).toBe('€0.99 per track')
    expect(perUsePrice(music, 'free')).toBeNull()
  })

  it('match the prices and free uses the database charges by (migration 85)', () => {
    const rows = [...musicSql.matchAll(/\('(\w+)',\s+(\d+),\s+'(\{[^']*\})'\)/g)]
    const db = Object.fromEntries(rows.map(([, id, cents, included]) => [id, { cents: Number(cents), included: JSON.parse(included) }]))
    expect(db).toEqual(Object.fromEntries(PAY_PER_USE.map(u => [u.id, { cents: Math.round(u.price * 100), included: u.included }])))
  })

  it('has its own rows in the comparison, which say which plans can use it', () => {
    const rows = COMPARE.flatMap(g => g.rows).filter(r => r.perUse)
    expect(rows.map(r => r.perUse)).toEqual(PAY_PER_USE.map(u => u.id))
    expect(rows[0].values).toEqual({ free: false, starter: true, pro: true, business: true })
  })
})

describe('effectivePlan', () => {
  const now = new Date('2026-12-01T10:00:00Z')
  const b = (patch: Partial<Billing>): Billing => ({ plan: 'business', status: 'trialing', interval: 'month', trial_ends_at: '2026-12-20T00:00:00Z',
    current_period_end: null, cancel_at_period_end: false, trial_used: true, has_customer: true, complimentary: null, complimentary_note: null, referral_months_applied: 0, referred_by: null, ...patch })

  it('gives the plan during the trial and once paid', () => {
    expect(effectivePlan(b({}), now)).toBe('business')
    expect(effectivePlan(b({ status: 'active' }), now)).toBe('business')
    expect(effectivePlan(b({ status: 'comped' }), now)).toBe('business')
  })

  it('cuts back to Free when the trial ends unpaid or a payment fails', () => {
    const ended = b({ trial_ends_at: '2026-11-30T00:00:00Z' })
    expect(effectivePlan(ended, now)).toBe('free')
    expect(paymentProblem(ended, now)).toBe(true)
    for (const status of ['past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused'] as const) {
      expect(effectivePlan(b({ status }), now)).toBe('free')
    }
    expect(effectivePlan(null, now)).toBe('free')
    expect(paymentProblem(b({ plan: 'free', status: 'none' }), now)).toBe(false)
  })
})
