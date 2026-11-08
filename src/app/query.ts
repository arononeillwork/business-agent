import { QueryClient, type Query } from '@tanstack/react-query'
import { SHARED_KEY } from './signInWatch'

// One cache for the whole app. Reads retry with backoff and refresh in the background when the
// window regains focus or the connection comes back, so a café tablet on flaky wifi recovers
// by itself. Writes are not retried automatically (a clock-in must never be sent twice).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failures, error) => failures < 3 && !/permission|not allowed|only an admin/i.test(String(error)),
      retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: { retry: false },
  },
})

/** AppContext's load: who is signed in, the business, its settings and team, pay rates and roles. */
const appData = (q: Query) => q.queryKey[0] === SHARED_KEY

/**
 * After a save: every read is refreshed, each page's, the Worker's (billing, connections, music…) and
 * the outside inboxes. Resolves once the app's own data is back, which is what a dialog closing onto it
 * or a form resetting from it needs; the rest lands on screen as it comes. On a slow day each of the
 * others can take seconds (the Worker checks the sign-in with Supabase first), so nothing waits for them.
 * Never rejects: a reload that fails keeps what's on screen and is tried again, and a save never looks
 * failed because of it.
 */
export async function refreshAll(client: QueryClient) {
  void client.invalidateQueries({ predicate: q => !appData(q) })
  await client.invalidateQueries({ predicate: appData })
}

export type Note = (text: string, kind: 'success' | 'error') => void

/**
 * One save (useAction, Notify.tsx). `write` changes something; a failed one shows its error and that's
 * all. A successful one shows `success` straight away, not after the reloads, then refreshes every read
 * (refreshAll), once. Resolves to whether it saved: straight away, or with `fresh` once the app's own data
 * shows the change, for code that goes on from it (closing a dialog onto the new row, a form resetting
 * from it, opening a page that reads it). A save button kept busy until then can't be pressed twice
 * while the screen still shows the old data.
 */
export async function runAction(client: QueryClient, note: Note, write: () => Promise<unknown>, success?: string,
  { fresh = false }: { fresh?: boolean } = {}) {
  try {
    await write()
  } catch (e) {
    note(e instanceof Error ? e.message : String(e), 'error')
    return false
  }
  if (success) note(success, 'success')
  const reloaded = refreshAll(client)
  if (fresh) await reloaded
  return true
}
