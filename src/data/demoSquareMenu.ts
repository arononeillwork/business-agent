// The demo's Square item library, shaped like the café's own: its printed menu's items as Square
// keeps them (Title Case names, Hot and Iced as variations with their own prices, sit in and takeaway
// at one price for the smoothies), a couple that are only on the till, and the milks, syrups and extra
// shot as modifier lists. Read by the demo when the menu's source is Square.
import { templateItems } from '../../shared/menuTemplate'
import type { SquareObject } from '../../shared/menuSquare'

const title = (s: string) => s.replace(/(^|[\s(+-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const cents = (n: number) => Math.round(n * 100)

export function demoSquareCatalog(): SquareObject[] {
  const items = templateItems().filter(i => i.category !== 'Make it yours')
  const categories = [...new Set(items.map(i => i.category!))]
  const objects: SquareObject[] = categories.map(c => ({ type: 'CATEGORY', id: `cat-${slug(c)}`, category_data: { name: c } }))
  const coffee = new Set(['Classics', 'Speciality'])
  for (const i of [...items, { ...items[0], name: 'Cafe con leche', sell_price: 3, price_label: 'Hot', variants: [], category: 'Classics', description: null },
    { ...items[0], name: 'Raisin butter swirl', sell_price: 3.3, price_label: null, variants: [], category: 'Bakery', description: null }]) {
    const variations = i.price_label
      ? [{ id: `v-${slug(i.name)}-0`, item_variation_data: { name: i.price_label, ordinal: 0, price_money: { amount: cents(i.sell_price ?? 0) } } },
        ...i.variants.map((v, n) => ({ id: `v-${slug(i.name)}-${n + 1}`, item_variation_data: { name: v.name, ordinal: n + 1, price_money: { amount: cents((i.sell_price ?? 0) + v.price_change) } } }))]
      : i.category === 'Smoothies'
        ? ['Sit In', 'Takeaway'].map((name, n) => ({ id: `v-${slug(i.name)}-${n}`, item_variation_data: { name, ordinal: n, price_money: { amount: cents(i.sell_price ?? 0) } } }))
        : [{ id: `v-${slug(i.name)}-0`, item_variation_data: { name: 'Regular', ordinal: 0, price_money: { amount: cents(i.sell_price ?? 0) } } }]
    objects.push({ type: 'ITEM', id: `sq-${slug(i.name)}`, item_data: {
      name: title(i.name), description: i.description ?? undefined, categories: [{ id: `cat-${slug(i.category!)}` }], variations,
      modifier_list_info: coffee.has(i.category!) ? ['mod-milk', 'mod-syrup', 'mod-shot'].map(id => ({ modifier_list_id: id })) : [] } })
  }
  const list = (id: string, name: string, mods: [string, number][]): SquareObject => ({ type: 'MODIFIER_LIST', id, modifier_list_data: { name,
    modifiers: mods.map(([n, c], ordinal) => ({ modifier_data: { name: n, ordinal, price_money: { amount: c } } })) } })
  objects.push(
    list('mod-milk', 'Milk', [['Whole', 0], ['Semi-skimmed', 0], ['Oat', 0], ['Oat - gluten free', 0], ['Almond', 0], ['Coconut', 0], ['Lactose free', 0]]),
    list('mod-syrup', 'Syrup', [['Vanilla', 50], ['Caramel', 50], ['Salted Caramel', 50], ['Hazelnut', 50]]),
    list('mod-shot', 'Extra Shot', [['Extra Espresso Shot', 50]]),
  )
  return objects
}
