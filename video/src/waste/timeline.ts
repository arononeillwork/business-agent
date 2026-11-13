// The food waste video, "Don't bin it. Sell it.": its timeline in frames at 30 fps. The music
// (video/music/waste.py) is 120 bpm, a bar is 60 frames; every scene starts on a bar line.
export const WASTE = {
  title: [0, 120],       // bars 1-2   "Don't bin it. Sell it."
  bin: [120, 540],       // bars 3-9   closing time: what's left on the counter goes in the bin
  log: [540, 1140],      // bars 10-19 1 of 3: the banana bread logged once, how long it keeps and when it's half price
  wait: [1140, 1320],    // bars 20-22 two days go by; nobody touches a thing
  offer: [1320, 1680],   // bars 23-28 2 of 3: its last day, on offer by itself, live on Offers & specials
  tv: [1680, 2040],      // bars 29-34 3 of 3: on the café's TV
  result: [2040, 2460],  // bars 35-41 the same tray: sold, not binned
  end: [2460, 2700],     // bars 42-45 the brand
} as const

export const WASTE_TOTAL = 2700

export type WasteScene = keyof typeof WASTE
export const lenOf = (k: WasteScene) => WASTE[k][1] - WASTE[k][0]
