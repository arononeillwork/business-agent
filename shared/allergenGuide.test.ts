import { describe, expect, it } from 'vitest'
import { ALLERGEN_RULES, isFoodItem, suggestAllergens } from './allergenGuide'
import { dietsFor } from './allergens'

const item = (name: string, category: string | null = null) => ({ name, category })

describe('usual allergens from an item’s name', () => {
  it('never suggests a diet its allergens rule out', () => {
    for (const r of ALLERGEN_RULES) expect(dietsFor(r.contains), r.usually).toContain(r.diet)
  })

  it('knows a café’s usual stock, in English and Spanish', () => {
    const got = (name: string, category?: string) => {
      const s = suggestAllergens(item(name, category))
      return s && [s.contains, s.diet]
    }
    expect(got('Oat milk (barista)')).toEqual([['gluten'], 'vegan'])
    expect(got('Bebida de avena sin gluten')).toEqual([[], 'vegan'])
    expect(got('Almond milk')).toEqual([['nuts'], 'vegan'])
    expect(got('Leche de soja')).toEqual([['soy'], 'vegan'])
    expect(got('Coconut milk')).toEqual([[], 'vegan'])
    expect(got('Whole milk')).toEqual([['milk'], 'vegetarian'])
    expect(got('Leche entera')).toEqual([['milk'], 'vegetarian'])
    expect(got('Butter croissants')).toEqual([['eggs', 'gluten', 'milk'], 'vegetarian'])
    expect(got('Almonds Croissant')).toEqual([['eggs', 'gluten', 'milk', 'nuts'], 'vegetarian'])
    expect(got('Pistache Croissant')).toEqual([['eggs', 'gluten', 'milk', 'nuts'], 'vegetarian'])
    expect(got('Pain au chocolat')).toEqual([['eggs', 'gluten', 'milk', 'soy'], 'vegetarian'])
    expect(got('Peanut butter')).toEqual([['peanuts'], 'vegan'])
    expect(got('Pavlova')).toEqual([['eggs', 'milk'], 'vegetarian'])
    expect(got('Lemon Tart')).toEqual([['eggs', 'gluten', 'milk'], 'vegetarian'])
    expect(got('Sourdough loaf')).toEqual([['gluten'], 'vegan'])
    expect(got('Acai')).toEqual([[], 'vegan'])
    expect(got('Açaí pulp')).toEqual([[], 'vegan'])
    expect(got('Ceremonial matcha')).toEqual([[], 'vegan'])
    expect(got('House espresso blend')).toEqual([[], 'vegan'])
    expect(got('Vanilla syrup')).toEqual([[], 'vegan'])
    expect(got('Chai concentrate')).toEqual([[], 'vegetarian'])
    expect(got('Smoked salmon')).toEqual([['fish'], 'neither'])
    expect(got('Jamón serrano')).toEqual([[], 'neither'])
    expect(got('Hummus')).toEqual([['sesame'], 'vegan'])
    expect(got('Nuez moscada')).toEqual([[], 'vegan'])
    expect(got('Walnuts')).toEqual([['nuts'], 'vegan'])
    expect(got('Granola')).toEqual([['gluten'], 'vegetarian'])
    expect(got('Strawberries')).toEqual([[], 'vegan'])
    expect(got('Easy Beans house blend 250 g', 'Shop')).toEqual([[], 'vegan'])
  })

  it('leaves out what isn’t eaten, and what it can’t tell', () => {
    expect(isFoodItem(item('Cups 8 oz', 'Packaging'))).toBe(false)
    expect(isFoodItem(item('Napkins'))).toBe(false)
    expect(isFoodItem(item('Easy Beans tote bag', 'Shop'))).toBe(false)
    expect(isFoodItem(item('Tea bags'))).toBe(true)
    expect(suggestAllergens(item('Lids 8 oz'))).toBeNull()
    expect(suggestAllergens(item('Mystery box'))).toBeNull()
  })

  it('keeps traces apart from what it contains', () => {
    const s = suggestAllergens(item('Butter croissants'))!
    expect(s.may).toEqual(['nuts', 'sesame', 'soy'])
    expect(s.may.some(a => s.contains.includes(a))).toBe(false)
  })
})
