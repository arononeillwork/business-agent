// After a deploy, a tab that was already open asks for page code the deploy replaced, which is gone.
// Reloading picks up the new version. For a few seconds after a deploy the old start page can still be
// served, and a reload of it asks for the same missing code again, so try again a few times, waiting
// longer each time. If that hasn't helped (or the connection is down), say so with a Reload button
// rather than show a blank page. Used by main.tsx (vite:preloadError) and the lazy pages in App.tsx.
import { Alert, AlertTitle, Box, Button } from '@mui/material'
import { t } from '../i18n'

const KEY = 'reloaded-for-new-version'
/** The wait before each reload in a row (ms); after the last, the notice. */
export const WAITS = [0, 2_000, 5_000, 10_000]
/** Reloads further apart than this start again from the first. */
const FRESH = 60_000

export interface Tries { n: number; at: number }

/** The wait before the next reload and what to remember for the one after, or null when it's time to stop. */
export function nextReload(before: Tries | null, now: number): { wait: number; tries: Tries } | null {
  const n = before && now - before.at < FRESH ? before.n : 0
  if (n >= WAITS.length) return null
  return { wait: WAITS[n], tries: { n: n + 1, at: now } }
}

const read = (raw: string | null): Tries | null => {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<Tries> | null
    return v && typeof v.n === 'number' && typeof v.at === 'number' ? { n: v.n, at: v.at } : null
  } catch { return null }
}

// Once a reload is on its way, every other page that fails to load in the meantime waits for it too.
let reloading = false

/**
 * Reload for the new version (true: it's on its way), or false when reloading hasn't helped, the
 * connection is down, or the tab can't remember its reloads (it would go round for ever).
 */
export function reloadForNewVersion(): boolean {
  if (reloading) return true
  if (!navigator.onLine) return false
  try {
    const next = nextReload(read(sessionStorage.getItem(KEY)), Date.now())
    if (!next) return false
    sessionStorage.setItem(KEY, JSON.stringify(next.tries))
    reloading = true
    setTimeout(() => location.reload(), next.wait)
    return true
  } catch {
    return false
  }
}

/** In place of a page whose code didn't load. */
export function NewVersionNotice() {
  const reload = () => {
    try { sessionStorage.removeItem(KEY) } catch { /* storage blocked */ }
    location.reload()
  }
  return (
    <Box sx={{ py: 4, maxWidth: 560, mx: 'auto' }}>
      <Alert severity="info" action={<Button color="inherit" onClick={reload}>{t('Reload')}</Button>}>
        <AlertTitle>{t('This page didn’t open')}</AlertTitle>
        {t('The app has probably just been updated, or the connection dropped. Reload to carry on.')}
      </Alert>
    </Box>
  )
}
