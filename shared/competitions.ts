// Competitions (Marketing): giveaways, draws and contests the business runs on Instagram, in the
// café or by email; ideas for the next one worked out from what the app knows (the calendar, the
// big matches, the quiet days, the stock that could be a prize); the bases legales a promotion in
// Spain needs; rules the platforms forbid; and the entries and the draw.
// The terms and warnings are a careful starting point, not legal advice: each says to check.
import { msg } from './i18n'
import { EMAIL, cleanPhone, mapHeadings, parseCsv, type ImportField } from './customers'

export type CompetitionKind = 'instagram_giveaway' | 'email_draw' | 'photo_contest' | 'name_a_drink' | 'in_cafe' | 'quiz' | 'referral' | 'sports_prediction' | 'custom'
export const COMPETITION_KINDS: { id: CompetitionKind; label: string }[] = [
  { id: 'instagram_giveaway', label: msg('Instagram giveaway') },
  { id: 'email_draw', label: msg('Sign-up draw') },
  { id: 'photo_contest', label: msg('Photo contest') },
  { id: 'name_a_drink', label: msg('Name a drink') },
  { id: 'in_cafe', label: msg('In-café draw') },
  { id: 'quiz', label: msg('Quiz') },
  { id: 'referral', label: msg('Bring a friend') },
  { id: 'sports_prediction', label: msg('Guess the score') },
  { id: 'custom', label: msg('Your own') },
]

export type CompetitionChannel = 'instagram' | 'facebook' | 'tiktok' | 'in_cafe' | 'website' | 'email' | 'whatsapp'
export const COMPETITION_CHANNELS: { id: CompetitionChannel; label: string }[] = [
  { id: 'instagram', label: 'Instagram' }, { id: 'facebook', label: 'Facebook' }, { id: 'tiktok', label: 'TikTok' },
  { id: 'in_cafe', label: msg('In the café') }, { id: 'website', label: msg('Website') }, { id: 'email', label: msg('Email') },
  { id: 'whatsapp', label: 'WhatsApp' },
]

export type CompetitionStatus = 'draft' | 'scheduled' | 'live' | 'drawn' | 'closed'
export const COMPETITION_STATUSES: { id: CompetitionStatus; label: string }[] = [
  { id: 'draft', label: msg('Draft') }, { id: 'scheduled', label: msg('Scheduled') }, { id: 'live', label: msg('Live') },
  { id: 'drawn', label: msg('Drawn') }, { id: 'closed', label: msg('Closed') },
]

export interface CompetitionRules {
  /** 18 by default; under 14 needs a parent's consent in Spain (RGPD). */
  min_age: number
  /** Only people living in Spain can win (the usual rule, and simpler for prizes and tax). */
  spain_only: boolean
  one_entry_per_person: boolean
  /** Entering signs people up to the business's news and offers (they can unsubscribe any time). */
  marketing_signup: boolean
}
export const DEFAULT_RULES: CompetitionRules = { min_age: 18, spain_only: true, one_entry_per_person: true, marketing_signup: false }

export interface Competition {
  id: string
  name: string
  kind: CompetitionKind
  channels: CompetitionChannel[]
  status: CompetitionStatus
  starts_on: string | null
  ends_on: string | null
  draw_on: string | null
  prize: string | null
  /** What the prize is worth, IVA included (over €300 it carries tax for the business to pay). */
  prize_value: number | null
  /** A shop or stock item given as the prize (giving it takes it off the stock). */
  prize_item_id: string | null
  winners: number
  reserves: number
  /** What people do to enter, step by step. */
  how_to_enter: string[]
  rules: CompetitionRules
  /** The bases legales, as edited. */
  terms: string | null
  caption: string | null
  caption_es: string | null
  notes: string | null
  drawn_at: string | null
  entry_count: number | null
  prize_given_at: string | null
  created_at: string
  /** How many entries it has (read with the list). */
  entries?: number
}
export type CompetitionInput = Partial<Omit<Competition, 'id' | 'created_at' | 'entries' | 'drawn_at' | 'entry_count'>> & { id?: string; name: string }

export type EntrySource = 'manual' | 'instagram_paste' | 'customers' | 'csv' | 'in_cafe'
export interface CompetitionEntry {
  id: string
  competition_id: string
  name: string | null
  /** Instagram (or TikTok) username, without the @. */
  handle: string | null
  email: string | null
  phone: string | null
  source: EntrySource
  customer_id: string | null
  /** False: left out of the draw (a duplicate account, a rule not met), with why in `note`. */
  valid: boolean
  note: string | null
  /** After the draw: 1..winners are the winners, then the reserves in order. */
  rank: number | null
  created_at: string
}
export type EntryInput = Partial<Omit<CompetitionEntry, 'id' | 'competition_id' | 'created_at' | 'rank'>>

/** Text in the person's language: English with {placeholders}, translated where it's shown. */
export interface Words { text: string; vars?: Record<string, string | number> }
const w = (text: string, vars?: Words['vars']): Words => (vars ? { text, vars } : { text })

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const at = (date: string) => new Date(`${date}T12:00:00Z`)
export const plusDays = (date: string, n: number) => iso(new Date(at(date).getTime() + n * DAY))
export const daysFrom = (from: string, to: string) => Math.round((at(to).getTime() - at(from).getTime()) / DAY)
const weekday = (date: string) => (at(date).getUTCDay() + 6) % 7 // 0 Monday … 6 Sunday
export const WEEKDAYS = [msg('Mondays'), msg('Tuesdays'), msg('Wednesdays'), msg('Thursdays'), msg('Fridays'), msg('Saturdays'), msg('Sundays')]
const WEEKDAYS_ES = ['los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados', 'los domingos']
const WEEKDAYS_EN = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']

