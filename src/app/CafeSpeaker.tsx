import { Box, Card, IconButton, Stack, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import PauseIcon from '@mui/icons-material/PauseRounded'
import NextIcon from '@mui/icons-material/SkipNextRounded'
import PrevIcon from '@mui/icons-material/SkipPreviousRounded'
import CloseIcon from '@mui/icons-material/CloseRounded'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useApp } from './AppContext'
import { useAsync } from './hooks'
import type { CafeMusicLibrary, CafeTrack, MusicAction, MusicPlayerState, SpotifyPlaylist } from '../../shared/types'
import { tokens } from '../theme'
import { t } from '../i18n'

// The café speaker. One device (the café tablet, or whoever presses "Play on this device")
// plays the café's YouTube Music queue with YouTube's embedded player; it lives here, at the
// app level, so the music keeps going while that device moves between pages. Every other team
// member's device sees what's playing and sends play/pause/skip/jump through the shared
// music_player row, which the speaker checks every 1.5 seconds.

const DEVICE_KEY = 'music-device-id'
/** A speaker that hasn't reported for this long has gone (closed the tab, lost its connection). */
const STALE_MS = 20_000
const FALLBACK_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random())

function myDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id) }
    return id
  } catch { return FALLBACK_ID }
}

function deviceKind() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet'
  if (/Mobi|iPhone|Android/i.test(ua)) return 'phone'
  return 'computer'
}

// ---------------------------------------------------------------------------------------------
// Players: YouTube's embedded player, or a pretend one for the demo's sample songs
// ---------------------------------------------------------------------------------------------
interface Engine {
  load(id: string, autoplay: boolean): void
  play(): void
  pause(): void
  seek(seconds: number): void
  setVolume(volume: number): void
  time(): { elapsed: number; duration: number }
  destroy(): void
}
interface EngineEvents { onEnded: () => void; onPlaying: (playing: boolean) => void; onError: () => void }

interface YTPlayer {
  loadVideoById(id: string): void; cueVideoById(id: string): void; playVideo(): void; pauseVideo(): void
  seekTo(s: number, allowSeekAhead: boolean): void; setVolume(v: number): void
  getCurrentTime?(): number; getDuration?(): number; destroy(): void
}
type YTNamespace = { Player: new (el: HTMLElement, opts: object) => YTPlayer }
declare global { interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void } }

let ytLoading: Promise<YTNamespace> | null = null
function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  ytLoading ??= new Promise((resolve, reject) => {
    const before = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { before?.(); resolve(window.YT!) }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => { ytLoading = null; reject(new Error(t('Could not load the YouTube player. Check the internet connection.'))) }
    document.head.appendChild(s)
  })
  return ytLoading
}

async function youtubeEngine(host: HTMLElement, ev: EngineEvents, volume: number): Promise<Engine> {
  const YT = await loadYouTube()
  const el = document.createElement('div')
  host.replaceChildren(el)
  return new Promise(resolve => {
    const player: YTPlayer = new YT.Player(el, {
      host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => { player.setVolume(volume); resolve(engine) },
        // 0 ended, 1 playing, 2 paused (3 buffering and 5 cued change nothing here).
        onStateChange: (e: { data: number }) => {
          if (e.data === 0) ev.onEnded()
          else if (e.data === 1) ev.onPlaying(true)
          else if (e.data === 2) ev.onPlaying(false)
        },
        // Removed, private or not allowed in other sites: move on to the next song.
        onError: () => ev.onError(),
      },
    })
    const engine: Engine = {
      load: (id, autoplay) => (autoplay ? player.loadVideoById(id) : player.cueVideoById(id)),
      play: () => player.playVideo(),
      pause: () => player.pauseVideo(),
      seek: s => player.seekTo(s, true),
      setVolume: v => player.setVolume(v),
      time: () => ({ elapsed: player.getCurrentTime?.() ?? 0, duration: player.getDuration?.() ?? 0 }),
      destroy: () => { try { player.destroy() } catch { /* already gone */ } host.replaceChildren() },
    }
  })
}

