import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface Env {
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  BUSINESS_ID: string
  ASSETS: Fetcher
  GIT_SHA?: string                    // set by the deploy: the commit that's live
  DEPLOYED_AT?: string                // set by the deploy: when it went live (ISO time)
  MEDIA?: R2Bucket
  // Integrations (secrets unless noted). Anything missing shows as "needs setup" in the app.
  GOOGLE_FONTS_API_KEY?: string       // optional: official Google Fonts list (brand page)
  ANTHROPIC_API_KEY?: string          // optional: the in-app assistant (worker/assistant.ts); off without it
  GOOGLE_PLACES_API_KEY?: string      // optional: Google reviews from the public listing until Business Profile access is approved; cafés nearby on Competitors
  GOOGLE_PLACE_ID?: string            // the café's Google Maps place id, for the above (where the business is, and its own rating)
  GOOGLE_PAGESPEED_API_KEY?: string   // optional: PageSpeed Insights beyond its small keyless quota (Website & SEO)
  INTEGRATION_KEY?: string            // encrypts stored tokens, signs OAuth state
  VAPID_KEY?: string                  // signs push notifications (a P-256 private key as a JWK; made by the deploy)
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_PICKER_API_KEY?: string      // optional: Google's file picker on the Legal page (a browser key for the same Google Cloud project)
  META_ACCESS_TOKEN?: string          // Meta system-user token (WhatsApp)
  META_APP_ID?: string                // Meta app: Facebook Page connections (Facebook Login)
  META_APP_SECRET?: string            // verifies WhatsApp webhooks; Facebook Login
  META_GRAPH_VERSION?: string         // var, e.g. v23.0
  WHATSAPP_PHONE_NUMBER_ID?: string   // secret (GitHub → deploy)
  WHATSAPP_VERIFY_TOKEN?: string
  WHATSAPP_TEMPLATE_LANG?: string     // var, e.g. es
  INSTAGRAM_APP_ID?: string           // Instagram Login app (Meta app → Instagram → API setup with Instagram login)
  INSTAGRAM_APP_SECRET?: string
  SPOTIFY_CLIENT_ID?: string
  SPOTIFY_CLIENT_SECRET?: string
  TIKTOK_CLIENT_KEY?: string          // TikTok app (Login Kit + Content Posting API)
  TIKTOK_CLIENT_SECRET?: string
  STRIPE_CLIENT_ID?: string           // Stripe Connect (OAuth, ca_…): takings on the Finances page
  STRIPE_SECRET_KEY?: string          // the platform's secret key (reads connected accounts)
  SQUARE_APP_ID?: string              // Square app (OAuth): takings on the Finances page
  SQUARE_APP_SECRET?: string
  SQUARE_ENVIRONMENT?: string         // var: 'production' (default) or 'sandbox'
  SQUARE_WEBHOOK_SIGNATURE_KEY?: string // the Square app's webhook subscription signature key (customers sync instantly)
  SQUARE_WEBHOOK_URL?: string          // the notification URL registered for it; default the app's workers.dev address + /api/webhooks/square
  SQUARE_REDIRECT_URL?: string        // the Redirect URL set in the Square app; default the app's workers.dev address + /api/integrations/square/callback
  SUMUP_CLIENT_ID?: string            // SumUp app (OAuth, read-only): takings on the Finances page
  SUMUP_CLIENT_SECRET?: string
  LINKEDIN_CLIENT_ID?: string         // LinkedIn app (Sign In with OpenID Connect, Share on LinkedIn, Community Management API)
  LINKEDIN_CLIENT_SECRET?: string
  LINKEDIN_PAGES?: string             // 'off': post as the person only (the app has no Community Management API yet)
  LINKEDIN_VERSION?: string           // var: Posts API version, YYYYMM (default in connections.ts)
  GOOGLE_ADS_DEVELOPER_TOKEN?: string // Google Ads API developer token (Google Ads manager account → API Center): the Ads page
  GOOGLE_ADS_API_VERSION?: string     // var, e.g. v21 (default in providers/googleAds.ts)
  MS_CLIENT_ID?: string               // Microsoft app (Outlook email, OneDrive files); set by the Microsoft setup workflow
  MS_CLIENT_SECRET?: string
  // Music on social posts (docs/SOCIAL_MUSIC_PLAN.md).
  ELEVENLABS_API_KEY?: string         // Business Agent's ElevenLabs account: AI tracks (paid per use) and the starter pack
  ELEVENLABS_MUSIC_MODEL?: string     // var: music_v1 (default), music_v2 or music_v2_5 (Actions → Music check compares them)
  RENDER_URL?: string                 // the render service (render/), set by Actions → Deploy render service
  RENDER_KEY?: string                 // its key, set by the same workflow
  MUSIC_STARTER?: string              // var: 'off' to not make the starter pack
  // Cameras (docs/INTEGRATIONS.md section 20): the camera upload server (cameras/), set by Actions → Deploy camera uploads.
  CAMERA_UPLOADS_URL?: string         // its address for the Worker (the latest pictures)
  CAMERA_UPLOADS_KEY?: string         // the key it and the Worker share
  CAMERA_FTP_HOST?: string            // the address cameras send to (its own name when not set)
}

export type Via = 'app' | 'api' | 'ai'

/**
 * A Supabase client that acts as the signed-in person (their JWT), so row-level security and
 * the SQL rules apply exactly as in the app. `via` is recorded in the audit log.
 */
