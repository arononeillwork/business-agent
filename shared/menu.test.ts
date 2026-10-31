import { describe, expect, it } from 'vitest'
import {
  aiErrorText, aiRequest, allergenNumber, buildPrompt, categoryOrder, closestRatio, designFacets, designProblem, filterDesigns, imageOf, marksOf, menuItemProblem,
  imageShape, isStrip, menuSections, moveInSection, moveSection, newDesign, otherVariants, photoPrompt, priceColumns, priceIn, readAiResult, shownAllergens, sizeOf,
  type MenuImage, type MenuItem,
} from './menu'
import type { ItemAllergens, MenuAllergens } from './allergens'
import { missingFrom, templateDesigns, templateItems, templateSections } from './menuTemplate'
import { EXTRAS_SECTION, fromSquareCatalog, type SquareObject } from './menuSquare'

const item = (p: Partial<MenuItem> & { name: string }): MenuItem => ({ id: p.name, category: 'Coffee', sell_price: 3, price_label: null, vat_rate: 10, description: null,
  photo_url: null, featured: false, on_menu: true, menu_sort: 0, variants: [], square_id: null, ...p })
const iced = (change: number) => [{ id: 'v', name: 'Iced', price_change: change }]

describe('menu items', () => {
  it('numbers the 14 allergens in the regulation’s order', () => {
    expect(allergenNumber('gluten')).toBe(1)
    expect(allergenNumber('milk')).toBe(7)
    expect(allergenNumber('molluscs')).toBe(14)
  })

  it('takes allergens and diets from the ingredients on Menu costing, and shows nothing for an item with none', () => {
    const ing = (id: string, allergens: ItemAllergens['allergens'], diet: ItemAllergens['diet'] = null): ItemAllergens => ({ id, name: id, allergens, may_contain: [], diet })
    const line = (item_id: string) => ({ item_id, quantity: 1, unit: 'unit' as const, variant_id: null, replaces_item_id: null })
    const data: MenuAllergens = {
      dishes: [
        { id: 'espresso', name: 'Espresso', category: 'Coffee', variants: [], lines: [line('beans')] },
        { id: 'croissant', name: 'Croissant', category: 'Bakery', variants: [], lines: [line('croissants')] },
        { id: 'chai', name: 'Chai latte', category: 'Coffee', variants: [], lines: [line('chai'), line('milk')] },
        { id: 'new', name: 'Avocado toast', category: 'Food', variants: [], lines: [] },
      ],
      items: [ing('beans', [], 'vegan'), ing('croissants', ['gluten', 'milk', 'eggs'], 'vegetarian'), ing('chai', null), ing('milk', ['milk'], 'vegetarian')],
    }
    expect(marksOf('espresso', data)).toEqual({ contains: [], unknown: [], tags: ['vegan', 'gluten_free', 'dairy_free'] })
    expect(marksOf('croissant', data)).toEqual({ contains: ['gluten', 'eggs', 'milk'], unknown: [], tags: ['vegetarian'] })
    expect(shownAllergens(marksOf('croissant', data))).toEqual(['gluten', 'eggs', 'milk'])
    // An ingredient not entered yet: what's known, but the menus show none of it until it is.
    expect(marksOf('chai', data)).toMatchObject({ contains: ['milk'], unknown: ['chai'], tags: [] })
    expect(shownAllergens(marksOf('chai', data))).toEqual([])
    // Nothing in it on Menu costing, or not on it at all: no allergens and no diet badges.
    expect(marksOf('new', data)).toEqual({ contains: [], unknown: [], tags: [] })
    expect(marksOf('elsewhere', data)).toEqual({ contains: [], unknown: [], tags: [] })
    expect(marksOf('espresso', null)).toEqual({ contains: [], unknown: [], tags: [] })
  })

  it('checks a menu item before saving', () => {
    expect(menuItemProblem({ name: ' ', sell_price: 3, description: null, photo_url: null })).toBe('Give it a name')
    expect(menuItemProblem({ name: 'Latte', sell_price: -1, description: null, photo_url: null })).toMatch(/price/)
    expect(menuItemProblem({ name: 'Latte', sell_price: null, description: 'x'.repeat(301), photo_url: null })).toMatch(/300/)
    expect(menuItemProblem({ name: 'Latte', sell_price: 3, description: null, photo_url: 'ftp://x' })).toMatch(/https/)
    expect(menuItemProblem({ name: 'Latte', sell_price: 3.2, description: 'Double shot', photo_url: 'https://x.es/a.jpg' })).toBeNull()
  })

  it('orders sections: the business’s own order, then the usual ones, others A–Z, then items without one', () => {
    expect(categoryOrder(['Food', 'Specials', null, 'Coffee', 'Brunch', 'Coffee'])).toEqual(['Coffee', 'Food', 'Brunch', 'Specials', null])
    expect(categoryOrder(['Food', 'Classics', 'Smoothies', 'Beers'], ['Classics', 'Smoothies', 'Beers'])).toEqual(['Classics', 'Smoothies', 'Beers', 'Food'])
    expect(moveSection(['Classics', 'Smoothies', 'Beers', null], 'Beers', -1)).toEqual(['Classics', 'Beers', 'Smoothies'])
    expect(moveSection(['Classics', 'Smoothies'], 'Classics', -1)).toBeNull()
  })

  it('hot and iced become price columns; one price, or the same price sit in and takeaway, don’t', () => {
    const classics = [item({ name: 'Flat white', sell_price: 3.8, price_label: 'Hot', variants: iced(1) }), item({ name: 'Latte', sell_price: 4, price_label: 'Hot', variants: iced(1) }),
      item({ name: 'Espresso', sell_price: 2.4, price_label: 'Regular' }), item({ name: 'Bumble coffee', sell_price: 6, price_label: 'Iced' })]
    const columns = priceColumns(classics)
    expect(columns).toEqual(['Hot', 'Iced'])
    expect(priceIn(classics[0], 'Iced', columns)).toBe(4.8)
    expect(priceIn(classics[2], 'Hot', columns)).toBe(2.4) // a lone price goes in the first column
    expect(priceIn(classics[2], 'Iced', columns)).toBeNull()
    expect(priceIn(classics[3], 'Hot', columns)).toBeNull() // iced only
    expect(priceIn(classics[3], 'Iced', columns)).toBe(6)
    expect(otherVariants(classics[0], columns)).toEqual([])
    const smoothies = [item({ name: 'Tropical', sell_price: 6.5, price_label: 'Sit In', variants: [{ id: 't', name: 'Takeaway', price_change: 0 }] }),
      item({ name: 'Gym nut', sell_price: 6.5, price_label: 'Sit In', variants: [{ id: 't', name: 'Takeaway', price_change: 0 }] })]
    expect(priceColumns(smoothies)).toEqual([])
    expect(priceColumns([item({ name: 'Flat white', variants: [{ id: 'o', name: 'Oat milk', price_change: 0.4 }] })])).toEqual([])
  })

  it('groups the menu by section in each item’s place, leaving out what’s off the menu', () => {
    const items = [item({ name: 'Latte', menu_sort: 2 }), item({ name: 'Espresso', menu_sort: 1 }), item({ name: 'Mocha', menu_sort: 2 }),
      item({ name: 'Croissant', category: 'Bakery' }), item({ name: 'Old cake', category: 'Bakery', on_menu: false })]
    const sections = menuSections(items)
    expect(sections.map(s => s.category)).toEqual(['Coffee', 'Bakery'])
    expect(sections[0].items.map(i => i.name)).toEqual(['Espresso', 'Latte', 'Mocha'])
    expect(sections[1].items.map(i => i.name)).toEqual(['Croissant'])
    expect(menuSections(items, { all: true })[1].items).toHaveLength(2)
    expect(menuSections(items, { only: ['Bakery'] }).map(s => s.category)).toEqual(['Bakery'])
  })

  it('moves an item up or down within its own section', () => {
    const items = [item({ name: 'A', menu_sort: 0 }), item({ name: 'B', menu_sort: 1 }), item({ name: 'C', menu_sort: 2 }), item({ name: 'X', category: 'Food' })]
    expect(moveInSection(items, 'B', -1)).toEqual(['B', 'A', 'C'])
    expect(moveInSection(items, 'B', 1)).toEqual(['A', 'C', 'B'])
    expect(moveInSection(items, 'A', -1)).toBeNull()
    expect(moveInSection(items, 'X', 1)).toBeNull()
  })
})

