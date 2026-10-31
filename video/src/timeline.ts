// The video's timeline, in frames at 30 fps. The music is 120 bpm, so a beat is 15 frames and a bar
// 60: every scene starts on a bar line (video/music/compose.py has the same plan).
export const FPS = 30
export const BEAT = 15
export const BAR = 60

export const SCENES = {
  cold: { from: 0, to: 300 },        // bars 1-5: 23:47, seven places
  turn: { from: 300, to: 420 },      // bars 6-7: "What if you changed it once?"
  setup: { from: 420, to: 1080 },    // bars 8-18: onboarding, taken slowly
  hours: { from: 1080, to: 1740 },   // bars 19-29: opening hours, the calendar, everywhere
  menu: { from: 1740, to: 2220 },    // bars 30-37: the till's new price, everywhere
  team: { from: 2220, to: 2460 },    // bars 38-41
  close: { from: 2460, to: 2820 },   // bars 42-47
} as const

export const TOTAL = 2820

/** Where the app's window sits: the whole page in view, under a one-line headline. */
export const WIN = { x: 305, y: 180, w: 1310, h: 819 } as const

/** A piece of a recording: seconds `a` to `b` of the clip, played `rate` times as fast. */
export interface Segment { a: number; b: number; rate: number }

/** How many frames the segments take in the video. */
export const lengthOf = (segs: Segment[]) => segs.reduce((n, s) => n + Math.round(((s.b - s.a) * FPS) / s.rate), 0)

/** Where a moment of the recording (seconds) lands in the scene (frames), or null if it was cut. */
export function rawToOut(t: number, segs: Segment[]): number | null {
  let at = 0
  for (const s of segs) {
    const len = Math.round(((s.b - s.a) * FPS) / s.rate)
    if (t >= s.a && t <= s.b) return at + ((t - s.a) * FPS) / s.rate
    at += len
  }
  return null
}
