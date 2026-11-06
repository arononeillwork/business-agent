// The menu read from Square's item library (when the Menu page's source is Square): each item with
// its category as the section, its variations as the ways it's sold (the first priced one is its
// price: "Hot", with "Iced" +1.00 as a variant), its description and photo; and the modifier lists the
// items use (Milk, Syrup, Extra shot) as extras in a section of their own, the way the café's printed
// menus list them. Choices without prices (how a steak is done) aren't extras. Shared by the Worker
// (which reads the catalogue) and the demo.
// And the other way (squarePriceChanges): a price changed here, as the changes to the item's
// variations in Square, read the same way round, so the next read from Square gives the same menu.

/** The parts of Square's catalogue objects that are read (GET /v2/catalog/list?types=ITEM,CATEGORY,MODIFIER_LIST,IMAGE). */
export interface SquareObject {
  type: string
  id: string
  is_deleted?: boolean
  item_data?: {
    name?: string; description?: string; description_plaintext?: string; is_archived?: boolean; image_ids?: string[]
    categories?: { id: string; ordinal?: number }[]; category_id?: string
    variations?: SquareVariation[]
    modifier_list_info?: { modifier_list_id: string; enabled?: boolean }[]
  }
  category_data?: { name?: string }
  /** Values of the seller's own custom attributes on the object, keyed by the attribute: "Shelf life" is read. */
  custom_attribute_values?: Record<string, { name?: string; type?: string; number_value?: string; string_value?: string }>
  modifier_list_data?: { name?: string; modifiers?: { modifier_data?: { name?: string; price_money?: { amount?: number }; ordinal?: number } }[] }
  image_data?: { url?: string }
}

/** An item's variation as Square gives it: what's read, and the rest kept as it is when it's sent back. */
export interface SquareVariation {
  id: string
  type?: string
  version?: number
  item_variation_data?: {
    name?: string; ordinal?: number; pricing_type?: string; price_money?: { amount?: number; currency?: string }
    location_overrides?: { location_id?: string; pricing_type?: string; price_money?: { amount?: number; currency?: string } }[]
    [more: string]: unknown
  }
  [more: string]: unknown
}

export interface SquareMenuItem {
  square_id: string
  name: string
  category: string | null
  sell_price: number | null
  price_label: string | null
  variants: { name: string; price_change: number }[]
  description: string | null
  photo_url: string | null
  /** Its place in its section, as Square lists it. */
  menu_sort: number
  /** How long it keeps once made, from the item's "Shelf life" custom attribute (hours); none without one. */
  shelf_life_hours?: number | null
}
export interface SquareMenu { items: SquareMenuItem[]; sections: string[] }

/** The section the modifier lists go in. */
export const EXTRAS_SECTION = 'Extras'
/** Variation names that only mean "the one way it's sold": not a label worth showing. */
const PLAIN = /^(regular|normal|standard|default|único|unico)$/i
/** Variations for how it's served, not what it is (eat in or take away): one price on a menu. */
const SERVICE = /^(sit[ -]?in|eat[ -]?in|take[ -]?away|to go|para llevar|en (el )?local|aqu[ií])$/i

const money = (amount: number | undefined) => (typeof amount === 'number' ? Math.round(amount) / 100 : null)
const round = (n: number) => Math.round(n * 100) / 100
const tidy = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** A custom attribute that says how long an item keeps: "Shelf life", "Shelf life (days)", "Caducidad", "Vida útil", "Keeps". */
const SHELF = /shelf[\s-]*life|\bkeeps\b|caducidad|vida\s*[úu]til|consumir\s+en/i
/** The longest shelf life the Freshly made tab takes: 30 days, in hours. */
const MAX_SHELF_HOURS = 720

/**
 * How long an item keeps, from its "Shelf life" custom attribute in Square, in hours: a number of days
 * ("5", "5 days", "5 días"), or of hours when it says so ("36 hours", "8 h", or an attribute named
 * "Shelf life (hours)"). Null without one, or with one that isn't a length between an hour and 30 days.
 */
