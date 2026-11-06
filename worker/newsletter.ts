// Newsletter sign-ups from the business's own website (Website & SEO → Newsletter sign-ups). Whoever
// signs up is on Customers straight away: a lead from the website with a yes to marketing and the
// topics they ticked as tags (the newsletter migration's newsletter_signup()). docs/WEBSITE.md is the
// contract for websites.
//
// No sign-in (the business is in the address, as for the menu):
//   GET  /api/site/<business>/newsletter    the form, as a page: a link to share, or shown inside any website
//   POST /api/site/<business>/signup        a sign-up, from that form, a website's own form (CORS is open) or its server
//   POST /api/site/<business>/unsubscribe   someone unsubscribed on the website (its server, with the key)
// A website's server sends its key (Authorization: Bearer …, made on Website & SEO): its sign-ups skip
// the limit on sign-ups from one place (they all come from the server's address), and may say when
// someone signed up (an older list). Off, or a number that's no business, is the same "not found".
//
// Admins (signed in):
//   POST/DELETE /api/newsletter/key         make (or replace) the website key, shown once; or remove it
//   POST /api/newsletter/import             people from a list brought in (up to 100 at a time)
import { Hono, type Context } from 'hono'
import { bearer, businessDb, requestDb, userClient, type Env } from './supabase'
import { FORM_TEXT, formLanguage, readSignup, type ListRow, type NewsletterInterest, type NewsletterSettings, type Signup, type SignupProblem } from '../shared/newsletter'
import { formPage, offPage } from '../shared/newsletterForm'

export const newsletter = new Hono<{ Bindings: Env }>()

const CORS = {
  'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '86400',
}
const NOT_ON = { error: 'This business doesn’t take newsletter sign-ups here.' }
const UNAVAILABLE = { error: 'Sign-ups couldn’t be saved just now. Try again in a minute.' }
const BAD_KEY = { error: 'That key isn’t this business’s website key.' }
/** Sign-ups from one address (without the website key) in an hour: enough for a family on one Wi-Fi, not for a script. */
export const LIMIT_PER_HOUR = 5
/** A list brought in, at a time. */
export const IMPORT_BATCH = 100

type Config = Pick<NewsletterSettings, 'enabled' | 'interests' | 'ask_name' | 'ask_phone' | 'heading' | 'intro'> & { key_hash: string | null }

const businessIn = (raw: string) => (/^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null)

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')

/** Who sent a sign-up, without keeping who: an HMAC of the address with the Worker's own key. */
async function addressHash(env: Env, business: number, ip: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`newsletter:${env.INTEGRATION_KEY ?? 'business-agent'}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${business}:${ip}`))
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** The business's set-up; null when it has none or it's off (and on a database error, `failed`). */
async function config(env: Env, business: number): Promise<{ on: Config | null; failed?: boolean }> {
  const { data, error } = await businessDb(env, business).from('newsletter')
    .select('enabled, interests, ask_name, ask_phone, heading, intro, key_hash').maybeSingle()
  if (error) return { on: null, failed: true }
  const c = data as Config | null
  return { on: c?.enabled ? { ...c, interests: (c.interests ?? []) as NewsletterInterest[] } : null }
}

/** Whether the request carries the website key: true, false (none), or 'wrong'. */
async function keyed(c: Context, cfg: Config): Promise<boolean | 'wrong'> {
  const token = bearer(c.req.header('authorization'))
  if (!token) return false
  return cfg.key_hash && (await sha256(token)) === cfg.key_hash ? true : 'wrong'
}

/** The body as JSON or as a plain form post (the form page without JavaScript). */
async function bodyOf(c: Context): Promise<{ body: Record<string, unknown>; html: boolean }> {
  const type = c.req.header('content-type') ?? ''
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await c.req.parseBody({ all: true })
    const interests = form.interests === undefined ? [] : Array.isArray(form.interests) ? form.interests : [form.interests]
    return { body: { ...form, interests: interests.filter(v => typeof v === 'string') }, html: true }
  }
  try {
    const json = await c.req.json<unknown>()
    return { body: json && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : {}, html: false }
  } catch {
    return { body: {}, html: false }
  }
}

/** Save one sign-up; an error message when the database says no. */
async function save(env: Env, business: number, s: Signup, via: 'form' | 'website' | 'import', ipHash: string | null) {
  const { error } = await businessDb(env, business).rpc('newsletter_signup', {
    p_email: s.email, p_first_name: s.first_name, p_last_name: s.last_name, p_phone: s.phone, p_interests: s.interests, p_tags: s.tags,
    p_lang: s.lang, p_place: s.place, p_via: via, p_ip_hash: ipHash, p_at: s.at,
  })
  return error?.message ?? null
}

