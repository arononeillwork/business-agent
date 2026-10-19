// Calendar feeds (iCalendar). Per person: my published shifts, my approved time off, and days the
// café is closed or on holiday. Business (admins): every shift with names, the calendar, and the
// big sports nights. Calendar apps poll the URL, so updates show up without any sign-in.
import { Hono, type MiddlewareHandler } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { seal, unseal } from './crypto'
import { calendarFetched } from './connections'
import { calendarAppFromAgent } from '../shared/connections'
import { buildIcs, type IcsEvent } from '../shared/ics'
import { addDays, today } from '../shared/time'
import { businessConfig } from '../shared/business.config'

export type FeedScope = 'me' | 'business'

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')

const newToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const feedUrl = (origin: string, token: string) => `${origin}/cal/${token}.ics`

/** Make (or reset) someone's feed link. Resetting stops the old link working straight away. */
async function makeFeed(env: Env, db: SupabaseClient, profileId: string, scope: FeedScope, origin: string) {
  const token = newToken()
  const { error } = await db.from('calendar_feeds').upsert({
    profile_id: profileId, scope, token_hash: await sha256(token),
    ciphertext: await seal(env.INTEGRATION_KEY!, { token }), created_at: new Date().toISOString(), last_read_at: null, last_read_by: null,
  })
  if (error) throw new Error(error.message)
  return feedUrl(origin, token)
}

/** Someone's feed link, made the first time it's needed (Connections page: "Add to Google Calendar"). */
export async function ensureFeed(env: Env, db: SupabaseClient, profileId: string, scope: FeedScope, origin: string) {
  const { data } = await db.from('calendar_feeds').select('ciphertext').eq('profile_id', profileId).eq('scope', scope).maybeSingle()
  if (data) return feedUrl(origin, (await unseal<{ token: string }>(env.INTEGRATION_KEY!, data.ciphertext)).token)
  return makeFeed(env, db, profileId, scope, origin)
}

/** The events for one feed (past 2 weeks to 10 weeks ahead). */
export async function feedEvents(db: SupabaseClient, scope: FeedScope, profileId: string): Promise<IcsEvent[]> {
  const from = addDays(today(), -14), to = addDays(today(), 70)
  const host = businessConfig.name.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const [{ data: biz }, { data: positions }, { data: people }] = await Promise.all([
    db.from('business').select('name, address').eq('id', 1).maybeSingle(),
    db.from('positions').select('id, name'),
    db.from('profiles').select('id, full_name'),
  ])
  const posName = new Map((positions ?? []).map(p => [p.id as number, p.name as string]))
  const who = new Map((people ?? []).map(p => [p.id as string, p.full_name as string]))
  const address = (biz?.address as string | undefined) ?? undefined

  let shifts = db.from('shifts').select('id, profile_id, position_id, starts_at, ends_at, break_minutes, note')
    .eq('status', 'published').gte('starts_at', `${from}T00:00:00Z`).lt('starts_at', `${to}T00:00:00Z`).order('starts_at')
  if (scope === 'me') shifts = shifts.eq('profile_id', profileId)
  let off = db.from('time_off').select('id, profile_id, starts_on, ends_on, kind').eq('status', 'approved').gte('ends_on', from).lte('starts_on', to)
  if (scope === 'me') off = off.eq('profile_id', profileId)
  const calendar = db.from('calendar_events').select('id, title, starts_on, ends_on, category, town, visibility')
    .gte('starts_on', from).lte('starts_on', to)
  const sports = scope === 'business'
    ? db.from('sports_events').select('id, title, starts_at, time_tbc, venue, sports_competitions!inner(name, followed)')
      .eq('big', true).eq('sports_competitions.followed', true).gte('starts_at', `${today()}T00:00:00Z`).lt('starts_at', `${to}T00:00:00Z`)
    : null
  const [s, o, c, sp] = await Promise.all([shifts, off, calendar, sports ?? Promise.resolve({ data: [] })])

  const events: IcsEvent[] = []
  for (const x of s.data ?? []) {
    const role = posName.get(x.position_id as number)
    const name = x.profile_id ? who.get(x.profile_id as string) ?? 'Someone' : 'Open shift'
    events.push({
      uid: `shift-${x.id}@${host}`, start: x.starts_at, end: x.ends_at, location: address,
      title: scope === 'me' ? `${businessConfig.name}${role ? ` · ${role}` : ''}` : `${name}${role ? ` · ${role}` : ''}`,
      description: [x.break_minutes ? `Break: ${x.break_minutes} min` : '', x.note ?? ''].filter(Boolean).join('\n') || undefined,
    })
  }
  const kinds: Record<string, string> = { vacation: 'Holiday', personal: 'Day off', sick: 'Sick leave', other: 'Time off' }
  for (const x of o.data ?? []) {
    const label = kinds[x.kind as string] ?? 'Time off'
    events.push({ uid: `off-${x.id}@${host}`, day: x.starts_on, lastDay: x.ends_on,
      title: scope === 'me' ? label : `${who.get(x.profile_id as string) ?? 'Someone'}: ${label.toLowerCase()}` })
  }
  // People see the café-wide days; staff-only and admin-only items stay in the app.
  for (const x of c.data ?? []) {
    if (x.visibility !== 'all' && scope === 'me') continue
    if (scope === 'me' && !['national', 'regional', 'local', 'business'].includes(x.category as string)) continue
    events.push({ uid: `cal-${x.id}@${host}`, day: x.starts_on, lastDay: x.ends_on ?? undefined,
      title: `${x.title}${x.town ? ` (${x.town})` : ''}` })
  }
  for (const x of (sp.data ?? []) as { id: string; title: string; starts_at: string; time_tbc: boolean; venue: string | null; sports_competitions: { name: string } | { name: string }[] }[]) {
    const comp = Array.isArray(x.sports_competitions) ? x.sports_competitions[0]?.name : x.sports_competitions?.name
    const title = `📺 ${x.title}${comp ? ` (${comp})` : ''}`
    if (x.time_tbc) events.push({ uid: `sport-${x.id}@${host}`, day: x.starts_at.slice(0, 10), title: `${title} · time TBC` })
    else events.push({ uid: `sport-${x.id}@${host}`, start: x.starts_at, end: new Date(Date.parse(x.starts_at) + 2 * 3_600_000).toISOString(), title, location: x.venue ?? undefined })
  }
  return events
}

