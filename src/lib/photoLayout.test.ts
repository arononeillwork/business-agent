import { describe, expect, it } from 'vitest'
import { aspectOf, byDay, justifiedRows, rowTarget, type Row } from './photoLayout'

/** The width a row takes: its days' parts and the gaps between them. */
const used = (r: Row, dayGap: number) => r.segments.reduce((w, s, k) => w + s.width + (k ? dayGap : 0), 0)
/** Every cell, in order, as [day, index]. */
const order = (rows: Row[]) => rows.flatMap(r => r.segments.flatMap(s => s.cells.map(c => [s.day, c.index])))

describe('aspectOf', () => {
  it('is the width over the height, or a usual photo or video when unknown', () => {
    expect(aspectOf({ kind: 'photo', width: 2560, height: 1920 })).toBeCloseTo(4 / 3)
    expect(aspectOf({ kind: 'photo', width: 1080, height: 1920 })).toBeCloseTo(0.5625)
    expect(aspectOf({ kind: 'photo', width: null, height: null })).toBeCloseTo(4 / 3)
    expect(aspectOf({ kind: 'video', width: null, height: 1080 })).toBeCloseTo(16 / 9)
  })

  it('crops panoramas and slivers', () => {
    expect(aspectOf({ kind: 'photo', width: 9000, height: 1000 })).toBe(3)
    expect(aspectOf({ kind: 'photo', width: 100, height: 1000 })).toBe(0.4)
  })
})

describe('byDay', () => {
  it('keeps runs of the same day together, in order', () => {
    const days = byDay(['2026-11-06a', '2026-11-06b', '2026-11-04a', '2026-11-01a', '2026-11-01b'], s => s.slice(0, 10))
    expect(days).toEqual([
      { day: '2026-11-06', items: ['2026-11-06a', '2026-11-06b'] },
      { day: '2026-11-04', items: ['2026-11-04a'] },
      { day: '2026-11-01', items: ['2026-11-01a', '2026-11-01b'] },
    ])
    expect(byDay([], () => '')).toEqual([])
  })
})

describe('rowTarget', () => {
  it('is lower on a phone', () => {
    expect(rowTarget(390)).toBeLessThan(rowTarget(800))
    expect(rowTarget(800)).toBeLessThan(rowTarget(1200))
  })
})

describe('justifiedRows', () => {
  const o = { width: 1000, target: 200, gap: 4, dayGap: 12 }

  it('fills every row but the last to the width, each at one height, every photo once and in order', () => {
    const days = [[4 / 3, 0.75, 1.5, 1, 4 / 3], [16 / 9], [0.75, 0.75, 4 / 3, 1, 1.5, 4 / 3, 0.5625]]
    const rows = justifiedRows(days, o)
    expect(order(rows)).toEqual(days.flatMap((d, day) => d.map((_, index) => [day, index])))
    for (const r of rows.slice(0, -1)) {
      expect(used(r, o.dayGap)).toBeCloseTo(o.width, 6)
      for (const s of r.segments) for (const c of s.cells) expect(c.width).toBeCloseTo(days[s.day][c.index] * r.height, 6)
    }
    const last = rows[rows.length - 1]
    expect(last.height).toBe(o.target)
    expect(used(last, o.dayGap)).toBeLessThan(o.width)
  })

  it('lets a few days share a row, each with its date above its first photo', () => {
    const rows = justifiedRows([[4 / 3], [1], [1, 1]], o)
    expect(rows).toHaveLength(1)
    expect(rows[0].header).toBe(true)
    expect(rows[0].segments.map(s => [s.day, s.first, s.cells.length])).toEqual([[0, true, 1], [1, true, 1], [2, true, 2]])
    // 12 between days, 4 between the two of the last day.
    expect(rows[0].height).toBe(200)
    expect(used(rows[0], o.dayGap)).toBeCloseTo((4 / 3 + 3) * 200 + 12 * 2 + 4)
  })

  it('carries a long day on to the next rows, with its date only where it starts', () => {
    const rows = justifiedRows([Array(12).fill(4 / 3)], o)
    expect(rows.length).toBeGreaterThan(2)
    expect(rows.map(r => r.header)).toEqual(rows.map((_, n) => n === 0))
    expect(rows.flatMap(r => r.segments.map(s => s.first))).toEqual(rows.map((_, n) => n === 0))
  })

  it('takes the next photo into the row or leaves it for the next, whichever keeps the height nearer the target', () => {
    // Three 4:3 photos are 800 at 200 high; a fourth makes 1067: taking it in (≈188 high) is nearer 200 than
    // stretching three (≈248 high).
    const four = justifiedRows([[4 / 3, 4 / 3, 4 / 3, 4 / 3, 4 / 3]], o)
    expect(four[0].segments[0].cells).toHaveLength(4)
    expect(four[0].height).toBeCloseTo((1000 - 12) / (16 / 3))
    // Four 1:1 are 800; a wide fifth (3:1) would make the row ≈141 high, so it starts the next row and four
    // fill this one (≈247 high).
    const wide = justifiedRows([[1, 1, 1, 1, 3]], o)
    expect(wide[0].segments[0].cells).toHaveLength(4)
    expect(wide[0].height).toBeCloseTo((1000 - 12) / 4)
    expect(wide[1].segments[0].cells.map(c => c.index)).toEqual([4])
  })

  it('doesn’t grow a row much past the target to fill it: it stops short instead', () => {
    // Two squares would be 318 high to fill 640, past 1.5 × 200: they're kept to 300, and the very wide one
    // (it would bring the row down to 63) goes on a row of its own.
    const rows = justifiedRows([[1, 1, 8]], { ...o, width: 640, maxGrow: 1.5 })
    expect(rows[0].height).toBe(300)
    expect(used(rows[0], o.dayGap)).toBe(604)
    expect(rows[1].segments[0].cells.map(c => c.index)).toEqual([2])
  })

  it('shrinks a photo wider than the row on its own to fit it', () => {
    const rows = justifiedRows([[3]], { ...o, width: 390, target: 160 })
    expect(rows).toHaveLength(1)
    expect(rows[0].height).toBeCloseTo(130)
    expect(rows[0].segments[0].cells[0].width).toBeCloseTo(390)
  })

  it('has nothing to lay out with nothing', () => {
    expect(justifiedRows([], o)).toEqual([])
  })
})
