// What a notification says, in its person's language. The database and the Worker write notifications
// in English; this says them in the language the person chose, for their phone (worker/push.ts) and in
// the app (the bell and the Notifications page), with the Notifications page's Spanish.
// Amounts and readings in them follow the person's number format (Ireland's "€15.00", Spain's "15,00 €"), not the language.
import { LANGUAGES, msg, type Language } from './i18n'
import { defaultNumberFormat, formatNumberAs, moneyText, type NumberFormat } from './time'
import type { AppNotification, Preferences } from './types'
import spanish from '../src/i18n/es/notifications'
import regions from '../src/i18n/es/regions'
import townHolidays from '../src/i18n/es/townHolidays'
import { TOWN_HOLIDAYS_BODY, TOWN_HOLIDAYS_TITLE } from './townHolidays'

const es = { ...spanish, ...regions, ...townHolidays } as Record<string, string>
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
  national: msg('National holiday'), regional: msg('Regional holiday'), local: msg('Local holiday'), area: msg('Nearby town holiday'),
}

type Note = Pick<AppNotification, 'title' | 'body' | 'kind' | 'data'>

/** The title and text of a notification, in this language, its numbers with this decimal mark (shared/time.ts numberFormatOf). */
export function pushText(n: Note, lang: Language, numbers: NumberFormat = defaultNumberFormat()): { title: string; body: string | null } {
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
  if (n.kind === 'town_holidays' && d.town && d.year) {
    return { title: say(lang, TOWN_HOLIDAYS_TITLE, { town: d.town, year: d.year }), body: say(lang, TOWN_HOLIDAYS_BODY) }
  }
  if (n.kind === 'test') return { title: say(lang, msg('Test notification')), body: say(lang, msg('Notifications are working on this device.')) }
  const mention = n.kind === 'instagram_mention' ? /^(@\S+|Someone) (mentioned you in their story|tagged you in a post|posted a reel with you|posted with you)$/.exec(n.title) : null
  if (mention) {
    const who = mention[1] === 'Someone' ? say(lang, msg('Someone')) : mention[1]
    const said: Record<string, string> = {
      'mentioned you in their story': msg('{who} mentioned you in their story'), 'tagged you in a post': msg('{who} tagged you in a post'),
      'posted a reel with you': msg('{who} posted a reel with you'), 'posted with you': msg('{who} posted with you'),
    }
    return { title: say(lang, said[mention[2]], { who }), body: n.body }
  }
  // The rest are written in English by the database and the Worker: each kind's wording is matched
  // and said again in this language; anything else (a caption, a name) stays as it was written.
  return { title: phrase(lang, numbers, n.title, TITLES), body: n.body ? phrase(lang, numbers, n.body, BODIES) : null }
}

const WHAT: Record<string, string> = { post: msg('post'), carousel: msg('carousel'), reel: msg('reel'), story: msg('story') }
const DAY: Record<string, string> = { Mon: 'lun', Tue: 'mar', Wed: 'mié', Thu: 'jue', Fri: 'vie', Sat: 'sáb', Sun: 'dom' }
const MONTH: Record<string, string> = { Jan: 'ene', Feb: 'feb', Mar: 'mar', Apr: 'abr', May: 'may', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'sept', Oct: 'oct', Nov: 'nov', Dec: 'dic' }
/** A number as written ("12.50", "8.4", "1.5"), with the person's decimal mark and as many decimals. */
const decimals = (f: NumberFormat, n: string) => formatNumberAs(Number(n), f, n.split('.')[1]?.length ?? 0)
/** An amount as written ("12.50"), as money in a sentence in the person's number format: "€12.50" or "12,50 €". */
const euros = (f: NumberFormat, n: string) => moneyText(Number(n), f)

/**
 * A wording, the template it's said with, and what goes in it (lang: the language to say it in; f: the
 * decimal mark). 'numbers': it has amounts or readings, so it's said again in English too, with the person's decimal mark.
 */
type Phrase = [RegExp, string, (m: RegExpExecArray, lang: Language, f: NumberFormat) => Record<string, string>, 'numbers'?]

