// YouTube Music for the Music page: a person's own playlists (YouTube Music playlists are YouTube
// playlists), read-only. Uses the same Google OAuth client as sign-in; the YouTube Data API v3
// must be enabled in that Google Cloud project. Playback is the YouTube embed player in the page.
import type { MusicPlaylist } from '../../shared/types'

export const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube.readonly', 'openid', 'email']

async function api<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3${path}`, { headers: { authorization: `Bearer ${accessToken}` } })
  const json = await res.json().catch(() => null) as (T & { error?: { message?: string; errors?: { reason?: string }[] } }) | null
  if (!res.ok) {
    const reason = json?.error?.errors?.[0]?.reason
    if (reason === 'accessNotConfigured') throw new Error('YouTube is not switched on for this app yet (enable the YouTube Data API v3 in Google Cloud).')
    throw new Error(json?.error?.message ?? `YouTube error ${res.status}`)
  }
  return json as T
}

export async function channel(accessToken: string) {
  const r = await api<{ items?: { snippet?: { title?: string } }[] }>(accessToken, '/channels?part=snippet&mine=true')
  return r.items?.[0]?.snippet?.title ?? null
}

type RawPlaylist = { id: string; snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url: string }> }; contentDetails?: { itemCount?: number } }

export async function playlists(accessToken: string): Promise<MusicPlaylist[]> {
  const r = await api<{ items?: RawPlaylist[] }>(accessToken, '/playlists?part=snippet,contentDetails&mine=true&maxResults=50')
  return (r.items ?? []).map(p => {
    const t = p.snippet?.thumbnails ?? {}
    return {
      id: p.id, provider: 'youtube' as const, name: p.snippet?.title ?? 'Playlist', owner: p.snippet?.channelTitle,
      image: (t.medium ?? t.high ?? t.default)?.url, tracks: p.contentDetails?.itemCount ?? 0,
      url: `https://music.youtube.com/playlist?list=${p.id}`,
    }
  })
}
