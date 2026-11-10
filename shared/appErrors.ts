// Error alerts without a third-party service (the app_errors migration). What the app and the Worker run
// into is kept one row per kind of error: where it happened, and its message with the parts that change
// from one time to the next (numbers, ids, addresses) taken out, as a fingerprint. Both ends clean what
// they keep the same way: no tokens or keys, no email addresses, no query strings, no secret links (a
// screen's or a rep's page), and nothing long. Nothing from a form is ever sent: only an error's own
// message and stack, the page's path, the build and the browser.

/** The longest each part may be, in characters. */
export const LIMITS = { source: 120, message: 500, stack: 4000, stackLines: 25, path: 200, build: 64, userAgent: 300 }
/** A page sends at most this many reports, each a different error, however long it stays open. */
export const MAX_REPORTS_PER_PAGE = 5
/** The Worker takes an error report of at most this many bytes. */
export const MAX_REPORT_BYTES = 8 * 1024
/**
 * When HQ's admins are told (public.record_app_error(), the app_errors migration, says the same): a new
 * error, or one back after QUIET_HOURS without it; each at most once a day, and ALERTS_AN_HOUR in all.
 * At most NEW_AN_HOUR new kinds an hour are kept; an error unseen for KEEP_DAYS goes (nightly).
 */
export const ALERTS = { QUIET_HOURS: 24, ALERTS_AN_HOUR: 5, NEW_AN_HOUR: 300, KEEP_DAYS: 90 }

/** How the app came across it: its error screen (render), the window's error event, or a promise nobody caught. */
export type ClientErrorKind = 'render' | 'error' | 'promise'
const KINDS: ClientErrorKind[] = ['render', 'error', 'promise']

/** What the app sends the Worker (POST /api/errors). */
export interface ClientErrorReport {
  kind: ClientErrorKind
  message: string
  stack: string | null
  /** The page's path only: never its query string or #fragment, and secret links as :token. */
  path: string | null
  /** The app's build (its main code file's name), when it has one. */
  build: string | null
  user_agent: string | null
}

/** A path segment that is a secret: a screen's, a rep's or a calendar feed's link (long, letters and digits). */
const SECRET_SEGMENT = /\/[\w-]{20,}(?=[/\s'"`)]|$)/g
const secretSegment = (m: string) => (/\d/.test(m) && /[a-z]/i.test(m) ? '/:token' : m)

/** Tokens, keys, email addresses, query strings and secret links out of a text before it's kept anywhere. */
export function scrub(text: string): string {
  return text
    // Sign-ins (JWTs) and anything sent as a bearer or basic credential.
    .replace(/\beyJ[\w-]{5,}\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/\b(bearer|basic)\s+[\w.~+/=-]{8,}/gi, '$1 [token]')
    // The app's access keys (ba_…), Stripe's and Supabase's keys.
    .replace(/\b(?:ba|sb|sk|pk|rk|whsec)_[\w-]{8,}/g, '[key]')
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, '[email]')
    // Query strings and fragments come off addresses, and a key=value that looks secret goes anywhere else.
    .replace(/(\b[a-z][a-z\d+.-]*:\/\/[^\s?#'"`)]*)[?#][^\s'"`)]*/gi, '$1')
    .replace(/([?&#]?\b(?:access_token|refresh_token|token|code|key|apikey|api_key|password|secret|state)=)[^&\s#'"]+/gi, '$1[…]')
    .replace(SECRET_SEGMENT, secretSegment)
}

/** A page's path as it's kept: no query string or fragment, secret links as :token, short. */
export function scrubPath(path: string): string {
  const bare = path.split(/[?#]/)[0] || '/'
  return bare.replace(SECRET_SEGMENT, secretSegment).slice(0, LIMITS.path)
}

/** The message as it's grouped: what changes from one time to the next taken out, spaces tidied. */
export function normalise(message: string): string {
  return scrub(message)
    .replace(/\b[a-z][a-z\d+.-]*:\/\/\S+/gi, '<url>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/gi, '<id>')
    .replace(/\d+(?:[.,:]\d+)*/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/** One kind of error: where it happened and its normalised message, as 32 hex characters. */
export async function fingerprintOf(source: string, message: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${source.trim()}\n${normalise(message)}`)))
  return [...bytes.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** An error's message and stack, whatever was thrown (an object's own fields are never read, beyond its message). */
export function describeError(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) return { message: err.message || err.name || 'Error', stack: typeof err.stack === 'string' ? err.stack : null }
  if (typeof err === 'string') return { message: err || 'Error', stack: null }
  const message = err && typeof err === 'object' ? (err as { message?: unknown }).message : undefined
  return { message: typeof message === 'string' && message ? message : 'Unknown error', stack: null }
}

/** A message as it's kept: cleaned, on one line's worth of characters. */
export const cleanMessage = (message: string) => scrub(message).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, LIMITS.message)

/** A stack as it's kept: cleaned, its first lines only. */
export function cleanStack(stack: string | null | undefined): string | null {
  if (!stack?.trim()) return null
  return scrub(stack).split('\n').slice(0, LIMITS.stackLines).join('\n').slice(0, LIMITS.stack)
}

const text = (v: unknown) => (typeof v === 'string' ? v : null)

/** A report as the Worker keeps it, from whatever was sent: null when it isn't one. */
export function cleanReport(body: unknown): ClientErrorReport | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>
  const message = cleanMessage(text(b.message) ?? '')
  if (!message) return null
  const path = text(b.path)
  const build = text(b.build)
  const agent = text(b.user_agent)
  return {
    kind: KINDS.includes(b.kind as ClientErrorKind) ? b.kind as ClientErrorKind : 'error',
    message,
    stack: cleanStack(text(b.stack)),
    path: path?.startsWith('/') ? scrubPath(path) : null,
    build: build && /^[\w.-]{1,64}$/.test(build) ? build : null,
    user_agent: agent ? agent.replace(/[\u0000-\u001f]/g, '').slice(0, LIMITS.userAgent) : null,
  }
}

/** What the app sends about an error it ran into (null: nothing worth sending). */
export function clientReport(err: unknown, kind: ClientErrorKind, at: { path: string; build: string | null; userAgent: string }): ClientErrorReport | null {
  const { message, stack } = describeError(err)
  return cleanReport({ kind, message, stack, path: at.path, build: at.build, user_agent: at.userAgent })
}
