// The business's own website reads its menu here (no sign-in): what's on the Menu page, by section in
// the menu's order, with prices, the other ways each item is sold, photos and allergens
// (shared/websiteFeed.ts). The website's server asks for it, or its pages do (any site may: CORS is open).
//
// Each business turns it on for itself (Website & SEO → The menu on your website, settings.website_menu).
// One that hasn't, or a number that's no business, gets the same "not found", so the numbers can't be
// used to list who's here. The business is in the address (/api/site/2/menu), as in a screen's short link;
// what's read is that business's alone (businessDb). docs/WEBSITE.md is the contract for websites.
import { Hono } from 'hono'
import { businessDb, type Env } from './supabase'
import { siteMenu } from '../shared/websiteFeed'
import type { MenuAllergens } from '../shared/allergens'
import type { MenuItem } from '../shared/menu'

export const site = new Hono<{ Bindings: Env }>()

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400' }
const NOT_SHARED = { error: 'This business doesn’t share its menu with a website.' }
const UNAVAILABLE = { error: 'The menu couldn’t be read just now. Try again in a minute.' }
/** A website may keep the menu this long; a change on the Menu page is on it a minute or two later. */
const FRESH = 'public, max-age=60, stale-while-revalidate=300'

site.options('/api/site/*', c => c.body(null, 204, CORS))

site.get('/api/site/:business/menu', async c => {
  const raw = c.req.param('business')
  if (!/^[1-9]\d{0,8}$/.test(raw)) return c.json(NOT_SHARED, 404, CORS)
  const id = Number(raw)
  const db = businessDb(c.env, id)
  const { data: settings, error } = await db.from('settings').select('website_menu, menu_sections, menu_source, menu_synced_at').eq('id', 1).maybeSingle()
  if (error) return c.json(UNAVAILABLE, 503, { ...CORS, 'cache-control': 'no-store' })
  if (settings?.website_menu !== true) return c.json(NOT_SHARED, 404, { ...CORS, 'cache-control': 'public, max-age=60' })
  const [items, business, allergens] = await Promise.all([
    db.rpc('menu_list'),
    db.from('business').select('name, currency').eq('id', id).maybeSingle(),
    // The allergens are a bonus: the menu goes without them rather than not at all.
    db.rpc('display_menu_allergens').then(r => (r.error ? null : (r.data as MenuAllergens | null)), () => null),
  ])
  if (items.error || business.error || !business.data) return c.json(UNAVAILABLE, 503, { ...CORS, 'cache-control': 'no-store' })
  const feed = siteMenu({
    business: { id, name: business.data.name as string, currency: (business.data.currency as string | null) ?? null },
    items: (items.data ?? []) as MenuItem[],
    order: (settings.menu_sections ?? []) as string[],
    source: settings.menu_source as 'custom' | 'square' | null,
    syncedAt: (settings.menu_synced_at as string | null) ?? null,
    allergens,
  })
  return c.json(feed, 200, { ...CORS, 'cache-control': FRESH })
})
