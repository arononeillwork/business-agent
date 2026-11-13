// The business's own website reads its menu here (no sign-in): what's on the Menu page, by section in
// the menu's order, with prices, the other ways each item is sold, photos and allergens
// (shared/websiteFeed.ts). The website's server asks for it, or its pages do (any site may: CORS is open).
//
// Each business turns it on for itself (Website & SEO → The menu on your website, settings.website_menu).
// One that hasn't, or a number that's no business, gets the same "not found", so the numbers can't be
// used to list who's here. The business is in the address (/api/site/2/menu), as in a screen's short link;
// what's read is that business's alone (businessDb). docs/WEBSITE.md is the contract for websites.
import { Hono } from 'hono'
import { businessDb, secretPlaceId, type Env } from './supabase'
import { siteMenu } from '../shared/websiteFeed'
import type { MenuAllergens } from '../shared/allergens'
import type { MenuItem } from '../shared/menu'
import { CLOSURES_AHEAD, siteDetails, type DetailsInput } from '../shared/websiteDetails'
import { addDays, isTimeZone, today } from '../shared/time'
import type { CalendarEvent } from '../shared/types'

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

// ---------------------------------------------------------------------------------------------
// The business's details: where it is, how to reach it, its social accounts and when it's open,
// with the closures on its Calendar (shared/websiteDetails.ts). As public as the menu, turned on on
// Website & SEO (settings.website_details); off, or no such business, the same "not found".
// ---------------------------------------------------------------------------------------------
const DETAILS_NOT_SHARED = { error: 'This business doesn’t share its details with a website.' }
const DETAILS_UNAVAILABLE = { error: 'The business’s details couldn’t be read just now. Try again in a minute.' }

site.get('/api/site/:business/details', async c => {
  const raw = c.req.param('business')
  if (!/^[1-9]\d{0,8}$/.test(raw)) return c.json(DETAILS_NOT_SHARED, 404, CORS)
  const id = Number(raw)
  const db = businessDb(c.env, id)
  const { data: settings, error } = await db.from('settings').select('website_details').eq('id', 1).maybeSingle()
  if (error) return c.json(DETAILS_UNAVAILABLE, 503, { ...CORS, 'cache-control': 'no-store' })
  if (settings?.website_details !== true) return c.json(DETAILS_NOT_SHARED, 404, { ...CORS, 'cache-control': 'public, max-age=60' })
  const { data: business, error: bizError } = await db.from('business')
    .select('name, address, phone, email, instagram, website, timezone, opening_hours, whatsapp, tiktok').eq('id', id).maybeSingle()
  if (bizError || !business) return c.json(DETAILS_UNAVAILABLE, 503, { ...CORS, 'cache-control': 'no-store' })
  const b = business as unknown as DetailsInput['business']
  const day = today(isTimeZone(b.timezone) ? b.timezone : undefined)
  const [events, google] = await Promise.all([
    // From a while back too: a closure of several days that started before today still counts.
    db.from('calendar_events').select('id, starts_on, ends_on, starts_at, title, category, town, competition, source, confirmed, visibility')
      .gte('starts_on', addDays(day, -60)).lte('starts_on', addDays(day, CLOSURES_AHEAD)),
    db.from('integrations').select('external').eq('provider', 'google_business').maybeSingle(),
  ])
  if (events.error) return c.json(DETAILS_UNAVAILABLE, 503, { ...CORS, 'cache-control': 'no-store' })
  const feed = siteDetails({
    business: { ...b, id },
    events: (events.data ?? []) as CalendarEvent[],
    closedOnHolidays: !!(google.data?.external as { closed_on_holidays?: boolean } | null)?.closed_on_holidays,
    placeId: secretPlaceId(c.env, db) ?? null,
    today: day,
  })
  return c.json(feed, 200, { ...CORS, 'cache-control': FRESH })
})
