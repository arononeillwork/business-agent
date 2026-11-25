import { Box, CircularProgress, Typography } from '@mui/material'
import TouchIcon from '@mui/icons-material/TouchAppOutlined'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { ScreenPlayer, Turned } from '../components/ScreenPlayer'
import { isShortLink, playAs, rotationOf, screenTurn, type DisplayFeed } from '../../shared/screens'
import { t } from '../i18n'

const CACHE = (token: string) => `eb-display-${token}`
/** This TV turns a portrait screen the other way (its own choice, kept on it). */
const TURN = 'eb-display-turn'
const TURN_KEYS = ['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
const landscape = () => typeof matchMedia === 'function' && matchMedia('(orientation: landscape)').matches
/** The slides last loaded on this screen, so it starts playing even before the network is back. */
function cached(token: string): DisplayFeed | null {
  try { return JSON.parse(localStorage.getItem(CACHE(token)) ?? 'null') as DisplayFeed | null } catch { return null }
}

/**
 * A screen's own page (/display/<link>, or its short link /display-menu/<name> or /slideshow/<name>),
 * opened once in the TV's or tablet's browser, with no sign-in: it plays the screen's slides full
 * screen, asks for changes every minute, keeps the screen awake, and carries on with the last slides
 * it had when the network drops.
 */
export function DisplayPage() {
  const { api } = useApp()
  const { pathname } = useLocation()
  // /display/<token>, or a short link (/display-menu/cafe-tv, /slideshow/offers): kept under its own path.
  const short = isShortLink(pathname)
  const token = short ? pathname.replace(/\/+$/, '') : pathname.split('/')[2] ?? ''
  const [feed, setFeed] = useState<DisplayFeed | null>(() => cached(token))
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    let stopped = false
    const load = () => (short ? api.displayLink(token) : api.display(token)).then(f => {
      if (stopped) return
      setFeed(f)
      setError(null)
      try { localStorage.setItem(CACHE(token), JSON.stringify(f)) } catch { /* storage full or off: fine */ }
    }).catch(e => { if (!stopped) setError(e instanceof Error ? e.message : String(e)) })
    void load()
    const id = setInterval(load, 60_000)
    return () => { stopped = true; clearInterval(id) }
  }, [api, token, short])

  useEffect(() => { if (feed) document.title = feed.screen.name }, [feed])
  // Nobody signs in on a TV: its prices are written the way the business's country writes them (Ireland's
  // "€3.20", Spain's "€3,20") and its times are the business's, set before the slides draw.
  if (feed) playAs(feed.business)

  // Keep the screen from going to sleep (asked again whenever the page comes back into view).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const ask = () => { (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<typeof lock> } }).wakeLock?.request('screen').then(l => { lock = l }).catch(() => {}) }
    const again = () => { if (document.visibilityState === 'visible') ask() }
    ask()
    document.addEventListener('visibilitychange', again)
    return () => { document.removeEventListener('visibilitychange', again); void lock?.release().catch(() => {}) }
  }, [])

  // The pointer hides when it's still (a mouse left on a TV).
  useEffect(() => {
    let id = setTimeout(() => setIdle(true), 3000)
    const moved = () => { setIdle(false); clearTimeout(id); id = setTimeout(() => setIdle(true), 3000) }
    window.addEventListener('pointermove', moved)
    return () => { clearTimeout(id); window.removeEventListener('pointermove', moved) }
  }, [])

  // A portrait screen on a TV that shows landscape (a TV hung on its side whose browser doesn't turn
  // with it): the slides are turned a quarter to fill it upright. A tap, or OK or an arrow on the
  // remote, turns them the other way, and this TV keeps that.
  const [wide, setWide] = useState(landscape)
  const [other, setOther] = useState(() => {
    try { const kept = localStorage.getItem(TURN); if (kept !== null) return kept === '1' } catch { /* storage off */ }
    // A page that shows this one inside it (the café's own website) can say which way its TV turns: ?turn=left.
    return new URLSearchParams(location.search).get('turn') === 'left'
  })
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const m = matchMedia('(orientation: landscape)')
    const changed = () => setWide(m.matches)
    m.addEventListener('change', changed)
    return () => m.removeEventListener('change', changed)
  }, [])
  const turned = feed?.screen.orientation === 'portrait' && wide
  const turnAround = () => setOther(o => { try { localStorage.setItem(TURN, o ? '0' : '1') } catch { /* storage off: this time only */ } return !o })
  useEffect(() => {
    if (!turned) return
    const key = (e: KeyboardEvent) => { if (TURN_KEYS.includes(e.key)) turnAround() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [turned])

  // The screen's own turn (the Rotate button on the Screens page) goes on top, for a TV hung any way round.
  const turn = feed ? screenTurn(rotationOf(feed.screen), turned ? (other ? 270 : 90) : 0) : 0

  // A tap goes full screen (and lets the music start: browsers only allow sound after one).
  const fullScreen = () => { void document.documentElement.requestFullscreen?.().catch(() => {}) }
  const tap = () => { fullScreen(); if (turned) turnAround() }
  const player = feed && <ScreenPlayer feed={feed} onBlocked={setBlocked} />
  return (
    <Box onClick={tap} sx={{ position: 'fixed', inset: 0, bgcolor: '#000', color: '#fff', cursor: idle ? 'none' : 'default', overflow: 'hidden' }}>
      {feed ? (turn ? <Turned turn={turn} units={['vw', 'vh']}>{player}</Turned> : player)
        : error ? (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 4, textAlign: 'center' }}>
            <Typography sx={{ maxWidth: 560, fontSize: '1.3rem' }}>{error}</Typography>
          </Box>
        ) : <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><CircularProgress color="inherit" /></Box>}
      {blocked && (
        <Box sx={{ position: 'absolute', left: '50%', bottom: '8%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 1, px: 2.5, py: 1.25,
          borderRadius: 99, bgcolor: 'rgba(0,0,0,0.7)', fontSize: '1.1rem', pointerEvents: 'none' }}>
          <TouchIcon /> {t('Tap anywhere to start the music')}
        </Box>
      )}
    </Box>
  )
}