newsletter.options('/api/site/:business/signup', c => c.body(null, 204, CORS))
newsletter.options('/api/site/:business/unsubscribe', c => c.body(null, 204, CORS))

// The form, as a page.
newsletter.get('/api/site/:business/newsletter', async c => {
  const business = businessIn(c.req.param('business'))
  const lang = formLanguage(c.req.query('lang'), c.req.header('accept-language'))
  const { on, failed } = business ? await config(c.env, business) : { on: null }
  if (failed) return c.html(offPage(lang, FORM_TEXT[lang].failed), 503, { 'cache-control': 'no-store' })
  if (!business || !on) return c.html(offPage(lang, FORM_TEXT[lang].off), 404, { 'cache-control': 'public, max-age=60' })
  const look = await lookOf(c.env, business)
  return c.html(formPage({ business, name: look.name, colour: look.colour, settings: on, lang, place: c.req.query('place') ?? null }), 200, PAGE_HEADERS)
})

// A sign-up.
newsletter.post('/api/site/:business/signup', async c => {
  const business = businessIn(c.req.param('business'))
  const { body, html } = await bodyOf(c)
  const lang = formLanguage(typeof body.lang === 'string' ? body.lang : null, c.req.header('accept-language'))
  const answer = async (status: 200 | 400 | 401 | 404 | 429 | 503, json: Record<string, unknown>, problem?: SignupProblem | 'tooMany' | 'failed') => {
    if (!html || !business) return c.json(problem ? { ...json, problem } : json, status, CORS)
    // A plain form post (no JavaScript): the page again, saying how it went.
    const { on } = await config(c.env, business)
    if (!on) return c.html(offPage(lang, FORM_TEXT[lang].off), status)
    const look = await lookOf(c.env, business)
    return c.html(formPage({ business, name: look.name, colour: look.colour, settings: on, lang, place: typeof body.place === 'string' ? body.place : null,
      said: status === 200 ? 'done' : (problem ?? 'failed') }), status, PAGE_HEADERS)
  }
  if (!business) return c.json(NOT_ON, 404, CORS)
  const { on, failed } = await config(c.env, business)
  if (failed) return answer(503, UNAVAILABLE, 'failed')
  if (!on) return c.json(NOT_ON, 404, CORS)
  const trusted = await keyed(c, on)
  if (trusted === 'wrong') return c.json(BAD_KEY, 401, CORS)
  // A field people can't see: only a robot fills it in. It's told it worked, and nothing is saved.
  if (typeof body.website === 'string' && body.website.trim()) return answer(200, { ok: true, interests: [], ignored: [] })
  const read = readSignup(body, on.interests, trusted)
  if ('problem' in read) return answer(400, { error: FORM_TEXT.en[read.problem] }, read.problem)
  let ipHash: string | null = null
  if (!trusted) {
    const ip = c.req.header('cf-connecting-ip')
    if (ip) {
      ipHash = await addressHash(c.env, business, ip)
      const { count, error } = await businessDb(c.env, business).from('newsletter_events').select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash).gte('created_at', new Date(Date.now() - 3600_000).toISOString())
      // A count that can't be read doesn't stop a real sign-up.
      if (!error && (count ?? 0) >= LIMIT_PER_HOUR) return answer(429, { error: FORM_TEXT.en.tooMany }, 'tooMany')
    }
  }
  const self = new URL(c.req.url).origin
  const via = trusted ? (read.signup.at ? 'import' : 'website') : c.req.header('origin') === self ? 'form' : 'website'
  const error = await save(c.env, business, read.signup, via, ipHash)
  if (error) {
    console.error('newsletter sign-up failed', business, error)
    return answer(error.includes('valid email') ? 400 : 503, error.includes('valid email') ? { error: FORM_TEXT.en.invalidEmail } : UNAVAILABLE,
      error.includes('valid email') ? 'invalidEmail' : 'failed')
  }
  return answer(200, { ok: true, interests: read.signup.interests, ignored: read.signup.unknown })
})

