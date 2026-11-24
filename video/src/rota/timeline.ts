// The shared rota video, "One rota. Everyone on the same page.": its timeline in frames at 30 fps. The music
// (video/music/rota.py) is 120 bpm, a bar is 60 frames; every scene starts on a bar line.
export const ROTA = {
  title: [0, 120],       // bars 1-2   "One rota. Everyone on the same page."
  problem: [120, 480],   // bars 3-8   the rota somewhere in the group chat; "who's on Saturday?", again
  change: [480, 1020],   // bars 9-17  1 of 3: one rota, one place; Sam's Saturday added once, there for everyone
  phone: [1020, 1500],   // bars 18-25 2 of 3: on Maria's phone the same rota, Sam's Saturday on it; Sunday taken in a tap
  whatsapp: [1500, 1920],// bars 26-32 3 of 3: all of it on the one rota; on WhatsApp, each person and the team's group
  chats: [1920, 2340],   // bars 33-39 WhatsApp, if you like: Sam's own shifts, and the week in the team's group
  recap: [2340, 2640],   // bars 40-44 one rota, every phone: what the owner gets
  end: [2640, 2880],     // bars 45-48 the brand
} as const

export const ROTA_TOTAL = 2880

export type RotaScene = keyof typeof ROTA
export const lenOf = (k: RotaScene) => ROTA[k][1] - ROTA[k][0]
