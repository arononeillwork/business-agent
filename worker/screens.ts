// Screens: the link a café screen opens (/display/<token>, no sign-in) asks here for its settings,
// slides and the digital menus on it, every minute while it's on, so changes on the Screens page
// show without touching the screen. The token is the screen's secret; display_feed() notes the
// screen as seen. The Screens page itself reads and writes the database directly (admins).
import { Hono } from 'hono'
import { serviceClient, type Env } from './supabase'

export const screens = new Hono<{ Bindings: Env }>()

screens.get('/api/display/:token', async c => {
  const token = c.req.param('token')
  const gone = { error: 'This screen’s link has changed or the screen was removed. Open the new link from the Screens page.' }
  if (!/^[0-9a-f]{32}$/.test(token)) return c.json(gone, 404)
  const { data, error } = await serviceClient(c.env).rpc('display_feed', { p_token: token })
  if (error) return c.json({ error: 'The slides couldn’t be loaded just now. The screen tries again in a minute.' }, 503)
  if (!data) return c.json(gone, 404)
  return c.json(data, 200, { 'cache-control': 'no-store' })
})
