import { afterEach, describe, expect, it } from 'vitest'
import { currencySymbol, formatMoney, formatNumber, setCurrency, setNumberFormat } from './time'

describe('number format', () => {
  afterEach(() => { setNumberFormat('comma'); setCurrency('EUR') })

  it('uses the Spanish decimal comma by default', () => {
    expect(formatMoney(1234.5)).toBe('1.234,50 €')
    expect(formatNumber(8.75)).toBe('8,75')
    expect(formatNumber(1500)).toBe('1.500')
  })

  it('switches to a decimal point when the person chooses it', () => {
    setNumberFormat('point')
    expect(formatMoney(1234.5)).toBe('€1,234.50')
    expect(formatNumber(12345.678)).toBe('12,345.68')
  })
  it('shows money in the business\'s currency, euro by default', () => {
    expect(currencySymbol()).toBe('€')
    setCurrency('GBP')
    expect(formatMoney(8.8)).toBe('8,80\u00a0£')
    setNumberFormat('point')
    expect(formatMoney(8.8)).toBe('£8.80')
    expect(currencySymbol()).toBe('£')
    setCurrency('nonsense')
    expect(formatMoney(8.8)).toBe('€8.80')
  })
})
