// Personal access keys, so any AI or automation can act as a team member: MCP clients that send a
// header (OpenAI and Anthropic APIs, n8n, agent frameworks), the REST API and its OpenAPI spec.
// Each person makes and revokes their own keys (My account → AI assistants); only a hash is kept.
// A key never bypasses anything: the Worker signs in as its owner with a normal session, so the
// same database rules apply as in the app, and changes are logged as made via the API or AI.
import { Hono, type MiddlewareHandler } from 'hono'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { seal, unseal } from './crypto'
import { loadMe } from './tools'

export const KEY_PATTERN = /^ba_[A-Za-z0-9]{40}$/
export const isAccessKey = (token: string | null | undefined): token is string => !!token && token.startsWith('ba_')
const MAX_KEYS = 10
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')

/** ba_ + 40 random letters and digits (about 238 bits). */
export function newKey() {
  let out = ''
  while (out.length < 40) {
    for (const b of crypto.getRandomValues(new Uint8Array(48))) if (b < 248 && out.length < 40) out += ALPHABET[b % 62]
  }
  return `ba_${out}`
}

interface KeySession { access_token: string; refresh_token: string; expires_at: number }
const toKeySession = (s: Session): KeySession => ({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600) })
const anon = (env: Env) => createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

async function refresh(env: Env, refreshToken: string): Promise<KeySession | null> {
  const { data } = await anon(env).auth.refreshSession({ refresh_token: refreshToken })
  return data.session ? toKeySession(data.session) : null
}

/** A new session for the key's owner without their password: a one-time sign-in link the Worker uses at once (no email is sent). */
async function mint(env: Env, db: SupabaseClient, email: string): Promise<KeySession> {
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data.properties?.hashed_token) throw new Error(error?.message ?? 'Could not sign in with this key')
  const { data: v, error: e2 } = await anon(env).auth.verifyOtp({ type: 'magiclink', token_hash: data.properties.hashed_token })
  if (e2 || !v.session) throw new Error(e2?.message ?? 'Could not sign in with this key')
  return toKeySession(v.session)
}

/**
 * The person behind an access key, with a session to act as them (kept encrypted with the key and
 * renewed when it runs out). Null if the key is unknown or revoked, or its owner was switched off.
 */
export async function resolveKey(env: Env, key: string): Promise<{ userId: string; accessToken: string } | null> {
  if (!KEY_PATTERN.test(key) || !env.INTEGRATION_KEY) return null
  const db = serviceClient(env)
  const { data: row } = await db.from('api_keys').select('id, profile_id, session, last_used_at, revoked_at').eq('key_hash', await sha256(key)).maybeSingle()
  if (!row || row.revoked_at) return null
  const { data: person } = await db.from('profiles').select('email, active, role').eq('id', row.profile_id).maybeSingle()
  if (!person?.active || !person.email || person.role === 'kiosk') return null
  const now = new Date().toISOString()
  let s = row.session ? await unseal<KeySession>(env.INTEGRATION_KEY, row.session).catch(() => null) : null
  if (!s || s.expires_at * 1000 - Date.now() < 120_000) {
    s = (s && await refresh(env, s.refresh_token).catch(() => null)) ?? await mint(env, db, person.email)
    await db.from('api_keys').update({ session: await seal(env.INTEGRATION_KEY, s), last_used_at: now }).eq('id', row.id)
  } else if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 5 * 60_000) {
    await db.from('api_keys').update({ last_used_at: now }).eq('id', row.id)
  }
  return { userId: row.profile_id as string, accessToken: s.access_token }
}

/** The Supabase session token for a request: a normal sign-in token, or one made from an access key. */
export async function sessionToken(env: Env, header: string | undefined | null) {
  const token = bearer(header)
  if (!isAccessKey(token)) return token
  return (await resolveKey(env, token))?.accessToken ?? null
}

export const apiKeys = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

// Managing keys needs a real sign-in (a key can't make more keys).
const signedIn: MiddlewareHandler<{ Bindings: Env; Variables: { userId: string } }> = async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token || isAccessKey(token)) return c.json({ error: 'Sign in to the app to manage access keys' }, 401)
  if (!c.env.INTEGRATION_KEY) return c.json({ error: 'Access keys are being set up' }, 503)
  try {
    const me = await loadMe(userClient(c.env, token, 'app'), token)
    c.set('userId', me.id)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 403)
  }
  await next()
}
apiKeys.use('/api/me/api-keys', signedIn)
apiKeys.use('/api/me/api-keys/*', signedIn)

const KEY_COLUMNS = 'id, name, prefix, created_at, last_used_at'

apiKeys.get('/api/me/api-keys', async c => {
  const { data, error } = await serviceClient(c.env).from('api_keys').select(KEY_COLUMNS)
    .eq('profile_id', c.get('userId')).is('revoked_at', null).order('created_at', { ascending: false })
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ keys: data })
})

apiKeys.post('/api/me/api-keys', async c => {
  const { name } = await c.req.json<{ name?: string }>().catch(() => ({ name: undefined }))
  const label = (name ?? '').trim().slice(0, 60)
  if (!label) return c.json({ error: 'Give the key a name, like “ChatGPT” or “n8n”' }, 400)
  const db = serviceClient(c.env)
  const { data: current } = await db.from('api_keys').select('id').eq('profile_id', c.get('userId')).is('revoked_at', null)
  if ((current?.length ?? 0) >= MAX_KEYS) return c.json({ error: `You have ${MAX_KEYS} keys already. Revoke one you no longer use first.` }, 400)
  const key = newKey()
  const row = { id: crypto.randomUUID(), profile_id: c.get('userId'), name: label, prefix: key.slice(0, 7), key_hash: await sha256(key), created_at: new Date().toISOString() }
  const { error } = await db.from('api_keys').insert(row)
  if (error) return c.json({ error: error.message }, 500)
  // The only time the key itself is shown.
  return c.json({ id: row.id, name: row.name, prefix: row.prefix, created_at: row.created_at, last_used_at: null, key })
})

apiKeys.delete('/api/me/api-keys/:id', async c => {
  const { data } = await serviceClient(c.env).from('api_keys').update({ revoked_at: new Date().toISOString(), session: null })
    .eq('id', c.req.param('id')).eq('profile_id', c.get('userId')).is('revoked_at', null).select('id')
  if (!data?.length) return c.json({ error: 'No such key' }, 404)
  return c.json({ ok: true })
})