describe('the café’s printed menus as a template', () => {
  it('has every section of Drinks, Food and The fridge, in their order', () => {
    expect(templateSections()).toEqual(['Classics', 'Speciality', 'Smoothies', 'Make it yours', 'Bakery', 'Toasts & more', 'Sweet things', 'Açaí bowls',
      'Chia puddings', 'Soft drinks', 'Juices & water', 'Beers'])
    expect(templateItems()).toHaveLength(61) // 26 drinks, 19 food, 16 in the fridge
  })

  it('keeps hot and iced prices and the lines under items (allergens come from Menu costing)', () => {
    const byName = (n: string) => templateItems().find(i => i.name === n)!
    expect(byName('Flat white')).toMatchObject({ category: 'Classics', sell_price: 3.8, price_label: 'Hot', variants: [{ name: 'Iced', price_change: 1 }] })
    expect(byName('Espresso')).toMatchObject({ sell_price: 2.4, price_label: 'Hot', variants: [] })
    expect(byName('Bumble coffee')).toMatchObject({ sell_price: 6, price_label: 'Iced', variants: [] })
    expect(byName('Gym nut')).toMatchObject({ sell_price: 6.5, price_label: null, description: 'Banana, peanut butter, oats and honey.' })
    expect(byName('Gluten-free brownie')).not.toHaveProperty('allergens')
    expect(byName('Any milk').sell_price).toBe(0)
    expect(priceColumns(templateItems().filter(i => i.category === 'Classics').map(i => ({ ...i, variants: i.variants.map(v => ({ ...v, id: v.name })) })))).toEqual(['Hot', 'Iced'])
  })

  it('adds only what isn’t on the menu yet, and makes the three printed menus', () => {
    expect(missingFrom(['FLAT WHITE', 'croissant']).map(i => i.name)).not.toContain('Flat white')
    expect(missingFrom(['FLAT WHITE', 'croissant'])).toHaveLength(59)
    expect(templateDesigns().map(d => [d.name, d.style, d.title])).toEqual([['Drinks menu', 'boxed', 'Drinks'], ['Food menu', 'boxed', 'Food'], ['The fridge menu', 'boxed', 'The fridge']])
    expect(templateDesigns().every(d => designProblem(d) === null)).toBe(true)
  })
})

