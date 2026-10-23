import { describe, expect, it } from 'vitest'
import {
  aiErrorText, aiRequest, allergenNumber, buildPrompt, categoryOrder, cleanAllergens, closestRatio, designProblem, dietaryClash, imageOf, menuItemProblem,
  menuSections, moveInSection, newDesign, photoPrompt, readAiResult, sizeOf, type MenuImage, type MenuItem,
} from './menu'

const item = (p: Partial<MenuItem> & { name: string }): MenuItem => ({ id: p.name, category: 'Coffee', sell_price: 3, vat_rate: 10, description: null,
  photo_url: null, allergens: [], dietary: [], featured: false, on_menu: true, menu_sort: 0, variants: [], ...p })

describe('menu items', () => {
  it('numbers the 14 allergens in the regulation’s order, and keeps only known ones', () => {
    expect(allergenNumber('gluten')).toBe(1)
    expect(allergenNumber('milk')).toBe(7)
    expect(allergenNumber('molluscs')).toBe(14)
    expect(cleanAllergens(['milk', 'gluten', 'milk', 'chocolate'])).toEqual(['gluten', 'milk'])
  })

  it('flags a dietary mark that its allergens contradict', () => {
    expect(dietaryClash({ dietary: ['gluten_free'], allergens: ['gluten'] })).toMatch(/gluten free/)
    expect(dietaryClash({ dietary: ['vegan'], allergens: ['milk'] })).toMatch(/vegan/)
    expect(dietaryClash({ dietary: ['dairy_free'], allergens: ['milk'] })).toMatch(/dairy free/)
    expect(dietaryClash({ dietary: ['vegan', 'gluten_free'], allergens: ['soy', 'nuts'] })).toBeNull()
  })

  it('checks a menu item before saving', () => {
    expect(menuItemProblem({ name: ' ', sell_price: 3, description: null, photo_url: null })).toBe('Give it a name')
    expect(menuItemProblem({ name: 'Latte', sell_price: -1, description: null, photo_url: null })).toMatch(/price/)
    expect(menuItemProblem({ name: 'Latte', sell_price: null, description: 'x'.repeat(301), photo_url: null })).toMatch(/300/)
    expect(menuItemProblem({ name: 'Latte', sell_price: 3, description: null, photo_url: 'ftp://x' })).toMatch(/https/)
    expect(menuItemProblem({ name: 'Latte', sell_price: 3.2, description: 'Double shot', photo_url: 'https://x.es/a.jpg' })).toBeNull()
  })

  it('orders sections: the usual ones first, others A–Z, then items without one', () => {
    expect(categoryOrder(['Food', 'Specials', null, 'Coffee', 'Brunch', 'Coffee'])).toEqual(['Coffee', 'Food', 'Brunch', 'Specials', null])
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
