// The fourth video, "Just say it": its timeline in frames at 30 fps. The music (video/music/say.py) is
// 120 bpm, a bar is 60 frames; every scene starts on a bar line.
export const SAY = {
  title: [0, 120],        // bars 1-2   "Just say it."
  connect: [120, 480],    // bars 3-8   Business Agent added to the AI as a custom connector, once
  typed: [480, 1200],     // bars 9-20  typed at the counter: Sundays close at three → the app, Google Maps, the website
  spoken: [1200, 1920],   // bars 21-32 said on the phone: 2 for 1 croissants from one → the app, the café TV
  ask: [1920, 2400],      // bars 33-40 anything asked, typed or said: the rota, the licences, the hours
  compare: [2400, 2700],  // bars 41-45 six places and a quarter of an hour, or one sentence
  close: [2700, 3180],    // bars 46-53 "How much is your time worth?", the brand coming in under it; it ends on both
} as const

export const SAY_TOTAL = 3180

export type SayScene = keyof typeof SAY
export const lenOf = (k: SayScene) => SAY[k][1] - SAY[k][0]
/** In a scene with a chat, where the chat ends and "everywhere it shows" begins (7 bars in). */
export const CHAT_LEN = 420
