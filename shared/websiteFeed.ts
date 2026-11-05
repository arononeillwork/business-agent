// The menu a business's own website reads from the app (GET /api/site/<business>/menu, worker/site.ts):
// the menu as customers see it, so the website lists what the Menu page lists, at the Menu page's
// prices, the way Google Maps, the screens and the printed menus already do. One place to change it.
//
// This is a contract with websites outside the app (Easy Beans' first; any business's later), so its
// shape only grows: fields are added, never renamed or removed, and `version` changes if one ever must.
// Customer-facing only: no costs, margins, recipes or suppliers. docs/WEBSITE.md says how a website uses it.
import { dishAllergens, type Allergen, type MenuAllergens } from './allergens'
import { menuSections, type MenuItem } from './menu'
import { EXTRAS_SECTION } from './menuSquare'

export interface SiteMenuFeed {
  version: 1
  business: { id: number; name: string; currency: string }
  /** Where the menu comes from on the Menu page: kept in the app (custom) or read from Square. */
  source: 'custom' | 'square'
  /** When it was last read from Square (source square); null otherwise. */
  synced_at: string | null
  /** When this answer was made. */
  generated_at: string
  /** The sections in the menu's order, each with its items in their order. Only what's on the menu. */
  sections: SiteMenuSection[]
}

export interface SiteMenuSection {
  /** The section's name as the Menu page shows it; null for items in no section. */
  name: string | null
  /** The extras read from Square's modifier lists (Milk, Syrup, Extra shot): ways to change an item, not items to order. */
  extras: boolean
  items: SiteMenuItem[]
}

export interface SiteMenuItem {
  /** The app's id for the item: stays the same while the item exists. */
  id: string
  name: string
  description: string | null
  photo_url: string | null
  /** Picked out on the menus (a house favourite). */
  featured: boolean
  /** The price, tax included, in the business's currency; null: not priced yet. */
  price: number | null
  /** What `price` is for when it's sold more than one way ("Hot", with "Iced" a variant); null: just its price. */
  price_label: string | null
  /** The other ways it's sold, each with its whole price (not the difference). */
  variants: { name: string; price: number | null }[]
  /** Its Square item (or modifier list) when the menu is read from Square: a website that takes orders through Square joins on it. */
  square_id: string | null
  /** What it contains, from what goes into it on Menu costing; null until all of that is known (never a guess). */
  allergens: { contains: Allergen[]; may_contain: Allergen[]; vegan: boolean | null; vegetarian: boolean | null } | null
}

const money = (n: number) => Math.round(n * 100) / 100

/** An item's allergens as the website may show them: only when everything in it is known. */
function allergensOf(id: string, known: MenuAllergens | null): SiteMenuItem['allergens'] {
  const dish = known?.dishes.find(d => d.id === id)
  if (!dish || !known) return null
  const a = dishAllergens(dish, known.items)
  if (a.empty || a.unknown.length) return null
  return { contains: a.contains, may_contain: a.mayContain, vegan: a.vegan, vegetarian: a.vegetarian }
}

/** The menu for the website, from the menu's items (menu_list()), its section order and its allergens. */
export function siteMenu({ business, items, order, source, syncedAt, allergens, now = new Date() }: {
  business: { id: number; name: string; currency: string | null }
  items: MenuItem[]
  order: readonly string[]
  source: 'custom' | 'square' | null
  syncedAt: string | null
  allergens: MenuAllergens | null
  now?: Date
}): SiteMenuFeed {
  const from = source === 'square' ? 'square' : 'custom'
  return {
    version: 1,
    business: { id: business.id, name: business.name, currency: business.currency || 'EUR' },
    source: from,
    synced_at: from === 'square' ? syncedAt : null,
    generated_at: now.toISOString(),
    sections: menuSections(items, { order }).map(s => ({
      name: s.category,
      extras: from === 'square' && s.category === EXTRAS_SECTION,
      items: s.items.map(i => ({
        id: i.id,
        name: i.name,
        description: i.description,
        photo_url: i.photo_url,
        featured: i.featured,
        price: i.sell_price === null ? null : money(Number(i.sell_price)),
        price_label: i.price_label,
        variants: i.variants.map(v => ({ name: v.name, price: i.sell_price === null ? null : money(Number(i.sell_price) + Number(v.price_change)) })),
        square_id: i.square_id,
        allergens: allergensOf(i.id, allergens),
      })),
    })),
  }
}
