// Sample ideas for the demo café (the Ideas page): posts and reels the café sent to itself on Instagram
// (its Ideas chat), with what was written with them. The pictures are drawn here, standing in for the copies the Worker keeps.
import type { InstagramIdea } from '../../shared/instagramIdeas'

/** The demo café's Instagram: its chat with itself is the Ideas chat. */
const CAFE = 'easy.beans.coffee'

const PIC = (bg: string, fg: string, word: string) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="${bg}"/><circle cx="200" cy="225" r="105" fill="${fg}" opacity=".85"/><text x="200" y="430" font-family="sans-serif" font-size="34" text-anchor="middle" fill="${fg}">${word}</text></svg>`)}`

export function demoIdeas(now = Date.now()): InstagramIdea[] {
  const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString()
  const idea = (n: number, hours: number, x: Partial<InstagramIdea>): InstagramIdea => ({
    id: `demo-idea-${n}`, message_id: `demo-message-${n}`, kind: 'post', username: CAFE, media_url: null, media_type: 'image',
    media_kept: true, permalink: null, note: null, shared_at: ago(hours), hidden: false, created_at: ago(hours), ...x,
  })
  return [
    idea(1, 3, { kind: 'reel', media_url: PIC('#E8D9C5', '#7A5230', 'latte art'), permalink: 'https://www.instagram.com/reel/DemoIdea01/',
      note: 'Slow-motion pour for our next reel. Could we film it on the bar at 8am, before opening?' }),
    idea(2, 26, { media_url: PIC('#DCE7D3', '#4F6B45', 'matcha cloud'), permalink: 'https://www.instagram.com/p/DemoIdea02/',
      note: 'Iced matcha with cold foam: one for the summer menu' }),
    idea(3, 50, { kind: 'photo', media_url: PIC('#F4E3D7', '#A0522D', 'cup sleeves'),
      note: 'Stamped kraft sleeves like these, with our logo' }),
    idea(4, 97, { media_url: PIC('#EDE4F2', '#6B4C80', 'pastry box'), permalink: 'https://www.instagram.com/p/DemoIdea04/',
      note: 'A pastry box for Sunday takeaway' }),
    idea(5, 170, { kind: 'reel', media_url: PIC('#E3EEF2', '#3F6B7A', 'barista POV'), permalink: 'https://www.instagram.com/reel/DemoIdea05/' }),
    idea(6, 240, { media_url: PIC('#F7EED2', '#8A6D1E', 'chalkboard'), permalink: 'https://www.instagram.com/p/DemoIdea06/',
      note: 'Hand-lettered specials board for the window' }),
  ]
}
