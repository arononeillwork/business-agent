// An offer's price on a screen and in what goes out to customers, by the business's country: a plain amount
// written the screen's way (Ireland's "€1.96", Spain's "€1,96"), whichever way it was saved; anything else as
// typed. And a TV, with nobody signed in, writes amounts and times the way its business's country does.
import { afterEach, describe, expect, it } from 'vitest'
import { countryMoney, priceAmount, shownPrice } from './offers'
import { playAs } from './screens'
import { TZ, formatMoney, setBusinessTimeZone, setCurrency, setNumberFormat } from './time'

afterEach(() => { setNumberFormat(); setCurrency(); setBusinessTimeZone('Europe/Madrid') })

describe('an offer’s price', () => {
  it('is a plain amount only with two decimals, either mark, the euro before or after', () => {
    expect(priceAmount('€1.96')).toBe(1.96)
    expect(priceAmount('€1,96')).toBe(1.96)
    expect(priceAmount(' 1,96 € ')).toBe(1.96)
    expect(priceAmount('€ 12.50')).toBe(12.5)
    // Anything else is shown as typed: a deal, a whole amount, a thousand the Spanish way, nothing.
    for (const typed of ['2 for €3', '20% off', '-30%', '€4', '€1.500', 'Half price', '', null]) expect(priceAmount(typed), String(typed)).toBeNull()
  })

  it('shows the screen’s way: an Irish business’s point, a Spanish one’s comma, however it was saved', () => {
    setNumberFormat(undefined, 'IE')
    expect(shownPrice('€1,96')).toBe('€1.96')
    expect(shownPrice('€1.96')).toBe('€1.96')
    expect(shownPrice('2 for €3')).toBe('2 for €3')
    setNumberFormat(undefined, 'ES')
    expect(shownPrice('€1.96')).toBe('€1,96')
    expect(shownPrice('€1,96')).toBe('€1,96')
    expect(shownPrice('-30%')).toBe('-30%')
    expect(shownPrice(null)).toBeNull()
    // Someone in Spain who chose the point sees the point.
    setNumberFormat('point', 'ES')
    expect(shownPrice('€1,96')).toBe('€1.96')
  })

  it('goes out to customers the business’s country’s way, whoever makes the story', () => {
    setNumberFormat('point', 'ES')
    expect(shownPrice('€1.96', n => countryMoney(n, 'ES'))).toBe('€1,96')
    expect(shownPrice('€1,96', n => countryMoney(n, 'IE'))).toBe('€1.96')
    expect(countryMoney(1234.5, 'IE')).toBe('€1,234.50')
    expect(countryMoney(1234.5, 'ES')).toBe('€1.234,50')
  })

  it('stays as written for a business that sells in another currency', () => {
    setCurrency('GBP')
    expect(shownPrice('€1.96')).toBe('€1.96')
  })
})

describe('a TV screen', () => {
  it('writes prices and times the way its business’s country does, with nobody signed in', () => {
    playAs({ country: 'IE', currency: 'EUR', timezone: 'Europe/Dublin' })
    expect(formatMoney(3.2)).toBe('€3.20')
    expect(TZ).toBe('Europe/Dublin')
    playAs({ country: 'ES', currency: 'EUR', timezone: 'Europe/Madrid' })
    expect(formatMoney(3.2)).toBe('€3,20')
    expect(TZ).toBe('Europe/Madrid')
    // A feed from before the country was sent: Spain's, as before.
    playAs({})
    expect(formatMoney(3.2)).toBe('€3,20')
  })
})
