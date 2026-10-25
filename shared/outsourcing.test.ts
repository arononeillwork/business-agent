import { describe, expect, it } from 'vitest'
import { cheapestOption, contractState, monthlyCost, optionsFor, outsourcingTotals, sortServices, type Contractor, type OutsourcedJob } from './outsourcing'

const job = (j: Partial<OutsourcedJob>): OutsourcedJob => ({ id: 'j', service: 'Cleaning', contractor_id: 'c', scope: null, price: null, price_unit: 'month',
  quantity: null, quantity_per: null, starts_on: null, ends_on: null, notes: null, active: true, ...j })
const person = (c: Partial<Contractor> & { id: string }): Contractor => ({ name: c.id, kind: 'freelancer', services: [], contact_name: null, email: null,
  phone: null, whatsapp: false, website: null, portfolio_url: null, location: null, rate: null, rate_unit: 'month', rating: null, notes: null,
  starred: false, active: true, ...c })

describe('outsourcing', () => {
  it('a month’s cost: a monthly price as it is, a yearly one spread out, hours, days or visits counted', () => {
    expect(monthlyCost(job({ price: 350, price_unit: 'month' }))).toBe(350)
    expect(monthlyCost(job({ price: 1200, price_unit: 'year' }))).toBe(100)
    expect(monthlyCost(job({ price: 35, price_unit: 'visit', quantity: 2, quantity_per: 'month' }))).toBe(70)
    expect(monthlyCost(job({ price: 95, price_unit: 'visit', quantity: 4, quantity_per: 'year' }))).toBe(31.67)
    expect(monthlyCost(job({ price: 16, price_unit: 'hour', quantity: 6, quantity_per: 'week' }))).toBe(416) // 52 weeks over 12 months
    expect(monthlyCost(job({ price: 120, price_unit: 'day', quantity: 1, quantity_per: 'month' }))).toBe(120)
  })

  it('no monthly cost for a one-off project, no price, or an hourly price without the hours', () => {
    expect(monthlyCost(job({ price: 450, price_unit: 'project' }))).toBeNull()
    expect(monthlyCost(job({ price: null, price_unit: 'month' }))).toBeNull()
    expect(monthlyCost(job({ price: 16, price_unit: 'hour' }))).toBeNull()
  })

  it('totals: what the jobs going on cost a month, the ones that can’t be told, and one-off projects; ended jobs left out', () => {
    expect(outsourcingTotals([
      job({ price: 350 }), job({ price: 35, price_unit: 'visit', quantity: 2, quantity_per: 'month' }),
      job({ price: 16, price_unit: 'hour' }), job({ price: 450, price_unit: 'project' }),
      job({ price: 999, active: false }),
    ])).toEqual({ jobs: 4, monthly: 420, unknown: 1, oneOff: 450 })
    expect(outsourcingTotals([])).toEqual({ jobs: 0, monthly: 0, unknown: 0, oneOff: 0 })
  })

  it('a contract is running, ending within a month, past its end while still going, starting later, or over', () => {
    const today = '2026-09-30'
    expect(contractState(job({}), today)).toBe('running')
    expect(contractState(job({ ends_on: '2026-10-31' }), today)).toBe('running')
    expect(contractState(job({ ends_on: '2026-10-30' }), today)).toBe('ending')
    expect(contractState(job({ ends_on: '2026-09-30' }), today)).toBe('ending') // its last day
    expect(contractState(job({ ends_on: '2026-09-29' }), today)).toBe('overdue')
    expect(contractState(job({ starts_on: '2026-10-01', ends_on: '2026-09-29' }), today)).toBe('upcoming')
    expect(contractState(job({ active: false, ends_on: '2027-01-01' }), today)).toBe('ended')
  })

  it('jobs in order: the usual ones as listed (in their own spelling), then the business’s own A to Z, each once', () => {
    expect(sortServices(['Window cleaning', ' Barista training ', 'social media management', 'Aprons', 'Social Media Management', 'barista training']))
      .toEqual(['Social media management', 'Window cleaning', 'Aprons', 'Barista training'])
  })

  it('the options for a job: not archived, starred first, then the best rated, then the cheapest charged the same way', () => {
    const list = [
      person({ id: 'nacho', services: ['Social media management'], rate: 240 }),
      person({ id: 'costa', services: ['social media management', 'Ads management'], rate: 690, rating: 4 }),
      person({ id: 'lucia', services: ['Social media management'], rate: 350, rating: 5 }),
      person({ id: 'pablo', services: ['Photography & video'], rating: 5 }),
      person({ id: 'old', services: ['Social media management'], rating: 5, active: false }),
      person({ id: 'star', services: ['Social media management'], starred: true }),
      person({ id: 'ana', services: ['Social media management'], rate: 200 }),
    ]
    expect(optionsFor('Social media management', list).map(c => c.id)).toEqual(['star', 'lucia', 'costa', 'ana', 'nacho'])
    expect(optionsFor('Pest control', list)).toEqual([])
  })

  it('the cheapest option: the lowest rate among those charged the most usual way, when it can be compared and is the only one', () => {
    const o = (id: string, rate: number | null, rate_unit: Contractor['rate_unit'] = 'month') => ({ id, rate, rate_unit })
    expect(cheapestOption([o('a', 350), o('b', 240), o('c', 690)])).toBe('b')
    expect(cheapestOption([o('a', 350), o('b', 15, 'hour'), o('c', 690)])).toBe('a') // an hourly rate isn't cheaper than a monthly one
    expect(cheapestOption([o('a', 350), o('b', null)])).toBeNull() // only one to compare
    expect(cheapestOption([o('a', 240), o('b', 240), o('c', 300)])).toBeNull() // a tie
    expect(cheapestOption([])).toBeNull()
  })
})
