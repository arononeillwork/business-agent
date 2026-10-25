import { describe, expect, it } from 'vitest'
import { ALLERGENS, dishAllergens, suitability, variantChanges, type AllergenDish, type ItemAllergens } from './allergens'

const items: ItemAllergens[] = [
  { id: 'beans', name: 'Espresso beans', allergens: [], may_contain: [] },
  { id: 'milk', name: 'Whole milk', allergens: ['milk'], may_contain: [] },
  { id: 'oat', name: 'Oat milk', allergens: ['gluten'], may_contain: [] },
  { id: 'croissant', name: 'Croissant', allergens: ['milk', 'gluten', 'eggs'], may_contain: ['nuts', 'milk'] },
  { id: 'chai', name: 'Chai concentrate', allergens: null, may_contain: [] },
]
const line = (item_id: string, variant_id: string | null = null, replaces_item_id: string | null = null) =>
  ({ item_id, quantity: 1, unit: 'unit' as const, variant_id, replaces_item_id })
const flatWhite: AllergenDish = { id: 'fw', name: 'Flat white', category: 'Coffee', variants: [{ id: 'v-oat', name: 'Oat milk', price_change: 0 }, { id: 'v-shot', name: 'Extra shot', price_change: 0 }],
  lines: [line('beans'), line('milk'), line('oat', 'v-oat', 'milk'), line('beans', 'v-shot')] }

describe('allergens', () => {
  it('the EU’s 14, each once', () => {
    expect(ALLERGENS).toHaveLength(14)
    expect(new Set(ALLERGENS.map(a => a.id)).size).toBe(14)
  })

  it('a dish has what its items have, in the law’s order; a trace of something it contains isn’t a trace', () => {
    const croissant = dishAllergens({ lines: [line('croissant')] }, items)
    expect(croissant).toEqual({ contains: ['gluten', 'eggs', 'milk'], mayContain: ['nuts'], unknown: [] })
    expect(dishAllergens({ lines: [line('chai'), line('milk')] }, items)).toEqual({ contains: ['milk'], mayContain: [], unknown: ['Chai concentrate'] })
  })

  it('a variant swaps or adds items: oat milk brings gluten and takes the milk away', () => {
    expect(dishAllergens(flatWhite, items, 'v-oat').contains).toEqual(['gluten'])
    expect(variantChanges(flatWhite, items)).toEqual([{ id: 'v-oat', name: 'Oat milk', adds: ['gluten'], removes: ['milk'] }])
  })

  it('for someone avoiding some: contains, not known yet, may contain, or safe', () => {
    const croissant = dishAllergens({ lines: [line('croissant')] }, items)
    expect(suitability(croissant, ['eggs'])).toBe('contains')
    expect(suitability(croissant, ['nuts'])).toBe('may')
    expect(suitability(croissant, ['fish'])).toBe('safe')
    expect(suitability(dishAllergens({ lines: [line('chai')] }, items), ['milk'])).toBe('unknown')
  })
})
