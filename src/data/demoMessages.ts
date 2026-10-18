// Sample Instagram inbox for the demo café: every kind of message the Messages page shows.
import type { InboxConversation, InboxMessage, TaggedPost } from '../../shared/messages'

const PIC = (bg: string, fg: string, word: string) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="${bg}"/><circle cx="150" cy="190" r="80" fill="${fg}"/><text x="150" y="340" font-family="sans-serif" font-size="30" text-anchor="middle" fill="${fg}">${word}</text></svg>`)}`

export function demoInbox() {
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
  let n = 0
  const msg = (min: number, fromMe: boolean, text: string, extra: Partial<InboxMessage> = {}): InboxMessage =>
    ({ id: `m${++n}`, at: ago(min), fromMe, text, kind: 'text', ...extra })
  const chat = (id: string, username: string, name: string, messages: InboxMessage[]) => ({ id, username, name, messages })

  const chats = [
    chat('c1', 'lucia.marbella', 'Lucía', [
      msg(180, true, '¡Hola Lucía! Yes, we open at 8.'),
      msg(25, false, 'Do you have oat milk for the flat whites? 🌱'),
    ]),
    chat('c2', 'sanpedro.eats', 'San Pedro Eats', [
      msg(95, false, '', { kind: 'story_mention', mediaUrl: PIC('#F3DED3', '#8B5E3C', 'flat white') }),
      msg(94, false, 'Best flat white in San Pedro ☕ tagged you!'),
    ]),
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
  ]
  const tagged: TaggedPost[] = [
    { id: 't1', username: 'sanpedro.eats', caption: 'Morning stop @easy.beans.coffee', mediaUrl: PIC('#F3DED3', '#8B5E3C', 'tagged'), permalink: 'https://www.instagram.com/p/demo1/', at: ago(2 * 24 * 60) },
    { id: 't2', username: 'costa.del.sol.food', caption: 'Matcha done right at @easy.beans.coffee', mediaUrl: PIC('#DDE8D5', '#4F6B45', 'tagged'), permalink: 'https://www.instagram.com/p/demo2/', at: ago(5 * 24 * 60) },
  ]

  const toConversation = (c: (typeof chats)[number]): InboxConversation => ({
    id: c.id, platform: 'instagram', with: { id: `u-${c.id}`, username: c.username, name: c.name },
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
