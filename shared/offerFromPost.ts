// An offer from one of the business's own posts on Instagram (or its Facebook Page): the special in
// the latest post goes onto Offers & specials and the screens without typing it again. The caption
// gives the offer's name (its first line), its price and what it usually costs ("€3.50, was €4.50",
// "2x1", "20% off"), the details (the rest, without the hashtags) and how long it runs ("today only",
// "this weekend"); the post's photo is its picture. Used by the Offers page and the AI connector's
// save_offer, which both show the result before it's saved. Its amounts are written the way the
// business's country writes them ("€3.50" in Ireland, "€3,50" in Spain), however the caption had them.
import { addDays, formatNumberAs, localDate, zonedIso, type NumberFormat } from './time'
import type { OfferInput } from './offers'

/** One of the business's own posts, newest first. */
export interface SourcePost {
  id: string
  source: 'instagram' | 'facebook'
  caption: string | null
  /** The photo (a video's cover), from Instagram's or Facebook's own servers: their links run out after a while. */
  image_url: string | null
  permalink: string | null
  posted_at: string
  video?: boolean
}

/** How long the caption says it runs; a week when it doesn't say. */
export type PostLength = 'today' | 'weekend' | 'week' | 'month'

export interface OfferIdea {
  title: string
  details: string | null
  price: string | null
  was_price: string | null
  length: PostLength
  /** It reads like an offer: a price, a deal, or a word such as "offer", "special", "promo", "oferta". */
  found: boolean
}

// Crossed-out text on Instagram is written with combining strokes (4̶.̶5̶0̶).
const STRIKE = /[\u{335}\u{336}]/gu
const STRUCK = /[\u{335}\u{336}]/u
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍⃣]/gu
const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu
const AMOUNT = String.raw`\d{1,4}(?:[.,]\d{1,2})?`
// "€3.50", "€ 3", "3,50€", "3.50 €", "3 euros", "3 EUR".
const EURO = new RegExp(String.raw`€\s?(${AMOUNT})|(${AMOUNT})\s?(?:€|eur(?:os?)?\b)`, 'giu')
const WAS = /\b(?:was|were|before|usually|normally|regular(?:ly)?|instead of|rrp|antes|normalmente|habitual|en vez de|en lugar de|precio normal)\s*:?\s*$/i
const DEAL_WORDS = /\b(?:offer|offers|special|specials|promo|promotion|deal|discount|happy hour|sale|oferta|ofertas|especial|promoci[oó]n|descuento|rebaja|rebajas)\b/i

/** "3,5" → "€3.50" (Ireland's decimal point) or "€3,50" (Spain's comma); "4" → "€4". */
function euros(n: string, f: NumberFormat) {
  const v = Number(n.replace(',', '.'))
  return `€${Number.isInteger(v) ? v : formatNumberAs(v, f, 2)}`
}

