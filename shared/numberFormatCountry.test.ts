// The decimal mark someone has before choosing one on Appearance follows their business's country: Ireland's
// point (and comma thousands), Spain's comma (and point thousands), as before. A choice wins in either.
import { afterEach, describe, expect, it } from 'vitest'
import { currentNumberFormat, defaultNumberFormat, formatMoney, formatNumber, formatNumberAs, moneyText, numberFormatOf, setNumberFormat } from './time'

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

describe('numbers written for someone away from the screen (the Worker’s messages)', () => {
  it('their own choice, else their business’s country’s', () => {
    expect(numberFormatOf(undefined, 'IE')).toBe('point')
    expect(numberFormatOf(null, 'ES')).toBe('comma')
    expect(numberFormatOf('comma', 'IE')).toBe('comma')
    expect(numberFormatOf('point', 'ES')).toBe('point')
  })

  it('in a given style, whatever the screen shows: Ireland’s €15.00, Spain’s 15,00 €', () => {
    setNumberFormat('comma')
    expect(moneyText(15, 'point')).toBe('€15.00')
    expect(moneyText(-1234.5, 'point')).toBe('-€1,234.50')
    expect(moneyText(15, 'comma')).toBe('15,00 €')
    expect(moneyText(1234.5, 'comma')).toBe('1.234,50 €')
    expect(moneyText(45, 'comma', { whole: true })).toBe('45 €')
    expect(moneyText(12.5, 'point', { whole: true })).toBe('€12.50')
    expect(formatNumberAs(8.4, 'point')).toBe('8.4')
    expect(formatNumberAs(8.4, 'comma')).toBe('8,4')
    expect(formatNumberAs(12.5, 'comma', 2)).toBe('12,50')
    expect(formatNumberAs(1350, 'point')).toBe('1,350')
    // What's on screen stays as it was.
    expect(formatMoney(15)).toBe('€15,00')
    expect(currentNumberFormat()).toBe('comma')
  })
})