/** The nth weekday (0 Monday … 6 Sunday) of a month, e.g. the first Sunday in May. */
function nthWeekday(year: number, month: number, day: number, nth: number) {
  const first = new Date(Date.UTC(year, month - 1, 1, 12))
  const offset = (day - ((first.getUTCDay() + 6) % 7) + 7) % 7
  return iso(new Date(first.getTime() + (offset + (nth - 1) * 7) * DAY))
}

/** Moments a café in Spain builds a promotion around, the next time each comes round from `from`. */
export function spanishMoments(from: string) {
  const out: { key: string; date: string; name: Words; es: string; en: string }[] = []
  const y = Number(from.slice(0, 4))
  for (const year of [y, y + 1]) {
    const fourthThursday = nthWeekday(year, 11, 3, 4)
    out.push(
      { key: 'reyes', date: `${year}-01-06`, name: w(msg('Reyes')), es: 'Reyes', en: 'Three Kings Day' },
      { key: 'valentin', date: `${year}-02-14`, name: w(msg('San Valentín')), es: 'San Valentín', en: 'Valentine’s Day' },
      { key: 'padre', date: `${year}-03-19`, name: w(msg('Día del Padre')), es: 'el Día del Padre', en: 'Father’s Day' },
      { key: 'madre', date: nthWeekday(year, 5, 6, 1), name: w(msg('Día de la Madre')), es: 'el Día de la Madre', en: 'Mother’s Day' },
      { key: 'verano', date: `${year}-06-21`, name: w(msg('Summer')), es: 'el verano', en: 'summer' },
      { key: 'halloween', date: `${year}-10-31`, name: w(msg('Halloween')), es: 'Halloween', en: 'Halloween' },
      { key: 'blackfriday', date: plusDays(fourthThursday, 1), name: w(msg('Black Friday')), es: 'el Black Friday', en: 'Black Friday' },
      { key: 'navidad', date: `${year}-12-25`, name: w(msg('Christmas')), es: 'Navidad', en: 'Christmas' },
    )
  }
  return out.filter(m => m.date > from).sort((a, b) => a.date.localeCompare(b.date))
}

// ---------------------------------------------------------------------------------------------
// Smart suggestions
// ---------------------------------------------------------------------------------------------

export interface SuggestInput {
  today: string
  business: { name: string; instagram?: string | null }
  /** The team calendar from today on (holidays, closures, local fiestas, events). */
  events?: { starts_on: string; title: string; category: string }[]
  /** Big matches coming up (Sports). */
  bigMatches?: { starts_at: string; title: string }[]
  /** Takings per day, the last weeks (Sales). */
  takings?: { date: string; gross: number }[]
  /** Stock and shop items, for prize ideas. */
  stock?: { id: string; name: string; retail: boolean; active: boolean; on_hand: number; par_level: number | null; cost_per_unit: number | null; sell_price: number | null }[]
  /** The newest drink on the menu (Menu costing), for "name our new drink". */
  newestDrink?: string | null
  followers?: number | null
  /** Customers who said yes to marketing (they can be entered, or told about it). */
  consenting?: number
  /** A Square loyalty programme exists (its members can be told by email). */
  loyalty?: boolean
  /** Competitions already set up, so an idea isn't suggested twice. */
  existing?: Pick<Competition, 'kind' | 'status' | 'starts_on' | 'ends_on' | 'name'>[]
}

export interface CompetitionIdea {
  key: string
  kind: CompetitionKind
  title: Words
  /** Why now, from the business's own figures and calendar. */
  why: Words
  channels: CompetitionChannel[]
  starts_on: string
  ends_on: string
  draw_on: string
  prize: Words
  /** The prize in Spanish, for the bases legales. */
  prize_es: string
  prize_value: number
  prize_item_id: string | null
  how_to_enter: Words[]
  /** The same steps in Spanish, for the bases legales (published in Spanish whatever the app's language). */
  how_to_enter_es: string[]
  caption: string
  caption_es: string
  /** Higher first. */
  score: number
}

const money = (n: number) => `${Math.round(n * 100) / 100}`.replace('.', ',') + ' €'
const moneyEn = (n: number) => `€${Math.round(n * 100) / 100}`

/** A prize from the stock: the shop item there's most of beyond what's needed, else a gift card. */
function prizeIdea(input: SuggestInput, giftCard: number): { name: Words; value: number; item: string | null; es: string; en: string } {
  const spare = (input.stock ?? []).filter(i => i.active && i.retail && i.on_hand >= 2 && (i.par_level === null || i.on_hand > i.par_level))
    .map(i => ({ i, value: Number(i.sell_price ?? (i.cost_per_unit ?? 0) * 1.1) }))
    .filter(x => x.value > 0)
    .sort((a, b) => b.value - a.value)[0]
  if (spare) return { name: w(msg('{item} from the shop'), { item: spare.i.name }), value: Math.round(spare.value * 100) / 100, item: spare.i.id, es: spare.i.name, en: spare.i.name }
  return { name: w(msg('A {amount} gift card'), { amount: giftCard }), value: giftCard, item: null, es: `una tarjeta regalo de ${money(giftCard)}`, en: `a ${moneyEn(giftCard)} gift card` }
}

