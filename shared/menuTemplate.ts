// The café's own printed menus, as a menu to start from: Drinks, Food and The Fridge (Google Drive,
// "New": Easy-Beans-Drinks-Menu.pdf, Easy-Beans-Food-Menu.pdf, Easy-Beans-The-Fridge-Menu.pdf, with
// Bebidas, Comida and La Nevera in Spanish). Every item with its section, price (hot and iced where
// the menu has both) and the line under it. The allergens printed on them aren't copied: a menu item's
// allergens come from what goes into it on Menu costing (the Allergens page). Loading it adds what
// isn't on the menu yet and makes the three printed menus.
import type { MenuDesignInput, MenuItemInput, MenuVariant } from './menu'

interface Line { name: string; price?: number; iced?: number; description?: string }
interface Section { name: string; hotIced?: boolean; items: Line[] }
export interface PrintedMenu { title: string; subtitle: string; sections: Section[] }


export const PRINTED_MENUS: PrintedMenu[] = [
  { title: 'Drinks', subtitle: 'hot, iced or canned — made your way', sections: [
    { name: 'Classics', hotIced: true, items: [
      { name: 'Espresso', price: 2.4 }, { name: 'Americano', price: 2.8, iced: 3.8 }, { name: 'Cortado', price: 3, iced: 4 },
      { name: 'Double cortado', price: 3.5, iced: 4.5 }, { name: 'Cappuccino', price: 3.5, iced: 4.5 }, { name: 'Flat white', price: 3.8, iced: 4.8 },
      { name: 'Latte', price: 4, iced: 5 }, { name: 'Mocha', price: 4.5 }, { name: 'Hot chocolate', price: 4 }, { name: 'Bumble coffee', iced: 6 },
      { name: 'Irish tea', price: 3, description: 'Barry’s & Lyons.' },
    ] },
    { name: 'Speciality', hotIced: true, items: [
      { name: 'Matcha latte', price: 5.5, iced: 6.5 }, { name: 'Chai latte', price: 4.5, iced: 5.5 }, { name: 'Pink chai latte', price: 5.5, iced: 6.5 },
      { name: 'Ube latte', price: 5.9, iced: 6.9 }, { name: 'Ube matcha latte', price: 6.9, iced: 7.9 }, { name: 'Cold brew', iced: 4.7 },
    ] },
    { name: 'Smoothies', items: [
      { name: 'Strawberry sunrise', price: 6.5, description: 'Strawberry, banana and fresh orange.' },
      { name: 'Tropical', price: 6.5, description: 'Mango, pineapple and coconut.' },
      { name: 'Berry blast', price: 6.5, description: 'Strawberry, blueberry and blackberry, blended thick.' },
      { name: 'Gym nut', price: 6.5, description: 'Banana, peanut butter, oats and honey.' },
    ] },
    { name: 'Make it yours', items: [
      { name: 'Syrup', price: 0.5, description: 'Classics: caramel, salted caramel, vanilla, hazelnut. Fruity: strawberry, mango, passion fruit, blue curaçao. Sugar-free: caramel, vanilla.' },
      { name: 'Purée', price: 1, description: 'Mango or strawberry.' }, { name: 'Extra espresso shot', price: 0.5 }, { name: 'Cold foam', price: 1 },
      { name: 'Any milk', price: 0, description: 'Oat, gluten-free oat, almond, coconut, semi-skimmed or lactose-free.' },
    ] },
  ] },
  { title: 'Food', subtitle: 'fresh, natural & made to feel good', sections: [
    { name: 'Bakery', items: [
      { name: 'Croissant', price: 2.7 }, { name: 'Ham + cheese croissant', price: 4.2 },
      { name: 'Almond croissant', price: 3.4 }, { name: 'Cinnamon swirl', price: 3.3 },
    ] },
    { name: 'Toasts & more', items: [
      { name: 'Toast, olive oil + tomato', price: 3.5 }, { name: 'Toast, butter + jam', price: 3 },
      { name: 'Ham + cheese sandwich', price: 4.5 }, { name: 'Bacon sandwich', price: 5.5 },
      { name: 'Eggs + toast', price: 6, description: 'Fried or scrambled — your call.' },
    ] },
    { name: 'Sweet things', items: [
      { name: 'Gluten-free brownie', price: 3.5 }, { name: 'Biscoff cheesecake', price: 4.5 },
      { name: 'Pistachio cheesecake', price: 6.5 }, { name: 'Fresh fruit cup', price: 5 },
    ] },
    { name: 'Açaí bowls', items: [
      { name: 'Açaí bowl', price: 11, description: 'Blended açaí, loaded with granola, berries, banana and coconut flakes.' },
      { name: 'Gluten-free açaí bowl', price: 11 },
      { name: '+ Extra sauce', price: 1, description: 'Biscoff or pistachio.' }, { name: '+ Extra toppings', price: 1, description: 'Peanut butter, granola or fruit.' },
    ] },
    { name: 'Chia puddings', items: [{ name: 'Mango chia pudding', price: 4.5 }, { name: 'Strawberry chia pudding', price: 4.5 }] },
  ] },
  { title: 'The fridge', subtitle: 'soft drinks, juices & beers — served ice cold', sections: [
    { name: 'Soft drinks', items: [
      { name: 'Coca-Cola', price: 2.5 }, { name: 'Coca-Cola Zero', price: 2.5 }, { name: 'Fanta', price: 2.5 }, { name: 'Fanta Lemon', price: 2.5 },
      { name: 'Sprite', price: 2.5 }, { name: 'Aquarius', price: 2.5 }, { name: 'Aquarius Orange', price: 2.5 }, { name: 'Iced tea', price: 2.5 },
      { name: 'Powerade', price: 3 },
    ] },
    { name: 'Juices & water', items: [
      { name: 'Fresh orange juice', price: 3.8, description: 'Squeezed when you order it.' }, { name: 'Apple juice', price: 2.5 },
      { name: 'Water', price: 2.5 }, { name: 'Sparkling water', price: 3 },
    ] },
    { name: 'Beers', items: [{ name: 'Estrella Galicia', price: 3 }, { name: 'Corona', price: 4 }, { name: 'Corona Zero', price: 4 }] },
  ] },
]

