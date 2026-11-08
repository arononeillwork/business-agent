import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { reloadOnSignInChange, SHARED_KEY } from './signInWatch'

/** Let timers and promises run: Supabase's events (sent with setTimeout), React Query's updates. */
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0)) }

/**
 * The app's shared load, reading whoever the "session" says is signed in. Each load waits until the test
 * finishes it (`finish()`), so what arrives during a load and what after is the test's to say, not the
 * clock's: a busy machine can't change the order.
 */
function app(failFirst = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let session: string | null = 'ana'
  let loads = 0
  let fail = failFirst
  const waiting: (() => void)[] = []
  const listeners = new Set<(id: string | null) => void>()
  const observer = new QueryObserver(client, {
    queryKey: [SHARED_KEY, 'live'],
    queryFn: async () => {
      loads++
      const who = session
      const failing = fail
      await new Promise<void>(resolve => waiting.push(resolve))
      if (failing) throw new Error('offline')
      return { me: who ? { id: who } : null }
    },
  })
  const stopObserver = observer.subscribe(() => {})
  const stop = reloadOnSignInChange(client, cb => { listeners.add(cb); return () => listeners.delete(cb) })
  return {
    /** Supabase reports who is signed in now (after the current callback, as supabaseApi does). */
    emit: async (id: string | null) => { session = id; listeners.forEach(cb => setTimeout(() => cb(id), 0)); await flush() },
    /** The oldest load on its way lands. */
    finish: async () => { expect(waiting.length).toBeGreaterThan(0); waiting.shift()!(); await flush() },
    loads: () => loads,
    onTheirWay: () => waiting.length,
    failNext: (on: boolean) => { fail = on },
    who: () => (client.getQueryData([SHARED_KEY, 'live']) as { me: { id: string } | null } | undefined)?.me?.id ?? null,
    done: () => { stop(); stopObserver() },
  }
}

describe('reloadOnSignInChange', () => {
  it('loads a page once: the session Supabase finds on opening arrives mid-load and is the one being loaded', async () => {
    const a = app()
    await a.emit('ana')                 // INITIAL_SESSION, while the first load is on its way
    await a.finish()
    expect([a.loads(), a.onTheirWay(), a.who()]).toEqual([1, 0, 'ana'])
    a.done()
  })

  it('token refreshes for the same person reload nothing', async () => {
    const a = app()
    await a.finish()
    await a.emit('ana')
    await a.emit('ana')
    expect([a.loads(), a.onTheirWay()]).toEqual([1, 0])
    a.done()
  })

  it('signing out, or someone else signing in, loads everything again', async () => {
    const a = app()
    await a.finish()
    await a.emit(null)
    await a.finish()
    expect([a.loads(), a.who()]).toEqual([2, null])
    await a.emit('bea')
    await a.finish()
    expect([a.loads(), a.onTheirWay(), a.who()]).toEqual([3, 0, 'bea'])
    a.done()
  })

  it('someone else signed in while a load was on its way: once it lands, it is loaded again for them', async () => {
    const a = app()                     // the first load has read "ana"…
    await a.emit('bea')                 // …and now Bea is signed in
    expect(a.loads()).toBe(1)           // nothing started again yet
    await a.finish()                    // Ana's lands, and is loaded again for Bea
    await a.finish()
    expect([a.loads(), a.onTheirWay(), a.who()]).toEqual([2, 0, 'bea'])
    a.done()
  })

  it('a load that failed while an event waited is tried again, once', async () => {
    const a = app(true)
    await a.emit('ana')
    a.failNext(false)
    await a.finish()                    // fails
    await a.finish()                    // tried again, once
    expect([a.loads(), a.onTheirWay(), a.who()]).toEqual([2, 0, 'ana'])
    a.done()
  })
})