/** Is something like it already set up (live or planned) for those days? */
function alreadyPlanned(input: SuggestInput, kind: CompetitionKind, from: string, to: string) {
  return (input.existing ?? []).some(c => c.kind === kind && c.status !== 'closed' && c.status !== 'drawn'
    && (!c.starts_on || c.starts_on <= to) && (!c.ends_on || c.ends_on >= from))
}

/**
 * Ideas for the next competitions, best first: a Spanish calendar moment or a local fiesta coming
 * up, a quiet weekday to fill, a big match, a monthly sign-up draw like the website's, a photo
 * contest and naming the newest drink. Each says why, when, the prize and how to enter.
 */
export function suggest(input: SuggestInput): CompetitionIdea[] {
  const t0 = input.today
  const handle = (input.business.instagram ?? '').replace(/^@/, '') || input.business.name
  const tag = `@${handle}`
  const ideas: CompetitionIdea[] = []
  const follow = w(msg('Follow {handle} on Instagram'), { handle: tag })
  const followEs = `Sigue a ${tag} en Instagram`
  const comment = w(msg('Comment on the post: who would you bring?'))

  // 1. A Spanish calendar moment in the next 7 weeks: two weeks running up to it, drawn the day before.
  for (const m of spanishMoments(t0).filter(x => daysFrom(t0, x.date) >= 5 && daysFrom(t0, x.date) <= 49).slice(0, 2)) {
    const start = daysFrom(t0, m.date) > 16 ? plusDays(m.date, -14) : t0
    const end = plusDays(m.date, -2)
    if (alreadyPlanned(input, 'instagram_giveaway', start, end)) continue
    const p = prizeIdea(input, m.key === 'navidad' || m.key === 'reyes' ? 25 : 15)
    ideas.push({
      key: `moment-${m.key}-${m.date.slice(0, 4)}`, kind: 'instagram_giveaway',
      title: w(msg('{moment} giveaway'), { moment: m.name.text }),
      why: w(msg('{moment} is on {date}: people are already looking for plans and presents, and a giveaway in the two weeks before gets shared.'), { moment: m.name.text, date: m.date }),
      channels: ['instagram'], starts_on: start, ends_on: end, draw_on: plusDays(end, 1),
      prize: p.name, prize_es: p.es, prize_value: p.value, prize_item_id: p.item,
      how_to_enter: [follow, w(msg('Like the post')), comment],
      how_to_enter_es: [followEs, 'Dale me gusta a la publicación', 'Comenta con quién vendrías'],
      caption_es: `🎁 ¡Sorteo de ${m.es}! Gana ${p.es}. Para participar: 1️⃣ sigue a ${tag} 2️⃣ dale me gusta a esta publicación 3️⃣ comenta con quién vendrías. Sorteo el ${fmt(plusDays(end, 1))}. Bases en el enlace del perfil. Promoción no patrocinada ni gestionada por Instagram.`,
      caption: `🎁 ${m.en} giveaway! Win ${p.en}. To enter: 1️⃣ follow ${tag} 2️⃣ like this post 3️⃣ comment who you'd bring. Drawn on ${fmt(plusDays(end, 1))}. Terms in our bio. Not sponsored or run by Instagram.`,
      score: 90 - daysFrom(t0, m.date),
    })
  }

  // 2. A local fiesta or event on the calendar (Feria, a market, a concert) in the next 6 weeks.
  const local = (input.events ?? []).filter(e => ['local', 'area', 'event'].includes(e.category) && daysFrom(t0, e.starts_on) >= 4 && daysFrom(t0, e.starts_on) <= 42)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0]
  if (local && !alreadyPlanned(input, 'in_cafe', t0, local.starts_on)) {
    const start = daysFrom(t0, local.starts_on) > 12 ? plusDays(local.starts_on, -10) : t0
    const end = plusDays(local.starts_on, -1)
    const p = prizeIdea(input, 15)
    ideas.push({
      key: `event-${local.starts_on}`, kind: 'in_cafe',
      title: w(msg('{event} draw'), { event: local.title }),
      why: w(msg('{event} is on the calendar for {date}: the town will be out, so give people a reason to stop at the café on the way.'), { event: local.title, date: local.starts_on }),
      channels: ['in_cafe', 'instagram'], starts_on: start, ends_on: end, draw_on: local.starts_on,
      prize: p.name, prize_es: p.es, prize_value: p.value, prize_item_id: p.item,
      how_to_enter: [w(msg('Buy any drink in the café')), w(msg('Write your name and phone on a slip and drop it in the jar'))],
      how_to_enter_es: ['Haz cualquier consumición en la cafetería', 'Escribe tu nombre y teléfono en una papeleta y déjala en el bote'],
      caption_es: `🎉 Por ${local.title}: con cada café, una papeleta para ganar ${p.es}. Sorteo el ${fmt(local.starts_on)} en la cafetería.`,
      caption: `🎉 For ${local.title}: every coffee gets you a slip to win ${p.en}. Drawn on ${fmt(local.starts_on)} in the café.`,
      score: 70 - daysFrom(t0, local.starts_on),
    })
  }

  // 3. The quietest weekday: a draw for everyone who comes in that day, for the next four weeks.
  const open = (input.takings ?? []).filter(d => d.gross > 0)
  if (open.length >= 14) {
    const byDay = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }))
    for (const d of open) { const x = byDay[weekday(d.date)]; x.sum += d.gross; x.n++ }
    const avg = byDay.map(x => (x.n ? x.sum / x.n : null))
    const known = avg.filter((x): x is number => x !== null)
    const mean = known.reduce((s, x) => s + x, 0) / known.length
    const quiet = avg.reduce<number | null>((best, x, i) => (x !== null && (best === null || x < avg[best]!) ? i : best), null)
    if (quiet !== null && avg[quiet]! <= mean * 0.8 && !alreadyPlanned(input, 'in_cafe', t0, plusDays(t0, 28))) {
      const less = Math.round((1 - avg[quiet]! / mean) * 100)
      const first = plusDays(t0, ((quiet - weekday(t0)) + 7) % 7 || 7)
      const last = plusDays(first, 21)
      const p = prizeIdea(input, 10)
      ideas.push({
        key: `quiet-${quiet}`, kind: 'in_cafe',
        title: w(msg('{day} draw'), { day: WEEKDAYS[quiet] }),
        why: w(msg('{day} take {percent}% less than the average day: a draw only for that day gives people a reason to come in.'), { day: WEEKDAYS[quiet], percent: less }),
        channels: ['in_cafe', 'instagram'], starts_on: first, ends_on: last, draw_on: plusDays(last, 1),
        prize: p.name, prize_es: p.es, prize_value: p.value, prize_item_id: p.item,
        how_to_enter: [w(msg('Come in on a {day}, buy anything'), { day: WEEKDAYS[quiet] }), w(msg('Write your name and phone on a slip and drop it in the jar'))],
        how_to_enter_es: [`Ven ${WEEKDAYS_ES[quiet]} y haz cualquier consumición`, 'Escribe tu nombre y teléfono en una papeleta y déjala en el bote'],
        caption_es: `☕ ${WEEKDAYS_ES[quiet][0].toUpperCase()}${WEEKDAYS_ES[quiet].slice(1)} tienen premio: durante cuatro semanas, cada consumición ${WEEKDAYS_ES[quiet]} es una papeleta para ganar ${p.es}.`,
        caption: `☕ ${WEEKDAYS_EN[quiet]} win: for four weeks, every order on ${WEEKDAYS_EN[quiet]} is a slip in the draw for ${p.en}.`,
        score: 60 + less / 2,
      })
    }
  }

  // 4. A big match in the next three weeks: guess the score.
  const match = (input.bigMatches ?? []).filter(m => daysFrom(t0, m.starts_at.slice(0, 10)) >= 2 && daysFrom(t0, m.starts_at.slice(0, 10)) <= 21)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
  if (match && !alreadyPlanned(input, 'sports_prediction', t0, match.starts_at.slice(0, 10))) {
    const day = match.starts_at.slice(0, 10)
    const p = prizeIdea(input, 15)
    ideas.push({
      key: `match-${day}`, kind: 'sports_prediction',
      title: w(msg('Guess the score: {match}'), { match: match.title }),
      why: w(msg('{match} is on {date}, one of the big nights in Sports: a prediction gets people talking (and back to watch it).'), { match: match.title, date: day }),
      channels: ['instagram', 'in_cafe'], starts_on: plusDays(day, -7) > t0 ? plusDays(day, -7) : t0, ends_on: day, draw_on: plusDays(day, 1),
      prize: p.name, prize_es: p.es, prize_value: p.value, prize_item_id: p.item,
      how_to_enter: [follow, w(msg('Comment your score before kick-off')), w(msg('Everyone with the right score goes into the draw'))],
      how_to_enter_es: [followEs, 'Comenta tu resultado antes de que empiece el partido', 'Entre quienes acierten el resultado se hace el sorteo'],
      caption_es: `⚽ ${match.title}: ¿cómo quedará? Comenta tu resultado antes del partido. Entre los que acierten sorteamos ${p.es}. Sigue a ${tag} para participar.`,
      caption: `⚽ ${match.title}: what's the score going to be? Comment yours before kick-off. Everyone who gets it right goes into the draw for ${p.en}. Follow ${tag} to enter.`,
      score: 65 - daysFrom(t0, day),
    })
  }

  // 5. A monthly draw for signing up to news and offers, like the website's (drawn on the 15th).
  const next15 = Number(t0.slice(8, 10)) < 15 ? `${t0.slice(0, 7)}-15` : plusMonth15(t0)
  if (!alreadyPlanned(input, 'email_draw', t0, next15)) {
    const p = prizeIdea(input, 10)
    const list = input.consenting ?? 0
    ideas.push({
      key: `signup-${next15}`, kind: 'email_draw',
      title: w(msg('Monthly draw for signing up')),
      why: list > 0
        ? w(msg('{n} customers already get your news: a small monthly prize for signing up grows the list you can tell about offers, without paying for ads.'), { n: list })
        : w(msg('A small monthly prize for signing up builds a list you can tell about offers, without paying for ads.')),
      channels: ['website', 'instagram', 'in_cafe'], starts_on: t0, ends_on: plusDays(next15, -1), draw_on: next15,
      prize: p.name, prize_es: p.es, prize_value: p.value, prize_item_id: p.item,
      how_to_enter: [follow, w(msg('Sign up for news and offers'))],
      how_to_enter_es: [followEs, 'Apúntate a nuestras novedades y ofertas'],
      caption_es: `🎁 Cada mes sorteamos ${p.es}. Sigue a ${tag} y apúntate a nuestras novedades para participar. Sorteo el día ${Number(next15.slice(8, 10))}.`,
      caption: `🎁 Every month we draw ${p.en}. Follow ${tag} and sign up for our news to enter. Drawn on the ${Number(next15.slice(8, 10))}th.`,
      score: 40 + Math.min(list, 40) / 4,
    })
  }

  // 6. A photo contest: the customers' own photos, the best content there is.
  if (!alreadyPlanned(input, 'photo_contest', t0, plusDays(t0, 21))) {
    const p = prizeIdea(input, 20)
    const followers = input.followers ?? 0
    ideas.push({
      key: `photo-${t0.slice(0, 7)}`, kind: 'photo_contest',
      title: w(msg('Best coffee photo')),
      why: followers > 0
        ? w(msg('Your {n} followers see your photos; their own photos, tagged, reach their friends too, and give you posts to share.'), { n: followers })
        : w(msg('Customers’ own photos, tagged, reach their friends and give you posts to share.')),
      channels: ['instagram'], starts_on: t0, ends_on: plusDays(t0, 20), draw_on: plusDays(t0, 22),
      prize: p.name, prize_es: p.es, prize_value: p.value, prize_item_id: p.item,
      how_to_enter: [follow, w(msg('Post a photo of your drink and tag {handle}'), { handle: tag }), w(msg('We choose our favourite (it’s judged, not drawn)'))],
      how_to_enter_es: [followEs, `Publica una foto de tu bebida y etiqueta a ${tag}`, 'Elegimos la que más nos guste (no es un sorteo)'],
      caption_es: `📸 Concurso de fotos: publica una foto de tu café y etiqueta a ${tag}. La que más nos guste gana ${p.es}. Hasta el ${fmt(plusDays(t0, 20))}.`,
      caption: `📸 Photo contest: post a photo of your coffee and tag ${tag}. Our favourite wins ${p.en}. Until ${fmt(plusDays(t0, 20))}.`,
      score: 35 + Math.min(followers, 1000) / 50,
    })
  }

  // 7. Name a new drink (the newest on the menu, when it's known).
  if (!alreadyPlanned(input, 'name_a_drink', t0, plusDays(t0, 14))) {
    const p = prizeIdea(input, 15)
    ideas.push({
      key: `name-${input.newestDrink ?? t0.slice(0, 7)}`, kind: 'name_a_drink',
      title: w(msg('Name our new drink')),
      why: input.newestDrink
        ? w(msg('“{drink}” is new on the menu: letting customers name it makes it theirs, and the winner tells everyone.'), { drink: input.newestDrink })
        : w(msg('Bringing out a new drink? Letting customers name it makes it theirs, and the winner tells everyone.')),
      channels: ['instagram', 'in_cafe'], starts_on: t0, ends_on: plusDays(t0, 13), draw_on: plusDays(t0, 15),
      prize: p.item ? w(msg('Its first month free, and {item} from the shop'), p.name.vars) : w(msg('Its first month free, and a {amount} gift card'), p.name.vars),
      prize_es: `su primer mes gratis y ${p.es}`, prize_value: p.value, prize_item_id: p.item,
      how_to_enter: [follow, w(msg('Comment a name for the new drink')), w(msg('We choose our favourite (it’s judged, not drawn)'))],
      how_to_enter_es: [followEs, 'Comenta un nombre para la bebida nueva', 'Elegimos el que más nos guste (no es un sorteo)'],
      caption_es: `🧋 Tenemos bebida nueva y le falta nombre. Comenta tu propuesta: la que elijamos gana su primer mes gratis y ${p.es}. Sigue a ${tag} para participar.`,
      caption: `🧋 We've got a new drink and it needs a name. Comment yours: the one we pick wins its first month free and ${p.en}. Follow ${tag} to enter.`,
      score: input.newestDrink ? 50 : 25,
    })
  }

  // 8. Loyalty members: a draw among the stamp card's members who come in this fortnight.
  if (input.loyalty && !alreadyPlanned(input, 'in_cafe', t0, plusDays(t0, 14))) {
    const p = prizeIdea(input, 15)
    ideas.push({
      key: `loyalty-${t0}`, kind: 'in_cafe',
      title: w(msg('Stamp card members’ draw')),
      why: w(msg('Everyone on the stamp card who comes in during the next two weeks is in: it rewards regulars and brings back the ones who stopped coming.')),
      channels: ['in_cafe', 'email'], starts_on: t0, ends_on: plusDays(t0, 13), draw_on: plusDays(t0, 14),
      prize: p.name, prize_es: p.es, prize_value: p.value, prize_item_id: p.item,
      how_to_enter: [w(msg('Collect a stamp on your card'))],
      how_to_enter_es: ['Consigue un sello en tu tarjeta'],
      caption_es: `⭐ Si tienes nuestra tarjeta de sellos, cada sello estas dos semanas es una participación para ganar ${p.es}.`,
      caption: `⭐ On our stamp card? Every stamp in the next two weeks is an entry to win ${p.en}.`,
      score: 30,
    })
  }

  return ideas.sort((a, b) => b.score - a.score)
}