export function shelfLifeOf(values: SquareObject['custom_attribute_values']): number | null {
  for (const v of Object.values(values ?? {})) {
    if (!SHELF.test(v.name ?? '')) continue
    const m = /(\d+(?:[.,]\d+)?)\s*([a-záéíóú]*)/i.exec(String(v.number_value ?? v.string_value ?? '').trim())
    if (!m) continue
    const n = Number(m[1].replace(',', '.'))
    const unit = m[2] || (/\b(hours?|horas?|hrs?)\b/i.test(v.name ?? '') ? 'h' : 'd')
    const hours = Math.round(/^(h|hr|hrs|hour|hours|hora|horas)$/i.test(unit) ? n : n * 24)
    if (hours >= 1 && hours <= MAX_SHELF_HOURS) return hours
  }
  return null
}

export function fromSquareCatalog(objects: SquareObject[]): SquareMenu {
  const live = objects.filter(o => !o.is_deleted)
  const categories = new Map(live.filter(o => o.type === 'CATEGORY').map(o => [o.id, tidy(o.category_data?.name)]))
  const images = new Map(live.filter(o => o.type === 'IMAGE').map(o => [o.id, o.image_data?.url]))
  const lists = new Map(live.filter(o => o.type === 'MODIFIER_LIST').map(o => [o.id, o]))
  const items: SquareMenuItem[] = []
  const used = new Set<string>()
  const sections: string[] = []
  const sorts = new Map<string, number>()
  for (const o of live.filter(x => x.type === 'ITEM' && x.item_data && !x.item_data.is_archived)) {
    const d = o.item_data!
    const name = tidy(d.name)
    if (!name) continue
    const firstCategory = [...(d.categories ?? [])].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))[0]?.id ?? d.category_id
    const category = (firstCategory && categories.get(firstCategory)) || null
    const all = [...(d.variations ?? [])].map(v => v.item_variation_data ?? {})
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
      .map(v => ({ name: tidy(v.name), price: money(v.price_money?.amount) }))
      .filter((v): v is { name: string; price: number } => v.price !== null)
    // Sit in and takeaway at one price are one way of selling it.
    const priced = all.every(v => SERVICE.test(v.name)) && new Set(all.map(v => v.price)).size === 1 ? all.slice(0, 1).map(v => ({ ...v, name: '' })) : all
    const base = priced[0]
    // A label worth keeping: what the price is for when there's more than one way (Hot, Iced), or a
    // lone Hot or Iced (an iced-only drink still goes in the iced column).
    const label = !base || !base.name || PLAIN.test(base.name) ? null : priced.length > 1 || /^(hot|iced)$/i.test(base.name) ? base.name : null
    const url = d.image_ids?.map(id => images.get(id)).find(u => typeof u === 'string' && /^https:\/\//.test(u)) ?? null
    if (category && !sections.includes(category)) sections.push(category)
    const sort = (sorts.get(category ?? '') ?? 0) + 1
    sorts.set(category ?? '', sort)
    items.push({
      square_id: o.id, name, category,
      sell_price: base?.price ?? null,
      price_label: label,
      variants: priced.slice(1).filter(v => v.name).map(v => ({ name: v.name, price_change: round(v.price - base!.price) })),
      description: tidy(d.description_plaintext ?? d.description) || null,
      photo_url: url,
      menu_sort: sort,
      shelf_life_hours: shelfLifeOf(o.custom_attribute_values),
    })
    for (const m of d.modifier_list_info ?? []) if (m.enabled !== false) used.add(m.modifier_list_id)
  }
  // The modifier lists the items use, as extras: priced add-ons only (all free, like the milks, is fine).
  let n = 0
  for (const id of used) {
    const l = lists.get(id)?.modifier_list_data
    const mods = (l?.modifiers ?? []).map(m => m.modifier_data ?? {}).sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
    const prices = mods.map(m => money(m.price_money?.amount))
    if (!l || !mods.length || prices.some(p => p === null)) continue
    const lowest = Math.min(...(prices as number[]))
    items.push({ square_id: id, name: tidy(l.name), category: EXTRAS_SECTION, sell_price: lowest, price_label: null, variants: [],
      description: mods.map(m => tidy(m.name)).filter(Boolean).join(', ') || null, photo_url: null, menu_sort: ++n })
  }
  if (n && !sections.includes(EXTRAS_SECTION)) sections.push(EXTRAS_SECTION)
  return { items, sections }
}

