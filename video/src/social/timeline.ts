// The "Instagram and TikTok never get posted" video, "From an idea to a scheduled post.": its timeline in frames at
// 30 fps. The music (video/music/social.py) is 120 bpm, a bar is 60 frames; every scene starts on a bar line.
export const SOCIAL = {
  title: [0, 120],     // bars 1-2   "From an idea to a scheduled post."
  problem: [120, 480], // bars 3-8   the café's last post, six weeks ago; "post on Insta" crossed off week after week
  phone: [480, 960],   // bars 9-16  1 of 2: on Julio's phone, the team's ideas; he takes one, adds his photo, hands it in
  post: [960, 1680],   // bars 17-28 2 of 2: the owner makes the post in one press, adds a line, six o'clock, every account
  recap: [1680, 2040], // bars 29-34 six o'clock: the post on Instagram and TikTok, and what the owner gets
  end: [2040, 2280],   // bars 35-38 the brand
} as const

export const SOCIAL_TOTAL = 2280

export type SocialScene = keyof typeof SOCIAL
export const lenOf = (k: SocialScene) => SOCIAL[k][1] - SOCIAL[k][0]
