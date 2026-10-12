// YouTube Music for the Music page: a person's own playlists (YouTube Music playlists are YouTube
// playlists), read-only. Uses the same Google OAuth client as sign-in; the YouTube Data API v3
// must be enabled in that Google Cloud project. Playback is the YouTube embed player in the page.
import type { CafeTrack, MusicPlaylist } from '../../shared/types'

export const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube.readonly', 'openid', 'email']

async function api<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3${path}`, { headers: { authorization: `Bearer ${accessToken}` } })
  const json = await res.json().catch(() => null) as (T & { error?: { message?: string; errors?: { reason?: string }[] } }) | null
  if (!res.ok) {
    const reason = json?.error?.errors?.[0]?.reason
    if (reason === 'accessNotConfigured') throw new Error('YouTube is not switched on for this app yet (enable the YouTube Data API v3 in Google Cloud).')
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new Error('YouTube’s daily limit for this app is used up. Searching works again tomorrow; playing doesn’t need it.')
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

type RawItem = { snippet?: { title?: string; videoOwnerChannelTitle?: string; thumbnails?: Record<string, { url: string }>; resourceId?: { videoId?: string } }; status?: { privacyStatus?: string } }

/** The songs in one playlist, in its order (up to 500). Deleted and private videos are left out. */
export async function playlistTracks(accessToken: string, playlistId: string): Promise<CafeTrack[]> {
  const out: CafeTrack[] = []
  let page = ''
  for (let i = 0; i < 10; i++) {
    const r = await api<{ items?: RawItem[]; nextPageToken?: string }>(accessToken,
      `/playlistItems?part=snippet,status&maxResults=50&playlistId=${encodeURIComponent(playlistId)}${page ? `&pageToken=${page}` : ''}`)
    for (const it of r.items ?? []) {
      const id = it.snippet?.resourceId?.videoId
      const title = it.snippet?.title ?? ''
      if (!id || it.status?.privacyStatus === 'private' || /^(Deleted|Private) video$/.test(title)) continue
      const t = it.snippet?.thumbnails ?? {}
      out.push({ id, title, artist: it.snippet?.videoOwnerChannelTitle?.replace(/ - Topic$/, ''), image: (t.medium ?? t.default ?? t.high)?.url })
    }
    if (!r.nextPageToken) break
    page = r.nextPageToken
  }
  return out
}

/**
 * Which playlists are music. YouTube doesn't mark playlists made in YouTube Music, so this looks at
 * up to 5 songs from each: a playlist counts as music when most of them are in YouTube's Music
 * category or come from an official "Artist - Topic" channel. One playlistItems call per playlist
 * and one videos call per 50 songs (1 quota unit each).
 */
export async function musicPlaylists(accessToken: string, ids: string[]): Promise<Record<string, boolean>> {
  // A playlist YouTube couldn't be asked about is left out (not decided), so it shows and is checked again next time.
  const samples = await Promise.all(ids.map(async id => {
    const r = await api<{ items?: RawItem[] }>(accessToken, `/playlistItems?part=snippet&maxResults=5&playlistId=${encodeURIComponent(id)}`).catch(() => null)
    return { id, ok: !!r, items: (r?.items ?? []).filter(i => i.snippet?.resourceId?.videoId) }
  }))
  const videoIds = [...new Set(samples.flatMap(s => s.items.map(i => i.snippet!.resourceId!.videoId!)))]
  const category = new Map<string, string>()
  let failed = false
  for (let i = 0; i < videoIds.length; i += 50) {
    const r = await api<{ items?: { id: string; snippet?: { categoryId?: string } }[] }>(accessToken,
      `/videos?part=snippet&maxResults=50&id=${videoIds.slice(i, i + 50).join(',')}`).catch(() => { failed = true; return { items: [] } })
    for (const v of r.items ?? []) category.set(v.id, v.snippet?.categoryId ?? '')
  }
  return Object.fromEntries(samples.filter(s => s.ok && (!failed || !s.items.length)).map(s => {
    const music = s.items.filter(i => category.get(i.snippet!.resourceId!.videoId!) === '10' || / - Topic$/.test(i.snippet?.videoOwnerChannelTitle ?? '')).length
    // An empty playlist (just made in YouTube Music) counts as music until it has songs.
    return [s.id, !s.items.length || music * 2 >= s.items.length]
  }))
}

const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, '’').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** Search all of YouTube: songs (Music category) or playlists. 100 quota units a call, so results are cached. */
export async function search(accessToken: string, q: string, kind: 'songs' | 'playlists'): Promise<{ tracks: CafeTrack[]; playlists: MusicPlaylist[] }> {
  type Hit = { id?: { videoId?: string; playlistId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url: string }> } }
  const params = kind === 'songs' ? 'type=video&videoCategoryId=10&videoEmbeddable=true' : 'type=playlist'
  const r = await api<{ items?: Hit[] }>(accessToken, `/search?part=snippet&maxResults=15&safeSearch=moderate&${params}&q=${encodeURIComponent(q)}`)
  const thumb = (h: Hit) => { const t = h.snippet?.thumbnails ?? {}; return (t.medium ?? t.default ?? t.high)?.url }
  return {
    tracks: kind === 'songs' ? (r.items ?? []).filter(h => h.id?.videoId).map(h => ({
      id: h.id!.videoId!, title: decode(h.snippet?.title ?? ''), artist: h.snippet?.channelTitle?.replace(/ - Topic$/, ''), image: thumb(h),
    })) : [],
    playlists: kind === 'playlists' ? (r.items ?? []).filter(h => h.id?.playlistId).map(h => ({
      id: h.id!.playlistId!, provider: 'youtube' as const, name: decode(h.snippet?.title ?? 'Playlist'), owner: h.snippet?.channelTitle,
      image: thumb(h), tracks: 0, url: `https://music.youtube.com/playlist?list=${h.id!.playlistId}`,
    })) : [],
  }
}
