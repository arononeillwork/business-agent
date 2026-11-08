import { describe, expect, it } from 'vitest'
import { DEFAULT_TAX_SETTINGS, filingsFor, overdue, upcoming, type TaxSettings } from './tax'
import { FORM11_ROS_DATES, filingsIn, irishFilingsFor, irishModelLabel } from './taxIreland'

const s = (patch: Partial<TaxSettings> = {}): TaxSettings => ({ ...DEFAULT_TAX_SETTINGS, ...patch })
const due = (model: string, period: string, settings = s()) => irishFilingsFor(2026, settings).find(f => f.model === model && f.period === period)?.due

describe('the tax calendar in Ireland', () => {
  it('a VAT3 every two months, by the 23rd of the month after, and the RTD with the year’s last one', () => {
    expect(['1B', '2B', '3B', '4B', '5B', '6B'].map(p => due('VAT3', p))).toEqual(
      ['2026-03-23', '2026-05-23', '2026-07-23', '2026-09-23', '2026-11-23', '2027-01-23'])
    expect(due('RTD', '0A')).toBe('2027-01-23')
  })

  it('Revenue’s 23rd isn’t moved for a weekend', () => {
    expect(due('VAT3', '6B')).toBe('2027-01-23') // a Saturday
    expect(due('PAYE', '4M')).toBe('2026-05-23') // a Saturday
  })

  it('payroll each month, by the 23rd of the next, when there are staff', () => {
    expect(due('PAYE', '1M')).toBe('2026-02-23')
    expect(due('PAYE', '12M')).toBe('2027-01-23')
    expect(irishFilingsFor(2026, s()).filter(f => f.model === 'PAYE')).toHaveLength(12)
    expect(irishFilingsFor(2026, s({ withholding: false })).some(f => f.model === 'PAYE')).toBe(false)
  })

  it('a company: the CT1 nine months after the year end, and preliminary tax in the 11th month when it pays it', () => {
    expect(due('CT1', '0A')).toBe('2027-09-23')
    expect(due('CT1', '1P')).toBeUndefined()
    expect(due('CT1', '1P', s({ instalments: true }))).toBe('2026-11-23')
    expect(due('F11', '0A')).toBeUndefined()
  })

  it('a sole trader: Form 11 by 31 October, and no Corporation Tax', () => {
    const list = irishFilingsFor(2026, s({ sole_trader: true, instalments: true }))
    expect(list.find(f => f.model === 'F11')?.due).toBe('2027-10-31')
    expect(list.find(f => f.model === 'F11')?.what).toMatch(/once Revenue sets the date/)
    expect(list.some(f => f.model === 'CT1')).toBe(false)
    expect(irishModelLabel('F11')).toBe('Form 11')
  })

  it('Form 11 on ROS: Revenue’s own later date once it’s announced (Wednesday 18 November 2026 for 2025’s)', () => {
    const f11 = (year: number) => irishFilingsFor(year, s({ sole_trader: true })).find(f => f.model === 'F11')!
    expect(f11(2025).due).toBe('2026-11-18')
    expect(f11(2025).what).toMatch(/Revenue’s later date shown here/)
    expect(f11(2024).due).toBe('2025-11-19')
    expect(FORM11_ROS_DATES[2026]).toBeUndefined()
  })

  it('preliminary tax: 90% of this year’s or 100% of last year’s, none in a small new company’s first year', () => {
    const prelim = irishFilingsFor(2026, s({ instalments: true })).find(f => f.model === 'CT1' && f.period === '1P')!
    expect(prelim.what).toMatch(/90% of this year’s tax, or 100% of last year’s/)
    expect(prelim.what).toMatch(/under €200,000 pays none that year/)
  })

  it('EU sales: a VIES listing each quarter', () => {
    expect(due('VIES', '1T')).toBeUndefined()
    expect(['1T', '2T', '3T', '4T'].map(p => due('VIES', p, s({ intra_eu: true })))).toEqual(['2026-04-23', '2026-07-23', '2026-10-23', '2027-01-23'])
    // Monthly once goods sold pass €50,000 a quarter (the VIES Traders Manual, 3.5), linked from the row.
    const vies = irishFilingsFor(2026, s({ intra_eu: true })).find(f => f.model === 'VIES')!
    expect(vies.what).toMatch(/€50,000 a quarter/)
    expect(vies.source).toMatch(/vies-traders-manual\.pdf$/)
  })

  it('soonest first, each with Revenue’s page, and what’s coming and overdue work as in Spain', () => {
    const list = irishFilingsFor(2026, s({ withholding: false }))
    expect(list.map(f => `${f.model} ${f.period}`)).toEqual(['VAT3 1B', 'VAT3 2B', 'VAT3 3B', 'VAT3 4B', 'VAT3 5B', 'RTD 0A', 'VAT3 6B', 'CT1 0A'])
    expect(list.every(f => f.source?.startsWith('https://www.revenue.ie/'))).toBe(true)
    const filed = [{ model: 'VAT3', year: 2026, period: '4B' as const, status: 'filed' as const, amount: 900, filed_on: '2026-09-20', reference: null, notes: null }]
    expect(upcoming(list, filed, '2026-11-07')[0]).toMatchObject({ model: 'VAT3', period: '5B', due: '2026-11-23' })
    expect(overdue(list, filed, '2026-11-07').map(f => f.period)).toEqual(['1B', '2B', '3B'])
  })

  it('Spain keeps its own modelos', () => {
    expect(filingsIn('ES', 2026, s())).toEqual(filingsFor(2026, s()))
    expect(filingsIn('IE', 2026, s()).some(f => f.model === '303')).toBe(false)
  })
})
