// Allergens: the 14 the EU says food businesses must tell customers about (Regulation 1169/2011,
// Annex II), for everything on the menu, also when it isn't packaged. Each stock item records what
// it contains and may contain (traces); a dish has what its items have (Menu costing says what goes
// in it), and a variant adds what it brings (oat milk, a gluten-free bun). Each item also says whether
// it's vegan or vegetarian, which the 14 can't tell, so the menu can be filtered by diet as well.
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

/** An item for diets: vegan (nothing from animals), vegetarian (milk, eggs or honey; no meat or fish) or neither. */
export type Diet = 'vegan' | 'vegetarian' | 'neither'
export const DIETS: { id: Diet; label: string; hint: string }[] = [
  { id: 'vegan', label: msg('Vegan'), hint: msg('Nothing from animals (packaging counts as vegan)') },
  { id: 'vegetarian', label: msg('Vegetarian'), hint: msg('Milk, eggs or honey, but no meat or fish') },
  { id: 'neither', label: msg('Meat or fish'), hint: msg('Also gelatine, anchovies or meat stock') },
]
export const dietLabel = (d: Diet) => DIETS.find(x => x.id === d)!.label

/** The diets an item with these allergens can be: milk or eggs aren't vegan, fish or shellfish not vegetarian (stock_items_diet_fits). */
export function dietsFor(allergens: Allergen[] | null): Diet[] {
  const has = (list: Allergen[]) => !!allergens?.some(a => list.includes(a))
  return has(['fish', 'crustaceans', 'molluscs']) ? ['neither'] : has(['milk', 'eggs']) ? ['vegetarian', 'neither'] : ['vegan', 'vegetarian', 'neither']
}

/** What one stock item has. `allergens` and `diet` null: nobody has said yet (not the same as none). */
export interface ItemAllergens { id: string; name: string; allergens: Allergen[] | null; may_contain: Allergen[]; diet: Diet | null }

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
  /** Nothing in it on Menu costing yet, so nothing's known about it. */
  empty: boolean
  /** Every item in it vegan (or vegan or vegetarian); false when one isn't, null when that's not known yet. */
  vegan: boolean | null
  vegetarian: boolean | null
}

const ordered = (s: Set<Allergen>) => ALLERGENS.map(a => a.id).filter(a => s.has(a))
const RANK: Record<Diet, number> = { neither: 0, vegetarian: 1, vegan: 2 }

/** What a dish (or one of its variants) contains and may contain, from its items. */
export function dishAllergens(dish: Pick<AllergenDish, 'lines'>, items: ItemAllergens[], variantId: string | null = null): DishAllergens {
  const contains = new Set<Allergen>(), may = new Set<Allergen>(), unknown: string[] = [], used: ItemAllergens[] = []
  const byId = new Map(items.map(i => [i.id, i]))
  for (const line of linesFor(dish, variantId)) {
    const item = byId.get(line.item_id)
    if (!item) continue
    used.push(item)
    if (item.allergens === null) { if (!unknown.includes(item.name)) unknown.push(item.name) } else item.allergens.forEach(a => contains.add(a))
    item.may_contain.forEach(a => may.add(a))
  }
  // One item rules a diet out, by what it is or by what it contains (even before anyone has said what it is).
  const rulesOut = (i: ItemAllergens, d: Diet) => (i.diet !== null && RANK[i.diet] < RANK[d]) || !dietsFor(i.allergens).includes(d)
  const keeps = (d: Diet) => (used.some(i => rulesOut(i, d)) ? false : used.length && used.every(i => i.diet !== null) ? true : null)
  return {
    contains: ordered(contains), mayContain: ordered(new Set([...may].filter(a => !contains.has(a)))), unknown, empty: !used.length,
    vegan: keeps('vegan'), vegetarian: keeps('vegetarian'),
  }
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
type KeptDiet = 'vegan' | 'vegetarian'

/** Can someone avoiding these (and keeping to these diets) have it: safe, may contain traces, contains them, or not known yet. */
export function suitability(d: DishAllergens, avoid: Allergen[], diets: KeptDiet[] = []): Suitability {
  if (avoid.some(a => d.contains.includes(a)) || diets.some(x => d[x] === false)) return 'contains'
  if ((avoid.length && d.unknown.length) || d.empty || diets.some(x => d[x] === null)) return 'unknown'
  if (avoid.some(a => d.mayContain.includes(a))) return 'may'
  return 'safe'
}

/** The filters on the menu, for what customers ask most; the other allergens are picked one by one. */
export type MenuFilter = 'gluten_free' | 'dairy_free' | 'vegan' | 'vegetarian' | 'nut_free' | 'egg_free'
export const MENU_FILTERS: { id: MenuFilter; label: string; avoid: Allergen[]; diet?: KeptDiet }[] = [
  { id: 'gluten_free', label: msg('Gluten free'), avoid: ['gluten'] },
  { id: 'dairy_free', label: msg('Dairy free'), avoid: ['milk'] },
  { id: 'vegan', label: msg('Vegan'), avoid: [], diet: 'vegan' },
  { id: 'vegetarian', label: msg('Vegetarian'), avoid: [], diet: 'vegetarian' },
  { id: 'nut_free', label: msg('Nut free'), avoid: ['nuts', 'peanuts'] },
  { id: 'egg_free', label: msg('Egg free'), avoid: ['eggs'] },
]
/** The allergens no filter covers (fish, soy, sesame…), to pick on their own. */
export const OTHER_ALLERGENS = ALLERGENS.filter(a => !MENU_FILTERS.some(f => f.avoid.includes(a.id)))

/** What the filters picked ask for: the allergens to avoid and the diets to keep to. */
export function asked(filters: MenuFilter[], without: Allergen[] = []): { avoid: Allergen[]; diets: KeptDiet[] } {
  const on = MENU_FILTERS.filter(f => filters.includes(f.id))
  return { avoid: ordered(new Set([...on.flatMap(f => f.avoid), ...without])), diets: on.flatMap(f => (f.diet ? [f.diet] : [])) }
}

/** The filters a dish meets, shown as its tags (vegan, gluten free…); vegetarian goes without saying when it's vegan. */
export function tagsOf(d: DishAllergens): MenuFilter[] {
  return MENU_FILTERS.filter(f => suitability(d, f.avoid, f.diet ? [f.diet] : []) === 'safe' && !(f.id === 'vegetarian' && d.vegan)).map(f => f.id)
}

const BETTER: Suitability[] = ['contains', 'unknown', 'may', 'safe']

/** How well a dish suits someone: as it is, or with the variant that suits them better (a flat white with oat milk). */
export function bestServing(dish: AllergenDish, items: ItemAllergens[], avoid: Allergen[], diets: KeptDiet[] = []): { suits: Suitability; variant: string | null } {
  let best = { suits: suitability(dishAllergens(dish, items), avoid, diets), variant: null as string | null }
  for (const v of dish.variants) {
    const suits = suitability(dishAllergens(dish, items, v.id), avoid, diets)
    if (BETTER.indexOf(suits) > BETTER.indexOf(best.suits)) best = { suits, variant: v.name }
  }
  return best
}
