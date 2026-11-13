// The Google reviews & opening hours video, "Right on Google.": its timeline in frames at 30 fps. The music
// (video/music/listing.py) is 120 bpm, a bar is 60 frames; every scene starts on a bar line.
export const LISTING = {
  title: [0, 120],       // bars 1-2   "Right on Google. Every time."
  problem: [120, 480],   // bars 3-8   Sunday, half past three: Google says open, the door says closed; a review with no reply
  hours: [480, 1020],    // bars 9-17  1 of 2: Sunday closes at three, changed once → Google Maps, the website
  reviews: [1020, 1560], // bars 18-26 2 of 2: Tom's review answered from the drafted reply → Google Maps
  recap: [1560, 1920],   // bars 27-32 the listing now: open when it says, answered
  end: [1920, 2160],     // bars 33-36 the brand
} as const

export const LISTING_TOTAL = 2160

export type ListingScene = keyof typeof LISTING
export const lenOf = (k: ListingScene) => LISTING[k][1] - LISTING[k][0]
