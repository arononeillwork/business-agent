import type { QueryClient } from '@tanstack/react-query'

/** The query that loads who is signed in and the team's reference data (AppContext). */
export const SHARED_KEY = 'app-shared'

/**
 * Signing in or out changes what everyone may see, so the whole cache is dropped when the person
 * signed in isn't the one the app has loaded. That's compared with what's loaded, not with the
 * previous event, so it doesn't matter which of Supabase's events arrives first. Token refreshes
 * for the same person reload nothing.
 *
 * An event that arrives while that load is still on its way waits for it to land. Supabase's first
 * event (the session it found on opening) always comes then, and that load already reads the
 * same session. Dropping it there started every page twice. Once the load lands, it's checked
 * against the latest event, and reloaded once if someone else is signed in by then (or it failed).
 */
export function reloadOnSignInChange(client: QueryClient, onAuthChange: (cb: (id: string | null) => void) => () => void) {
  let latest: string | null | undefined
  let waiting = false
  const shared = () => client.getQueryCache().findAll({ queryKey: [SHARED_KEY] })
  const loading = () => shared().some(q => q.state.fetchStatus === 'fetching')
  /** Whoever the loaded data is for: null when no one is signed in, undefined when nothing has loaded. */
  const loadedId = () => {
    const q = shared().find(x => x.state.status === 'success')
    return q ? (q.state.data as { me?: { id: string } | null } | undefined)?.me?.id ?? null : undefined
  }

  const stopAuth = onAuthChange(id => {
    latest = id
    if (loading()) { waiting = true; return }
    if (id !== loadedId()) void client.resetQueries()
  })
  const stopCache = client.getQueryCache().subscribe(event => {
    if (!waiting || event.type !== 'updated' || event.query.queryKey[0] !== SHARED_KEY || loading()) return
    waiting = false
    if (event.query.state.status !== 'success' || latest !== loadedId()) void client.resetQueries()
  })
  return () => { stopAuth(); stopCache() }
}