/** The demo's sample songs aren't real videos: a pretend player that counts through 3-minute songs. */
function demoEngine(host: HTMLElement, ev: EngineEvents): Engine {
  let elapsed = 0, playing = false
  const duration = 180
  host.replaceChildren(Object.assign(document.createElement('div'), {
    textContent: t('♪ Sample song (demo)'),
    style: 'display:grid;place-items:center;height:100%;color:#fff;font-size:13px;background:linear-gradient(135deg,#FF0033,#2B2522)',
  }))
  const timer = setInterval(() => {
    if (!playing) return
    elapsed += 1
    if (elapsed >= duration) { elapsed = 0; ev.onEnded() }
  }, 1000)
  const set = (p: boolean) => { playing = p; ev.onPlaying(p) }
  return {
    load: (_id, autoplay) => { elapsed = 0; set(autoplay) },
    play: () => set(true), pause: () => set(false),
    seek: s => { elapsed = s }, setVolume: () => {},
    time: () => ({ elapsed, duration }),
    destroy: () => { clearInterval(timer); host.replaceChildren() },
  }
}

/**
 * The order playlists play in: the order the team saved, then any playlists not in it yet (the
 * approved one first). Playlists that aren't music only count once someone put them in the order.
 */
export function playlistOrder(saved: string[], lib: CafeMusicLibrary, withOthers = false): SpotifyPlaylist[] {
  const all = [...lib.playlists, ...(lib.other_playlists ?? [])]
  const listed = saved.map(id => all.find(p => p.id === id)).filter((p): p is SpotifyPlaylist => !!p)
  const rest = [...lib.playlists, ...(withOthers ? lib.other_playlists ?? [] : [])].filter(p => !saved.includes(p.id))
    .sort((a, b) => Number(b.id === lib.approved?.id) - Number(a.id === lib.approved?.id))
  return [...listed, ...rest]
}

// ---------------------------------------------------------------------------------------------
// Shared state for the whole app
// ---------------------------------------------------------------------------------------------
interface CafeMusic {
  /** A team member, and the café's music is YouTube Music. */
  enabled: boolean
  library: CafeMusicLibrary | null
  /** The shared player (with this device's live numbers when it is the speaker). */
  state: MusicPlayerState | null
  /** A speaker is playing somewhere right now. */
  live: boolean
  /** This device is the speaker. */
  here: boolean
  deviceName: string
  error: string | null
  /** Seconds into the current song, estimated between reports on other devices. */
  elapsed: () => number
  control(action: MusicAction, value?: number): Promise<void>
  setQueue(playlist: SpotifyPlaylist | null, queue: CafeTrack[], position: number): Promise<void>
  playPlaylist(playlist: SpotifyPlaylist): Promise<void>
  /** Songs from a search: play now, play next, or add to the end of the queue. */
  addTracks(tracks: CafeTrack[], where: 'now' | 'next' | 'end'): Promise<void>
  setPlaylistOrder(ids: string[]): Promise<void>
  claim(): Promise<void>
  release(): Promise<void>
  /** Pages that show the player call this so it keeps the state fresh while they're open. */
  watch(): () => void
}

const Ctx = createContext<CafeMusic | null>(null)
export const useCafeMusic = () => useContext(Ctx)

