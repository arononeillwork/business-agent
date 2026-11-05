// Reloading for a new version: a few times in a row, waiting longer each time, then the notice.
import { describe, expect, it } from 'vitest'
import { WAITS, nextReload } from './newVersion'

describe('reloading for a new version', () => {
  it('reloads straight away the first time, then waits longer each time, then stops', () => {
    let tries = null as Parameters<typeof nextReload>[0]
    const waits: number[] = []
    let now = 1_000_000
    for (;;) {
      const next = nextReload(tries, now)
      if (!next) break
      waits.push(next.wait)
      tries = next.tries
      now += next.wait + 1_500
    }
    expect(waits).toEqual(WAITS)
    expect(waits[0]).toBe(0)
  })

  it('starts again from the first once the last reload was a while ago (the next deploy)', () => {
    expect(nextReload({ n: WAITS.length, at: 0 }, 5_000)).toBeNull()
    expect(nextReload({ n: WAITS.length, at: 0 }, 61_000)).toEqual({ wait: 0, tries: { n: 1, at: 61_000 } })
  })
})
