// The back-office's monthly revenue: what each paying business pays a month without VAT, a yearly plan
// spread over its months, and nothing for a trial, a complimentary account or Free.
import { describe, expect, it } from 'vitest'
import { monthlyRevenue } from './HqBusinessesPage'

describe('monthly revenue', () => {
  it('counts paying plans only, yearly ones by the month', () => {
    expect(monthlyRevenue({ plan: 'pro', status: 'active', billing_interval: 'month' })).toBe(79)
    expect(monthlyRevenue({ plan: 'business', status: 'active', billing_interval: 'year' })).toBeCloseTo(107.5)
    expect(monthlyRevenue({ plan: 'starter', status: 'past_due', billing_interval: 'month' })).toBe(39)
    expect(monthlyRevenue({ plan: 'business', status: 'trialing', billing_interval: 'month' })).toBe(0)
    expect(monthlyRevenue({ plan: 'business', status: 'comped', billing_interval: null })).toBe(0)
    expect(monthlyRevenue({ plan: 'free', status: 'none', billing_interval: null })).toBe(0)
  })
})
