import { QueryClient } from '@tanstack/react-query'

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
