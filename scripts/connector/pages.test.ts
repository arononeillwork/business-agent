import { describe, expect, it } from 'vitest'
import { buildPages, menuItems, routeFiles } from './pages'

describe('connector pages, worked out from the app', () => {
  const pages = buildPages()
  const page = (key: string) => pages.find(p => p.key === key)!
  const table = (key: string, name: string) => page(key).tables.find(t => t.table === name)

  it('has every page in the menu', () => {
    expect(pages.map(p => p.path)).toEqual(menuItems().map(i => i.to))
    expect(pages.length).toBeGreaterThan(60)
  })

  it('finds the page behind every menu item, so a new page reaches the AI', () => {
    const routes = routeFiles()
    // A menu item whose page can't be found would reach the AI empty: name the page here only
    // if it really holds nothing (and say why).
    const holdsNothing = new Set(['/kiosk'])
    const missing = menuItems().filter(i => !routes.has(i.to) && !holdsNothing.has(i.to)).map(i => i.to)
    expect(missing).toEqual([])
    const empty = pages.filter(p => !p.tables.length && !p.live.length && !holdsNothing.has(p.path)).map(p => p.path)
    expect(empty).toEqual([])
  })

  it('reads what the pages read, with their columns', () => {
    expect(table('coffees', 'coffees')).toMatchObject({ writes: true })
    expect(table('coffees', 'coffees')!.columns.split(', ')).toEqual(expect.arrayContaining(['name', 'roaster', 'tasting_notes', 'photo']))
    expect(table('brand', 'brand')).toBeTruthy()
    expect(table('brand', 'brand_documents')).toBeTruthy()
    expect(table('social', 'post_ideas')).toMatchObject({ writes: true })
    expect(table('menu', 'recipes')).toBeTruthy()
    expect(page('reviews').live).toContain('/api/reviews')
  })

  it('keeps who sees a page', () => {
    expect(page('coffees').who).toBe('all')
    expect(page('customers').who).toBe('admin')
    expect(page('contacts').who).toBe('pay')
  })
})
