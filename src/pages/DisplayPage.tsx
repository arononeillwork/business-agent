import { Box, CircularProgress, Typography } from '@mui/material'
import TouchIcon from '@mui/icons-material/TouchAppOutlined'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { ScreenPlayer } from '../components/ScreenPlayer'
import type { DisplayFeed } from '../../shared/screens'
import { t } from '../i18n'

const CACHE = (token: string) => `eb-display-${token}`
/** The slides last loaded on this screen, so it starts playing even before the network is back. */
function cached(token: string): DisplayFeed | null {
  try { return JSON.parse(localStorage.getItem(CACHE(token)) ?? 'null') as DisplayFeed | null } catch { return null }
}

/**
 * A screen's own page (/display/<link>), opened once in the TV's or tablet's browser, with no
 * sign-in: it plays the screen's slides full screen, asks for changes every minute, keeps the
 * screen awake, and carries on with the last slides it had when the network drops.
 */
export function DisplayPage() {
  const { api } = useApp()
  const { pathname } = useLocation()
  const token = pathname.split('/')[2] ?? ''
  const [feed, setFeed] = useState<DisplayFeed | null>(() => cached(token))
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    let stopped = false
    const load = () => api.display(token).then(f => {
      if (stopped) return
      setFeed(f)
      setError(null)
      try { localStorage.setItem(CACHE(token), JSON.stringify(f)) } catch { /* storage full or off: fine */ }
    }).catch(e => { if (!stopped) setError(e instanceof Error ? e.message : String(e)) })
    void load()
    const id = setInterval(load, 60_000)
    return () => { stopped = true; clearInterval(id) }
  }, [api, token])

  useEffect(() => { if (feed) document.title = feed.screen.name }, [feed])

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

  // A tap goes full screen (and lets the music start: browsers only allow sound after one).
  const fullScreen = () => { void document.documentElement.requestFullscreen?.().catch(() => {}) }
  return (
    <Box onClick={fullScreen} sx={{ position: 'fixed', inset: 0, bgcolor: '#000', color: '#fff', cursor: idle ? 'none' : 'default' }}>
      {feed ? <ScreenPlayer feed={feed} onBlocked={setBlocked} />
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