describe('the menu from Square', () => {
  // Shaped like the café's own Square catalogue.
  const v = (id: string, name: string, cents: number | undefined, ordinal = 0) => ({ id, item_variation_data: { name, ordinal, ...(cents === undefined ? {} : { price_money: { amount: cents } }) } })
  const catalogue: SquareObject[] = [
    { type: 'CATEGORY', id: 'c-classics', category_data: { name: 'Classics' } },
    { type: 'CATEGORY', id: 'c-smoothies', category_data: { name: 'Smoothies' } },
    { type: 'CATEGORY', id: 'c-cold', category_data: { name: 'Cold Drinks' } },
    { type: 'IMAGE', id: 'img-fw', image_data: { url: 'https://items-images.example/flat-white.jpg' } },
    { type: 'ITEM', id: 'i-fw', item_data: { name: 'Flat White', categories: [{ id: 'c-classics' }], image_ids: ['img-fw'], variations: [v('a', 'Hot', 380, 0), v('b', 'Iced', 480, 1)],
      modifier_list_info: [{ modifier_list_id: 'm-milk' }, { modifier_list_id: 'm-syrup' }, { modifier_list_id: 'm-done' }] } },
    { type: 'ITEM', id: 'i-esp', item_data: { name: 'Espresso', categories: [{ id: 'c-classics' }], variations: [v('c', 'Regular', 200)] } },
    { type: 'ITEM', id: 'i-bumble', item_data: { name: 'Bumble Coffee', categories: [{ id: 'c-classics' }], variations: [v('d', 'Iced', 600)] } },
    { type: 'ITEM', id: 'i-gym', item_data: { name: 'Gym Nut', description: 'Banana, oats, peanut butter', categories: [{ id: 'c-smoothies' }],
      variations: [v('e', 'Sit In', 650, 0), v('f', 'Takeaway', 650, 1)] } },
    { type: 'ITEM', id: 'i-soft', item_data: { name: 'Soft Drinks', categories: [{ id: 'c-cold' }], variations: [v('g', 'Coca Cola', 250, 0), v('h', 'Fanta', 250, 1)] } },
    { type: 'ITEM', id: 'i-old', is_deleted: true, item_data: { name: 'Gone', variations: [v('i', 'Regular', 100)] } },
    { type: 'ITEM', id: 'i-arch', item_data: { name: 'Archived', is_archived: true, variations: [v('j', 'Regular', 100)] } },
    { type: 'ITEM', id: 'i-promo', item_data: { name: 'Coffee Beans 1kg', variations: [v('k', 'Regular', undefined)] } },
    { type: 'MODIFIER_LIST', id: 'm-milk', modifier_list_data: { name: 'Milk', modifiers: [{ modifier_data: { name: 'Oat', price_money: { amount: 0 } } }, { modifier_data: { name: 'Almond', price_money: { amount: 0 } } }] } },
    { type: 'MODIFIER_LIST', id: 'm-syrup', modifier_list_data: { name: 'Syrup', modifiers: [{ modifier_data: { name: 'Vanilla', price_money: { amount: 50 } } }, { modifier_data: { name: 'Caramel', price_money: { amount: 50 } } }] } },
    { type: 'MODIFIER_LIST', id: 'm-done', modifier_list_data: { name: 'Temperatura', modifiers: [{ modifier_data: { name: 'Poco hecho' } }] } },
    { type: 'MODIFIER_LIST', id: 'm-unused', modifier_list_data: { name: 'Unused', modifiers: [{ modifier_data: { name: 'X', price_money: { amount: 100 } } }] } },
  ]
  const menu = fromSquareCatalog(catalogue)
  const byId = (id: string) => menu.items.find(i => i.square_id === id)!

  it('reads hot and iced as the price and a variant, an iced-only drink in the iced column, and a plain one as just its price', () => {
    expect(byId('i-fw')).toMatchObject({ name: 'Flat White', category: 'Classics', sell_price: 3.8, price_label: 'Hot', variants: [{ name: 'Iced', price_change: 1 }],
      photo_url: 'https://items-images.example/flat-white.jpg', menu_sort: 1 })
    expect(byId('i-esp')).toMatchObject({ sell_price: 2, price_label: null, variants: [], menu_sort: 2 })
    expect(byId('i-bumble')).toMatchObject({ sell_price: 6, price_label: 'Iced', variants: [] })
  })

  it('sit in and takeaway at one price are one price; drinks sold under one item stay as its variants', () => {
    expect(byId('i-gym')).toMatchObject({ sell_price: 6.5, price_label: null, variants: [], description: 'Banana, oats, peanut butter' })
    expect(byId('i-soft')).toMatchObject({ sell_price: 2.5, price_label: 'Coca Cola', variants: [{ name: 'Fanta', price_change: 0 }] })
  })

  it('leaves out deleted and archived items; one without a price comes in to be priced', () => {
    expect(menu.items.find(i => i.square_id === 'i-old' || i.square_id === 'i-arch')).toBeUndefined()
    expect(byId('i-promo')).toMatchObject({ sell_price: null, category: null })
  })

  it('lists the modifiers the items use as extras, priced ones only, in their own section last', () => {
    expect(byId('m-milk')).toMatchObject({ name: 'Milk', category: EXTRAS_SECTION, sell_price: 0, description: 'Oat, Almond' })
    expect(byId('m-syrup')).toMatchObject({ name: 'Syrup', sell_price: 0.5, description: 'Vanilla, Caramel' })
    expect(menu.items.find(i => i.square_id === 'm-done' || i.square_id === 'm-unused')).toBeUndefined()
    expect(menu.sections).toEqual(['Classics', 'Smoothies', 'Cold Drinks', EXTRAS_SECTION])
  })
})

