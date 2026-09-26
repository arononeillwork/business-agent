// Spotify Web API: one-click connect (OAuth), choose the approved playlist, and play/pause it on
// the café speaker. Playback control needs a Spotify Premium account.
export const SPOTIFY_SCOPES = ['playlist-read-private', 'playlist-read-collaborative', 'user-read-playback-state',
  'user-modify-playback-state', 'user-read-currently-playing']

export interface SpotifyOAuthConfig { clientId: string; clientSecret: string; redirectUri: string }

export function authUrl(cfg: SpotifyOAuthConfig, state: string) {
  const p = new URLSearchParams({ client_id: cfg.clientId, response_type: 'code', redirect_uri: cfg.redirectUri,
    scope: SPOTIFY_SCOPES.join(' '), state, show_dialog: 'true' })
  return `https://accounts.spotify.com/authorize?${p}`
}

async function token(cfg: SpotifyOAuthConfig, body: Record<string, string>) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { authorization: `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = await res.json() as { access_token?: string; refresh_token?: string; error_description?: string; error?: string }
  if (!res.ok || !json.access_token) throw new Error(json.error_description ?? json.error ?? 'Spotify sign-in failed')
  return json
}

export const exchangeCode = (cfg: SpotifyOAuthConfig, code: string) =>
  token(cfg, { grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri })
export const refreshAccess = (cfg: SpotifyOAuthConfig, refreshToken: string) =>
  token(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken })

async function api<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T | null> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init, headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', ...init.headers },
  })
  if (res.status === 204) return null
  const json = await res.json().catch(() => null) as (T & { error?: { message?: string; reason?: string } }) | null
  if (!res.ok) {
    const reason = json?.error?.reason
    if (reason === 'NO_ACTIVE_DEVICE') throw new Error('No Spotify speaker is on. Open Spotify on the café speaker or tablet first.')
    if (reason === 'PREMIUM_REQUIRED') throw new Error('Playing from the app needs Spotify Premium.')
    throw new Error(json?.error?.message ?? `Spotify error ${res.status}`)
  }
  return json
}

export interface Playlist { id: string; name: string; image?: string; tracks: number; url: string; owner?: string }

type RawPlaylist = { id: string; name: string; images?: { url: string }[]; tracks?: { total: number }; external_urls?: { spotify: string }; owner?: { display_name?: string } }
const toPlaylist = (p: RawPlaylist): Playlist => ({
  id: p.id, name: p.name, image: p.images?.[0]?.url, tracks: p.tracks?.total ?? 0,
  url: p.external_urls?.spotify ?? `https://open.spotify.com/playlist/${p.id}`, owner: p.owner?.display_name,
})

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

export async function pause(accessToken: string) {
  await api(accessToken, '/me/player/pause', { method: 'PUT' })
}
