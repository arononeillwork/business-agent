import { useColorScheme } from '@mui/material/styles'
import { useEffect } from 'react'
import type { Preferences } from '../../shared/types'
import { useApp } from './AppContext'

// Each person's appearance and accessibility choices (saved on their profile, so they follow them
// to any device), applied to the whole app. A copy is kept on this device so the next visit opens
// in the right theme and size straight away, before sign-in finishes.
const CACHE = 'eb-preferences'
export const TEXT_SIZES: Record<NonNullable<Preferences['textSize']>, { label: string; scale: string }> = {
  small: { label: 'Small', scale: '93.75%' },
  default: { label: 'Standard', scale: '100%' },
  large: { label: 'Large', scale: '112.5%' },
  larger: { label: 'Extra large', scale: '125%' },
}

export function cachedPreferences(): Preferences {
  try { return JSON.parse(localStorage.getItem(CACHE) ?? '{}') as Preferences } catch { return {} }
}

/** Everything except the colour theme, which MUI's colour-scheme switcher handles. */
export function applyPreferences(p: Preferences) {
  const root = document.documentElement
  root.style.fontSize = TEXT_SIZES[p.textSize ?? 'default'].scale
  const set = (attr: string, value: string | null) => value ? root.setAttribute(attr, value) : root.removeAttribute(attr)
  set('data-eb-contrast', p.contrast === 'high' ? 'high' : null)
  set('data-eb-font', p.font === 'readable' ? 'readable' : null)
  set('data-eb-motion', p.motion === 'reduce' ? 'reduce' : null)
  if (p.font === 'readable' && !document.getElementById('eb-readable-font')) {
    const link = Object.assign(document.createElement('link'), { id: 'eb-readable-font', rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap' })
    document.head.appendChild(link)
  }
  try { localStorage.setItem(CACHE, JSON.stringify(p)) } catch { /* storage unavailable */ }
}

/** Keeps the page in step with the signed-in person's preferences. */
export function AppearanceSync() {
  const { me } = useApp()
  const { setMode } = useColorScheme()
  // Signed in: only this person's own settings (never the last person's on this device).
  const prefs = me ? (me.preferences ?? {}) : cachedPreferences()
  const key = JSON.stringify(prefs)
  useEffect(() => {
    applyPreferences(prefs)
    setMode(prefs.theme ?? 'system')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setMode])
  return null
}