// Kept in step with what writes them: the social, enquiry, expense, campaign, food safety, licence,
// sales rep and event alert migrations, and worker/{reviews,competitors,connections,integrations}.ts.
const TITLES: Phrase[] = [
  // Error alerts to HQ's admins (the app_errors migration): first, as the error's own message could read like another's.
  [/^New error: (.+)$/s, msg('New error: {message}'), m => ({ message: m[1] })],
  [/^An error is back: (.+)$/s, msg('An error is back: {message}'), m => ({ message: m[1] })],
  [/^Time to post your (post|carousel|reel|story) on (.+)$/, msg('Time to post your {what} on {where}'), (m, l) => ({
    what: say(l, WHAT[m[1]]),
    where: m[2] === 'social media' ? say(l, msg('social media')) : m[2].split(' and ').join(say(l, msg(' and '))),
  })],
  [/^Follow up: (.+)$/, msg('Follow up: {name}'), m => ({ name: m[1] })],
  [/^Expense to approve: (.+), (\d+\.\d\d) €$/, msg('Expense to approve: {who}, {amount}'), (m, _l, f) => ({ who: m[1], amount: euros(f, m[2]) }), 'numbers'],
  [/^Expense approved: (.+)$/, msg('Expense approved: {what}'), m => ({ what: m[1] })],
  [/^Expense paid back: (.+)$/, msg('Expense paid back: {what}'), m => ({ what: m[1] })],
  [/^Expense turned down: (.+)$/, msg('Expense turned down: {what}'), m => ({ what: m[1] })],
  [/^Time to send: (.+)$/, msg('Time to send: {name}'), m => ({ name: m[1] })],
  [/^Out of range: (.+) (-?\d+\.\d) °C$/, msg('Out of range: {point} {reading} °C'), (m, _l, f) => ({ point: m[1], reading: decimals(f, m[2]) }), 'numbers'],
  [/^(.+) runs out on (\d\d\/\d\d\/\d{4})$/, msg('{name} runs out on {date}'), m => ({ name: m[1], date: m[2] })],
  [/^(.+) ran out on (\d\d\/\d\d\/\d{4})$/, msg('{name} ran out on {date}'), m => ({ name: m[1], date: m[2] })],
  [/^New (\d)★ review from (.+): worth a reply$/, msg('New {stars}★ review from {who}: worth a reply'), (m, l) => ({ stars: m[1], who: m[2] === 'someone' ? say(l, msg('someone')) : m[2] })],
  [/^New (\d)★ review from (.+)$/, msg('New {stars}★ review from {who}'), (m, l) => ({ stars: m[1], who: m[2] === 'someone' ? say(l, msg('someone')) : m[2] })],
  [/^(.+) has closed for good, says Google$/, msg('{name} has closed for good, says Google'), m => ({ name: m[1] })],
  [/^(.+) is closed for now, says Google$/, msg('{name} is closed for now, says Google'), m => ({ name: m[1] })],
  [/^New on Google nearby: (.+)$/, msg('New on Google nearby: {name}'), m => ({ name: m[1] })],
  [/^(\d+) new places on Google nearby$/, msg('{n} new places on Google nearby'), m => ({ n: m[1] })],
  [/^(.+) for (.+): €(\d+\.\d\d) to approve$/, msg('{rule} for {rep}: {amount} to approve'), (m, _l, f) => ({ rule: m[1], rep: m[2], amount: euros(f, m[3]) }), 'numbers'],
  [/^(.+) stopped working$/, msg('{name} stopped working'), m => ({ name: m[1] })],
  [/^LinkedIn needs connecting again soon$/, msg('LinkedIn needs connecting again soon'), () => ({})],
  [/^Meta Ads needs connecting again soon$/, msg('Meta Ads needs connecting again soon'), () => ({})],
  [/^Opening hours changed on Google Maps$/, msg('Opening hours changed on Google Maps'), () => ({})],
  [/^On offer till closing: (.+)$/, msg('On offer till closing: {name}'), m => ({ name: m[1] })],
  [/^(.+) posted about the café: waiting for your OK as a rep$/, msg('{name} posted about the café: waiting for your OK as a rep'), m => ({ name: m[1] })],
]
const BODIES: Phrase[] = [
  // An expense decided without a note says its amount (the expense claims migration).
  [/^(\d+\.\d\d) €$/, '{amount}', (m, _l, f) => ({ amount: euros(f, m[1]) }), 'numbers'],
  [/^In (.+)\. The details are on Businesses, under Errors\.$/s, msg('In {where}. The details are on Businesses, under Errors.'), m => ({ where: m[1] })],
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
    (m, _l, f) => ({ n: decimals(f, m[1]), price: m[2], time: m[3] }), 'numbers'],
]

function phrase(lang: Language, f: NumberFormat, text: string, phrases: Phrase[]) {
  for (const [re, template, vars, numbers] of phrases) {
    const m = re.exec(text)
    if (m) return lang === 'en' && !numbers ? text : say(lang, template, vars(m, lang, f))
  }
  return lang === 'en' ? text : say(lang, text)
}
