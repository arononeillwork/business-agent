// The decimal mark someone has before choosing one on Appearance follows their business's country: Ireland's
// point (and comma thousands), Spain's comma (and point thousands), as before. A choice wins in either.
import { afterEach, describe, expect, it } from 'vitest'
import { defaultNumberFormat, formatMoney, formatNumber, setNumberFormat } from './time'

afterEach(() => setNumberFormat('comma'))

describe('numbers before anyone chooses', () => {
  it('in Ireland: €15.00, 1,350, a decimal point and comma thousands', () => {
    setNumberFormat(undefined, 'IE')
    expect(formatMoney(15)).toBe('€15.00')
    expect(formatMoney(-1234.5)).toBe('-€1,234.50')
    expect(formatNumber(1350)).toBe('1,350')
    expect(formatNumber(8.75)).toBe('8.75')
  })

  it('in Spain, and before a business loads: Spain’s decimal comma, as before', () => {
    setNumberFormat(undefined, 'ES')
    expect(formatMoney(15)).toBe('€15,00')
    expect(formatNumber(1350)).toBe('1.350')
    setNumberFormat('point')
    setNumberFormat()
    expect(formatMoney(1234.5)).toBe('€1.234,50')
    expect(defaultNumberFormat(null)).toBe('comma')
    expect(defaultNumberFormat('ES')).toBe('comma')
    expect(defaultNumberFormat('IE')).toBe('point')
  })

  it('a choice on Appearance wins, in either country', () => {
    setNumberFormat('comma', 'IE')
    expect(formatMoney(1234.5)).toBe('€1.234,50')
    setNumberFormat('point', 'ES')
    expect(formatMoney(1234.5)).toBe('€1,234.50')
  })
})
