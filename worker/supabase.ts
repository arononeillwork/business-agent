import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface Env {
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  BUSINESS_ID: string
  ASSETS: Fetcher
  MEDIA?: R2Bucket
  // Integrations (secrets unless noted). Anything missing shows as "needs setup" in the app.
  INTEGRATION_KEY?: string            // encrypts stored tokens, signs OAuth state
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  META_ACCESS_TOKEN?: string          // Meta system-user token (WhatsApp + Instagram)
  META_APP_SECRET?: string            // verifies WhatsApp webhooks
  META_GRAPH_VERSION?: string         // var, e.g. v23.0
  WHATSAPP_PHONE_NUMBER_ID?: string   // var
  WHATSAPP_VERIFY_TOKEN?: string
  WHATSAPP_TEMPLATE_LANG?: string     // var, e.g. es
  INSTAGRAM_USER_ID?: string          // var
  SPOTIFY_CLIENT_ID?: string
  SPOTIFY_CLIENT_SECRET?: string
}

export type Via = 'app' | 'api' | 'ai'

/**
 * A Supabase client that acts as the signed-in person (their JWT), so row-level security and
 * the SQL rules apply exactly as in the app. `via` is recorded in the audit log.
 */
export function userClient(env: Env, accessToken: string, via: Via): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { authorization: `Bearer ${accessToken}`, 'x-app-via': via } },
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
