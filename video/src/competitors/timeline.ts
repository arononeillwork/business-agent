// The competitor insights video, "Know your competition.": its timeline in frames at 30 fps. The music
// (video/music/competitors.py) is 120 bpm, a bar is 60 frames; every scene starts on a bar line.
export const COMPETITORS = {
  title: [0, 120],       // bars 1-2   "Know your competition. Every week."
  street: [120, 480],    // bars 3-8   five cafés round the corner and the owner guessing; then a new one opens
  glance: [480, 960],    // bars 9-16  1 of 3: every café round you in one place, and what it means in plain words
  prices: [960, 1500],   // bars 17-25 2 of 3: the cappuccino against the street; the price rises lately
  nearby: [1500, 2040],  // bars 26-34 3 of 3: Google looks around every week; the new café, followed
  recap: [2040, 2400],   // bars 35-40 the street again, known: what the owner gets
  end: [2400, 2640],     // bars 41-44 the brand
} as const

export const COMPETITORS_TOTAL = 2640

export type CompetitorsScene = keyof typeof COMPETITORS
export const lenOf = (k: CompetitorsScene) => COMPETITORS[k][1] - COMPETITORS[k][0]
