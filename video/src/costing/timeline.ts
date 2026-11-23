// The "prices set by feel" video, "What does a flat white really cost?": its timeline in frames at 30 fps. The music
// (video/music/costing.py) is 120 bpm, a bar is 60 frames; every scene starts on a bar line.
export const COSTING = {
  title: [0, 120],      // bars 1-2   "What does a flat white really cost?"
  problem: [120, 480],  // bars 3-8   prices on the board, costs a guess; then the roaster's new price
  cost: [480, 1080],    // bars 9-18  1 of 3: a flat white built from what goes in: €0,61 to make, €2,30 to you
  beans: [1080, 1620],  // bars 19-27 2 of 3: the new price for the beans typed once; every coffee recosted
  margin: [1620, 2220], // bars 28-37 3 of 3: the advisor flags a thin margin; Pain au chocolat at €2,90, on target
  recap: [2220, 2580],  // bars 38-43 the board again, every price with its cost and margin
  end: [2580, 2820],    // bars 44-47 the brand
} as const

export const COSTING_TOTAL = 2820

export type CostingScene = keyof typeof COSTING
export const lenOf = (k: CostingScene) => COSTING[k][1] - COSTING[k][0]
