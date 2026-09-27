// The Music page: each person connects their own Spotify or YouTube Music account (one click,
// OAuth), then sees and plays their playlists. Uses the same OAuth apps and redirect URLs as the
// admin connections, told apart by the signed state ({ kind: 'music' }), so no extra setup.
import { Hono, type MiddlewareHandler } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { seal, signState, unseal } from './crypto'
import * as google from './providers/google'
import * as spotify from './providers/spotify'
import * as youtube from './providers/youtube'
import type { MusicProvider } from '../shared/types'

export interface MusicState { uid: string; kind: 'music'; provider: MusicProvider }

const googleCfg = (env: Env, origin: string): google.GoogleOAuthConfig | null =>
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.INTEGRATION_KEY
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: `${origin}/api/integrations/google/callback` }
    : null
const spotifyCfg = (env: Env, origin: string): spotify.SpotifyOAuthConfig | null =>
  env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET && env.INTEGRATION_KEY
    ? { clientId: env.SPOTIFY_CLIENT_ID, clientSecret: env.SPOTIFY_CLIENT_SECRET, redirectUri: `${origin}/api/integrations/spotify/callback` }
    : null

const PROVIDERS: MusicProvider[] = ['spotify', 'youtube']
const NAMES: Record<MusicProvider, string> = { spotify: 'Spotify', youtube: 'YouTube Music' }

/** OAuth callback for a personal connection: store the sealed refresh token for that person. */
export async function finishMusicConnect(env: Env, state: MusicState, code: string, origin: string) {
  const db = serviceClient(env)
  let refresh: string | undefined
  let label: string | null
  if (state.provider === 'spotify') {
    const t = await spotify.exchangeCode(spotifyCfg(env, origin)!, code)
    const who = await spotify.me(t.access_token!)
    refresh = t.refresh_token
    label = `${who.display_name ?? who.id}${who.product === 'premium' ? '' : ' · Free (plays in the page only)'}`
  } else {
    const t = await google.exchangeCode(googleCfg(env, origin)!, code)
    refresh = t.refresh_token
    label = await youtube.channel(t.access_token!).catch(() => null)
  }
  if (!refresh) throw new Error(`${NAMES[state.provider]} did not give lasting access. Remove the app from your account settings and connect again.`)
  const { error } = await db.from('music_accounts').upsert({
    profile_id: state.uid, provider: state.provider, account_label: label,
    ciphertext: await seal(env.INTEGRATION_KEY!, { refresh_token: refresh }), connected_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

/** A fresh access token for this person's account on one provider. */
async function session(env: Env, db: SupabaseClient, uid: string, provider: MusicProvider, origin: string) {
  const { data } = await db.from('music_accounts').select('ciphertext').eq('profile_id', uid).eq('provider', provider).maybeSingle()
  if (!data) throw new Error(`Connect ${NAMES[provider]} first`)
  const { refresh_token } = await unseal<{ refresh_token: string }>(env.INTEGRATION_KEY!, data.ciphertext)
  try {
    if (provider === 'spotify') {
      const t = await spotify.refreshAccess(spotifyCfg(env, origin)!, refresh_token)
      if (t.refresh_token && t.refresh_token !== refresh_token) {
        await db.from('music_accounts').update({ ciphertext: await seal(env.INTEGRATION_KEY!, { refresh_token: t.refresh_token }) })
          .eq('profile_id', uid).eq('provider', provider)
      }
      return t.access_token!
    }
    return (await google.refreshAccess(googleCfg(env, origin)!, refresh_token)).access_token!
  } catch (e) {
    // Access was removed on the provider's side: forget the connection so the page asks again.
    if (/invalid_grant|revoked|expired/i.test(String(e))) {
      await db.from('music_accounts').delete().eq('profile_id', uid).eq('provider', provider)
      throw new Error(`${NAMES[provider]} access was removed. Connect it again.`)
    }
    throw e
  }
}

export const music = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

// Team members only (not partners or the café tablet account).
const teamOnly: MiddlewareHandler<{ Bindings: Env; Variables: { userId: string } }> = async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'app')
  const [{ data: user }, { data: role }] = await Promise.all([sb.auth.getUser(token), sb.rpc('my_role')])
  if (!user.user || !['admin', 'employee'].includes(role as string)) return c.json({ error: 'Music is for the team' }, 403)
  c.set('userId', user.user.id)
  await next()
}
music.use('/api/me/music', teamOnly)
music.use('/api/me/music/*', teamOnly)

music.get('/api/me/music', async c => {
  const { data, error } = await serviceClient(c.env).from('music_accounts').select('provider, account_label, connected_at')
    .eq('profile_id', c.get('userId'))
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ configured: { spotify: !!spotifyCfg(c.env, ''), youtube: !!googleCfg(c.env, '') }, accounts: data ?? [] })
})

