// User analytics (Settings → User analytics, shared/usage.ts): the app's reports of what it's used for, kept for
// the owners. The app sends a visit's time on each page about once a minute and as it's hidden or closed
// (src/app/usage.ts); this adds the device, from the browser's own description, and the town, from where
// Cloudflare places the connection (the address itself isn't kept), and keeps it as the person who sent it, in
// their business (public.record_usage(), the user_analytics migration). Visits go after a year (nightly).
//   POST /api/usage   someone signed in: { visit, installed, touch, pages: [{ page, views, seconds }] } → 204; 503 when
//                     Supabase can't say who they are (the app sends it again), 401 when the sign-in isn't one
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, businessDb, type Env } from './supabase'
import { signInCheck, signedInUser } from './signedIn'
import { reportError } from './errors'
import { KEEP_DAYS, MAX_REPORT_BYTES, cleanUsageReport, deviceOf } from '../shared/usage'

/** Reports one person may send a minute, in this Worker instance (the app sends one a minute, a few more as it's hidden). */
export const REPORTS_A_MINUTE = 12

const counts = new Map<string, { n: number; until: number }>()
let now = () => Date.now()

/** Tests: nothing counted from another test, and a clock of their own if they like. */
export function forgetUsageReports(clock?: () => number) {
  counts.clear()
  now = clock ?? (() => Date.now())
}

/** One more report from this person, if they have any left this minute. */
function take(who: string): boolean {
  const t = now()
  const c = counts.get(who)
  if (!c || c.until <= t) {
    if (counts.size > 5000) for (const [k, v] of counts) if (v.until <= t) counts.delete(k)
    counts.set(who, { n: 1, until: t + 60_000 })
    return true
  }
  if (c.n >= REPORTS_A_MINUTE) return false
  c.n++
  return true
}

/** Where Cloudflare places a request (its town, region and country); its headers stand in where there's no `cf` (local runs, tests). */
export function placeOf(req: Request): { city: string | null; region: string | null; country: string | null } {
  const cf = (req as Request & { cf?: { city?: unknown; region?: unknown; country?: unknown } }).cf
  const text = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 100) : null)
  const from = cf ?? { city: req.headers.get('cf-ipcity'), region: req.headers.get('cf-region'), country: req.headers.get('cf-ipcountry') }
  const country = text(from.country)?.toUpperCase() ?? null
  return { city: text(from.city), region: text(from.region), country: country && /^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'T1' ? country : null }
}

/** Nightly: visits older than a year, with their pages. */
export async function clearOldUsage(db: SupabaseClient, at = Date.now()) {
  const { error } = await db.from('usage_visits').delete().lt('started_at', new Date(at - KEEP_DAYS * 86_400_000).toISOString())
  if (error) throw new Error(error.message)
}

export const usage = new Hono<{ Bindings: Env }>()

usage.post('/api/usage', async c => {
  const origin = c.req.header('origin')
  if ((origin && origin !== new URL(c.req.url).origin) || c.req.header('sec-fetch-site') === 'cross-site') {
    return c.json({ error: 'Reports come from the app itself' }, 403)
  }
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  if (Number(c.req.header('content-length') ?? 0) > MAX_REPORT_BYTES) return c.json({ error: 'Too big' }, 413)
  const text = await c.req.text()
  if (text.length > MAX_REPORT_BYTES) return c.json({ error: 'Too big' }, 413)
  let body: unknown
  try { body = JSON.parse(text) } catch { body = null }
  const report = cleanUsageReport(body)
  if (!report) return c.json({ error: 'That isn’t a usage report' }, 400)
  // Supabase not answering (an outage, a restart) isn't the sign-in being wrong: the app keeps the report and
  // sends it again with the next one, rather than letting it go as it does when it's told it isn't signed in.
  const busy = () => c.json({ error: 'Couldn’t check the sign-in. Try again in a minute.' }, 503, { 'retry-after': '60' })
  let checks: [Awaited<ReturnType<typeof signedInUser>>, Awaited<ReturnType<typeof signInCheck<'current_business_id'>>>]
  try {
    checks = await Promise.all([signedInUser(c.env, token), signInCheck(c.env, token, 'current_business_id')])
  } catch {
    return busy()
  }
  const [{ data: who, error: whoError }, { data: businessId, error: businessError }] = checks
  if (!who.user) return !whoError || turnedAway(whoError) ? c.json({ error: 'Not signed in' }, 401) : busy()
  if (businessError) return busy()
  if (!businessId) return c.json({ error: 'You’re not in a business yet' }, 403)
  const user = who.user
  if (!take(user.id)) return c.json({ error: 'Too many reports. Try again in a minute.' }, 429, { 'retry-after': '60' })
  const { device, os, browser } = deviceOf(c.req.header('user-agent') ?? '', report.touch)
  const place = placeOf(c.req.raw)
  const { error } = await businessDb(c.env, businessId as number).rpc('record_usage', {
    p_profile: user.id, p_visit: report.visit, p_device: device, p_os: os, p_browser: browser, p_installed: report.installed,
    p_city: place.city, p_region: place.region, p_country: place.country, p_pages: report.pages,
  })
  if (error) {
    // Kept for HQ (Businesses → Errors), so a report that can't be kept doesn't go unnoticed.
    const keep = reportError(c.env, 'usage: keeping a report', error.message, { business: businessId as number, user: user.id, path: '/api/usage' })
    try { c.executionCtx.waitUntil(keep) } catch { /* no execution context (tests): it carries on by itself */ }
    return c.json({ error: 'Couldn’t keep it' }, 502)
  }
  return c.body(null, 204)
})

/** Supabase turned the sign-in away (expired, or not one), rather than not answering. */
function turnedAway(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' && status >= 400 && status < 500
}
