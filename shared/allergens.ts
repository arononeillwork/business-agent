// Allergens: the 14 the EU says food businesses must tell customers about (Regulation 1169/2011,
// Annex II), for everything on the menu, also when it isn't packaged. Each stock item records what
// it contains and may contain (traces); a dish has what its items have (Menu costing says what goes
// in it), and a variant adds what it brings (oat milk, a gluten-free bun).
import { msg } from './i18n'
import { linesFor, type Recipe } from './recipes'

export type Allergen = 'gluten' | 'crustaceans' | 'eggs' | 'fish' | 'peanuts' | 'soy' | 'milk' | 'nuts' | 'celery' | 'mustard' | 'sesame'
  | 'sulphites' | 'lupin' | 'molluscs'

export const ALLERGENS: { id: Allergen; label: string; hint: string }[] = [
  { id: 'gluten', label: msg('Gluten'), hint: msg('Wheat, rye, barley, oats, spelt (most bread, cakes, oat milk unless gluten-free)') },
  { id: 'crustaceans', label: msg('Crustaceans'), hint: msg('Prawns, crab, lobster') },
  { id: 'eggs', label: msg('Eggs'), hint: msg('Also in mayonnaise, many cakes and some glazes') },
  { id: 'fish', label: msg('Fish'), hint: msg('Also in some sauces and dressings') },
  { id: 'peanuts', label: msg('Peanuts'), hint: msg('Also peanut oil and butter') },
  { id: 'soy', label: msg('Soy'), hint: msg('Soy milk, tofu, soy sauce, lecithin in chocolate') },
  { id: 'milk', label: msg('Milk'), hint: msg('Cow’s, goat’s and sheep’s milk and anything made from it (butter, cheese, cream)') },
  { id: 'nuts', label: msg('Nuts'), hint: msg('Almonds, hazelnuts, walnuts, cashews, pecans, pistachios, macadamias (almond milk, praline)') },
  { id: 'celery', label: msg('Celery'), hint: msg('Also celeriac, and in stock and soups') },
  { id: 'mustard', label: msg('Mustard'), hint: msg('Also in dressings and sauces') },
  { id: 'sesame', label: msg('Sesame'), hint: msg('Seeds, tahini, sesame oil') },
  { id: 'sulphites', label: msg('Sulphites'), hint: msg('Over 10 mg/kg: wine, dried fruit, some syrups') },
  { id: 'lupin', label: msg('Lupin'), hint: msg('Lupin flour in some breads and pastries') },
  { id: 'molluscs', label: msg('Molluscs'), hint: msg('Mussels, clams, squid, octopus') },
]
export const allergenLabel = (a: Allergen) => ALLERGENS.find(x => x.id === a)!.label
export const isAllergen = (a: unknown): a is Allergen => ALLERGENS.some(x => x.id === a)

/** What one stock item has. `allergens` null: nobody has said yet (not the same as none). */
export interface ItemAllergens { id: string; name: string; allergens: Allergen[] | null; may_contain: Allergen[] }

/** A menu item with what goes in it (no costs: everyone on the team reads this). */
export interface AllergenDish extends Pick<Recipe, 'id' | 'name' | 'category' | 'variants' | 'lines'> {}

/** The menu's allergens: the dishes and the stock items in them. */
export interface MenuAllergens { dishes: AllergenDish[]; items: ItemAllergens[] }

export interface DishAllergens {
  contains: Allergen[]
  /** Traces only (not already in `contains`). */
  mayContain: Allergen[]
  /** Items in it whose allergens nobody has entered yet. */
  unknown: string[]
}

const ordered = (s: Set<Allergen>) => ALLERGENS.map(a => a.id).filter(a => s.has(a))

/** What a dish (or one of its variants) contains and may contain, from its items. */
export function dishAllergens(dish: Pick<AllergenDish, 'lines'>, items: ItemAllergens[], variantId: string | null = null): DishAllergens {
  const contains = new Set<Allergen>(), may = new Set<Allergen>(), unknown: string[] = []
  const byId = new Map(items.map(i => [i.id, i]))
  for (const line of linesFor(dish, variantId)) {
    const item = byId.get(line.item_id)
    if (!item) continue
    if (item.allergens === null) { if (!unknown.includes(item.name)) unknown.push(item.name) } else item.allergens.forEach(a => contains.add(a))
    item.may_contain.forEach(a => may.add(a))
  }
  return { contains: ordered(contains), mayContain: ordered(new Set([...may].filter(a => !contains.has(a)))), unknown }
}

/** What each variant adds to the dish itself (oat milk: gluten), leaving out variants that add nothing. */
export function variantChanges(dish: AllergenDish, items: ItemAllergens[]): { id: string; name: string; adds: Allergen[]; removes: Allergen[] }[] {
  const base = dishAllergens(dish, items)
  return dish.variants.map(v => {
    const own = dishAllergens(dish, items, v.id)
    return { id: v.id, name: v.name, adds: own.contains.filter(a => !base.contains.includes(a)), removes: base.contains.filter(a => !own.contains.includes(a)) }
  }).filter(v => v.adds.length || v.removes.length)
}

export type Suitability = 'safe' | 'may' | 'contains' | 'unknown'

/** Can someone avoiding these have it: safe, may contain traces, contains them, or not known yet. */
export function suitability(d: DishAllergens, avoid: Allergen[]): Suitability {
  if (avoid.some(a => d.contains.includes(a))) return 'contains'
  if (d.unknown.length) return 'unknown'
  if (avoid.some(a => d.mayContain.includes(a))) return 'may'
  return 'safe'
}
