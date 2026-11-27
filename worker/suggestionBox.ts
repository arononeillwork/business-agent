// The suggestion box (shared/suggestionBox.ts): customers scan the Suggestion box QR code and send the
// business an idea, with no sign-in. Each one is on the Suggestions page straight away, not sorted yet,
// heard on the business's day from "Suggestion box", with the customer's name when they give it.
//
// No sign-in (the business is in the address, as for the newsletter form):
//   GET  /api/site/<business>/suggest      the page the code opens
//   POST /api/site/<business>/suggestion   an idea, from that page (JSON, or a plain form post without JavaScript)
// A number that's no business is "not found". From one address, five ideas an hour, and a business takes
// sixty an hour in all (kept in suggestion_box_sends as an HMAC of the address, never the address, for a
// day). A robot filling in the hidden field is told it worked, and nothing is saved.
import { Hono, type Context } from 'hono'
import { businessDb, type Env } from './supabase'
import { businessIn } from './websiteKey'
import { inTimeZone } from './zone'
import { formLanguage, type FormLanguage } from '../shared/newsletter'
import { BOX_TEXT, boxMessagePage, readIdea, suggestionBoxPage, type BoxProblem } from '../shared/suggestionBox'
import { SUGGESTION_BOX_SOURCE } from '../shared/suggestions'
import { today } from '../shared/time'

export const suggestionBox = new Hono<{ Bindings: Env }>()

/** Ideas from one address in an hour: a table of friends, not a script. */
export const LIMIT_PER_HOUR = 5
/** A business's ideas in an hour from everyone: a backstop that holds even when addresses change. */
export const LIMIT_BUSINESS_PER_HOUR = 60

const PAGE_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
}

interface Look { name: string; colour: string | null; country: string | null; timezone: string | null }

/** The business's name, main colour (Brand page), country and time zone; null when the number is no business. */
async function lookOf(env: Env, business: number): Promise<{ look: Look | null; failed?: boolean }> {
  const db = businessDb(env, business)
  const [b, brand] = await Promise.all([
    db.from('business').select('name, country, timezone').eq('id', business).maybeSingle(),
    db.from('brand').select('colours').eq('id', 1).maybeSingle(),
  ])
  if (b.error) return { look: null, failed: true }
  if (!b.data) return { look: null }
  const row = b.data as { name?: string | null; country?: string | null; timezone?: string | null }
  const colours = (brand.data?.colours ?? []) as { hex?: string; role?: string }[]
  const hex = colours.find(x => x.role === 'primary')?.hex ?? null
  return { look: { name: row.name ?? '', colour: hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : null, country: row.country ?? null, timezone: row.timezone ?? null } }
}

/** Who sent an idea, without keeping who: an HMAC of the address with the Worker's own key. */
async function addressHash(env: Env, business: number, ip: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`suggestion-box:${env.INTEGRATION_KEY ?? 'business-agent'}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${business}:${ip}`))
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Whether this many (or more) ideas came in the last hour (from one address, or all); a count that can't be read stops nobody. */
async function overHour(env: Env, business: number, max: number, ipHash?: string) {
  let q = businessDb(env, business).from('suggestion_box_sends').select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 3600_000).toISOString())
  if (ipHash) q = q.eq('ip_hash', ipHash)
  const { count, error } = await q
  return !error && (count ?? 0) >= max
}

/** The body as JSON or as a plain form post (the page without JavaScript). */
async function bodyOf(c: Context): Promise<{ body: Record<string, unknown>; html: boolean }> {
  const type = c.req.header('content-type') ?? ''
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    return { body: await c.req.parseBody() as Record<string, unknown>, html: true }
  }
  try {
    const json = await c.req.json<unknown>()
    return { body: json && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : {}, html: false }
  } catch {
    return { body: {}, html: false }
  }
}

const langOf = (c: Context, asked: unknown, country?: string | null): FormLanguage =>
  formLanguage(typeof asked === 'string' ? asked : null, c.req.header('accept-language'), country)

// The page the code opens.
suggestionBox.get('/api/site/:business/suggest', async c => {
  const business = businessIn(c.req.param('business'))
  const { look, failed } = business ? await lookOf(c.env, business) : { look: null }
  const lang = langOf(c, c.req.query('lang'), look?.country)
  if (failed) return c.html(boxMessagePage(lang, 'failed'), 503, PAGE_HEADERS)
  if (!business || !look) return c.html(boxMessagePage(lang, 'off'), 404, PAGE_HEADERS)
  return c.html(suggestionBoxPage({ business, name: look.name, colour: look.colour, lang }), 200, PAGE_HEADERS)
})

// An idea.
suggestionBox.post('/api/site/:business/suggestion', async c => {
  const business = businessIn(c.req.param('business'))
  const { body, html } = await bodyOf(c)
  const { look, failed } = business ? await lookOf(c.env, business) : { look: null }
  const lang = langOf(c, body.lang, look?.country)
  const typed = { idea: typeof body.idea === 'string' ? body.idea : '', name: typeof body.name === 'string' ? body.name : '' }
  const answer = (status: 200 | 400 | 404 | 429 | 503, said: BoxProblem | 'failed' | 'tooMany' | 'off' | 'done') => {
    if (!html) return c.json(said === 'done' ? { ok: true } : { error: BOX_TEXT.en[said], problem: said }, status)
    // A plain form post: the page again, saying how it went (what was typed kept, to fix and send again).
    if (said === 'off' || !business || !look) return c.html(boxMessagePage(lang, 'off'), status, PAGE_HEADERS)
    return c.html(suggestionBoxPage({ business, name: look.name, colour: look.colour, lang, said, typed: said === 'done' ? undefined : typed }), status, PAGE_HEADERS)
  }
  if (failed) return answer(503, 'failed')
  if (!business || !look) return answer(404, 'off')
  // A field people can't see: only a robot fills it in. It's told it worked, and nothing is saved.
  if (typeof body.website === 'string' && body.website.trim()) return answer(200, 'done')
  const read = readIdea(body)
  if ('problem' in read) return answer(400, read.problem)
  const ipHash = await addressHash(c.env, business, c.req.header('cf-connecting-ip') ?? 'unknown')
  if (await overHour(c.env, business, LIMIT_PER_HOUR, ipHash) || await overHour(c.env, business, LIMIT_BUSINESS_PER_HOUR)) return answer(429, 'tooMany')
  const db = businessDb(c.env, business)
  const { error } = await db.from('customer_suggestions').insert({
    text: read.idea.text, customer: read.idea.customer, source: SUGGESTION_BOX_SOURCE,
    // The business's day, not the database's.
    heard_on: inTimeZone(look.timezone, () => today()),
  })
  if (error) {
    console.error('suggestion box: an idea wasn’t saved', business, error.message)
    return answer(503, 'failed')
  }
  // Counted for the limits (by the Worker's clock, which the limits read), and what's older than a day let go.
  const [sent, pruned] = await Promise.all([
    db.from('suggestion_box_sends').insert({ ip_hash: ipHash, created_at: new Date().toISOString() }),
    db.from('suggestion_box_sends').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString()),
  ])
  if (sent.error || pruned.error) console.error('suggestion box: the count wasn’t kept', business, (sent.error ?? pruned.error)?.message)
  return answer(200, 'done')
})
