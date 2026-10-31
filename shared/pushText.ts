// What a notification says, in its person's language. The database and the Worker write notifications
// in English; this says them in the language the person chose, for their phone (worker/push.ts) and in
// the app (the bell and the Notifications page), with the Notifications page's Spanish.
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
  // The rest are written in English by the database and the Worker: each kind's wording is matched
  // and said again in this language; anything else (a caption, a name) stays as it was written.
  return { title: phrase(lang, n.title, TITLES), body: n.body ? phrase(lang, n.body, BODIES) : null }
}

const WHAT: Record<string, string> = { post: msg('post'), carousel: msg('carousel'), reel: msg('reel'), story: msg('story') }
const DAY: Record<string, string> = { Mon: 'lun', Tue: 'mar', Wed: 'mié', Thu: 'jue', Fri: 'vie', Sat: 'sáb', Sun: 'dom' }
const MONTH: Record<string, string> = { Jan: 'ene', Feb: 'feb', Mar: 'mar', Apr: 'abr', May: 'may', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'sept', Oct: 'oct', Nov: 'nov', Dec: 'dic' }
const amount = (lang: Language, n: string) => (lang === 'es' ? n.replace('.', ',') : n)

/** A wording, the template it's said with, and what goes in it (lang: the language to say it in). */
type Phrase = [RegExp, string, (m: RegExpExecArray, lang: Language) => Record<string, string>]

// Kept in step with what writes them: the social, enquiry, expense, campaign, food safety, licence,
// sales rep and event alert migrations, and worker/{reviews,competitors,connections,integrations}.ts.
const TITLES: Phrase[] = [
  [/^Time to post your (post|carousel|reel|story) on (.+)$/, msg('Time to post your {what} on {where}'), (m, l) => ({
    what: say(l, WHAT[m[1]]),
    where: m[2] === 'social media' ? say(l, msg('social media')) : m[2].split(' and ').join(say(l, msg(' and '))),
  })],
  [/^Follow up: (.+)$/, msg('Follow up: {name}'), m => ({ name: m[1] })],
  [/^Expense to approve: (.+), (\d+\.\d\d) €$/, msg('Expense to approve: {who}, {amount} €'), (m, l) => ({ who: m[1], amount: amount(l, m[2]) })],
  [/^Expense approved: (.+)$/, msg('Expense approved: {what}'), m => ({ what: m[1] })],
  [/^Expense paid back: (.+)$/, msg('Expense paid back: {what}'), m => ({ what: m[1] })],
  [/^Expense turned down: (.+)$/, msg('Expense turned down: {what}'), m => ({ what: m[1] })],
  [/^Time to send: (.+)$/, msg('Time to send: {name}'), m => ({ name: m[1] })],
  [/^Out of range: (.+) (-?\d+\.\d) °C$/, msg('Out of range: {point} {reading} °C'), (m, l) => ({ point: m[1], reading: amount(l, m[2]) })],
  [/^(.+) runs out on (\d\d\/\d\d\/\d{4})$/, msg('{name} runs out on {date}'), m => ({ name: m[1], date: m[2] })],
  [/^(.+) ran out on (\d\d\/\d\d\/\d{4})$/, msg('{name} ran out on {date}'), m => ({ name: m[1], date: m[2] })],
  [/^New (\d)★ review from (.+): worth a reply$/, msg('New {stars}★ review from {who}: worth a reply'), (m, l) => ({ stars: m[1], who: m[2] === 'someone' ? say(l, msg('someone')) : m[2] })],
  [/^New (\d)★ review from (.+)$/, msg('New {stars}★ review from {who}'), (m, l) => ({ stars: m[1], who: m[2] === 'someone' ? say(l, msg('someone')) : m[2] })],
  [/^(.+) has closed for good, says Google$/, msg('{name} has closed for good, says Google'), m => ({ name: m[1] })],
  [/^(.+) is closed for now, says Google$/, msg('{name} is closed for now, says Google'), m => ({ name: m[1] })],
  [/^New on Google nearby: (.+)$/, msg('New on Google nearby: {name}'), m => ({ name: m[1] })],
  [/^(\d+) new places on Google nearby$/, msg('{n} new places on Google nearby'), m => ({ n: m[1] })],
  [/^(.+) for (.+): €(\d+\.\d\d) to approve$/, msg('{rule} for {rep}: €{amount} to approve'), (m, l) => ({ rule: m[1], rep: m[2], amount: amount(l, m[3]) })],
  [/^(.+) stopped working$/, msg('{name} stopped working'), m => ({ name: m[1] })],
  [/^LinkedIn needs connecting again soon$/, msg('LinkedIn needs connecting again soon'), () => ({})],
  [/^Meta Ads needs connecting again soon$/, msg('Meta Ads needs connecting again soon'), () => ({})],
  [/^Opening hours changed on Google Maps$/, msg('Opening hours changed on Google Maps'), () => ({})],
  [/^On offer till closing: (.+)$/, msg('On offer till closing: {name}'), m => ({ name: m[1] })],
]
const BODIES: Phrase[] = [
  [/^Coming up (\w{3}) (\d\d) (\w{3}), (\d\d:\d\d)\. You asked to be reminded\.$/, msg('Coming up {when}. You asked to be reminded.'), (m, l) => ({
    when: l === 'es' ? `${DAY[m[1]] ?? m[1]} ${Number(m[2])} ${MONTH[m[3]] ?? m[3]}, ${m[4]}` : `${m[1]} ${m[2]} ${m[3]}, ${m[4]}`,
  })],
  [/^It renews by itself: check it went through\.$/, msg('It renews by itself: check it went through.'), () => ({})],
  [/^LinkedIn only allows access for 60 days\. Connect it again before (.+) to keep posting\.$/,
    msg('LinkedIn only allows access for 60 days. Connect it again before {date} to keep posting.'), m => ({ date: m[1] })],
  [/^Meta only allows access for 60 days\. Connect Meta Ads again before (.+) to keep seeing your ads\.$/,
    msg('Meta only allows access for 60 days. Connect Meta Ads again before {date} to keep seeing your ads.'), m => ({ date: m[1] })],
  [/^The app now uses the hours from your Google listing\.$/, msg('The app now uses the hours from your Google listing.'), () => ({})],
  [/^(\d+(?:\.\d+)?) left on their last day, (.+) until (\d\d:\d\d)\. Square isn’t changed: take the offer price at the till\.$/,
    msg('{n} left on their last day, {price} until {time}. Square isn’t changed: take the offer price at the till.'),
    (m, l) => ({ n: amount(l, m[1]), price: m[2], time: m[3] })],
]

function phrase(lang: Language, text: string, phrases: Phrase[]) {
  if (lang === 'en') return text
  for (const [re, template, vars] of phrases) {
    const m = re.exec(text)
    if (m) return say(lang, template, vars(m, lang))
  }
  return say(lang, text)
}
