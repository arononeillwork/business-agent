import { afterEach, describe, expect, it } from 'vitest'
import { formatMoney, formatNumber, setNumberFormat } from './time'

describe('number format', () => {
  afterEach(() => setNumberFormat('comma'))

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
})
