// The day-in-the-life video's timeline, in frames at 30 fps (music: video/music/day.py, 120 bpm, a bar
// is 60 frames; every scene starts on a bar line).
export const BEFORE = {
  title: [0, 120], alarm: [120, 240], open: [240, 360], serve: [360, 480], call: [480, 600],
  chalk: [600, 720], bills: [720, 840], close: [840, 960], night: [960, 1080], letter: [1080, 1200],
} as const
export const TURN = [1200, 1320] as const
export const AFTER = {
  open: [1320, 1560], messages: [1560, 1740], order: [1740, 1920], offer: [1920, 2100], social: [2100, 2280],
  accounts: [2280, 2460], licence: [2460, 2640], close: [2640, 2820], home: [2820, 2940],
} as const
export const RECAP = [2940, 3180] as const
export const END = [3180, 3360] as const
export const DAY_TOTAL = 3360
