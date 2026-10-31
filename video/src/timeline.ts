// The video's timeline, in frames at 30 fps. The music is 120 bpm, so a beat is 15 frames and a bar
// 60: every scene starts on a bar line (video/music/compose.py has the same plan).
export const FPS = 30
export const BEAT = 15
export const BAR = 60

export const SCENES = {
  cold: { from: 0, to: 300 },        // bars 1-5: 18:00, everything still to do
  turn: { from: 300, to: 420 },      // bars 6-7: "What if you changed it in one place?"
  setup: { from: 420, to: 1260 },    // bars 8-21: onboarding, taken slowly
  hours: { from: 1260, to: 1920 },   // bars 22-32: opening hours, the calendar, everywhere
  menu: { from: 1920, to: 2280 },    // bars 33-38: the till's new price, everywhere
  team: { from: 2280, to: 2880 },    // bars 39-48: the team, your day, the advisor
  close: { from: 2880, to: 3240 },   // bars 49-54
} as const

export const TOTAL = 3240

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
