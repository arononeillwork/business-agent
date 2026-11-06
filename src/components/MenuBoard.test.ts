import { describe, expect, it } from 'vitest'
import { boardBrand, boardLogo } from './MenuBoard'

describe('the logo at the top of a menu board', () => {
  it('is the business’s own when it has one', () => {
    expect(boardLogo(boardBrand('Café Lola', { logo: 'data:image/png;base64,LOLA' }, 7))).toBe('data:image/png;base64,LOLA')
    expect(boardLogo(boardBrand('Easy Beans Coffee', { logo: 'data:image/png;base64,EB' }, 1))).toBe('data:image/png;base64,EB')
  })

  it('without one, Easy Beans’ bundled logo for Easy Beans only: another business shows none', () => {
    expect(boardLogo(boardBrand('Easy Beans Coffee', { logo: null }, 1))).toMatch(/easy-beans-logo/)
    expect(boardLogo(boardBrand('Easy Beans Coffee', null, undefined))).toMatch(/easy-beans-logo/) // the demo, whose business is Easy Beans
    expect(boardLogo(boardBrand('Café Lola', { logo: null }, 7))).toBeNull()
    expect(boardLogo(boardBrand('The Business Agent HQ', null, 3))).toBeNull()
  })
})
