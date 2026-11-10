// Screens: the link a café screen opens (/display/<token>, no sign-in) asks here for its settings,
// slides and the digital menus on it, every minute while it's on, so changes on the Screens page
// show without touching the screen. The token is the screen's secret; display_feed() notes the
// screen as seen. The Screens page itself reads and writes the database directly (admins).
// A screen's short link (/display-menu/cafe-tv, /slideshow/offers; /display-menu/2/bar-tv for
// business 2) names its business in the link itself, so it's found within that business alone.
// The feed says the business's country, currency and time zone, so the screen writes prices and times its way.
import { Hono, type Context } from 'hono'
import { businessDb, serviceClient, type Env } from './supabase'
import { parseShortLink } from '../shared/screens'

export const screens = new Hono<{ Bindings: Env }>()

const GONE = { error: 'This screen’s link has changed or the screen was removed. Open the new link from the Screens page.' }

/** What the screen with this token plays, from its own business's database. */
async function feed(c: Context<{ Bindings: Env }>, business: number, token: string) {
  const db = businessDb(c.env, business)
  const [{ data, error }, { data: biz }] = await Promise.all([
    db.rpc('display_feed', { p_token: token }),
    db.from('business').select('country, currency, timezone').maybeSingle(),
  ])
  if (error) return c.json({ error: 'The slides couldn’t be loaded just now. The screen tries again in a minute.' }, 503)
  if (!data) return c.json(GONE, 404)
  // Whose screen it is: Easy Beans (business 1) has a bundled logo for when it hasn't uploaded one (MenuBoard).
  // And its country, currency and time zone: nobody is signed in on a TV, so the screen writes its prices that
  // country's way from them (Ireland's "€3.20", Spain's "€3,20") and its times in the business's own time.
  const fed = data as { business?: Record<string, unknown> }
  const where = biz as { country?: string | null; currency?: string | null; timezone?: string | null } | null
  const country = where?.country === 'IE' ? 'IE' : 'ES'
  return c.json({ ...fed, business: { ...fed.business, id: business, country, currency: where?.currency || 'EUR',
    timezone: where?.timezone || (country === 'IE' ? 'Europe/Dublin' : 'Europe/Madrid') } }, 200, { 'cache-control': 'no-store' })
}

screens.get('/api/display/:token', async c => {
  const token = c.req.param('token')
  if (!/^[0-9a-f]{32}$/.test(token)) return c.json(GONE, 404)
  // The screen's own business answers.
  const { data: screen } = await serviceClient(c.env).from('screens').select('business_id').eq('token', token).maybeSingle()
  if (!screen) return c.json(GONE, 404)
  return feed(c, screen.business_id as number, token)
})

// A short link: the screen with that link name in the business it names (its first screen, or first
// slideshow, when there's no name).
const byLink = async (c: Context<{ Bindings: Env }>) => {
  const link = parseShortLink(c.req.path.slice('/api'.length))
  if (!link) return c.json(GONE, 404)
  const db = businessDb(c.env, link.business)
  const query = link.name
    ? db.from('screens').select('token').eq('slug', link.name)
    : db.from('screens').select('token').eq('kind', link.kind).order('created_at').limit(1)
  const { data, error } = await query.maybeSingle()
  if (error) return c.json({ error: 'The slides couldn’t be loaded just now. The screen tries again in a minute.' }, 503)
  if (!data) return c.json(GONE, 404)
  return feed(c, link.business, data.token as string)
}
for (const prefix of ['/api/display-menu', '/api/slideshow']) {
  screens.get(prefix, byLink)
  screens.get(`${prefix}/*`, byLink)
}
