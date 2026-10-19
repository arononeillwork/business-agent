import { describe, expect, it } from 'vitest'
import { syncPrices, type StripeCall } from './stripe-prices'

/** Products and prices in memory, with list pagination and lookup keys like Stripe's. */
function fakeStripe() {
  const products: any[] = [], prices: any[] = []
  let n = 0
  const call: StripeCall = async (method, path, params = {}) => {
    const [p, q] = path.split('?'); const qs = new URLSearchParams(q)
    const page = (rows: any[]) => {
      const after = qs.get('starting_after'); const start = after ? rows.findIndex(r => r.id === after) + 1 : 0
      const lim = Number(qs.get('limit') ?? 10); const data = rows.slice(start, start + lim)
      return { data, has_more: start + lim < rows.length }
    }
    if (method === 'GET' && p === '/products') return page(products.filter(x => x.active))
    if (method === 'GET' && p === '/prices') {
      const key = qs.get('lookup_keys[]')
      return page(prices.filter(x => x.active && (!key || x.lookup_key === key)))
    }
    if (method === 'POST' && p === '/products') {
      const prod = { id: `prod_${++n}`, name: params.name, active: true, metadata: { business_agent_plan: params['metadata[business_agent_plan]'] } }
      products.push(prod); return prod
    }
    if (method === 'POST' && p === '/prices') {
      if (params.transfer_lookup_key === 'true') for (const x of prices) if (x.lookup_key === params.lookup_key) x.lookup_key = null
      const pr = { id: `price_${++n}`, product: params.product, unit_amount: Number(params.unit_amount), lookup_key: params.lookup_key, active: true,
        metadata: { business_agent_plan: params['metadata[business_agent_plan]'] } }
      prices.push(pr); return pr
    }
    const one = /^\/(products|prices)\/(\w+)$/.exec(p)
    if (method === 'POST' && one) {
      const row = (one[1] === 'products' ? products : prices).find(x => x.id === one[2])
      if (params.active) row.active = params.active === 'true'
      if (params.name) row.name = params.name
      return row
    }
    throw new Error(`fake Stripe: ${method} ${path}`)
  }
  return { call, products, prices }
}

const PLANS = [
  { plan: 'free', name: 'Free', monthly: 0, yearly: 0 },
  { plan: 'starter', name: 'Starter', monthly: 25, yearly: 250 },
  { plan: 'pro', name: 'Pro', monthly: 49, yearly: 490 },
  { plan: 'business', name: 'Business', monthly: 79, yearly: 790 },
]
const onSale = (s: ReturnType<typeof fakeStripe>) => s.prices.filter(p => p.active).map(p => `${p.lookup_key}=${p.unit_amount}`).sort()

describe('Stripe prices follow the plans', () => {
  it('makes a product and a monthly and yearly price for each paid plan, and nothing for Free', async () => {
    const s = fakeStripe()
    await syncPrices(s.call, PLANS)
    expect(s.products.map(p => p.name)).toEqual(['Business Agent Starter', 'Business Agent Pro', 'Business Agent Business'])
    expect(onSale(s)).toEqual(['business_agent_business_month=7900', 'business_agent_business_year=79000', 'business_agent_pro_month=4900',
      'business_agent_pro_year=49000', 'business_agent_starter_month=2500', 'business_agent_starter_year=25000'])
    expect(await syncPrices(s.call, PLANS)).toEqual([]) // already in step: no change
  })

  it('a new amount replaces the price and archives the old one', async () => {
    const s = fakeStripe()
    await syncPrices(s.call, PLANS)
    const changes = await syncPrices(s.call, PLANS.map(p => (p.plan === 'pro' ? { ...p, monthly: 59, yearly: 590 } : p)))
    expect(changes.slice(0, 2)).toEqual(['Pro monthly: €59.00 (was €49.00)', 'Pro yearly: €590.00 (was €490.00)'])
    expect(changes.slice(2)).toEqual([expect.stringMatching(/^archived price .*\(€49\.00\)$/), expect.stringMatching(/^archived price .*\(€490\.00\)$/)])
    expect(onSale(s)).toContain('business_agent_pro_month=5900')
    expect(onSale(s).filter(x => x.startsWith('business_agent_pro'))).toHaveLength(2)
    expect(s.prices.filter(p => !p.active).map(p => p.unit_amount).sort()).toEqual([4900, 49000])
  })

  it('a plan that is gone has its prices and product archived; a "contact sales" plan gets nothing', async () => {
    const s = fakeStripe()
    await syncPrices(s.call, PLANS)
    await syncPrices(s.call, [...PLANS.filter(p => p.plan !== 'starter'), { plan: 'enterprise', name: 'Enterprise', monthly: NaN, yearly: NaN }])
    expect(s.products.filter(p => p.active).map(p => p.name)).toEqual(['Business Agent Pro', 'Business Agent Business'])
    expect(onSale(s).some(x => x.includes('starter') || x.includes('enterprise'))).toBe(false)
    expect(onSale(s)).toHaveLength(4)
  })

  it('pages through long lists', async () => {
    const s = fakeStripe()
    for (let i = 0; i < 150; i++) s.prices.push({ id: `other_${i}`, active: true, metadata: {} })
    await syncPrices(s.call, PLANS)
    expect(s.prices.filter(p => p.id.startsWith('other_') && !p.active)).toHaveLength(0)
  })
})