/** What the menu says an item costs: its price and its variants' differences (as the menu keeps them). */
export interface MenuPrices { sell_price: number | null; variants: readonly { name: string; price_change: number }[] }

/** One variation whose price changes in Square: the variation as it'll be sent, and what it was and will be. */
export interface PriceChange { variation: SquareVariation; name: string; from: number | null; to: number }

const cents = (euros: number) => Math.max(0, Math.round(euros * 100))

/**
 * A menu item's prices as changes to its Square item's variations, the way fromSquareCatalog reads them:
 * the first priced variation is the price; sit in and takeaway at one price all take it; any other
 * variation is the price plus its variant's difference (matched by name), or keeps the difference it had
 * in Square when the menu has no variant of that name. A location's own price that was the same as the
 * variation's moves with it; one set differently on purpose stays. Only variations whose price changes
 * are returned. `problem` when it can't be done here: extras (a modifier list), an item with no price.
 */
export function squarePriceChanges(object: SquareObject | undefined, want: MenuPrices, currency = 'EUR'): { changes: PriceChange[]; problem?: string } {
  if (!object || object.is_deleted) return { changes: [], problem: 'It isn’t in Square any more. Read the menu from Square again.' }
  if (object.type === 'MODIFIER_LIST') return { changes: [], problem: 'Extras (milks, syrups) are priced in Square: change them there.' }
  if (object.type !== 'ITEM') return { changes: [], problem: 'That isn’t an item in Square.' }
  if (want.sell_price === null || !Number.isFinite(want.sell_price)) return { changes: [], problem: 'Give it a price: Square needs one to sell it.' }
  const all = [...(object.item_data?.variations ?? [])].sort((a, b) => (a.item_variation_data?.ordinal ?? 0) - (b.item_variation_data?.ordinal ?? 0))
  if (!all.length) return { changes: [], problem: 'It has no variation in Square to put a price on.' }
  const amountOf = (v: SquareVariation) => (typeof v.item_variation_data?.price_money?.amount === 'number' ? v.item_variation_data.price_money.amount : null)
  // With no price in Square at all, the first variation takes it (Square then sells it at that price).
  const priced = all.filter(v => amountOf(v) !== null)
  const sold = priced.length ? priced : all.slice(0, 1)
  const base = sold[0]
  const oldBase = amountOf(base)
  const names = sold.map(v => tidy(v.item_variation_data?.name))
  const oneService = priced.length > 0 && names.every(n => SERVICE.test(n)) && new Set(priced.map(amountOf)).size === 1
  const byName = new Map(want.variants.map(v => [tidy(v.name).toLowerCase(), v.price_change]))
  const price = cents(want.sell_price)
  const changes: PriceChange[] = []
  for (const v of sold) {
    const was = amountOf(v)
    const diff = byName.get(tidy(v.item_variation_data?.name).toLowerCase())
    const to = v === base || oneService ? price
      : diff !== undefined ? cents(want.sell_price + diff)
      : Math.max(0, price + (was ?? 0) - (oldBase ?? 0))
    if (to === was) continue
    const d = v.item_variation_data ?? {}
    const money = { amount: to, currency: d.price_money?.currency ?? currency }
    const overrides = d.location_overrides?.map(o => (o.price_money?.amount === was || (was === null && !o.price_money)
      ? { ...o, pricing_type: 'FIXED_PRICING', price_money: { ...money, currency: o.price_money?.currency ?? money.currency } } : o))
    changes.push({
      variation: { ...v, item_variation_data: { ...d, pricing_type: 'FIXED_PRICING', price_money: money, ...(overrides ? { location_overrides: overrides } : {}) } },
      name: tidy(d.name), from: was === null ? null : was / 100, to: to / 100,
    })
  }
  return { changes }
}