/** The handle at the bottom of every printed menu. */
export const PRINTED_FOOTER = '@easy.beans.coffee'

export type TemplateItem = MenuItemInput & { variants: Omit<MenuVariant, 'id'>[]; menu_sort: number }

/**
 * The template's items, ready to add: hot and iced as the item's price ("Hot") and an "Iced" variant;
 * only hot, or only iced, as that one price with its label.
 */
export function templateItems(): TemplateItem[] {
  return PRINTED_MENUS.flatMap(m => m.sections.flatMap(s => s.items.map((l, n): TemplateItem => {
    const base = l.price ?? l.iced ?? null
    const label = s.hotIced ? (l.price !== undefined ? 'Hot' : 'Iced') : null
    return {
      name: l.name, category: s.name, sell_price: base, price_label: label, vat_rate: 10, description: l.description ?? null, photo_url: null,
      featured: false, on_menu: true, menu_sort: n + 1,
      variants: l.price !== undefined && l.iced !== undefined ? [{ name: 'Iced', price_change: Math.round((l.iced - l.price) * 100) / 100 }] : [],
    }
  })))
}

/** The sections in the printed menus' order. */
export const templateSections = () => PRINTED_MENUS.flatMap(m => m.sections.map(s => s.name))

/** The three printed menus as designs: A4, boxed like the originals, each with its own sections. */
export function templateDesigns(): MenuDesignInput[] {
  return PRINTED_MENUS.map((m, i) => ({
    name: `${m.title} menu`, format: 'physical', size: 'a4_portrait', mode: 'background', style: 'boxed', categories: m.sections.map(s => s.name),
    title: m.title, subtitle: m.subtitle, footer: PRINTED_FOOTER, text_tone: 'dark', panel: false, show_descriptions: true, show_allergens: true, image_id: null,
    // Their headings are in English; Drinks, Food and The fridge, in that order.
    language: 'en', kind: (['drinks', 'food', 'fridge'] as const)[i] ?? null,
  }))
}

/** What the template adds to a menu that has these items already (by name, any case): only what's missing. */
export const missingFrom = (names: string[]) => {
  const have = new Set(names.map(n => n.trim().toLowerCase()))
  return templateItems().filter(i => !have.has(i.name.toLowerCase()))
}
