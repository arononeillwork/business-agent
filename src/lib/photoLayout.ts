// The Content page's photos and videos, laid out the way Google Photos lays out a library: rows of them at
// their own shape (none cropped to a square), each row filling the width at about the same height, and the
// days following one another along the rows, newest first, each with its date above its first photo.

/** How wide it is for its height; one without a size counts as a usual photo (4:3) or video (16:9). */
export function aspectOf(i: { kind: 'photo' | 'video'; width: number | null; height: number | null }) {
  const a = i.width && i.height ? i.width / i.height : i.kind === 'video' ? 16 / 9 : 4 / 3
  // A panorama or a sliver would take a whole row; past these it's cropped instead.
  return Math.min(3, Math.max(0.4, a))
}

/** Items in order (newest first), in runs of the same day. */
export function byDay<T>(items: readonly T[], dayOf: (item: T) => string): { day: string; items: T[] }[] {
  const days: { day: string; items: T[] }[] = []
  for (const item of items) {
    const day = dayOf(item)
    const last = days[days.length - 1]
    if (last?.day === day) last.items.push(item)
    else days.push({ day, items: [item] })
  }
  return days
}

/** The height a row aims for at this width: smaller on a phone, as Google Photos does. */
export const rowTarget = (width: number) => (width < 600 ? 120 : width < 1000 ? 170 : 220)

export interface LayoutOptions {
  /** The width to fill, in pixels. */
  width: number
  /** The height a row aims for. */
  target: number
  /** Between two of the same day. */
  gap: number
  /** Between the last of one day and the first of the next, in the same row. */
  dayGap: number
  /** How much taller than `target` a row may grow to fill the width (else it stops short). */
  maxGrow?: number
}

/** One day's part of a row: its date goes above it when the day starts here (`first`). */
export interface Segment {
  day: number
  first: boolean
  cells: { index: number; width: number }[]
  /** Its cells and the gaps between them. */
  width: number
}

/** A row: its height, whether a day starts in it (so it has room for a date above), and its days' parts. */
export interface Row { height: number; header: boolean; segments: Segment[] }

/**
 * Lays out days of photos (each day a list of their aspect ratios) in justified rows. Each row is filled
 * at `target` height until the next one wouldn't fit; then it either takes that one too (coming out lower)
 * or leaves it for the next row (coming out taller), whichever is nearer `target`, and is scaled to fill
 * the width exactly. The last row stays at `target`, as wide as it comes.
 */
export function justifiedRows(days: readonly (readonly number[])[], o: LayoutOptions): Row[] {
  const maxGrow = o.maxGrow ?? 1.5
  const rows: Row[] = []
  let row: { day: number; index: number; aspect: number }[] = []
  let sum = 0 // the aspect ratios in the row
  let gaps = 0 // the pixels between them

  const gapBefore = (day: number) => (!row.length ? 0 : row[row.length - 1].day === day ? o.gap : o.dayGap)
  const add = (day: number, index: number, aspect: number) => {
    gaps += gapBefore(day)
    sum += aspect
    row.push({ day, index, aspect })
  }
  const close = (height: number) => {
    const segments: Segment[] = []
    for (const c of row) {
      const width = c.aspect * height
      const last = segments[segments.length - 1]
      if (last?.day === c.day) {
        last.cells.push({ index: c.index, width })
        last.width += o.gap + width
      } else segments.push({ day: c.day, first: c.index === 0, cells: [{ index: c.index, width }], width })
    }
    rows.push({ height, header: segments.some(s => s.first), segments })
    row = []
    sum = 0
    gaps = 0
  }

  days.forEach((aspects, day) => aspects.forEach((aspect, index) => {
    const g = gapBefore(day)
    if (row.length && (sum + aspect) * o.target + gaps + g > o.width) {
      const lower = (o.width - gaps - g) / (sum + aspect)
      const taller = (o.width - gaps) / sum
      if (lower > 0 && o.target - lower <= taller - o.target) {
        add(day, index, aspect)
        close(lower)
        return
      }
      close(Math.min(taller, o.target * maxGrow))
    }
    add(day, index, aspect)
    // Exactly full, or one on its own wider than the row: it's scaled down to fit.
    if (sum * o.target + gaps >= o.width) close((o.width - gaps) / sum)
  }))
  if (row.length) close(o.target)
  return rows
}
