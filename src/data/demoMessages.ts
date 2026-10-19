// Sample Instagram inbox for the demo café: every kind of message the Messages page shows. And its
// Facebook Page's Messenger chats (shown once Facebook is connected).
import type { InboxConversation, InboxMessage, TaggedPost } from '../../shared/messages'

const PIC = (bg: string, fg: string, word: string) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="${bg}"/><circle cx="150" cy="190" r="80" fill="${fg}"/><text x="150" y="340" font-family="sans-serif" font-size="30" text-anchor="middle" fill="${fg}">${word}</text></svg>`)}`

/** A simple portrait (the demo's stand-in for Instagram profile photos). */
const FACE = (bg: string, skin: string, hair: string) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="${bg}"/><circle cx="40" cy="34" r="17" fill="${skin}"/><path d="M21 32c0-14 9-20 19-20s19 6 19 20c-5-7-12-9-19-9s-14 2-19 9z" fill="${hair}"/><path d="M12 80c3-17 14-25 28-25s25 8 28 25z" fill="${hair}" opacity=".85"/></svg>`)}`

export function demoInbox() {
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
  let n = 0
  const msg = (min: number, fromMe: boolean, text: string, extra: Partial<InboxMessage> = {}): InboxMessage =>
    ({ id: `m${++n}`, at: ago(min), fromMe, text, kind: 'text', ...extra })
  const chat = (id: string, username: string, name: string, messages: InboxMessage[], picture?: string) => ({ id, username, name, messages, picture })

  const chats = [
    chat('c1', 'lucia.marbella', 'Lucía', [
      msg(180, true, '¡Hola Lucía! Yes, we open at 8.'),
      msg(25, false, 'Do you have oat milk for the flat whites? 🌱'),
    ], FACE('#F3DED3', '#E8B998', '#5A3A2A')),
    chat('c2', 'sanpedro.eats', 'San Pedro Eats', [
      msg(95, false, '', { kind: 'story_mention', mediaUrl: PIC('#F3DED3', '#8B5E3C', 'flat white') }),
      msg(94, false, 'Best flat white in San Pedro ☕ tagged you!'),
    ], FACE('#DDE8D5', '#C98F6B', '#2F3B2A')),
    chat('c3', 'tom_runs', 'Tom', [
      msg(300, false, 'Is the matcha iced or hot?', { kind: 'story_reply', mediaUrl: PIC('#DDE8D5', '#4F6B45', 'matcha') }),
    ]),
    chat('c4', 'marta.g', 'Marta', [
      msg(600, false, 'Can you make this for my birthday?', { kind: 'share', link: 'https://www.instagram.com/p/demo/', mediaUrl: PIC('#F6E7C8', '#A86B2D', 'cake') }),
    ]),
    chat('c5', 'weekend.visitor', 'Weekend visitor', [
      msg(3 * 24 * 60, false, 'Are you open on Sunday?'),
    ]),
    chat('c6', 'happy.client', 'Happy client', [
      msg(26 * 60, false, 'Thanks for the great coffee yesterday!', { reactions: ['❤️'] }),
      msg(25 * 60, true, 'Thank you! See you soon 😊'),
    ]),
    chat('c7', 'old.friend', 'Old friend', [
      msg(9 * 24 * 60, false, 'Do you do catering for events?'),
    ]),
  ]
  const tagged: TaggedPost[] = [
    { id: 't1', username: 'sanpedro.eats', caption: 'Morning stop @easy.beans.coffee', mediaUrl: PIC('#F3DED3', '#8B5E3C', 'tagged'), permalink: 'https://www.instagram.com/p/demo1/', at: ago(2 * 24 * 60) },
    { id: 't2', username: 'costa.del.sol.food', caption: 'Matcha done right at @easy.beans.coffee', mediaUrl: PIC('#DDE8D5', '#4F6B45', 'tagged'), permalink: 'https://www.instagram.com/p/demo2/', at: ago(5 * 24 * 60) },
  ]

  const toConversation = (c: (typeof chats)[number]): InboxConversation => ({
    id: c.id, platform: 'instagram', with: { id: `u-${c.id}`, username: c.username, name: c.name, ...(c.picture ? { picture: c.picture } : {}) },
    updatedAt: c.messages[c.messages.length - 1].at, recent: [...c.messages].reverse().slice(0, 5),
  })
  return {
    state: () => ({ conversations: chats.map(toConversation).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), tagged }),
    thread: (id: string) => {
      const c = chats.find(x => x.id === id)
      if (!c) throw new Error('That chat is no longer on Instagram')
      return { conversation: toConversation(c), messages: [...c.messages] }
    },
    reply: (id: string, text: string) => chats.find(x => x.id === id)!.messages.push(msg(0, true, text)),
  }
}

/** The Facebook Page's Messenger chats: names, not @handles. */
export function demoMessenger() {
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
  let n = 0
  const msg = (min: number, fromMe: boolean, text: string): InboxMessage => ({ id: `fm${++n}`, at: ago(min), fromMe, text, kind: 'text' })
  const chats = [
    { id: 't_1', name: 'Carmen Ruiz', messages: [msg(70, false, 'Hola! Do you take bookings for 8 people on Saturday?')] },
    { id: 't_2', name: 'Hotel Puente Romano', messages: [
      msg(2 * 24 * 60, false, 'Could you send us a price for coffee for 40 guests?'),
      msg(2 * 24 * 60 - 30, true, 'Of course! I’ll email you the menu today.'),
    ] },
  ]
  const toConversation = (c: (typeof chats)[number]): InboxConversation => ({
    id: c.id, platform: 'messenger', with: { id: `psid-${c.id}`, username: c.name, name: c.name },
    updatedAt: c.messages[c.messages.length - 1].at, recent: [...c.messages].reverse().slice(0, 5),
  })
  return {
    state: () => ({ conversations: chats.map(toConversation).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }),
    thread: (id: string) => {
      const c = chats.find(x => x.id === id)
      if (!c) throw new Error('That chat is no longer on Messenger')
      return { conversation: toConversation(c), messages: [...c.messages] }
    },
    reply: (id: string, text: string) => chats.find(x => x.id === id)!.messages.push(msg(0, true, text)),
  }
}