describe('menu designs', () => {
  it('starts physical menus on A4 and digital ones on a landscape screen', () => {
    expect(newDesign('physical', 'Counter').size).toBe('a4_portrait')
    expect(newDesign('digital', 'TV').size).toBe('screen_landscape')
    expect(designProblem(newDesign('digital', 'TV'))).toBeNull()
    expect(designProblem({ ...newDesign('digital', 'TV'), size: 'a4_portrait' })).toMatch(/size/)
    expect(designProblem(newDesign('physical', ''))).toMatch(/name/)
  })

  it('shows its chosen image only once it’s ready', () => {
    const img = (p: Partial<MenuImage>): MenuImage => ({ id: 'i1', design_id: 'd', item_id: null, url: 'https://x/a.jpg', source: 'ai', model: 'ideogram',
      prompt: null, edit_of: null, status: 'ready', error: null, stored: true, created_at: '2026-10-23T10:00:00Z', ...p })
    expect(imageOf({ image_id: 'i1', images: [img({})] })?.url).toBe('https://x/a.jpg')
    expect(imageOf({ image_id: 'i1', images: [img({ status: 'working', url: null })] })).toBeNull()
    expect(imageOf({ image_id: null, images: [img({})] })).toBeNull()
  })
})

describe('AI images', () => {
  it('picks the closest shape the model makes', () => {
    const a4 = sizeOf('a4_portrait')
    expect(closestRatio(a4.width, a4.height, ['1:1', '2:3', '3:4', '16:9'])).toBe('2:3')
    expect(closestRatio(a4.width, a4.height, ['1:1', '10:14', '2:3'])).toBe('10:14')
    expect(closestRatio(1920, 1080, ['1:1', '16:9', '9:16'])).toBe('16:9')
    expect(closestRatio(1080, 1920, ['1:1', '16:9', '9:16'])).toBe('9:16')
  })

  it('asks for artwork without words when the app writes the menu over it', () => {
    const p = buildPrompt('Terracotta and olive branches', { mode: 'background', format: 'physical', size: 'a4_portrait', title: 'Easy Beans' })
    expect(p).toMatch(/^Terracotta and olive branches\. Background artwork for a printed café menu, portrait\./)
    expect(p).toMatch(/No text, no letters/)
    expect(p).not.toMatch(/Easy Beans/)
  })

  it('makes a boxed menu’s image as a wide strip of illustrations, without words', () => {
    expect(isStrip({ mode: 'background', style: 'boxed' })).toBe(true)
    expect(isStrip({ mode: 'full', style: 'boxed' })).toBe(false)
    expect(imageShape({ mode: 'background', style: 'boxed', size: 'a4_portrait' })).toEqual({ width: 4, height: 1 })
    expect(imageShape({ mode: 'background', style: 'classic', size: 'a4_portrait' })).toEqual(sizeOf('a4_portrait'))
    const p = buildPrompt('Iced drinks with straws', { mode: 'background', style: 'boxed', format: 'physical', size: 'a4_portrait', title: 'Drinks' })
    expect(p).toBe('Iced drinks with straws. A wide strip of illustrations for the bottom of a printed café menu, side by side in one row, on a plain light background. '
      + 'No text, no letters, no words, no numbers, no logos.')
    expect(aiRequest('recraft', p, imageShape({ mode: 'background', style: 'boxed', size: 'a4_portrait' })).body.aspect_ratio).toBe('2:1')
  })

  it('writes every section, item and price into a whole-menu image', () => {
    const sections = menuSections([item({ name: 'Flat white', sell_price: 3.2, variants: [{ id: 'v', name: 'Oat milk', price_change: 0.4 }] }),
      item({ name: 'Croissant', category: 'Bakery', sell_price: 1.8 })])
    const p = buildPrompt('Chalkboard', { mode: 'full', format: 'digital', size: 'screen_landscape', title: 'Easy Beans Coffee', footer: 'Prices include IVA', sections })
    expect(p).toContain('A café menu screen, landscape')
    expect(p).toContain('The heading reads "Easy Beans Coffee".')
    expect(p).toContain('COFFEE: Flat white 3,20 € (Oat milk +0,40 €) | BAKERY: Croissant 1,80 €')
    expect(p).toContain('At the bottom, small: "Prices include IVA".')
  })

  it('describes a menu item for its photo', () => {
    expect(photoPrompt({ name: 'Iced matcha latte', description: 'Ceremonial matcha over oat milk', category: 'Tea & matcha' }))
      .toMatch(/^A professional photograph of Iced matcha latte: Ceremonial matcha over oat milk, as served/)
  })

  it('builds each model’s request as Higgsfield documents it', () => {
    const a4 = sizeOf('a4_portrait')
    expect(aiRequest('ideogram', 'menu', a4)).toEqual({ endpoint: 'ideogram/v4.0', body: { prompt: 'menu', aspect_ratio: '2:3', rendering_speed: 'QUALITY' } })
    expect(aiRequest('recraft', 'art', a4, { colours: [{ name: 'Rose', hex: '#E8B4B8', role: 'primary' }, { name: 'Bad', hex: 'red', role: 'accent' }] }))
      .toEqual({ endpoint: 'recraft/v4.1/text-to-image', body: { prompt: 'art', aspect_ratio: '10:14', resolution: '1k', output_format: 'jpg', colors: [{ rgb: [232, 180, 184] }] } })
    expect(aiRequest('qwen', 'photo', { width: 1, height: 1 })).toEqual({ endpoint: 'alibaba/qwen-image-3/text-to-image', body: { prompt: 'photo', aspect_ratio: '1:1', resolution: '2k' } })
  })

  it('sends edits with the image: Ideogram to itself, Recraft and Qwen to Qwen’s edit', () => {
    const tv = sizeOf('screen_landscape')
    expect(aiRequest('ideogram', 'warmer', tv, { image: 'https://x/a.png' }).body).toMatchObject({ image_url: 'https://x/a.png', image_weight: 60, aspect_ratio: '16:9' })
    expect(aiRequest('recraft', 'warmer', tv, { image: 'https://x/a.png' })).toEqual({ endpoint: 'alibaba/qwen-image-3/edit',
      body: { prompt: 'warmer', image_urls: ['https://x/a.png'], resolution: '2k', aspect_ratio: '16:9' } })
  })

  it('reads Higgsfield’s status answers and webhooks', () => {
    expect(readAiResult({ status: 'queued' })).toEqual({ status: 'queued', url: null, error: null })
    expect(readAiResult({ status: 'in_progress' }).status).toBe('working')
    expect(readAiResult({ status: 'completed', images: [{ url: 'https://cdn/x.png' }] })).toEqual({ status: 'ready', url: 'https://cdn/x.png', error: null })
    expect(readAiResult({ request_id: 'r', status: 'completed', error: null, payload: { images: [{ url: 'https://cdn/y.jpg', content_type: 'image/jpeg' }] } }).url).toBe('https://cdn/y.jpg')
    expect(readAiResult({ status: 'completed', images: [] }).status).toBe('failed')
    expect(readAiResult({ status: 'nsfw' }).error).toMatch(/safety/)
    expect(readAiResult({ status: 'failed', error: 'Generation failed' }).error).toMatch(/Generation failed/)
    expect(readAiResult(null).status).toBe('failed')
  })

  it('explains Higgsfield’s errors', () => {
    expect(aiErrorText(401, { detail: 'Invalid credentials' })).toMatch(/API key/)
    expect(aiErrorText(403, {})).toMatch(/credits/)
    expect(aiErrorText(422, { detail: [{ msg: 'prompt too short' }] })).toMatch(/prompt too short/)
    expect(aiErrorText(500, null)).toMatch(/500/)
  })
})

