import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface Env {
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  BUSINESS_ID: string
  ASSETS: Fetcher
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
