// Error alerts without a third-party service. What goes wrong is kept in public.app_errors, one row per
// kind of error (shared/appErrors.ts groups them), by public.record_app_error() (the app_errors
// migration), which also tells The Business Agent HQ's admins about a new one, or one back after a quiet
// day, with a notification their phones get by push (worker/push.ts): once a day each at most, a few an
// hour in all. Three ways in:
//   - the app's own reports (POST /api/errors, src/app/errorReports.ts), signed in or not;
//   - the Worker's unexpected errors (answerError, its app.onError), with the method and route;
//   - the scheduled jobs' failures (reportError, worker/index.ts).
// HQ's Businesses page lists them (src/components/HqErrors.tsx). Only the service role writes the table,
// and only HQ's admins read it; it isn't any one business's, so the service role over every business
// writes it (scripts/ci/business-scope.test.ts lists this file).
import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { bearer, businessOfRequest, serviceClient, type Env } from './supabase'
import { signedInUser } from './signedIn'
import { LIMITS, MAX_REPORT_BYTES, cleanMessage, cleanReport, cleanStack, describeError, fingerprintOf, scrubPath } from '../shared/appErrors'

/** Reports one address may send in WINDOW_MS, and all of them together, in this Worker instance. */
export const REPORTS_PER_ADDRESS = 30
export const REPORTS_IN_ALL = 300
export const WINDOW_MS = 10 * 60_000
/**
 * The Worker's own reports kept a minute in this instance: each is a request to Supabase, and a scheduled
 * run may make only 50 outside requests, so a run where everything fails still gets its work done.
 */
export const SERVER_REPORTS_A_MINUTE = 8

// Counts in this Worker instance only (each has its own): enough to stop one browser or script flooding
// the table. Behind them, the database keeps at most a few hundred new kinds of error an hour.
const counts = new Map<string, { n: number; until: number }>()
let now = () => Date.now()

/** Tests: nothing counted from another test, and a clock of their own if they like. */
export function forgetErrorReports(clock?: () => number) {
  counts.clear()
  now = clock ?? (() => Date.now())
}

/** One more for this key, if it has any left in its window. */
function take(key: string, max: number, windowMs: number): boolean {
  const t = now()
  const c = counts.get(key)
  if (!c || c.until <= t) {
    if (counts.size > 5000) for (const [k, v] of counts) if (v.until <= t) counts.delete(k)
    counts.set(key, { n: 1, until: t + windowMs })
    return true
  }
  if (c.n >= max) return false
  c.n++
  return true
}

export interface ErrorRecord {
  source: string
  message: string
  stack: string | null
  path: string | null
  business: number | null
  user: string | null
  detail: Record<string, unknown>
}

/** Keep one error (public.record_app_error()); whether HQ's admins were told, or null when it couldn't be kept. */
export async function recordAppError(env: Env, e: ErrorRecord): Promise<boolean | null> {
  const source = e.source.trim().slice(0, LIMITS.source)
  const message = cleanMessage(e.message) || 'Error'
  const { data, error } = await serviceClient(env).rpc('record_app_error', {
    p_fingerprint: await fingerprintOf(source, message), p_source: source, p_message: message,
    p_stack: cleanStack(e.stack), p_path: e.path ? scrubPath(e.path) : null, p_business: e.business, p_user: e.user, p_detail: e.detail,
  })
  if (error) {
    console.error('keeping an error failed', error.message)
    return null
  }
  return data === true
}

/** Settles within `ms` whatever `p` does (a report never holds up what comes after it). */
async function within(ms: number, p: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([p, new Promise(r => { timer = setTimeout(r, ms) })])
  } finally {
    clearTimeout(timer)
  }
}

export interface ErrorExtra { business?: number | null; user?: string | null; path?: string | null; detail?: Record<string, unknown> }

/**
 * Log an error and keep it, for HQ: `where` it happened ("cron: outbox"), what was thrown, and whose it
 * was. Never throws, and never waits more than a few seconds.
 */