function plusMonth15(date: string) {
  const [y, m] = date.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-15` : `${y}-${String(m + 1).padStart(2, '0')}-15`
}
const fmt = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`

// ---------------------------------------------------------------------------------------------
// Rules: what the platforms and Spanish law ask
// ---------------------------------------------------------------------------------------------

/** Over this the prize carries IRPF for the organiser to pay on the winner's behalf (ingreso a cuenta). */
export const PRIZE_TAX_THRESHOLD = 300

/**
 * Problems with how people enter, in words for the business. Platforms ban some ways of entering;
 * a few things Spanish rules ask for. A starting point: check with your gestoría or a lawyer.
 */
export function entryProblems(c: Pick<Competition, 'channels' | 'how_to_enter' | 'prize_value' | 'rules' | 'winners' | 'starts_on' | 'ends_on' | 'draw_on' | 'kind'>): Words[] {
  const out: Words[] = []
  const steps = c.how_to_enter.join(' \n ').toLowerCase()
  if (/review|reseña|resena|valoraci[oó]n|opini[oó]n en google|google maps|tripadvisor|estrellas|stars|rate us|punt[uú]a/.test(steps)) {
    out.push(w(msg('Don’t ask for a review to enter: Google and TripAdvisor ban reviews given for a reward, and can remove your reviews or mark the listing.')))
  }
  if (c.channels.includes('facebook') && /share|compart|tag|etiquet|timeline|biograf|muro/.test(steps)) {
    out.push(w(msg('On Facebook, sharing to enter and tagging friends to enter aren’t allowed: ask for a comment or a reaction on the Page’s post instead.')))
  }
  if ((c.channels.includes('instagram') || c.channels.includes('tiktok')) && /tag .*(photo|picture|post)|etiquet.*(foto|imagen|publicaci)/.test(steps) && !/tag (us|@)|etiquét?anos|etiqueta a @/.test(steps)) {
    out.push(w(msg('Instagram doesn’t allow asking people to tag others in photos they aren’t in. Tagging friends in a comment is fine.')))
  }
  if ((c.channels.includes('instagram') || c.channels.includes('facebook')) && c.kind !== 'in_cafe') {
    out.push(w(msg('Say in the post and the terms that the promotion isn’t sponsored, endorsed or run by Instagram or Facebook (Meta asks for it).')))
  }
  if ((c.prize_value ?? 0) > PRIZE_TAX_THRESHOLD) {
    out.push(w(msg('The prize is worth more than €300: the business pays the IRPF on it (an ingreso a cuenta) and declares it on modelos 111 and 190. Ask your gestoría.')))
  }
  if (c.rules.min_age < 14) out.push(w(msg('Under 14s need a parent’s consent to give their details (RGPD): keep it to 14 or over, or ask for that consent.')))
  if (c.winners < 1) out.push(w(msg('Choose how many winners there are.')))
  if (!c.ends_on) out.push(w(msg('Set the day entries close.')))
  if (c.ends_on && c.draw_on && c.draw_on < c.ends_on) out.push(w(msg('The draw is before entries close.')))
  if (c.starts_on && c.ends_on && c.ends_on < c.starts_on) out.push(w(msg('It closes before it starts.')))
  if (!c.how_to_enter.some(s => s.trim())) out.push(w(msg('Say how people enter.')))
  return out
}

// ---------------------------------------------------------------------------------------------
// Bases legales
// ---------------------------------------------------------------------------------------------

const CHANNEL_ES: Record<CompetitionChannel, string> = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', in_cafe: 'el establecimiento', website: 'la web', email: 'email', whatsapp: 'WhatsApp',
}

