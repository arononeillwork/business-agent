// The menu read from Square's item library (when the Menu page's source is Square): each item with
// its category as the section, its variations as the ways it's sold (the first priced one is its
// price: "Hot", with "Iced" +1.00 as a variant), its description and photo; and the modifier lists the
// items use (Milk, Syrup, Extra shot) as extras in a section of their own, the way the café's printed
// menus list them. Choices without prices (how a steak is done) aren't extras. Shared by the Worker
// (which reads the catalogue) and the demo.

/** The parts of Square's catalogue objects that are read (GET /v2/catalog/list?types=ITEM,CATEGORY,MODIFIER_LIST,IMAGE). */
export interface SquareObject {
  type: string
  id: string
  is_deleted?: boolean
  item_data?: {
    name?: string; description?: string; description_plaintext?: string; is_archived?: boolean; image_ids?: string[]
    categories?: { id: string; ordinal?: number }[]; category_id?: string
    variations?: { id: string; item_variation_data?: { name?: string; ordinal?: number; price_money?: { amount?: number } } }[]
    modifier_list_info?: { modifier_list_id: string; enabled?: boolean }[]
  }
  category_data?: { name?: string }
  modifier_list_data?: { name?: string; modifiers?: { modifier_data?: { name?: string; price_money?: { amount?: number }; ordinal?: number } }[] }
  image_data?: { url?: string }
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