export function userClient(env: Env, accessToken: string, via: Via): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Capital A: supabase-js adds its own 'Authorization' for auth calls, and a second, lower-case
    // copy would be merged into "Bearer x, Bearer x", which Supabase rejects as an expired session.
    global: { headers: { Authorization: `Bearer ${accessToken}`, 'x-app-via': via } },
  })
}

/**
 * Service-role client over every business: only for what isn't one business's (accounts, finding
 * which business a link, webhook or sign-in belongs to, listing the businesses). Anything else goes
 * through businessDb(). Never exposed to users.
 */
export function serviceClient(env: Env): SupabaseClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * The business set up with Business Agent's own accounts in the Worker's secrets: Easy Beans, the
 * founding business. Its WhatsApp number (WHATSAPP_PHONE_NUMBER_ID) and Google place
 * (GOOGLE_PLACE_ID) are its own; no other business uses them.
 */
export const SECRETS_BUSINESS_ID = 1

/** A client acting for one business (businessDb()), which says which. */
export type BusinessDb = SupabaseClient & { businessId: number }

/** The business a client acts for (null: one over every business, or a person's own). */
export const businessIdOf = (db: SupabaseClient) => (db as Partial<BusinessDb>).businessId ?? null

/** Whether the accounts in the Worker's secrets (WhatsApp number, Google place) are this client's business's. */
export const ownsSecretAccounts = (db: SupabaseClient) => businessIdOf(db) === SECRETS_BUSINESS_ID

/** The café's Google place id (Worker secret GOOGLE_PLACE_ID): only the business it was set for has it. */
export const secretPlaceId = (env: Env, db: SupabaseClient) => (ownsSecretAccounts(db) ? env.GOOGLE_PLACE_ID : undefined)

/** Tables that are Business Agent's own, the same for every business (the plans and prices). */
const SHARED_TABLES = new Set(['plan_limits', 'pay_per_use'])

/**
 * The service role acting for one business (docs/SEVERAL_BUSINESSES.md). The service role skips
 * row security, so every read, change and delete here is filtered to the business's rows; what it
 * writes, and what the SQL functions it calls do, are the business's through the x-business-id
 * header (current_business_id() in the database). `where id = 1` on a settings table still means
 * this business's row.
 */
export function businessDb(env: Env, businessId: number): BusinessDb {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  if (!Number.isInteger(businessId) || businessId <= 0) throw new Error('No business to act for')
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-business-id': String(businessId) } },
  })
  const from = db.from.bind(db)
  db.from = ((table: string) => {
    const q = from(table)
    if (SHARED_TABLES.has(table)) return q
    // The business row is the business itself; every other row says whose it is.
    const column = table === 'business' ? 'id' : 'business_id'
    const select = q.select.bind(q)
    const update = q.update.bind(q)
    const del = q.delete.bind(q)
    return Object.assign(q, {
      select: (...a: Parameters<typeof select>) => select(...a).eq(column, businessId),
      update: (...a: Parameters<typeof update>) => update(...a).eq(column, businessId),
      delete: (...a: Parameters<typeof del>) => del(...a).eq(column, businessId),
    })
  }) as typeof db.from
  return Object.assign(db, { businessId })
}

/**
 * Put someone into a business (with the rest of `patch`): an account just made for it, or one that
 * isn't in any business yet. Never moves someone out of another business. Null when nothing changed.
 */
export async function joinBusiness(env: Env, userId: string, businessId: number, patch: Record<string, unknown> = {}) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  // The header makes what the change sets off (the audit log, the plan's limits) that business's.
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-business-id': String(businessId) } },
  })
  const { data, error } = await db.from('profiles').update({ ...patch, business_id: businessId })
    .eq('id', userId).or(`business_id.is.null,business_id.eq.${businessId}`).select('id')
  if (error) throw new Error(error.message)
  return data?.length ? userId : null
}

const requestBusiness = new WeakMap<Request, Promise<number | null>>()

/** The business of whoever signed in to this request (its bearer token): null when they're in none. */
export function businessOfRequest(c: { env: Env; req: { raw: Request; header: (name: string) => string | undefined } }) {
  let found = requestBusiness.get(c.req.raw)
  if (!found) {
    const token = bearer(c.req.header('authorization'))
    found = token
      ? Promise.resolve(userClient(c.env, token, 'app').rpc('current_business_id')).then(({ data }) => (data as number | null) ?? null)
      : Promise.resolve(null)
    requestBusiness.set(c.req.raw, found)
  }
  return found
}

/**
 * The Worker acting for the business of whoever signed in to this request, for routes whose sign-in
 * check has already passed (someone signed in is always in a business by then).
 */
export async function requestDb(c: Parameters<typeof businessOfRequest>[0]) {
  const id = await businessOfRequest(c)
  if (!id) throw new Error('You’re not in a business yet')
  return businessDb(c.env, id)
}

/** Every business, for the jobs that run for each in turn. */
export async function businessIds(env: Env): Promise<number[]> {
  const { data, error } = await serviceClient(env).from('business').select('id').order('id')
  if (error) throw new Error(error.message)
  return (data ?? []).map(b => b.id as number)
}

/** The business someone is in (null: in none yet). */
export async function businessOf(env: Env, userId: string): Promise<number | null> {
  const { data } = await serviceClient(env).from('profiles').select('business_id').eq('id', userId).maybeSingle()
  return (data?.business_id as number | null | undefined) ?? null
}

export function bearer(header: string | undefined | null) {
  const m = header?.match(/^Bearer\s+(.+)$/i)
  return m?.[1] ?? null
}