export function CafeSpeakerProvider({ children }: { children: ReactNode }) {
  const { api, me } = useApp()
  const staff = me?.role === 'admin' || me?.role === 'employee'
  const library = useAsync('cafe-music-library', () => (staff ? api.cafeMusicLibrary() : Promise.resolve(null)), [staff])
  const enabled = library.data?.provider === 'youtube'
  const deviceId = useMemo(myDeviceId, [])
  const kind = deviceKind()
  const owner = me?.full_name?.split(' ')[0] ?? t('Someone')
  const deviceName = kind === 'tablet' ? t('{name}’s tablet', { name: owner }) : kind === 'phone' ? t('{name}’s phone', { name: owner }) : t('{name}’s computer', { name: owner })
  const [state, setState] = useState<MusicPlayerState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [watchers, setWatchers] = useState(0)
  const [tick, setTick] = useState(0)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const engine = useRef<Engine | null>(null)
  /** What the speaker is doing (it is the authority on these while it plays). */
  const local = useRef({ version: -1, seq: -1, queue: [] as CafeTrack[], position: 0, playing: false, volume: 80, errors: 0, autoplay: false })
  const here = !!state && state.device_id === deviceId
  // The latest shared state and library, for the player's callbacks.
  const latest = useRef({ state, library: library.data })
  latest.current = { state, library: library.data }
  const live = !!state?.device_id && !!state.heartbeat_at && Date.now() - Date.parse(state.heartbeat_at) < STALE_MS

  const refresh = useCallback(async () => {
    try { setState(await api.musicPlayer()); setError(null) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [api])

  // Load once, then keep fresh while this device plays or a page shows the player.
  useEffect(() => { if (enabled) void refresh() }, [enabled, refresh])
  useEffect(() => {
    if (!enabled || (!here && watchers === 0)) return
    const timer = setInterval(() => void refresh(), here ? 1500 : 3000)
    return () => clearInterval(timer)
  }, [enabled, here, watchers, refresh])

  const report = useCallback(async (extra: object = {}) => {
    const e = engine.current
    const time = e?.time() ?? { elapsed: 0, duration: 0 }
    const l = local.current
    await api.musicReport({ position: l.position, playing: l.playing, volume: l.volume, elapsed: time.elapsed, duration: time.duration,
      heartbeat_at: new Date().toISOString(), ...extra }, deviceId).catch(() => {})
  }, [api, deviceId])

  /**
   * End of the queue: start the next playlist in the team's order (back to the first after the
   * last). False when there's no order to follow, so the same queue starts again.
   */
  const nextPlaylist = useCallback(() => {
    const { state: s, library: lib } = latest.current
    if (!lib) return false
    const order = playlistOrder(s?.playlist_order ?? [], lib)
    if (order.length < 2) return false
    const at = s?.playlist ? order.findIndex(p => p.id === s.playlist!.id) : -1
    const playlist = order[(at + 1) % order.length]
    // A song or playlist from a search isn't in the order: carry on from the first playlist.
    if (playlist.id === s?.playlist?.id) return false
    local.current.autoplay = true
    void api.cafeTracks(playlist.id)
      .then(tracks => (tracks.length ? api.musicSetQueue(playlist, tracks, 0) : Promise.reject(new Error(t('{name} has no songs that can play', { name: playlist.name })))))
      .then(() => api.musicPlayer()).then(setState)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
    return true
  }, [api])

  /** The next song, or the next playlist after the last song. */
  const forward = useCallback(() => {
    const l = local.current
    if (l.position + 1 >= l.queue.length && nextPlaylist()) return
    go(l.position + 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextPlaylist])

  const go = useCallback((index: number, autoplay = true) => {
    const l = local.current
    if (!l.queue.length || !engine.current) return
    l.position = ((index % l.queue.length) + l.queue.length) % l.queue.length
    l.playing = autoplay
    engine.current.load(l.queue[l.position].id, autoplay)
    void report()
  }, [report])

  const apply = useCallback((action: MusicAction, value: number | null | undefined) => {
    const e = engine.current, l = local.current
    if (!e) return
    if (action === 'play') { if (l.queue.length) { e.play(); l.playing = true } }
    else if (action === 'pause') { e.pause(); l.playing = false }
    else if (action === 'next') forward()
    else if (action === 'previous') { if (e.time().elapsed > 4) e.seek(0); else go(l.position - 1) }
    else if (action === 'jump' && value != null) go(value)
    else if (action === 'seek' && value != null) e.seek(value)
    else if (action === 'volume' && value != null) { l.volume = Math.max(0, Math.min(100, Math.round(value))); e.setVolume(l.volume) }
    void report()
  }, [go, forward, report])

  // Becoming the speaker: start the player in the mini player; stop when another device takes over.
  useEffect(() => {
    if (!here || !host || !state) return
    let gone = false
    const l = local.current
    l.seq = state.command_seq // older button presses were for the previous speaker
    l.version = -1
    l.volume = state.volume
    const events: EngineEvents = {
      onEnded: () => forward(),
      onPlaying: p => { local.current.playing = p; if (p) local.current.errors = 0; void report() },
      onError: () => {
        const c = local.current
        c.errors += 1
        if (c.errors >= c.queue.length) { c.playing = false; setError(t('None of these songs can play here (YouTube doesn’t allow them on other sites).')); void report(); return }
        go(c.position + 1)
      },
    }
    const start = library.data?.demo ? Promise.resolve(demoEngine(host, events)) : youtubeEngine(host, events, state.volume)
    start.then(e => {
      if (gone) { e.destroy(); return }
      engine.current = e
      setTick(n => n + 1)
    }, err => setError(err instanceof Error ? err.message : String(err)))
    return () => { gone = true; engine.current?.destroy(); engine.current = null; local.current.version = -1 }
    // Only when this device starts or stops being the speaker, or the player's box appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here, host])

  // The speaker follows the shared row: a new queue (playlist, order) and button presses from other devices.
  useEffect(() => {
    if (!here || !state || !engine.current) return
    const l = local.current
    if (state.queue_version !== l.version) {
      const before = l.queue[l.position]?.id
      l.version = state.queue_version
      l.queue = state.queue
      l.position = Math.min(state.position, Math.max(state.queue.length - 1, 0))
      const now = l.queue[l.position]?.id
      if (now && now !== before) go(l.position, l.autoplay || l.playing || before !== undefined)
      l.autoplay = false
    }
    if (state.command_seq > l.seq) {
      l.seq = state.command_seq
      if (state.command) apply(state.command.action, state.command.value)
    }
    // tick: also right after the player finishes starting (it sets tick), not just on the next refresh.
  }, [here, state, go, apply, tick])

  // While playing here: report every 2 seconds (the heartbeat that says this device is still on), redraw every second.
  useEffect(() => {
    if (!here) return
    const r = setInterval(() => void report(), 2000)
    const redraw = setInterval(() => setTick(n => n + 1), 1000)
    return () => { clearInterval(r); clearInterval(redraw) }
  }, [here, report])

  const value = useMemo<CafeMusic>(() => {
    const l = local.current
    const shown: MusicPlayerState | null = state && here
      ? { ...state, queue: l.version === -1 ? state.queue : l.queue, position: l.version === -1 ? state.position : l.position, playing: l.playing,
        volume: l.volume, ...(engine.current ? engine.current.time() : {}) }
      : state
    return {
      enabled, library: library.data ?? null, state: shown, live: live || here, here, deviceName, error,
      elapsed: () => {
        if (!shown) return 0
        if (here || !shown.playing || !shown.heartbeat_at) return shown.elapsed
        return Math.min(shown.elapsed + (Date.now() - Date.parse(shown.heartbeat_at)) / 1000, shown.duration || Infinity)
      },
      async control(action, v) {
        if (here) apply(action, v)
        else { await api.musicSend(action, v); await refresh() }
      },
      async setQueue(playlist, queue, position) {
        await api.musicSetQueue(playlist, queue, position)
        await refresh()
      },
      async playPlaylist(playlist) {
        const tracks = await api.cafeTracks(playlist.id)
        if (!tracks.length) throw new Error(t('That playlist has no songs that can play'))
        local.current.autoplay = true
        await api.musicSetQueue(playlist, tracks, 0)
        await refresh()
      },
      async addTracks(tracks, where) {
        const q = shown?.queue ?? []
        const at = shown?.position ?? 0
        if (!q.length) { local.current.autoplay = true; await api.musicSetQueue(shown?.playlist ?? null, tracks, 0) }
        else if (where === 'end') await api.musicSetQueue(shown!.playlist, [...q, ...tracks], at)
        else {
          // Right after the song playing now; "now" also moves to it (the speaker starts it).
          if (where === 'now') local.current.autoplay = true
          await api.musicSetQueue(shown!.playlist, [...q.slice(0, at + 1), ...tracks, ...q.slice(at + 1)], where === 'now' ? at + 1 : at)
        }
        await refresh()
      },
      async setPlaylistOrder(ids) {
        await api.musicSetPlaylistOrder(ids)
        await refresh()
      },
      async claim() {
        // Nothing queued yet: the approved playlist (or the first one) before this device starts.
        if (!state?.queue.length) {
          const first = library.data?.approved ?? library.data?.playlists[0]
          if (first) await api.musicSetQueue(first, await api.cafeTracks(first.id), 0)
        }
        local.current.autoplay = true
        local.current.playing = true
        await api.musicReport({ device_id: deviceId, device_name: deviceName, heartbeat_at: new Date().toISOString() })
        await refresh()
      },
      async release() {
        engine.current?.pause()
        local.current.playing = false
        await api.musicReport({ device_id: null, device_name: null, playing: false, heartbeat_at: null }, deviceId)
        await refresh()
      },
      watch() {
        setWatchers(n => n + 1)
        return () => setWatchers(n => n - 1)
      },
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, library.data, state, live, here, deviceName, error, api, apply, refresh, deviceId, tick])

  return (
    <Ctx.Provider value={value}>
      {children}
      {here && <MiniPlayer music={value} onHost={setHost} />}
    </Ctx.Provider>
  )
}

/** Keeps the player fresh while the calling page is open. */
export function useWatchCafeMusic() {
  const music = useCafeMusic()
  const watch = music?.watch
  useEffect(() => (watch ? watch() : undefined), [watch])
  return music
}

/**
 * On the speaker device: the YouTube player (YouTube requires it to stay visible, at least
 * 200×200), the song, and the main buttons, in the corner of every page.
 */
function MiniPlayer({ music, onHost }: { music: CafeMusic; onHost: (el: HTMLElement | null) => void }) {
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const { pathname } = useLocation()
  const s = music.state
  const track = s?.queue[s.position]
  return (
    <Card role="region" aria-label={t('Café speaker')} elevation={8}
      sx={{ position: 'fixed', zIndex: 1200, right: desktop ? 24 : 8, bottom: desktop ? 24 : 76, width: 220, overflow: 'hidden', borderRadius: '14px' }}>
      <Box ref={onHost} sx={{ width: 220, height: 200, bgcolor: '#000' }} />
      <Box sx={{ px: 1.25, pt: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>{track?.title ?? t('Pick a playlist')}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>
          {track?.artist ?? (pathname === '/music' ? t('Café speaker') : <RouterLink to="/music">{t('Open Music')}</RouterLink>)}
        </Typography>
      </Box>
      <Stack direction="row" sx={{ alignItems: 'center', px: 0.5, pb: 0.5 }}>
        <IconButton aria-label={t('Previous song')} onClick={() => void music.control('previous')}><PrevIcon /></IconButton>
        {s?.playing
          ? <IconButton aria-label={t('Pause')} onClick={() => void music.control('pause')}><PauseIcon /></IconButton>
          : <IconButton aria-label={t('Play')} onClick={() => void music.control('play')} sx={{ color: tokens.roseDeep }}><PlayIcon /></IconButton>}
        <IconButton aria-label={t('Next song')} onClick={() => void music.control('next')}><NextIcon /></IconButton>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={t('Stop playing on this device')}>
          <IconButton aria-label={t('Stop playing on this device')} size="small" onClick={() => void music.release()}><CloseIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>
    </Card>
  )
}
