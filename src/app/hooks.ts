import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

/**
 * Load data through the shared TanStack Query cache. `key` names the data (e.g. 'rota') and
 * `deps` are its parameters; together they form the cache key. Keeps previous data while
 * reloading, retries failed reads, and refreshes when any write succeeds (see useAction).
 */
export function useAsync<T>(key: string, fn: () => Promise<T>, deps: unknown[], options: { refetchInterval?: number } = {}) {
  const q = useQuery({
    queryKey: [key, ...deps],
    queryFn: fn,
    placeholderData: prev => prev,
    refetchInterval: options.refetchInterval,
  })
  return {
    data: q.data ?? null,
    error: q.error ? (q.error instanceof Error ? q.error.message : String(q.error)) : null,
    loading: q.isPending || q.isFetching,
    reload: async () => { await q.refetch() },
  }
}

/** Re-render every `ms` (for live timers). */
export function useTick(ms = 1000) {
  const [, set] = useState(0)
  useEffect(() => {
    const t = setInterval(() => set(n => n + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}
