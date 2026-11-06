import { describe, expect, it } from 'vitest'
import { PLANS } from './plans'
import {
  CURVE_WEEKS, FEATURE_GROUPS, FEATURE_ROWS, PRODUCTS, SOURCES, TEAM_DEFAULT, TEAM_SIZES, USD_PER_EUR,
  businessAgentPlan, costAfter, coverage, familiarity, fromUsd, missing, monthlyCost, routeItems, squareTeam,
} from './compare'

describe('compare: what each route costs', () => {
  it('prices The Business Agent from the plans, the cheapest with WhatsApp and takings that fits the team', () => {
    expect(businessAgentPlan(10).id).toBe('pro')
    expect(businessAgentPlan(25).id).toBe('pro')
    expect(businessAgentPlan(26).id).toBe('business')
    expect(monthlyCost('business_agent', 10)).toBe(PLANS.find(p => p.id === 'pro')!.monthly)
    expect(monthlyCost('business_agent', 40)).toBe(PLANS.find(p => p.id === 'business')!.monthly)
  })

  it('takes Square’s cheapest way to a rota for the team: free, per person, then Restaurants Plus', () => {
    expect(squareTeam(5)).toMatchObject({ label: 'Square Shifts, free plan', monthly: 0 })
    expect(squareTeam(10)).toMatchObject({ label: 'Square Shifts Plus', monthly: 35 })
    expect(squareTeam(16)).toMatchObject({ label: 'Square Shifts Plus', monthly: 56 })
    expect(squareTeam(17)).toMatchObject({ label: 'Square for Restaurants Plus', monthly: 59 })
  })

  it('adds up each route line by line, GoHighLevel in euros at the ECB rate', () => {
    expect(fromUsd(97)).toBe(86.88)
    expect(fromUsd(USD_PER_EUR)).toBe(1)
    expect(monthlyCost('square', 10)).toBe(35 + 15 + 89)
    expect(monthlyCost('gohighlevel', 10)).toBe(Math.round((86.88 + 8.96 + 26.87 + 35) * 100) / 100)
    expect(costAfter('business_agent', 10, 36)).toBe(79 * 36)
  })

  it('makes The Business Agent the cheapest route at every team size on the page', () => {
    for (const people of TEAM_SIZES) {
      const ours = monthlyCost('business_agent', people)
      for (const p of PRODUCTS.filter(p => p.id !== 'business_agent')) expect(monthlyCost(p.id, people), `${p.id} with ${people}`).toBeGreaterThan(ours)
    }
    expect(TEAM_SIZES).toContain(TEAM_DEFAULT)
  })

  it('keeps the same free till on every route, and says where every price comes from', () => {
    const sources = new Set<string>(Object.values(SOURCES))
    for (const p of PRODUCTS) {
      const items = routeItems(p.id, TEAM_DEFAULT)
      expect(items.some(i => i.label === 'Square till, free plan' && i.monthly === 0)).toBe(true)
      for (const i of items) expect(sources.has(i.source), i.label).toBe(true)
    }
  })
})

describe('compare: feature by feature', () => {
  it('has a value for every product on every row', () => {
    for (const r of FEATURE_GROUPS.flatMap(g => g.rows)) expect(Object.keys(r.values).sort()).toEqual(PRODUCTS.map(p => p.id).sort())
    expect(FEATURE_GROUPS.every(g => g.rows.length)).toBe(true)
    // A free plan and the language aren't jobs: in the table, not in the counts.
    expect(FEATURE_ROWS.map(r => r.label)).not.toContain('A free plan to start on')
  })

  it('counts every row once, and The Business Agent misses none (the till it reads is the café’s own)', () => {
    for (const p of PRODUCTS) expect(Object.values(coverage(p.id)).reduce((a, b) => a + b, 0)).toBe(FEATURE_ROWS.length)
    expect(missing('business_agent')).toEqual([])
    expect(coverage('business_agent')).toEqual({ yes: FEATURE_ROWS.length - 1, extra: 0, partial: 1, no: 0 })
  })

  it('counts a paid add-on only where the route pays for it', () => {
    // Square's add-ons are Marketing and MarketMan; GoHighLevel's the listings add-on: each is in that route's cost.
    const labels = (id: 'square' | 'gohighlevel') => routeItems(id, TEAM_DEFAULT).map(i => i.label).join(' ')
    for (const r of FEATURE_ROWS) {
      if (r.values.square.has === 'extra') expect(labels('square')).toMatch(/Marketing|MarketMan/)
      if (r.values.gohighlevel.has === 'extra') expect(labels('gohighlevel')).toMatch(/listings/)
    }
  })
})

describe('compare: the learning curve', () => {
  it('starts at nothing, rises every week, and reaches 80% at each product’s estimate', () => {
    for (const p of PRODUCTS) {
      expect(familiarity(p.id, 0)).toBe(0)
      expect(familiarity(p.id, p.weeksTo80)).toBe(80)
      for (let w = 1; w <= CURVE_WEEKS; w++) expect(familiarity(p.id, w)).toBeGreaterThanOrEqual(familiarity(p.id, w - 1))
    }
  })
})
