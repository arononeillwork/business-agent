import { describe, expect, it, vi } from 'vitest'
import { ignorable, makeReporter } from './errorReports'
import type { ClientErrorReport } from '../../shared/appErrors'

const where = { path: () => '/rota', build: () => 'index-Abc1-r2', userAgent: () => 'Mozilla/5.0' }

describe('the app’s error reports', () => {
  it('wait until the app knows how to send them, then go', async () => {
    const r = makeReporter(where)
    r.report(new Error('early'), 'error')
    const send = vi.fn(async (_: ClientErrorReport) => {})
    r.start(send)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({ kind: 'error', message: 'early', path: '/rota', build: 'index-Abc1-r2', user_agent: 'Mozilla/5.0' })
    r.report(new Error('later'), 'promise')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('a handful a page at most, each a different error, the same one from the error screen and the window once', () => {
    const send = vi.fn(async () => {})
    const r = makeReporter(where, 5)
    r.start(send)
    const boom = new Error('boom')
    r.report(boom, 'render')
    r.report(boom, 'error')
    expect(send).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 10; i++) r.report(new Error(`other ${i}`), 'error')
    expect(send).toHaveBeenCalledTimes(5)
  })

  it('never break the page: a send that fails, or something odd thrown', async () => {
    const r = makeReporter(where)
    r.start(async () => { throw new Error('offline') })
    expect(() => r.report(Symbol('odd'), 'promise')).not.toThrow()
    expect(() => r.report(new Error('boom'), 'error')).not.toThrow()
    await new Promise(res => setTimeout(res, 0))
  })

  it('none from the demo', () => {
    const r = makeReporter(where)
    r.start(null)
    expect(() => r.report(new Error('boom'), 'error')).not.toThrow()
    expect(r.started).toBe(true)
  })

  it('leave out what says nothing about the app', () => {
    expect(ignorable(new Error('ResizeObserver loop completed with undelivered notifications.'))).toBe(true)
    expect(ignorable('Script error.')).toBe(true)
    expect(ignorable(new TypeError('Failed to fetch'))).toBe(true)
    expect(ignorable(new TypeError('Load failed'))).toBe(true)
    expect(ignorable(new Error('Failed to fetch dynamically imported module: https://app.test/assets/RotaPage-x.js'))).toBe(true)
    expect(ignorable(new Error('boom'), 'chrome-extension://abc/content.js')).toBe(true)
    expect(ignorable(new TypeError('Cannot read properties of undefined (reading \'x\')'))).toBe(false)
  })
})
