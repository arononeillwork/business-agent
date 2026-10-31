// Last-day offers: stock on its final day to sell (today's croissants, a cake, sandwiches, milk near
// its date) goes on offer by itself for the rest of the day, from a rule's time until closing, on the
// screens picked. The database's minute job does it (the last_day_offers migration:
// start_last_day_offers()); this is the same reckoning, for the pages, the demo and the tests.
// Nothing is charged or changed in Square: the till takes the offer price as the team rings it up.
import { msg } from './i18n'
import { addDays, dayKey, localDate, zonedIso } from './time'
import type { OpeningHours } from './types'
import type { StockItem } from './stock'
import type { ScreenMode } from './offers'

/** An admin's rule: which items, the discount, from when, on which screens. */
export interface LastDayRule {
  id: string
  name: string
  active: boolean
  /** Stock categories it covers ("Bakery"); with item_ids. Neither: every item with a use-by. */
  categories: string[]
  item_ids: string[]
  /** percent: a % off the shop price. price: a set price, as shown ("2 for €3"). */
  discount: 'percent' | 'price'
  percent_off: number
  price: string | null
  /** It starts this long before closing and ends at closing. */
  minutes_before_close: number
  /** None picked: every screen that's switched on. */
  screen_ids: string[]
  screen_mode: ScreenMode
  /** Admins are asked to make its story when it starts. */
  story: boolean
  sort: number
}
export type LastDayRuleInput = Omit<LastDayRule, 'id'> & { id?: string }

/** A café's usual rule: today's bakes, 30% off, from two hours before closing. */
export const newLastDayRule = (): LastDayRuleInput => ({
  name: '', active: true, categories: ['Bakery'], item_ids: [], discount: 'percent', percent_off: 30, price: null,
  minutes_before_close: 120, screen_ids: [], screen_mode: 'turns', story: false, sort: 0,
})

/** How long before closing it starts, as offered on the page. */
export const LEAD_TIMES: { minutes: number; label: string }[] = [
  { minutes: 30, label: msg('30 minutes before closing') },
  { minutes: 60, label: msg('1 hour before closing') },
  { minutes: 90, label: msg('1½ hours before closing') },
  { minutes: 120, label: msg('2 hours before closing') },
  { minutes: 180, label: msg('3 hours before closing') },
  { minutes: 240, label: msg('4 hours before closing') },
]

/** What stops the rule being saved (null: fine). The database checks the same. */
export function lastDayRuleProblem(r: Pick<LastDayRuleInput, 'name' | 'discount' | 'percent_off' | 'price' | 'minutes_before_close'>): string | null {
  if (!r.name.trim()) return msg('Give the rule a name')
  if (r.name.trim().length > 60) return msg('Keep the name under 60 characters')
  if (r.discount === 'percent' && !(Number.isInteger(r.percent_off) && r.percent_off >= 5 && r.percent_off <= 90)) return msg('Take between 5% and 90% off')
  if (r.discount === 'price' && !r.price?.trim()) return msg('Say the offer price, e.g. 2 for €3')
  if ((r.price ?? '').trim().length > 40) return msg('Keep the prices short')
  if (!(r.minutes_before_close >= 15 && r.minutes_before_close <= 720)) return msg('Start it between 15 minutes and 12 hours before closing')
  return null
}

type UseBy = Pick<StockItem, 'active' | 'on_hand'> & { use_by?: string | null }

/** On its final day to sell: today is its use-by and there are some left. */
export const isLastDay = (i: UseBy, today: string) => i.active && i.on_hand > 0 && i.use_by === today

/** Past its use-by with some still counted in: for the waste log. */
export const isPastUseBy = (i: UseBy, today: string) => i.active && i.on_hand > 0 && !!i.use_by && i.use_by < today

/** A delivery's use-by: the date given, else the day it comes in plus the item's days (1: that day); null: none. */
export function deliveryUseBy(sellWithinDays: number | null | undefined, today: string, given?: string | null): string | null {
  if (given) return given
  return sellWithinDays ? addDays(today, sellWithinDays - 1) : null
}

/** The first switched-on rule that covers this item (by its order), or none. */
export function ruleFor<R extends Pick<LastDayRule, 'active' | 'categories' | 'item_ids' | 'sort'>>(
  item: Pick<StockItem, 'id' | 'category'>, rules: R[],
): R | null {
  return [...rules].sort((a, b) => a.sort - b.sort).find(r => r.active && (
    (!r.categories.length && !r.item_ids.length) || r.item_ids.includes(item.id) || (!!item.category && r.categories.includes(item.category)))) ?? null
}

/** When the café closes on that day (an ISO time), or null: closed. Closing after midnight is the next day's. */
export function closingOn(hours: OpeningHours, date: string, tz: string): string | null {
  const h = hours[dayKey(date)]
  if (!h?.close) return null
  const close = zonedIso(date, h.close, tz)
  return h.close <= (h.open || '00:00') ? new Date(Date.parse(close) + 86_400_000).toISOString() : close
}

/** When an item's offer would run today under that rule: from the rule's time until closing; null: closed today. */
export function offerWindow(rule: Pick<LastDayRule, 'minutes_before_close'>, hours: OpeningHours, date: string, tz: string): { starts: string; ends: string } | null {
  const ends = closingOn(hours, date, tz)
  if (!ends) return null
  return { starts: new Date(Date.parse(ends) - rule.minutes_before_close * 60_000).toISOString(), ends }
}

const euro = (n: number) => `€${(Math.round(n * 100) / 100).toFixed(2)}`

/** What it's shown for and the usual price crossed out: 30% off the shop price ("€1.96", was "€2.80"); without one, "-30%". */
export function lastDayPrice(rule: Pick<LastDayRule, 'discount' | 'percent_off' | 'price'>, sellPrice: number | null): { price: string; was_price: string | null } {
  const was = sellPrice === null ? null : euro(sellPrice)
  if (rule.discount === 'price') return { price: rule.price ?? '', was_price: was }
  if (sellPrice === null) return { price: `-${rule.percent_off}%`, was_price: null }
  return { price: euro(sellPrice * (100 - rule.percent_off) / 100), was_price: was }
}

/** An item due to go on offer now: its rule and when it runs (from now until closing). */
export interface DueOffer<R> { item: StockItem; rule: R; starts: string; ends: string }

/**
 * What goes on offer now, as the minute job does: each item on its last day with some left, from its
 * rule's time until closing, once a day (made: the items already put on offer today).
 */
export function dueLastDayOffers<R extends LastDayRule>(items: StockItem[], rules: R[], made: Set<string>, hours: OpeningHours, now: number, tz: string): DueOffer<R>[] {
  const today = localDate(new Date(now), tz)
  const out: DueOffer<R>[] = []
  for (const item of [...items].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!isLastDay(item, today) || made.has(item.id)) continue
    const rule = ruleFor(item, rules)
    const when = rule && offerWindow(rule, hours, today, tz)
    if (!rule || !when || now < Date.parse(when.starts) || now >= Date.parse(when.ends)) continue
    out.push({ item, rule, starts: new Date(now).toISOString(), ends: when.ends })
  }
  return out
}

/** The bell's note when one starts (written in English, as the database does; said again in Spanish by shared/pushText). */
export function lastDayNote(item: Pick<StockItem, 'name' | 'on_hand'>, price: string, closes: string): { title: string; body: string } {
  return {
    title: `On offer till closing: ${item.name}`,
    body: `${Number(item.on_hand.toFixed(2))} left on their last day, ${price} until ${closes}. Square isn’t changed: take the offer price at the till.`,
  }
}