/**
 * The terms of a promotion (bases legales) in Spanish, as a promotion in Spain needs them: who runs
 * it, when, who can enter and how, the prize, how the winner is chosen and told, data protection,
 * Meta's disclaimer when it runs on Instagram or Facebook, and the tax on prizes over €300.
 * A draft: the business reviews it (and its gestoría or lawyer), then publishes it.
 */
export function basesLegales(c: Pick<Competition, 'name' | 'kind' | 'channels' | 'starts_on' | 'ends_on' | 'draw_on' | 'prize' | 'prize_value' | 'winners' | 'reserves' | 'how_to_enter' | 'rules'>,
  b: { name: string; tax_id?: string | null; address?: string | null; email?: string | null; website?: string | null }): string {
  const judged = c.kind === 'photo_contest' || c.kind === 'name_a_drink'
  const meta = c.channels.some(x => x === 'instagram' || x === 'facebook')
  const where = c.channels.map(x => CHANNEL_ES[x]).join(', ')
  const d = (x: string | null) => (x ? fmt(x) : '[fecha]')
  const n = (k: number) => (k === 1 ? 'un (1) ganador' : `${k} ganadores`)
  const sections = [
    `BASES LEGALES DE LA PROMOCIÓN «${c.name}»`,
    `1. Organizador\n${b.name}${b.tax_id ? `, con CIF/NIF ${b.tax_id}` : ''}${b.address ? ` y domicilio en ${b.address}` : ''} (en adelante, «el Organizador»), organiza esta promoción${where ? ` a través de ${where}` : ''}.`,
    `2. Fechas\nLa promoción empieza el ${d(c.starts_on)} y se puede participar hasta el ${d(c.ends_on)} a las 23:59 (hora peninsular). ${judged ? 'El ganador se elegirá' : 'El sorteo se hará'} el ${d(c.draw_on)}.`,
    `3. Quién puede participar\nPersonas físicas mayores de ${c.rules.min_age} años${c.rules.spain_only ? ' con residencia en España' : ''}. No pueden participar los empleados del Organizador ni sus familiares directos.${c.rules.one_entry_per_person ? ' Solo se admite una participación por persona; las cuentas duplicadas o creadas para la promoción quedan fuera.' : ''}`,
    `4. Cómo participar\n${c.how_to_enter.filter(s => s.trim()).map((s, i) => `${i + 1}. ${s.trim()}`).join('\n') || '[Pasos para participar]'}\nParticipar es gratuito${c.kind === 'in_cafe' ? ' salvo la consumición que se indique' : ''}.${c.rules.marketing_signup ? ' Al participar, la persona acepta recibir las novedades y ofertas del Organizador, y puede darse de baja cuando quiera.' : ''}`,
    `5. Premio\n${c.prize ? `${c.prize[0].toUpperCase()}${c.prize.slice(1)}` : '[Premio]'}${c.prize_value ? `, con un valor de ${money(c.prize_value)} (IVA incluido)` : ''}. Habrá ${n(c.winners)}${c.reserves ? ` y ${c.reserves} suplente${c.reserves === 1 ? '' : 's'}` : ''}. El premio es personal e intransferible y no puede cambiarse por su valor en dinero.`,
    `6. Elección del ganador\n${judged ? 'El Organizador elegirá la participación ganadora según su originalidad y calidad.' : 'El ganador se elegirá al azar entre todas las participaciones válidas.'} Se contactará con el ganador${meta ? ' por mensaje privado o comentario' : ''} en los 3 días siguientes y tendrá 7 días para responder; si no responde o no cumple las bases, el premio pasará al siguiente suplente.`,
    `7. Protección de datos\nEl responsable del tratamiento es el Organizador. Los datos se usarán para gestionar la promoción y contactar con el ganador${c.rules.marketing_signup ? ', y para enviar novedades y ofertas a quien lo haya aceptado' : ''}, y se conservarán el tiempo necesario para ello. El ganador acepta que su nombre o usuario se publique al anunciarlo. Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ${b.email ?? '[email del Organizador]'}, y reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).`,
    ...(meta ? [`8. Instagram y Facebook\nEsta promoción no está patrocinada, avalada ni administrada por Instagram ni Facebook (Meta), ni asociada a ellas. Los participantes liberan a Meta de toda responsabilidad y aceptan sus condiciones de uso.`] : []),
    ...((c.prize_value ?? 0) > PRIZE_TAX_THRESHOLD ? [`${meta ? 9 : 8}. Fiscalidad\nEl premio está sujeto al IRPF. El Organizador hará el ingreso a cuenta correspondiente y lo declarará en los modelos 111 y 190; el ganador deberá incluir el premio en su declaración de la renta.`] : []),
    `${8 + (meta ? 1 : 0) + ((c.prize_value ?? 0) > PRIZE_TAX_THRESHOLD ? 1 : 0)}. Aceptación de las bases\nParticipar supone aceptar estas bases. El Organizador puede descalificar participaciones fraudulentas y modificar o cancelar la promoción por causas justificadas, avisándolo por los mismos canales.${b.website ? ` Las bases están publicadas en ${b.website}.` : ''}`,
  ]
  return sections.join('\n\n')
}

