import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface Env {
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  BUSINESS_ID: string
  ASSETS: Fetcher
  MEDIA?: R2Bucket
  // Integrations (secrets unless noted). Anything missing shows as "needs setup" in the app.
  GOOGLE_FONTS_API_KEY?: string       // optional: official Google Fonts list (brand page)
  INTEGRATION_KEY?: string            // encrypts stored tokens, signs OAuth state
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
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
  SQUARE_APP_ID?: string              // Square app (OAuth): takings on the Finances page
  SQUARE_APP_SECRET?: string
  SQUARE_ENVIRONMENT?: string         // var: 'production' (default) or 'sandbox'
  MS_CLIENT_ID?: string               // Microsoft app (Outlook email, OneDrive files); set by the Microsoft setup workflow
  MS_CLIENT_SECRET?: string
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

/** Service-role client: only for invites and the cron. Never exposed to users. */
export function serviceClient(env: Env): SupabaseClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function bearer(header: string | undefined | null) {
  const m = header?.match(/^Bearer\s+(.+)$/i)
  return m?.[1] ?? null
}
