// What a push notification says, in its person's language. The database writes notifications in
// English; the app translates them as it shows them (the bell), and this does the same for the ones
// that go to phones (worker/push.ts), with the Notifications page's Spanish.
import { LANGUAGES, msg, type Language } from './i18n'
import type { AppNotification, Preferences } from './types'
import spanish from '../src/i18n/es/notifications'

const es = spanish as Record<string, string>
const fill = (text: string, vars: Record<string, string | number> = {}) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
const say = (lang: Language, text: string, vars?: Record<string, string | number>) => fill((lang === 'es' && es[text]) || text, vars)

/** The language someone reads the app in: the one they last switched to, else the first of theirs and the team's. */
export function languageOf(p: Preferences | null | undefined, team: readonly string[] = []): Language {
  const all = new Set([...(p?.languages ?? []), ...team])
  const mine = LANGUAGES.map(l => l.code).filter(c => all.has(c))
  if (p?.language && mine.includes(p.language)) return p.language
  return mine[0] ?? 'en'
}

const KIND_LABEL: Record<string, string> = {
  national: msg('National holiday'), regional: msg('Andalucía holiday'), local: msg('Local holiday'), area: msg('Nearby town holiday'),
}

type Note = Pick<AppNotification, 'title' | 'body' | 'kind' | 'data'>

/** The title and text of a notification, in this language. */
export function pushText(n: Note, lang: Language): { title: string; body: string | null } {
  const d = n.data ?? {}
  if (n.kind === 'bank_holiday' && d.name && typeof d.days === 'number' && d.date) {
    const name = d.name
    const title = d.days === 0 ? say(lang, msg('Bank holiday today: {name}'), { name })
      : d.days === 1 ? say(lang, msg('Bank holiday tomorrow: {name}'), { name })
        : say(lang, msg('Bank holiday in {n} days: {name}'), { n: d.days, name })
    const date = new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(new Date(`${d.date}T12:00:00Z`))
    const kind = say(lang, KIND_LABEL[d.category ?? ''] ?? msg('Local holiday')) + (d.town ? ` (${d.town})` : '')
    return { title, body: say(lang, msg('{date} · {kind}. Check the rota and the opening hours.'), { date, kind }) }
  }
  if (n.kind === 'test') return { title: say(lang, msg('Test notification')), body: say(lang, msg('Notifications are working on this device.')) }
  const mention = n.kind === 'instagram_mention' ? /^(@\S+|Someone) (mentioned you in their story|tagged you in a post)$/.exec(n.title) : null
  if (mention) {
    const who = mention[1] === 'Someone' ? say(lang, msg('Someone')) : mention[1]
    return { title: mention[2].startsWith('mentioned') ? say(lang, msg('{who} mentioned you in their story'), { who }) : say(lang, msg('{who} tagged you in a post'), { who }), body: n.body }
  }
  // Anything else as it was written, unless it's one of the texts the app has Spanish for.
  return { title: say(lang, n.title), body: n.body ? say(lang, n.body) : null }
}
