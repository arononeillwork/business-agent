import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { reloadOnSignInChange, SHARED_KEY } from './signInWatch'

const later = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** The app's shared load, reading whoever the "session" says is signed in, taking `ms` each time. */
function app(ms = 20, failFirst = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let session: string | null = 'ana'
  let loads = 0
  let fail = failFirst
  const listeners = new Set<(id: string | null) => void>()
  const observer = new QueryObserver(client, {
    queryKey: [SHARED_KEY, 'live'],
    queryFn: async () => {
      loads++
      const who = session
      const failing = fail
      await later(ms)
      if (failing) throw new Error('offline')
      return { me: who ? { id: who } : null }
    },
  })
  const stopObserver = observer.subscribe(() => {})
  const stop = reloadOnSignInChange(client, cb => { listeners.add(cb); return () => listeners.delete(cb) })
  const emit = (id: string | null) => { session = id; listeners.forEach(cb => setTimeout(() => cb(id), 0)) }
  return {
    client, emit, loads: () => loads, failNext: (on: boolean) => { fail = on },
    who: () => (client.getQueryData([SHARED_KEY, 'live']) as { me: { id: string } | null } | undefined)?.me?.id ?? null,
    done: () => { stop(); stopObserver() },
  }
}

describe('reloadOnSignInChange', () => {
  it('loads a page once: the session Supabase finds on opening arrives mid-load and is the one being loaded', async () => {
    const a = app()
    a.emit('ana')                       // INITIAL_SESSION, while the first load is on its way
    await later(80)
    expect(a.loads()).toBe(1)
    expect(a.who()).toBe('ana')
    a.done()
  })

  it('token refreshes for the same person reload nothing', async () => {
    const a = app()
    await later(40)
    a.emit('ana')
    a.emit('ana')
    await later(40)
    expect(a.loads()).toBe(1)
    a.done()
  })

  it('signing out, or someone else signing in, loads everything again', async () => {
    const a = app()
    await later(40)
    a.emit(null)
    await later(40)
    expect([a.loads(), a.who()]).toEqual([2, null])
    a.emit('bea')
    await later(40)
    expect([a.loads(), a.who()]).toEqual([3, 'bea'])
    a.done()
  })

  it('someone else signed in while a load was on its way: once it lands, it is loaded again for them', async () => {
    const a = app()
    await later(5)                       // the first load has read "ana"…
    a.emit('bea')                        // …and now Bea is signed in
    await later(80)
    expect(a.loads()).toBe(2)
    expect(a.who()).toBe('bea')
    a.done()
  })

  it('a load that failed while an event waited is tried again, once', async () => {
    const a = app(20, true)
    a.emit('ana')
    await later(10)
    a.failNext(false)
    await later(80)
    expect(a.loads()).toBe(2)
    expect(a.who()).toBe('ana')
    a.done()
  })
})