/** The same terms in a few lines of English, for the business to check what the Spanish says. */
export function termsSummary(c: Pick<Competition, 'starts_on' | 'ends_on' | 'draw_on' | 'prize' | 'prize_value' | 'winners' | 'reserves' | 'rules' | 'channels' | 'kind'>): Words[] {
  const judged = c.kind === 'photo_contest' || c.kind === 'name_a_drink'
  return [
    judged
      ? w(msg('Open {from} to {to}; the winner is chosen on {draw}.'), { from: c.starts_on ?? '–', to: c.ends_on ?? '–', draw: c.draw_on ?? '–' })
      : w(msg('Open {from} to {to}; drawn on {draw}.'), { from: c.starts_on ?? '–', to: c.ends_on ?? '–', draw: c.draw_on ?? '–' }),
    c.rules.spain_only ? w(msg('Aged {age} or over and living in Spain.'), { age: c.rules.min_age }) : w(msg('Aged {age} or over.'), { age: c.rules.min_age }),
    c.rules.one_entry_per_person ? w(msg('One entry each.')) : w(msg('More than one entry each is allowed.')),
    w(msg('{winners} winner(s) and {reserves} reserve(s); the prize can’t be swapped for cash.'), { winners: c.winners, reserves: c.reserves }),
    w(msg('Winners are told within 3 days and have 7 to answer, or it goes to the next reserve.')),
    w(msg('Data protection: what the data is for, how long it’s kept and how to ask for it to be deleted.')),
    ...(c.channels.some(x => x === 'instagram' || x === 'facebook') ? [w(msg('Meta’s disclaimer: not sponsored or run by Instagram or Facebook.'))] : []),
    ...((c.prize_value ?? 0) > PRIZE_TAX_THRESHOLD ? [w(msg('Tax: the business pays the IRPF on a prize over €300 (modelos 111 and 190).'))] : []),
  ]
}

