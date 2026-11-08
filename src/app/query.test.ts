import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { refreshAll } from './query'

const later = <T,>(ms: number, value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms))

describe('refreshAll', () => {
  it("refreshes every read but doesn't wait for the outside inboxes or the connections", async () => {
    const client = new QueryClient()
    let settingsReads = 0
    let inboxReads = 0
    let connectionReads = 0
    const watch = (queryKey: string[], queryFn: () => Promise<unknown>) => new QueryObserver(client, { queryKey, queryFn }).subscribe(() => {})
    const stop = [
      watch(['app-shared'], () => later(5, ++settingsReads)),
      watch(['instagram-inbox'], () => later(400, ++inboxReads)),
      watch(['integrations'], () => later(400, ++connectionReads)),
    ]
    await later(450, null)
    expect([settingsReads, inboxReads, connectionReads]).toEqual([1, 1, 1])

    const started = Date.now()
    await refreshAll(client)
    expect(Date.now() - started).toBeLessThan(200)
    expect(settingsReads).toBe(2)
    expect(inboxReads).toBe(2)                    // asked again, still on its way
    expect(connectionReads).toBe(2)
    expect(client.getQueryState(['instagram-inbox'])?.fetchStatus).toBe('fetching')
    expect(client.getQueryState(['integrations'])?.fetchStatus).toBe('fetching')
    stop.forEach(s => s())
  })
})
