// Makes Stripe's products and prices match the plans in shared/plans.ts (runs in the Deploy
// workflow, after the webhook step). Needs STRIPE_SECRET_KEY.
//   node --experimental-strip-types scripts/ops/stripe-prices.ts
// For each paid plan: one product ("Business Agent <Plan>") and one active monthly and one active
// yearly price in euros, found by lookup key business_agent_<plan>_<month|year>. A changed amount
// gets a new price that takes the key over, and the old one is archived: off sale for new
// subscribers, kept by anyone already on it (Stripe never deletes a used price). Prices and
// products of plans that no longer exist are archived too. Plans without a price (Free, or a
// "contact sales" plan) have nothing in Stripe.
import { PLANS } from '../../shared/plans.ts'

type Params = Record<string, string>
export type StripeCall = (method: 'GET' | 'POST', path: string, params?: Params) => Promise<any>

export interface PlanPrice { plan: string; name: string; monthly: number; yearly: number }

const lookupKey = (plan: string, interval: 'month' | 'year') => `business_agent_${plan}_${interval}`

/** Every active product or price tagged as ours (list endpoints: exact and immediate, unlike search). */
async function ours(stripe: StripeCall, resource: 'products' | 'prices') {
  const all: any[] = []
  let after = ''
  for (;;) {
    const page = await stripe('GET', `/${resource}?active=true&limit=100${after ? `&starting_after=${after}` : ''}`)
    all.push(...page.data.filter((x: any) => x.metadata?.business_agent_plan))
    if (!page.has_more || !page.data.length) return all
    after = page.data[page.data.length - 1].id
  }
}

/** Bring Stripe in line with these plans. Returns what changed, one line each. */
export async function syncPrices(stripe: StripeCall, plans: PlanPrice[]): Promise<string[]> {
  const done: string[] = []
  const keep = new Set<string>()
  const paid = plans.filter(p => Number.isFinite(p.monthly) && p.monthly > 0)

  const products = await ours(stripe, 'products')
  for (const p of paid) {
    let product = products.find(x => x.metadata.business_agent_plan === p.plan)
    const name = `Business Agent ${p.name}`
    if (!product) {
      product = await stripe('POST', '/products', { name, 'metadata[business_agent_plan]': p.plan })
      done.push(`created product ${name}`)
    } else if (product.name !== name || !product.active) {
      product = await stripe('POST', `/products/${product.id}`, { name, active: 'true' })
      done.push(`updated product ${name}`)
    }
    for (const interval of ['month', 'year'] as const) {
      const cents = Math.round((interval === 'month' ? p.monthly : p.yearly) * 100)
      const key = lookupKey(p.plan, interval)
      const current = (await stripe('GET', `/prices?active=true&limit=10&lookup_keys[]=${key}`)).data[0]
      if (current && current.unit_amount === cents && current.product === product.id) { keep.add(current.id); continue }
      const price = await stripe('POST', '/prices', {
        product: product.id, currency: 'eur', unit_amount: String(cents), 'recurring[interval]': interval, tax_behavior: 'exclusive',
        lookup_key: key, transfer_lookup_key: 'true', 'metadata[business_agent_plan]': p.plan,
      })
      keep.add(price.id)
      done.push(`${p.name} ${interval}ly: €${(cents / 100).toFixed(2)}${current ? ` (was €${(current.unit_amount / 100).toFixed(2)})` : ''}`)
    }
  }

  // Anything else of ours still on sale: old amounts, and plans that are gone.
  for (const pr of await ours(stripe, 'prices')) {
    if (keep.has(pr.id)) continue
    await stripe('POST', `/prices/${pr.id}`, { active: 'false' })
    done.push(`archived price ${pr.lookup_key ?? pr.id} (€${(pr.unit_amount / 100).toFixed(2)})`)
  }
  for (const prod of products) {
    if (paid.some(p => p.plan === prod.metadata.business_agent_plan)) continue
    await stripe('POST', `/products/${prod.id}`, { active: 'false' })
    done.push(`archived product ${prod.name}`)
  }
  return done
}

if (process.argv[1]?.endsWith('stripe-prices.ts')) {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) { console.log('::warning::STRIPE_SECRET_KEY not set: Stripe prices not synced'); process.exit(0) }
  const stripe: StripeCall = async (method, path, params) => {
    const body = params ? new URLSearchParams(params) : undefined
    const res = await fetch(`https://api.stripe.com/v1${path}`, { method, body,
      headers: { authorization: `Bearer ${key}`, 'Stripe-Version': '2024-06-20', ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) } })
    const json = await res.json()
    if (!res.ok) throw new Error(`Stripe ${method} ${path.split('?')[0]}: ${json.error?.message ?? res.status}`)
    return json
  }
  const plans = PLANS.map(p => ({ plan: p.id, name: p.name, monthly: p.monthly, yearly: p.yearly }))
  const changes = await syncPrices(stripe, plans)
  const mode = key.startsWith('sk_live') || key.startsWith('rk_live') ? 'live' : 'test'
  console.log(`Stripe prices (${mode} mode): ${changes.length ? changes.join('; ') : 'already match the plans'}`)
  for (const p of plans.filter(p => p.monthly > 0)) console.log(`  ${p.name}: €${p.monthly}/month, €${p.yearly}/year`)
}
