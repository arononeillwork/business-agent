// Which Spotify app a business signs in through. Spotify lets a development-mode app in at most 5
// Spotify accounts, across every business that uses it, so The Business Agent's app (the Worker's
// SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET) can't take every business. A business can make its own
// app instead (free, in Spotify's developer dashboard) and an admin pastes its Client ID on
// Connections → Spotify (settings.spotify_client_id). Its café account and its team then sign in
// through it, with PKCE: the Client ID is all that needs, so nothing secret is kept for it.
//
// What's kept for each connection (the café's in integration_secrets, a person's in music_accounts)
// says which app gave it, so a connection keeps working with the app it was made with when the
// business switches: { refresh_token } is The Business Agent's app, { refresh_token, client_id } a
// business's own.
import type { SupabaseClient } from '@supabase/supabase-js'
import { businessConfig } from '../shared/business.config'
import { pkcePair, seal, signState, unseal } from './crypto'
import * as spotify from './providers/spotify'
import type { Env } from './supabase'

export interface SpotifyGrant { refresh_token: string; client_id?: string }
/** What a Spotify sign-in's state carries for a business's own app: its Client ID and the PKCE verifier, sealed. */
export interface SpotifyStateApp { app?: string; pkce?: string }

export const CALLBACK_PATH = '/api/integrations/spotify/callback'

/** The Business Agent's Spotify app (the Worker's keys). */
export const spotifyConfig = (env: Env, origin: string): spotify.SpotifyOAuthConfig | null =>
  env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET && env.INTEGRATION_KEY
    ? { clientId: env.SPOTIFY_CLIENT_ID, clientSecret: env.SPOTIFY_CLIENT_SECRET, redirectUri: `${origin}${CALLBACK_PATH}` }
    : null
/** A Spotify Client ID, as the dashboard shows it. */
export const CLIENT_ID = /^[0-9a-f]{32}$/

/** The business's own Spotify app's Client ID, if it has one. */
export async function ownSpotifyApp(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from('settings').select('spotify_client_id').eq('id', 1).maybeSingle()
  return (data?.spotify_client_id as string | null | undefined) ?? null
}

/** The app new sign-ins go through: the business's own, else The Business Agent's. Null: neither is set up. */
export async function spotifyAppFor(env: Env, db: SupabaseClient, origin: string): Promise<spotify.SpotifyOAuthConfig | null> {
  if (!env.INTEGRATION_KEY) return null
  const own = await ownSpotifyApp(db)
  return own ? { clientId: own, redirectUri: `${origin}${CALLBACK_PATH}` } : spotifyConfig(env, origin)
}

/** Can this business's people connect Spotify at all? */
export const spotifyReady = async (env: Env, db: SupabaseClient) => !!await spotifyAppFor(env, db, '')

/** The addresses to register as redirect URIs in a Spotify app: the app's, the Worker's, and the one in use now. */
export const redirectUris = (origin: string) =>
  [...new Set([businessConfig.appUrl, businessConfig.workersUrl, origin].filter(Boolean))].map(o => `${o}${CALLBACK_PATH}`)

/** The Spotify sign-in link, with `state` signed (and, for a business's own app, the PKCE verifier sealed into it). */
export async function spotifyStart(env: Env, db: SupabaseClient, origin: string, state: Record<string, unknown>): Promise<string | null> {
  const cfg = await spotifyAppFor(env, db, origin)
  if (!cfg) return null
  const key = env.INTEGRATION_KEY!
  if (cfg.clientSecret) return spotify.authUrl(cfg, await signState(key, state))
  const { verifier, challenge } = await pkcePair()
  return spotify.authUrl(cfg, await signState(key, { ...state, app: cfg.clientId, pkce: await seal(key, verifier) } satisfies SpotifyStateApp), challenge)
}

/** The callback: swap the code with the app the sign-in started with. Returns the access token and what to keep. */
export async function spotifyFinish(env: Env, origin: string, state: SpotifyStateApp, code: string) {
  const key = env.INTEGRATION_KEY!
  if (state.app) {
    const verifier = await unseal<string>(key, state.pkce ?? '')
    const t = await spotify.exchangeCode({ clientId: state.app, redirectUri: `${origin}${CALLBACK_PATH}` }, code, verifier)
    return { accessToken: t.access_token!, grant: t.refresh_token ? { refresh_token: t.refresh_token, client_id: state.app } satisfies SpotifyGrant : null }
  }
  const cfg = spotifyConfig(env, origin)
  if (!cfg) throw new Error('Spotify is not set up')
  const t = await spotify.exchangeCode(cfg, code)
  return { accessToken: t.access_token!, grant: t.refresh_token ? { refresh_token: t.refresh_token } satisfies SpotifyGrant : null }
}

/** A fresh access token from what was kept, with the app that gave it; `rotated` when Spotify sent a new refresh token to keep. */
export async function spotifyRefresh(env: Env, grant: SpotifyGrant): Promise<{ accessToken: string; rotated: SpotifyGrant | null }> {
  const cfg = grant.client_id ? { clientId: grant.client_id, redirectUri: '' } : spotifyConfig(env, '')
  if (!cfg) throw new Error('Spotify is not set up')
  const t = await spotify.refreshAccess(cfg, grant.refresh_token)
  return { accessToken: t.access_token!, rotated: t.refresh_token && t.refresh_token !== grant.refresh_token ? { ...grant, refresh_token: t.refresh_token } : null }
}

export const sealGrant = (env: Env, grant: SpotifyGrant) => seal(env.INTEGRATION_KEY!, grant)
export const unsealGrant = (env: Env, ciphertext: string) => unseal<SpotifyGrant>(env.INTEGRATION_KEY!, ciphertext)
