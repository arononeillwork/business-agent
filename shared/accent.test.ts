// A business's own main colour as the app's accent: every shade readable where it's used, in light
// and dark mode, and Easy Beans' rose pink still giving Easy Beans its own look.
import { describe, expect, it } from 'vitest'
import { accentFor, contrast, mainColour } from './accent'

const LIGHT_BG = '#F8F4EF', DARK_SURFACE = '#1A1620', DARK_BG = '#110E15'

describe('the accent from a business’s main colour', () => {
  it('keeps the colour itself, with a deep step readable as text on the page', () => {
    for (const main of ['#F79BA4', '#2F5D50', '#1F3A5F', '#D4A017', '#FFFF00', '#111111']) {
      const a = accentFor(main, 'light')
      expect(a.rose).toBe(main.toUpperCase())
      expect(contrast(a.roseDeep, LIGHT_BG), main).toBeGreaterThanOrEqual(4.5)
      // Button text on the colour reads too, whichever of ink and white is better.
      expect(contrast(a.onRose, a.rose), main).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('lifts a dark colour in dark mode, so it shows on the dark background', () => {
    const a = accentFor('#111111', 'dark')
    expect(contrast(a.rose, DARK_BG)).toBeGreaterThanOrEqual(3)
    expect(contrast(a.roseDeep, DARK_SURFACE)).toBeGreaterThanOrEqual(4.5)
    // A light colour stays as it is.
    expect(accentFor('#F79BA4', 'dark').rose).toBe('#F79BA4')
  })

  it('takes the Brand page’s primary colour, else its first, else none', () => {
    expect(mainColour([{ hex: '#C6C2BB', role: 'secondary' }, { hex: '#2f5d50', role: 'primary' }])).toBe('#2F5D50')
    expect(mainColour([{ hex: '#C6C2BB', role: 'secondary' }])).toBe('#C6C2BB')
    expect(mainColour([{ hex: 'pink', role: 'primary' }])).toBeNull()
    expect(mainColour([])).toBeNull()
    expect(mainColour(null)).toBeNull()
  })
})
