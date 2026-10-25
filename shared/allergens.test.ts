import { describe, expect, it } from 'vitest'
import {
  ALLERGENS, OTHER_ALLERGENS, asked, bestServing, dietsFor, dishAllergens, suitability, tagsOf, variantChanges, type AllergenDish, type ItemAllergens,
} from './allergens'

const items: ItemAllergens[] = [
  { id: 'beans', name: 'Espresso beans', allergens: [], may_contain: [], diet: 'vegan' },
  { id: 'milk', name: 'Whole milk', allergens: ['milk'], may_contain: [], diet: 'vegetarian' },
  { id: 'oat', name: 'Oat milk', allergens: ['gluten'], may_contain: [], diet: 'vegan' },
  { id: 'croissant', name: 'Croissant', allergens: ['milk', 'gluten', 'eggs'], may_contain: ['nuts', 'milk'], diet: null },
  { id: 'chai', name: 'Chai concentrate', allergens: null, may_contain: [], diet: null },
  { id: 'ham', name: 'Ham', allergens: [], may_contain: [], diet: 'neither' },
  { id: 'tuna', name: 'Tuna', allergens: ['fish'], may_contain: [], diet: null },
]
const line = (item_id: string, variant_id: string | null = null, replaces_item_id: string | null = null) =>
  ({ item_id, quantity: 1, unit: 'unit' as const, variant_id, replaces_item_id })
const flatWhite: AllergenDish = { id: 'fw', name: 'Flat white', category: 'Coffee', variants: [{ id: 'v-oat', name: 'Oat milk', price_change: 0 }, { id: 'v-shot', name: 'Extra shot', price_change: 0 }],
  lines: [line('beans'), line('milk'), line('oat', 'v-oat', 'milk'), line('beans', 'v-shot')] }
const dish = (...ids: string[]) => dishAllergens({ lines: ids.map(id => line(id)) }, items)

describe('allergens', () => {
  it('the EU’s 14, each once', () => {
    expect(ALLERGENS).toHaveLength(14)
    expect(new Set(ALLERGENS.map(a => a.id)).size).toBe(14)
  })

  it('a dish has what its items have, in the law’s order; a trace of something it contains isn’t a trace', () => {
    expect(dish('croissant')).toMatchObject({ contains: ['gluten', 'eggs', 'milk'], mayContain: ['nuts'], unknown: [], empty: false })
    expect(dish('chai', 'milk')).toMatchObject({ contains: ['milk'], mayContain: [], unknown: ['Chai concentrate'] })
  })

  it('a variant swaps or adds items: oat milk brings gluten and takes the milk away', () => {
    expect(dishAllergens(flatWhite, items, 'v-oat').contains).toEqual(['gluten'])
    expect(variantChanges(flatWhite, items)).toEqual([{ id: 'v-oat', name: 'Oat milk', adds: ['gluten'], removes: ['milk'] }])
  })

  it('for someone avoiding some: contains, not known yet, may contain, or safe', () => {
    const croissant = dish('croissant')
    expect(suitability(croissant, ['eggs'])).toBe('contains')
    expect(suitability(croissant, ['nuts'])).toBe('may')
    expect(suitability(croissant, ['fish'])).toBe('safe')
    expect(suitability(dish('chai'), ['milk'])).toBe('unknown')
  })

  it('a dish with nothing in it yet isn’t known to suit anyone', () => {
    const empty = dish()
    expect(empty).toMatchObject({ empty: true, vegan: null, vegetarian: null })
    expect(suitability(empty, ['gluten'])).toBe('unknown')
    expect(tagsOf(empty)).toEqual([])
  })
})

describe('vegan and vegetarian', () => {
  it('an item’s allergens limit what it can be: milk or eggs aren’t vegan, fish isn’t vegetarian', () => {
    expect(dietsFor([])).toEqual(['vegan', 'vegetarian', 'neither'])
    expect(dietsFor(null)).toEqual(['vegan', 'vegetarian', 'neither'])
    expect(dietsFor(['gluten', 'eggs'])).toEqual(['vegetarian', 'neither'])
    expect(dietsFor(['milk', 'crustaceans'])).toEqual(['neither'])
  })

  it('a dish is vegan when every item is, vegetarian when every item is at least that', () => {
    expect(dish('beans', 'oat')).toMatchObject({ vegan: true, vegetarian: true })
    expect(dish('beans', 'milk')).toMatchObject({ vegan: false, vegetarian: true })
    expect(dish('beans', 'ham')).toMatchObject({ vegan: false, vegetarian: false })
  })

  it('not said yet is not known, unless what it contains already rules it out', () => {
    expect(dish('beans', 'chai')).toMatchObject({ vegan: null, vegetarian: null })
    expect(dish('croissant')).toMatchObject({ vegan: false, vegetarian: null })
    expect(dish('tuna')).toMatchObject({ vegan: false, vegetarian: false })
  })

  it('a variant can make it vegan: the flat white with oat milk', () => {
    expect(dishAllergens(flatWhite, items)).toMatchObject({ vegan: false, vegetarian: true })
    expect(dishAllergens(flatWhite, items, 'v-oat')).toMatchObject({ vegan: true, vegetarian: true })
  })
})

describe('the menu’s filters', () => {
  it('each filter asks for allergens to avoid or a diet; the rest of the 14 are picked one by one', () => {
    expect(asked(['dairy_free', 'nut_free', 'vegan'])).toEqual({ avoid: ['peanuts', 'milk', 'nuts'], diets: ['vegan'] })
    expect(asked([], ['sesame'])).toEqual({ avoid: ['sesame'], diets: [] })
    expect(OTHER_ALLERGENS.map(a => a.id)).toEqual(['crustaceans', 'fish', 'soy', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'])
  })

  it('a dish’s tags are the filters it meets; vegetarian goes without saying when it’s vegan', () => {
    expect(tagsOf(dish('beans'))).toEqual(['gluten_free', 'dairy_free', 'vegan', 'nut_free', 'egg_free'])
    expect(tagsOf(dish('beans', 'milk'))).toEqual(['gluten_free', 'vegetarian', 'nut_free', 'egg_free'])
    expect(tagsOf(dish('croissant'))).toEqual([]) // may contain nuts: not nut free
  })

  it('an item’s allergens not known don’t stop a diet it’s known to keep', () => {
    const chaiVegan = dishAllergens({ lines: [line('chai')] }, [{ ...items[4], diet: 'vegan' }])
    expect(suitability(chaiVegan, [], ['vegan'])).toBe('safe')
    expect(suitability(chaiVegan, ['milk'], ['vegan'])).toBe('unknown')
  })

  it('a dish suits them as it is, or with the variant that does', () => {
    expect(bestServing(flatWhite, items, ['milk'])).toEqual({ suits: 'safe', variant: 'Oat milk' })
    expect(bestServing(flatWhite, items, [], ['vegan'])).toEqual({ suits: 'safe', variant: 'Oat milk' })
    expect(bestServing(flatWhite, items, ['gluten'])).toEqual({ suits: 'safe', variant: null })
    expect(bestServing(flatWhite, items, ['milk', 'gluten'])).toEqual({ suits: 'contains', variant: null })
  })
})