// ---------------------------------------------------------------------------------------------
// Entries and the draw
// ---------------------------------------------------------------------------------------------

/** Instagram's words around comments, copied with them ("2d", "Reply", "Me gusta"…), never usernames. */
const NOT_A_USER = /^(\d+\s*[smhdw]|\d+\s*(min|sem|h|d)|reply|responder|like|likes|me gusta|ver traducción|see translation|verified|verificado|editado|edited|author|autor|ver respuestas.*|view replies.*|hide replies|ocultar respuestas|\d+ (likes?|me gusta))$/i
export const HANDLE = /^[a-z0-9._]{1,30}$/i
export const cleanHandle = (raw: string | null | undefined) => {
  const h = (raw ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, '').replace(/[/?#].*$/, '').toLowerCase()
  return HANDLE.test(h) && !/^\.|\.$|\.\./.test(h) ? h : null
}

/**
 * Who commented, from comments copied off Instagram (or a list of usernames): each line that is a
 * username on its own (with or without the @), or a username then ":" or "•" and the rest. Comment
 * text is left out, so friends tagged in a comment don't count (they didn't enter), nor does the
 * business itself; each person once. The page shows the list to check before adding it.
 */
export function parseComments(text: string, ownHandle?: string | null): string[] {
  const own = cleanHandle(ownHandle)
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || NOT_A_USER.test(line)) continue
    const m = /^(@?[A-Za-z0-9._]+)(?:\s*$|\s*[:•·]\s*)/.exec(line)
    if (!m || !/[a-z]/i.test(m[1])) continue
    const handle = cleanHandle(m[1])
    if (handle && handle !== own) seen.add(handle)
  }
  return [...seen]
}