// Someone unsubscribed on the website: its server says so, with the key.
newsletter.post('/api/site/:business/unsubscribe', async c => {
  const business = businessIn(c.req.param('business'))
  if (!business) return c.json(NOT_ON, 404, CORS)
  const { on, failed } = await config(c.env, business)
  if (failed) return c.json(UNAVAILABLE, 503, CORS)
  if (!on) return c.json(NOT_ON, 404, CORS)
  const trusted = await keyed(c, on)
  if (trusted !== true) return c.json(trusted === 'wrong' ? BAD_KEY : { error: 'Unsubscribing needs the website key.' }, 401, CORS)
  const { body } = await bodyOf(c)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) return c.json({ error: FORM_TEXT.en.invalidEmail, problem: 'invalidEmail' }, 400, CORS)
  const { data, error } = await businessDb(c.env, business).rpc('newsletter_unsubscribe', { p_email: email, p_via: 'website' })
  if (error) return c.json(UNAVAILABLE, 503, CORS)
  return c.json({ ok: true, found: data === true }, 200, CORS)
})

// ---------------------------------------------------------------------------------------------
// Admins
// ---------------------------------------------------------------------------------------------

for (const path of ['/api/newsletter', '/api/newsletter/*']) {
  newsletter.use(path, async (c, next) => {
    const token = bearer(c.req.header('authorization'))
    const { data } = token ? await userClient(c.env, token, 'app').rpc('is_admin') : { data: false }
    if (data !== true) return c.json({ error: 'Only an admin can set up the newsletter' }, 403)
    await next()
  })
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
/** nl_ + 40 random letters and digits (about 238 bits). */
export function newWebsiteKey() {
  let out = ''
  while (out.length < 40) {
    for (const b of crypto.getRandomValues(new Uint8Array(48))) if (b < 248 && out.length < 40) out += ALPHABET[b % 62]
  }
  return `nl_${out}`
}

// A new key for the website's server, shown this once (only its hash is kept). The old one stops working.
newsletter.post('/api/newsletter/key', async c => {
  const db = await requestDb(c)
  const key = newWebsiteKey()
  const made = { key_hash: await sha256(key), key_hint: key.slice(-4), key_made_at: new Date().toISOString() }
  const { error } = await db.from('newsletter').upsert(made, { onConflict: 'business_id' })
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ key, key_hint: made.key_hint, key_made_at: made.key_made_at })
})

newsletter.delete('/api/newsletter/key', async c => {
  const db = await requestDb(c)
  const { error } = await db.from('newsletter').update({ key_hash: null, key_hint: null, key_made_at: null }).eq('id', 1)
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ ok: true })
})

// People from a list brought in: each signed up as from the list (when they signed up, if it says).
newsletter.post('/api/newsletter/import', async c => {
  const db = await requestDb(c)
  const body = await c.req.json<{ rows?: ListRow[] }>().catch(() => ({ rows: undefined }))
  const rows = Array.isArray(body.rows) ? body.rows : []
  if (rows.length > IMPORT_BATCH) return c.json({ error: `Up to ${IMPORT_BATCH} at a time` }, 400)
  const { data: cfg, error: cfgError } = await db.from('newsletter').select('interests').maybeSingle()
  if (cfgError) return c.json({ error: cfgError.message }, 500)
  const interests = ((cfg?.interests ?? []) as NewsletterInterest[])
  let added = 0, skipped = 0
  const unknown = new Set<string>()
  for (const row of rows) {
    const read = readSignup({ ...row } as Record<string, unknown>, interests, true)
    if ('problem' in read) { skipped++; continue }
    read.signup.unknown.forEach(u => unknown.add(u))
    if (await save(c.env, db.businessId, read.signup, 'import', null)) skipped++
    else added++
  }
  return c.json({ added, skipped, unknown: [...unknown].slice(0, 20) })
})

// ---------------------------------------------------------------------------------------------
// The form page
// ---------------------------------------------------------------------------------------------

/** Shown inside any website (no frame-ancestors limit); its own script and styles only. */
const PAGE_HEADERS = {
  'cache-control': 'public, max-age=60',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'",
  'referrer-policy': 'strict-origin-when-cross-origin',
}

/** The business's name and its main colour (Brand page), for the form. */
async function lookOf(env: Env, business: number): Promise<{ name: string; colour: string | null }> {
  const db = businessDb(env, business)
  const [b, brand] = await Promise.all([
    db.from('business').select('name').eq('id', business).maybeSingle(),
    db.from('brand').select('colours').eq('id', 1).maybeSingle(),
  ])
  const colours = (brand.data?.colours ?? []) as { hex?: string; role?: string }[]
  const hex = colours.find(x => x.role === 'primary')?.hex ?? null
  return { name: (b.data?.name as string | undefined) ?? '', colour: hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : null }
}