const providerOf = (p: string) => (PROVIDERS as string[]).includes(p) ? p as MusicProvider : null

music.post('/api/me/music/:provider/start', async c => {
  const provider = providerOf(c.req.param('provider'))
  if (!provider) return c.json({ error: 'Unknown music service' }, 404)
  const origin = new URL(c.req.url).origin
  const state = await signState(c.env.INTEGRATION_KEY ?? '', { uid: c.get('userId'), kind: 'music', provider } satisfies MusicState)
  if (provider === 'spotify') {
    const cfg = spotifyCfg(c.env, origin)
    if (!cfg) return c.json({ error: 'Spotify is being set up. Ask an admin.' }, 400)
    return c.json({ url: spotify.authUrl(cfg, state) })
  }
  const cfg = googleCfg(c.env, origin)
  if (!cfg) return c.json({ error: 'YouTube Music is being set up. Ask an admin.' }, 400)
  return c.json({ url: google.authUrl(cfg, state, youtube.YOUTUBE_SCOPES) })
})

music.post('/api/me/music/:provider/disconnect', async c => {
  const provider = providerOf(c.req.param('provider'))
  if (!provider) return c.json({ error: 'Unknown music service' }, 404)
  await serviceClient(c.env).from('music_accounts').delete().eq('profile_id', c.get('userId')).eq('provider', provider)
  return c.json({ ok: true })
})

music.get('/api/me/music/:provider/playlists', async c => {
  const provider = providerOf(c.req.param('provider'))
  if (!provider) return c.json({ error: 'Unknown music service' }, 404)
  const token = await session(c.env, serviceClient(c.env), c.get('userId'), provider, new URL(c.req.url).origin)
  const list = provider === 'spotify'
    ? (await spotify.playlists(token)).map(p => ({ ...p, provider }))
    : await youtube.playlists(token)
  return c.json({ playlists: list })
})

// Spotify extras: what's playing on your devices, play a playlist there, pause (Premium only).
music.get('/api/me/music/spotify/now', async c => {
  const token = await session(c.env, serviceClient(c.env), c.get('userId'), 'spotify', new URL(c.req.url).origin)
  return c.json(await spotify.myPlayer(token))
})
music.post('/api/me/music/spotify/play', async c => {
  const { playlist_id } = await c.req.json<{ playlist_id?: string }>()
  if (!playlist_id || !/^[A-Za-z0-9]+$/.test(playlist_id)) return c.json({ error: 'Pick a playlist' }, 400)
  const token = await session(c.env, serviceClient(c.env), c.get('userId'), 'spotify', new URL(c.req.url).origin)
  await spotify.playPlaylist(token, playlist_id)
  return c.json({ ok: true })
})
music.post('/api/me/music/spotify/pause', async c => {
  const token = await session(c.env, serviceClient(c.env), c.get('userId'), 'spotify', new URL(c.req.url).origin)
  await spotify.pause(token)
  return c.json({ ok: true })
})
