// The third video, "Run your café from one place": its timeline in frames at 30 fps. The music
// (video/music/owner.py) is 120 bpm, a bar is 60 frames; every scene starts on a bar line.
export const OWNER = {
  title: [0, 120],        // bars 1-2   "Run your café from one place."
  hub: [120, 300],        // bars 3-5   Today and the advisor in the middle, everything the café shows round them
  today: [300, 600],      // bars 6-10  Today: the day at a glance, the advisor's first tip
  advisor: [600, 960],    // bars 11-16 everything the advisor found; the four things to do
  hours: [960, 1440],     // bars 17-24 1 of 4: Sunday closes an hour earlier → Google Maps, the website
  price: [1440, 1980],    // bars 25-33 2 of 4: Pain au chocolat up to its margin → Google Maps, the TV, the printed menu
  offer: [1980, 2460],    // bars 34-41 3 of 4: leftover croissants on offer by themselves, and its story → the TV, Instagram
  reviews: [2460, 2940],  // bars 42-49 4 of 4: a review answered → Google Maps
  recap: [2940, 3180],    // bars 50-53 four changes, made once; the rest of the café in the same place
  end: [3180, 3420],      // bars 54-57 the brand
} as const

export const OWNER_TOTAL = 3420

export type OwnerScene = keyof typeof OWNER
export const lenOf = (k: OwnerScene) => OWNER[k][1] - OWNER[k][0]
