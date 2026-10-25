import { QueryClient, type Query } from '@tanstack/react-query'

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

// The menu badge's inboxes (src/app/unread.ts, shared with the Messages page) ask Instagram, Facebook
// and WhatsApp through the Worker, and one of them can take ten seconds. They are refreshed with
// everything else, but a save doesn't wait for them before it says it's done.
const OUTSIDE_INBOXES = new Set(['instagram-inbox', 'messenger-inbox', 'whatsapp-inbox'])
const outside = (q: Query) => OUTSIDE_INBOXES.has(String(q.queryKey[0]))

/** After a save: every read is refreshed; resolves once the app's own data (not the inboxes) is back. */
export async function refreshAll(client: QueryClient) {
  void client.invalidateQueries({ predicate: outside })
  await client.invalidateQueries({ predicate: q => !outside(q) })
}
