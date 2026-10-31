// The video's timeline, in frames at 30 fps. The music is 120 bpm, so a beat is 15 frames and a bar
// 60: every scene starts on a bar line (video/music/compose.py has the same plan).
export const FPS = 30
export const BEAT = 15
export const BAR = 60

export const SCENES = {
  cold: { from: 0, to: 240 },        // bars 1-4: 23:47, seven places
  turn: { from: 240, to: 360 },      // bars 5-6: "What if you changed it once?"
  setup: { from: 360, to: 660 },     // bars 7-11
  hours: { from: 660, to: 1140 },    // bars 12-19
  menu: { from: 1140, to: 1620 },    // bars 20-27
  team: { from: 1620, to: 1860 },    // bars 28-31
  close: { from: 1860, to: 2280 },   // bars 32-38
} as const

export const TOTAL = 2280

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
