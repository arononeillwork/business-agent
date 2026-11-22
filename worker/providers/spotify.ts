// Spotify Web API: one-click connect (OAuth), choose the approved playlist, and play/pause it on
// the café speaker. Playback control needs a Spotify Premium account.
export const SPOTIFY_SCOPES = ['playlist-read-private', 'playlist-read-collaborative', 'user-read-playback-state',
  'user-modify-playback-state', 'user-read-currently-playing']

/**
 * A Spotify app to sign in through. With a secret: The Business Agent's app (the Worker's keys).
 * Without: a business's own app, signed in with PKCE (worker/spotifyApp.ts), which needs only its Client ID.
 */
export interface SpotifyOAuthConfig { clientId: string; clientSecret?: string; redirectUri: string }

/** The sign-in link. `codeChallenge`: PKCE, for an app without a secret. */
export function authUrl(cfg: SpotifyOAuthConfig, state: string, codeChallenge?: string) {
  const p = new URLSearchParams({ client_id: cfg.clientId, response_type: 'code', redirect_uri: cfg.redirectUri,
    scope: SPOTIFY_SCOPES.join(' '), state, show_dialog: 'true',
    ...(codeChallenge ? { code_challenge_method: 'S256', code_challenge: codeChallenge } : {}) })
  return `https://accounts.spotify.com/authorize?${p}`
}

async function token(cfg: SpotifyOAuthConfig, body: Record<string, string>) {
  // An app with a secret proves itself with it; a PKCE app names itself (and sends the verifier, or the refresh token).
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded',
      ...(cfg.clientSecret ? { authorization: `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}` } : {}) },
    body: new URLSearchParams(cfg.clientSecret ? body : { ...body, client_id: cfg.clientId }),
  })
  const json = await res.json() as { access_token?: string; refresh_token?: string; error_description?: string; error?: string }
  if (!res.ok || !json.access_token) throw new Error(json.error_description ?? json.error ?? 'Spotify sign-in failed')
  return json
}

export const exchangeCode = (cfg: SpotifyOAuthConfig, code: string, codeVerifier?: string) =>
  token(cfg, { grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri, ...(codeVerifier ? { code_verifier: codeVerifier } : {}) })
export const refreshAccess = (cfg: SpotifyOAuthConfig, refreshToken: string) =>
  token(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken })

/**
 * Spotify refuses an account a development-mode app doesn't list under User Management (an app takes up to 5).
 * Said the same way for the café's account and a team member's own.
 */
export const NOT_LISTED = 'Spotify didn’t let this account in: the Spotify app it connects through doesn’t list it. In Spotify’s developer dashboard, add the account’s email under the app’s User Management (an app takes up to 5 accounts), or use your own Spotify app (Connections → Spotify). Then connect again.'

async function api<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T | null> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init, headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', ...init.headers },
  })
  if (res.status === 204) return null
  const text = await res.text().catch(() => '')
  let json: (T & { error?: { message?: string; reason?: string } }) | null = null
  try { json = JSON.parse(text) } catch { /* not JSON: Spotify sometimes answers in plain text */ }
  // "Check settings on developer.spotify.com/dashboard, the user may not be registered." (or in plain text).
  if (res.status === 403 && /not be registered|not registered|developer\.spotify\.com\/dashboard/i.test(text)) throw new Error(NOT_LISTED)
  if (!res.ok) {
    const reason = json?.error?.reason
    if (reason === 'NO_ACTIVE_DEVICE') throw new Error('No Spotify speaker is on. Open Spotify on the café speaker or tablet first.')
    if (reason === 'PREMIUM_REQUIRED') throw new Error('Playing from the app needs Spotify Premium.')
    throw new Error(json?.error?.message ?? `Spotify error ${res.status}`)
  }
  return json
}

export interface Playlist { id: string; name: string; image?: string; tracks: number; url: string; owner?: string }

// Apps made since Spotify's February 2026 changes get a playlist's songs as `items` (was `tracks`), and only
// for playlists the person owns or collaborates on; older apps still get `tracks`.
type RawPlaylist = { id: string; name: string; images?: { url: string }[] | null; items?: { total?: number }; tracks?: { total?: number }; external_urls?: { spotify: string }; owner?: { display_name?: string } }
const toPlaylist = (p: RawPlaylist): Playlist => ({
  id: p.id, name: p.name, image: p.images?.[0]?.url, tracks: p.items?.total ?? p.tracks?.total ?? 0,
  url: p.external_urls?.spotify ?? `https://open.spotify.com/playlist/${p.id}`, owner: p.owner?.display_name,
})

/** Who signed in. `product` (premium or free) is only sent to apps made before Spotify's February 2026 changes. */
export async function me(accessToken: string) {
  return (await api<{ display_name?: string; id: string; product?: string }>(accessToken, '/me'))!
}

export async function playlists(accessToken: string): Promise<Playlist[]> {
  const res = await api<{ items: RawPlaylist[] }>(accessToken, '/me/playlists?limit=50')
  return (res?.items ?? []).filter(Boolean).map(toPlaylist)
}

export interface NowPlaying { playing: boolean; track?: string; artist?: string; device?: string; onApprovedPlaylist: boolean }

export async function nowPlaying(accessToken: string, approvedId?: string): Promise<NowPlaying> {
  const s = await api<{ is_playing: boolean; item?: { name: string; artists?: { name: string }[] }; device?: { name: string }; context?: { uri?: string } }>(
    accessToken, '/me/player')
  if (!s) return { playing: false, onApprovedPlaylist: false }
  return { playing: s.is_playing, track: s.item?.name, artist: s.item?.artists?.map(a => a.name).join(', '), device: s.device?.name,
    onApprovedPlaylist: !!approvedId && s.context?.uri === `spotify:playlist:${approvedId}` }
}

export async function playPlaylist(accessToken: string, playlistId: string) {
  await api(accessToken, '/me/player/play', { method: 'PUT', body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}` }) })
  await api(accessToken, '/me/player/shuffle?state=true', { method: 'PUT' }).catch(() => null)
}

/** A person's own player (Music page): what's on, and play any of their playlists. */
export async function myPlayer(accessToken: string) {
  const s = await api<{ is_playing: boolean; item?: { name: string; artists?: { name: string }[]; album?: { images?: { url: string }[] } }; device?: { name: string } }>(
    accessToken, '/me/player')
  if (!s) return { playing: false }
  return { playing: s.is_playing, track: s.item?.name, artist: s.item?.artists?.map(a => a.name).join(', '),
    device: s.device?.name, image: s.item?.album?.images?.at(-1)?.url }
}

export async function pause(accessToken: string) {
  await api(accessToken, '/me/player/pause', { method: 'PUT' })
}