/** Entries not already in (the same username or email), and how many were already there. */
export function newEntries(existing: Pick<CompetitionEntry, 'handle' | 'email'>[], rows: EntryInput[]) {
  const handles = new Set(existing.map(e => e.handle?.toLowerCase()).filter(Boolean))
  const emails = new Set(existing.map(e => e.email?.toLowerCase()).filter(Boolean))
  const fresh: EntryInput[] = []
  let skipped = 0
  for (const r of rows) {
    const handle = cleanHandle(r.handle)
    const email = r.email?.trim().toLowerCase() || null
    if (!handle && !email && !r.name?.trim() && !r.phone?.trim()) { skipped++; continue }
    if ((handle && handles.has(handle)) || (email && emails.has(email))) { skipped++; continue }
    if (handle) handles.add(handle)
    if (email) emails.add(email)
    fresh.push({ ...r, handle, email })
  }
  return { fresh, skipped }
}

/**
 * Entries from a CSV (a sign-up list, a form's export, Spanish Excel included): its name, email,
 * phone and Instagram columns, found by their headings. Null when it has none of them.
 */
export function entriesFromCsv(text: string): EntryInput[] | null {
  const [head, ...rows] = parseCsv(text)
  const map = head ? mapHeadings(head) : []
  if (!map.some(f => f && ['first_name', 'last_name', 'full_name', 'email', 'phone', 'instagram'].includes(f))) return null
  return rows.map(r => {
    const get = (f: ImportField) => { const i = map.indexOf(f); return i >= 0 ? (r[i] ?? '').trim() : '' }
    const name = get('full_name') || [get('first_name'), get('last_name')].filter(Boolean).join(' ')
    const email = get('email').toLowerCase()
    return { name: name || null, email: EMAIL.test(email) ? email : null, phone: get('phone') ? cleanPhone(get('phone')) : null,
      handle: cleanHandle(get('instagram')), source: 'csv' as const }
  }).filter(e => e.name || e.email || e.phone || e.handle)
}

/** The draw: winners and then reserves, picked at random from the valid entries (`random` returns 0 ≤ x < 1). */
export function draw<T extends { id: string; valid: boolean }>(entries: T[], winners: number, reserves: number, random: () => number = Math.random): { id: string; rank: number }[] {
  const pool = entries.filter(e => e.valid).map(e => e.id)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, winners + reserves).map((id, i) => ({ id, rank: i + 1 }))
}

/** The message for a winner (Instagram only lets a business message someone who wrote first: copy it into their DMs). */
export function winnerMessage(e: Pick<CompetitionEntry, 'name' | 'handle'>, c: Pick<Competition, 'name' | 'prize'>, business: string, lang: 'es' | 'en' = 'es') {
  const who = e.name?.trim().split(/\s+/)[0] || (e.handle ? `@${e.handle}` : '')
  return lang === 'es'
    ? `¡Hola ${who}! 🎉 Has ganado «${c.name}»${c.prize ? `: ${c.prize}` : ''}. Escríbenos por aquí para recogerlo en ${business}. ¡Enhorabuena!`
    : `Hi ${who}! 🎉 You've won "${c.name}"${c.prize ? `: ${c.prize}` : ''}. Message us here to collect it at ${business}. Congratulations!`
}

/** Live (between its start and end), coming up, or over, from its dates and status. */
export function phaseOf(c: Pick<Competition, 'status' | 'starts_on' | 'ends_on'>, today: string): 'draft' | 'upcoming' | 'live' | 'to_draw' | 'drawn' | 'closed' {
  if (c.status === 'closed') return 'closed'
  if (c.status === 'drawn') return 'drawn'
  if (c.status === 'draft') return 'draft'
  if (c.starts_on && c.starts_on > today) return 'upcoming'
  if (c.ends_on && c.ends_on < today) return 'to_draw'
  return 'live'
}