describe('printed menus in more than one language', () => {
  const designs = [
    { name: 'Drinks menu', language: null, kind: 'drinks' as const },
    { name: 'Drinks', language: 'en' as const, kind: 'drinks' as const },
    { name: 'Bebidas', language: 'es' as const, kind: 'drinks' as const },
    { name: 'Comida', language: 'es' as const, kind: 'food' as const },
    { name: 'La Nevera', language: 'es' as const, kind: 'fridge' as const },
    { name: 'Table card', language: null, kind: null },
  ]
  const names = (o: Parameters<typeof filterDesigns>[1]) => filterDesigns(designs, o).map(d => d.name)

  it('one language: its own menus and those in no language in particular; one type: only that type', () => {
    expect(names({ language: 'all', kind: 'all' })).toHaveLength(6)
    expect(names({ language: 'es', kind: 'all' })).toEqual(['Drinks menu', 'Bebidas', 'Comida', 'La Nevera', 'Table card'])
    expect(names({ language: 'en', kind: 'drinks' })).toEqual(['Drinks menu', 'Drinks'])
    expect(names({ language: 'es', kind: 'food' })).toEqual(['Comida'])
    expect(names({ language: 'en', kind: 'fridge' })).toEqual([])
  })

  it('offers the languages and types there are, in the usual order', () => {
    expect(designFacets(designs)).toEqual({ languages: ['en', 'es'], kinds: ['drinks', 'food', 'fridge'] })
    expect(designFacets([{ language: null, kind: null }])).toEqual({ languages: [], kinds: [] })
  })

  it('the template’s printed menus are Drinks, Food and The fridge, headed in English', () => {
    expect(templateDesigns().map(d => [d.name, d.language, d.kind])).toEqual([
      ['Drinks menu', 'en', 'drinks'], ['Food menu', 'en', 'food'], ['The fridge menu', 'en', 'fridge'],
    ])
  })
})
