// The "customers who never come back" video, "Bring them back.": its timeline in frames at 30 fps. The music
// (video/music/regulars.py) is 120 bpm, a bar is 60 frames; every scene starts on a bar line.
export const REGULARS = {
  title: [0, 120],        // bars 1-2   "Bring them back. On the quiet days."
  quiet: [120, 480],      // bars 3-8   a rush on Saturday, a quiet Monday; regulars you know but can't reach
  regulars: [480, 1020],  // bars 9-17  1 of 3: the regulars on Customers and who said yes; the stamp card from the till
  campaign: [1020, 1680], // bars 18-28 2 of 3: the ready-made quiet-day message, to the regulars who said yes, planned for Monday
  draw: [1680, 2220],     // bars 29-37 3 of 3: Mondays take 36% less; the Mondays draw, its rules and its post written
  recap: [2220, 2580],    // bars 38-43 Monday morning: the message on a regular's phone, and what the owner gets
  end: [2580, 2820],      // bars 44-47 the brand
} as const

export const REGULARS_TOTAL = 2820

export type RegularsScene = keyof typeof REGULARS
export const lenOf = (k: RegularsScene) => REGULARS[k][1] - REGULARS[k][0]