export const calendarFeeds = new Hono<{ Bindings: Env; Variables: { userId: string; role: string } }>()

const signedIn: MiddlewareHandler<{ Bindings: Env; Variables: { userId: string; role: string } }> = async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'app')
  const [{ data: user }, { data: role }] = await Promise.all([sb.auth.getUser(token), sb.rpc('my_role')])
  if (!user.user || !['admin', 'employee'].includes(role as string)) return c.json({ error: 'Calendar feeds are for the team' }, 403)
  c.set('userId', user.user.id)
  c.set('role', role as string)
  await next()
}
calendarFeeds.use('/api/me/calendar-feed', signedIn)
calendarFeeds.use('/api/me/calendar-feed/*', signedIn)

const scopeOf = (s: string | undefined): FeedScope | null => s === 'me' || s === 'business' ? s : null

// Your feed links (made on first request; the link stays the same until you reset it).
calendarFeeds.get('/api/me/calendar-feed', async c => {
  if (!c.env.INTEGRATION_KEY) return c.json({ error: 'Calendar links are being set up' }, 503)
  const origin = new URL(c.req.url).origin
  const { data } = await serviceClient(c.env).from('calendar_feeds').select('scope, ciphertext').eq('profile_id', c.get('userId'))
  const out: Partial<Record<FeedScope, string>> = {}
  for (const row of data ?? []) {
    if (row.scope === 'business' && c.get('role') !== 'admin') continue
    out[row.scope as FeedScope] = feedUrl(origin, (await unseal<{ token: string }>(c.env.INTEGRATION_KEY, row.ciphertext)).token)
  }
  return c.json(out)
})

// Make (or reset) a feed link. Resetting stops the old link working straight away.
calendarFeeds.post('/api/me/calendar-feed/:scope', async c => {
  const scope = scopeOf(c.req.param('scope'))
  if (!scope) return c.json({ error: 'Unknown feed' }, 404)
  if (scope === 'business' && c.get('role') !== 'admin') return c.json({ error: 'Only an admin can share the whole business calendar' }, 403)
  if (!c.env.INTEGRATION_KEY) return c.json({ error: 'Calendar links are being set up' }, 503)
  return c.json({ url: await makeFeed(c.env, serviceClient(c.env), c.get('userId'), scope, new URL(c.req.url).origin) })
})

calendarFeeds.delete('/api/me/calendar-feed/:scope', async c => {
  const scope = scopeOf(c.req.param('scope'))
  if (!scope) return c.json({ error: 'Unknown feed' }, 404)
  await serviceClient(c.env).from('calendar_feeds').delete().eq('profile_id', c.get('userId')).eq('scope', scope)
  return c.json({ ok: true })
})

// The feed itself (no sign-in: calendar apps can't). Unknown links and switched-off people get 404.
calendarFeeds.get('/cal/:file', async c => {
  const token = c.req.param('file').replace(/\.ics$/, '')
  if (!/^[A-Za-z0-9_-]{30,}$/.test(token)) return c.text('Not found', 404)
  const db = serviceClient(c.env)
  const { data: feed } = await db.from('calendar_feeds').select('profile_id, scope').eq('token_hash', await sha256(token)).maybeSingle()
  if (!feed) return c.text('Not found', 404)
  const { data: person } = await db.from('profiles').select('full_name, role, active').eq('id', feed.profile_id).maybeSingle()
  if (!person?.active || !['admin', 'employee'].includes(person.role as string)) return c.text('Not found', 404)
  if (feed.scope === 'business' && person.role !== 'admin') return c.text('Not found', 404)
  const events = await feedEvents(db, feed.scope as FeedScope, feed.profile_id as string)
  // Which app fetched it: Google Calendar or Outlook fetching the team calendar proves (and keeps
  // proving) the business's calendar connection. A person's browser or phone changes nothing.
  const agent = c.req.header('user-agent') ?? null
  const app = feed.scope === 'business' ? calendarAppFromAgent(agent) : null
  c.executionCtx.waitUntil((async () => {
    await db.from('calendar_feeds').update({ last_read_at: new Date().toISOString(), last_read_by: agent?.slice(0, 200) ?? null })
      .eq('profile_id', feed.profile_id).eq('scope', feed.scope)
    if (app) await calendarFetched(db, app)
  })().catch(e => console.error('calendar feed bookkeeping failed', e)))
  const name = feed.scope === 'me' ? `${businessConfig.name} · my shifts` : `${businessConfig.name} · team calendar`
  return new Response(buildIcs(name, events), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=900',
      'content-disposition': `inline; filename="${feed.scope === 'me' ? 'my-shifts' : 'team'}.ics"` },
  })
})