/** "2x1", "3 for €5", "20% off", "half price", "buy one get one free". */
function dealIn(text: string, f: NumberFormat): string | null {
  const forPrice = new RegExp(String.raw`\b(\d)\s?(?:for|por|x)\s?(?:€\s?(${AMOUNT})|(${AMOUNT})\s?(?:€|eur(?:os?)?\b))`, 'iu').exec(text)
  if (forPrice) return `${forPrice[1]} for ${euros(forPrice[2] ?? forPrice[3], f)}`
  const nForM = /\b([2-9])\s?(?:x|for|por)\s?([1-8])\b(?!\s?(?:€|%|eur))/i.exec(text)
  if (nForM && Number(nForM[2]) < Number(nForM[1])) return `${nForM[1]} for ${nForM[2]}`
  if (/\b(?:buy one,? get one(?: free)?|bogo|compra uno y ll[eé]vate otro)\b/i.test(text)) return '2 for 1'
  if (/\b(?:half[- ]price|mitad de precio)\b/i.test(text)) return 'Half price'
  // "20% off", "-20%", "save 20%"; not "70% cacao".
  const pct = /(?:^|[\s(])-\s?(\d{1,2})\s?%|\b(\d{1,2})\s?%\s?(?:off|discount|de descuento|descuento|dto\b|menos|rebaja)|\b(?:save|ahorra|up to|hasta un|hasta el)\s(\d{1,2})\s?%/i.exec(text)
  const n = Number(pct?.[1] ?? pct?.[2] ?? pct?.[3] ?? 0)
  return n > 0 ? `${n}% off` : null
}

/** The euro amounts in the text, each marked if it's what it usually costs ("was €4", "4̶€̶", "€4 → €3"). */
function amountsIn(raw: string, f: NumberFormat) {
  const plain = raw.replace(STRIKE, '')
  const out: { price: string; was: boolean }[] = []
  for (const m of plain.matchAll(EURO)) {
    const before = plain.slice(Math.max(0, m.index - 24), m.index)
    // "€4 → €3", "4€ a 3€", "€4 now €3": the first is what it usually costs.
    const after = plain.slice(m.index + m[0].length, m.index + m[0].length + 12)
    out.push({ price: euros(m[1] ?? m[2], f), was: WAS.test(before) || /^\s?(?:→|->|➡|>|a|now|ahora)\s?€?\s?\d/i.test(after) })
  }
  // Crossed out: the digits of an amount carry strokes in the caption as written.
  const struck = [...raw.matchAll(new RegExp(String.raw`(?:€\s?)?(?:\d[\u{335}\u{336}]?)+(?:[.,][\u{335}\u{336}]?(?:\d[\u{335}\u{336}]?)+)?\s?(?:€[\u{335}\u{336}]?)?`, 'gu'))]
    .filter(m => STRUCK.test(m[0])).map(m => euros(m[0].replace(STRIKE, '').replace(/[€\s]/g, ''), f))
  return out.map(a => (struck.includes(a.price) ? { ...a, was: true } : a))
}

/** At most `max` characters, cut between words. */
function cut(s: string, max: number) {
  if (s.length <= max) return s
  const at = s.lastIndexOf(' ', max - 1)
  return `${s.slice(0, at > max / 2 ? at : max - 1).replace(/[\s,;:–-]+$/, '')}…`
}

const tidy = (s: string) => s.replace(STRIKE, '').replace(HASHTAG, ' ').replace(/[ \t]+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim()

/** Read the offer in a caption, its amounts written with the business's decimal mark (Ireland's point by default). */
export function offerFromCaption(caption: string | null, f: NumberFormat = 'point'): OfferIdea {
  const raw = (caption ?? '').replace(/\r/g, '')
  const lines = raw.split('\n').map(l => tidy(l.replace(EMOJI, ' '))).filter(l => /[\p{L}\p{N}]/u.test(l))
  let title = lines[0] ?? ''
  let rest = lines.slice(1)
  // A long first line: its first sentence is the name, the rest goes in the details.
  if (title.length > 80) {
    const end = /^(.{8,80}?[.!?])\s/.exec(title)
    if (end) { rest = [title.slice(end[1].length).trim(), ...rest]; title = end[1] }
    else { rest = [title, ...rest]; title = cut(title, 80) }
  }
  title = title.replace(/[.!:]+$/, '').trim()
  const details = rest.join(' ').replace(/\s+/g, ' ').trim()
  const flat = raw.replace(EMOJI, ' ')
  const amounts = amountsIn(flat, f)
  const deal = dealIn(flat.replace(STRIKE, ''), f)
  const was = amounts.find(a => a.was)?.price ?? null
  const price = deal ?? amounts.find(a => !a.was)?.price ?? null
  const text = flat.toLowerCase()
  const length: PostLength =
    /\b(?:today only|only today|just today|solo hoy|s[oó]lo por hoy|hoy solo|today)\b/.test(text) ? 'today'
    : /\b(?:this weekend|all weekend|weekend|fin de semana|finde)\b/.test(text) ? 'weekend'
    : /\b(?:this month|all month|este mes|todo el mes)\b/.test(text) ? 'month'
    : 'week'
  return {
    title, details: details ? cut(details, 300) : null, price, was_price: was && was !== price ? was : null, length,
    found: !!(price || was || DEAL_WORDS.test(flat)),
  }
}

/** When something that starts at `starts` and runs for `length` ends, in the business's time zone. */
export function postOfferEnd(starts: string, length: PostLength, tz: string): string {
  const day = localDate(starts, tz)
  if (length === 'today') return zonedIso(day, '23:59', tz)
  if (length === 'weekend') {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
    return zonedIso(addDays(day, (7 - weekday) % 7), '23:59', tz)
  }
  if (length === 'month') {
    const [y, m] = day.split('-').map(Number)
    return zonedIso(new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10), '23:59', tz)
  }
  return new Date(Date.parse(starts) + 7 * 86_400_000).toISOString()
}

/**
 * A new offer from a post, ready to check and save: from now (to the minute) for as long as the
 * caption says, on the screens given, its amounts with the business's decimal mark (`f`: its country's).
 * A caption with nothing to name it by is named after the post.
 */
export function offerFromPost(post: SourcePost, screenIds: string[], tz: string, now = Date.now(), f: NumberFormat = 'point'): OfferInput & { length: PostLength; found: boolean } {
  const idea = offerFromCaption(post.caption, f)
  const starts = new Date(Math.floor(now / 60_000) * 60_000).toISOString()
  return {
    title: idea.title || (post.source === 'instagram' ? 'Our Instagram special' : 'Our special'),
    details: idea.details, price: idea.price, was_price: idea.was_price, image_url: post.image_url,
    starts_at: starts, ends_at: postOfferEnd(starts, idea.length, tz),
    screen_ids: screenIds, screen_mode: 'turns', seconds: 15, post_id: null, active: true,
    length: idea.length, found: idea.found,
  }
}

/** The newest post with an offer in it; null: none of them has one. */
export const latestOfferPost = <T extends Pick<SourcePost, 'caption' | 'posted_at'>>(posts: T[]): T | null =>
  [...posts].sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at)).find(p => offerFromCaption(p.caption).found) ?? null
