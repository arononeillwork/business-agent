import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshAll, runAction } from './query'
import { SHARED_KEY } from './signInWatch'

const later = <T,>(ms: number, value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms))

/**
 * The app on a slow day: its own data (AppContext's load) answers in 300 ms, a Worker endpoint (billing,
 * which checks the sign-in with Supabase first) in 8 s and an outside inbox in 10 s. `db` is what's saved.
 */
function slowApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const db = { phone: 'old' }
  const reads = { app: 0, billing: 0, inbox: 0 }
  let appFails = false
  const watch = (queryKey: string[], queryFn: () => Promise<unknown>) => new QueryObserver(client, { queryKey, queryFn }).subscribe(() => {})
  const stop = [
    watch([SHARED_KEY, 'live'], async () => {
      reads.app++
      const failing = appFails
      const phone = await later(300, db.phone)
      if (failing) throw new Error('Supabase timed out')
      return { business: { phone } }
    }),
    watch(['billing'], () => { reads.billing++; return later(8000, { plan: 'pro' }) }),
    watch(['instagram-inbox'], () => { reads.inbox++; return later(10_000, []) }),
  ]
  const notes: [string, string][] = []
  return {
    client, db, reads, notes,
    note: (text: string, kind: string) => { notes.push([text, kind]) },
    phone: () => (client.getQueryData([SHARED_KEY, 'live']) as { business: { phone: string } } | undefined)?.business.phone,
    fetching: (key: string) => client.getQueryState(key === 'app' ? [SHARED_KEY, 'live'] : [key])?.fetchStatus === 'fetching',
    failNextLoad: () => { appFails = true },
    /** A write that takes 200 ms. */
    save: (phone: string) => async () => { await later(200, null); db.phone = phone },
    done: () => stop.forEach(s => s()),
  }
}

describe('saving on a slow day', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  /** Let the first loads land. */
  const loaded = async () => { await vi.advanceTimersByTimeAsync(10_000) }

  it('says "Saved" as soon as the write is done, then the saved data lands while the Worker is still on its way', async () => {
    const a = slowApp()
    await loaded()
    expect(a.phone()).toBe('old')

    let settled = false
    const saving = runAction(a.client, a.note, a.save('new'), 'Saved').then(ok => { settled = true; return ok })
    await vi.advanceTimersByTimeAsync(200)                // the write is done: nothing reloaded yet
    expect(a.notes).toEqual([['Saved', 'success']])
    expect(settled).toBe(true)                            // no `fresh`: straight away
    expect(await saving).toBe(true)
    // Every read is asked again, the slow ones too, once each.
    expect(a.reads).toEqual({ app: 2, billing: 2, inbox: 2 })
    expect(a.phone()).toBe('old')

    await vi.advanceTimersByTimeAsync(300)
    expect(a.phone()).toBe('new')                         // the screen ends up showing it
    expect(a.fetching('billing')).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(a.fetching('billing')).toBe(false)
    expect(a.reads).toEqual({ app: 2, billing: 2, inbox: 2 }) // not started again part way
    a.done()
  })

  it('with `fresh`, resolves once the app’s own data shows the change, without waiting for the Worker', async () => {
    const a = slowApp()
    await loaded()
    let saved: boolean | undefined
    void runAction(a.client, a.note, a.save('new'), 'Saved', { fresh: true }).then(ok => { saved = ok })
    await vi.advanceTimersByTimeAsync(200)
    expect(a.notes).toEqual([['Saved', 'success']])      // said before the reload
    expect(saved).toBeUndefined()                         // a dialog closing now would show the old phone
    await vi.advanceTimersByTimeAsync(300)
    expect(saved).toBe(true)
    expect(a.phone()).toBe('new')
    expect(a.fetching('billing')).toBe(true)              // 8 s, not waited for
    a.done()
  })

  it('a failed write shows its error and no "Saved", and reloads nothing', async () => {
    const a = slowApp()
    await loaded()
    const saving = runAction(a.client, a.note, async () => { await later(200, null); throw new Error('Enter the full phone number') }, 'Saved', { fresh: true })
    await vi.advanceTimersByTimeAsync(200)
    expect(await saving).toBe(false)
    expect(a.notes).toEqual([['Enter the full phone number', 'error']])
    expect(a.reads).toEqual({ app: 1, billing: 1, inbox: 1 })
    a.done()
  })

  it('a reload that fails afterwards doesn’t make the save look failed', async () => {
    const a = slowApp()
    await loaded()
    a.failNextLoad()
    let saved: boolean | undefined
    void runAction(a.client, a.note, a.save('new'), 'Saved', { fresh: true }).then(ok => { saved = ok })
    await vi.advanceTimersByTimeAsync(500)
    expect(saved).toBe(true)
    expect(a.notes).toEqual([['Saved', 'success']])
    expect(a.phone()).toBe('old')                         // what was on screen stays
    a.done()
  })
})

describe('refreshAll', () => {
  it('refreshes every read but resolves once the app’s own data is back', async () => {
    const client = new QueryClient()
    let appReads = 0
    let billingReads = 0
    const watch = (queryKey: string[], queryFn: () => Promise<unknown>) => new QueryObserver(client, { queryKey, queryFn }).subscribe(() => {})
    const stop = [
      watch([SHARED_KEY, 'live'], () => later(5, ++appReads)),
      watch(['billing'], () => later(400, ++billingReads)),
    ]
    await later(450, null)
    expect([appReads, billingReads]).toEqual([1, 1])

    const started = Date.now()
    await refreshAll(client)
    expect(Date.now() - started).toBeLessThan(200)
    expect(appReads).toBe(2)
    expect(billingReads).toBe(2)                    // asked again, still on its way
    expect(client.getQueryState(['billing'])?.fetchStatus).toBe('fetching')
    stop.forEach(s => s())
  })
})