export async function reportError(env: Env, where: string, err: unknown, extra: ErrorExtra = {}): Promise<void> {
  try {
    console.error(`${where} failed`, ...(extra.business != null ? [extra.business] : []), err)
    if (!env.SUPABASE_SERVICE_ROLE_KEY || !take('server', SERVER_REPORTS_A_MINUTE, 60_000)) return
    const { message, stack } = describeError(err)
    await within(5000, recordAppError(env, {
      source: where, message, stack, path: extra.path ?? null, business: extra.business ?? null, user: extra.user ?? null,
      detail: { ...extra.detail, version: env.GIT_SHA ?? null },
    }).catch(e => console.error('keeping an error failed', e)))
  } catch (e) {
    console.error('keeping an error failed', e)
  }
}

/** Whose a request is: the business and the person signed in, when they are (nothing when not, or it can't be told). */
async function whoSent<E extends { Bindings: Env }>(c: Context<E>): Promise<{ business: number | null; user: string | null }> {
  const token = bearer(c.req.header('authorization'))
  if (!token) return { business: null, user: null }
  const [user, business] = await Promise.all([
    signedInUser(c.env, token).then(r => r.data.user?.id ?? null, () => null),
    businessOfRequest(c).catch(() => null),
  ])
  return { business, user }
}

/**
 * The Worker's app.onError: an unexpected error is kept with its method and route (in the background),
 * and the answer is as it always was.
 */
export function answerError<E extends { Bindings: Env }>(err: Error, c: Context<E>) {
  if (!(err instanceof HTTPException && err.status < 500)) {
    const method = c.req.method
    const route = c.req.routePath
    const keep = whoSent(c).catch(() => ({ business: null, user: null })).then(who => reportError(c.env, `worker ${method} ${route}`, err, {
      ...who, path: new URL(c.req.url).pathname, detail: { method, route },
    }))
    try { c.executionCtx.waitUntil(keep) } catch { /* no execution context (tests): it carries on by itself */ }
  }
  return c.json({ error: err.message }, 500)
}

/** The body, if it's no bigger than `max` bytes (null when it is). */
async function readUpTo(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return null
  if (!req.body) return ''
  const reader = req.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    parts.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const p of parts) { all.set(p, at); at += p.byteLength }
  return new TextDecoder().decode(all)
}

export const errors = new Hono<{ Bindings: Env }>()

// An error the app ran into, signed in or not. Only from the app's own pages.
errors.post('/api/errors', async c => {
  const origin = c.req.header('origin')
  if ((origin && origin !== new URL(c.req.url).origin) || c.req.header('sec-fetch-site') === 'cross-site') {
    return c.json({ error: 'Error reports come from the app itself' }, 403)
  }
  const address = c.req.header('cf-connecting-ip') ?? 'unknown'
  if (!take(`address ${address}`, REPORTS_PER_ADDRESS, WINDOW_MS) || !take('everyone', REPORTS_IN_ALL, WINDOW_MS)) {
    return c.json({ error: 'Too many error reports. Try again later.' }, 429, { 'retry-after': String(WINDOW_MS / 1000) })
  }
  const text = await readUpTo(c.req.raw, MAX_REPORT_BYTES)
  if (text === null) return c.json({ error: `An error report is at most ${MAX_REPORT_BYTES / 1024} KB` }, 413)
  let body: unknown
  try { body = JSON.parse(text) } catch { body = null }
  const report = cleanReport(body)
  if (!report) return c.json({ error: 'That isn’t an error report' }, 400)
  if (!c.env.SUPABASE_SERVICE_ROLE_KEY) return c.body(null, 204)
  const who = await whoSent(c)
  await recordAppError(c.env, {
    source: 'app', message: report.message, stack: report.stack, path: report.path, ...who,
    detail: { kind: report.kind, build: report.build, user_agent: report.user_agent, version: c.env.GIT_SHA ?? null },
  }).catch(e => console.error('keeping an error failed', e))
  return c.body(null, 204)
})
