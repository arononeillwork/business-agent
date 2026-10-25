// Business advisor and Dashboards: what the takings, the timecards, the menu and the stock say,
// worked out from figures the app already has (the till's takings hour by hour, Square's best
// sellers, Menu costing, the timecards and the rota, the waste log, reviews). Pure functions, so the
// pages, the tests and the AI tools all read the same. Each finding is English with {placeholders}
// (msg() marks it for translation); the page translates it and fills in the figures.
import { msg } from './i18n'
import { DAY_KEYS, type DayKey, type OpeningHours, type SalesDay, type SalesItem, type Shift, type TimeEntry } from './types'
import { addDays, dayKey, localDate, localTime } from './time'

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places

// ---------------- Takings ----------------

export interface SalesTotals { gross: number; net: number; refunds: number; tips: number; payments: number; average: number; days: number }

/** Takings over some days: gross, less refunds, tips, how many payments and the average sale. */
export function salesTotals(days: SalesDay[]): SalesTotals {
  const gross = days.reduce((s, d) => s + d.gross, 0), refunds = days.reduce((s, d) => s + d.refunds, 0)
  const tips = days.reduce((s, d) => s + d.tips, 0), payments = days.reduce((s, d) => s + d.payments, 0)
  return { gross: round(gross), net: round(gross - refunds), refunds: round(refunds), tips: round(tips), payments, average: payments ? round(gross / payments) : 0,
    days: days.filter(d => d.gross > 0).length }
}

/** The days from `from` to `to` (inclusive). */
export const between = (days: SalesDay[], from: string, to: string) => days.filter(d => d.date >= from && d.date <= to)

/** The change from one figure to another as a share (0.12: up 12%), or null with nothing to compare. */
export const change = (now: number, before: number) => (before > 0 ? now / before - 1 : null)

/** Average takings on each day of the week, over the days it traded (a closed day isn't a bad day). */
export function weekdayAverages(days: SalesDay[]): { day: DayKey; average: number; days: number }[] {
  return DAY_KEYS.map(day => {
    const on = days.filter(d => d.gross > 0 && dayKey(d.date) === day)
    return { day, average: on.length ? round(on.reduce((s, d) => s + d.gross, 0) / on.length) : 0, days: on.length }
  })
}

/** Takings in each hour of the day (0–23), added up over the days that say. */
export function hourTotals(days: SalesDay[]): number[] {
  const out = Array<number>(24).fill(0)
  for (const d of days) d.hours?.forEach((v, h) => { out[h] += v })
  return out.map(v => round(v))
}

const hourOf = (hhmm: string) => Number(hhmm.slice(0, 2))
/** The last hour open: closing at 18:00 the last hour is 17; at 18:30 it's 18. */
const lastHourOf = (hhmm: string) => (hhmm.endsWith(':00') ? hourOf(hhmm) - 1 : hourOf(hhmm))

/** One day of the week's first and last hour open against a usual hour that day, on average. */
export interface EdgeHours { day: DayKey; open: string; close: string; first: number; last: number; perHour: number; days: number }

/** How the first and last hour open do, day by day of the week (only days open, with hours from the till). */
export function edgeHours(days: SalesDay[], hours: OpeningHours | null): EdgeHours[] {
  if (!hours) return []
  return DAY_KEYS.flatMap(day => {
    const h = hours[day]
    if (!h) return []
    const on = days.filter(d => d.gross > 0 && d.hours && dayKey(d.date) === day)
    if (!on.length) return []
    const first = hourOf(h.open), last = lastHourOf(h.close)
    const open = Math.max(1, last - first + 1)
    const avg = (f: (d: SalesDay) => number) => on.reduce((s, d) => s + f(d), 0) / on.length
    return [{ day, open: h.open, close: h.close, first: round(avg(d => d.hours![first] ?? 0)), last: round(avg(d => d.hours![last] ?? 0)),
      perHour: round(avg(d => d.gross) / open), days: on.length }]
  })
}

// ---------------- The team ----------------

/** Hours worked (paid) by each person, from the timecards. */
export function hoursByPerson(entries: Pick<TimeEntry, 'profile_id' | 'paid_minutes'>[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of entries) out.set(e.profile_id, round((out.get(e.profile_id) ?? 0) + e.paid_minutes / 60))
  return out
}

/** Takings for each hour worked, day of the week by day of the week (staff hours from the timecards). */
export function takingsPerStaffHour(days: SalesDay[], entries: Pick<TimeEntry, 'work_date' | 'paid_minutes'>[]) {
  return DAY_KEYS.map(day => {
    const dates = new Set(entries.filter(e => dayKey(e.work_date) === day).map(e => e.work_date))
    const hours = entries.filter(e => dates.has(e.work_date)).reduce((s, e) => s + e.paid_minutes / 60, 0)
    const takings = days.filter(d => dates.has(d.date)).reduce((s, d) => s + d.gross, 0)
    return { day, hours: round(hours, 1), takings: round(takings), perHour: hours ? round(takings / hours) : null }
  })
}

/**
 * What came through the till while each person was clocked in, shared between everyone on at the
 * time, for each hour they worked. Busier hours aren't only down to the person: it compares shifts.
 */
export function takingsWhileOn(days: SalesDay[], entries: Pick<TimeEntry, 'profile_id' | 'clock_in' | 'clock_out' | 'work_date' | 'paid_minutes'>[]) {
  const byDate = new Map(days.map(d => [d.date, d]))
  // Who's on each hour of each day.
  const on = new Map<string, string[]>()
  const spans = entries.filter(e => e.clock_out).map(e => {
    const from = localTime(e.clock_in), to = localTime(e.clock_out!)
    const date = localDate(e.clock_in)
    const hours: number[] = []
    for (let h = hourOf(from); h <= hourOf(to) && h < 24; h++) {
      // Counted when on for at least half of the hour.
      const start = Math.max(h * 60, hourOf(from) * 60 + Number(from.slice(3))), end = Math.min((h + 1) * 60, hourOf(to) * 60 + Number(to.slice(3)))
      if (end - start >= 30) hours.push(h)
    }
    for (const h of hours) on.set(`${date}|${h}`, [...(on.get(`${date}|${h}`) ?? []), e.profile_id])
    return { e, date, hours }
  })
  const out = new Map<string, { takings: number; hours: number }>()
  for (const { e, date, hours } of spans) {
    const day = byDate.get(date)
    if (!day?.hours) continue
    const row = out.get(e.profile_id) ?? { takings: 0, hours: 0 }
    for (const h of hours) row.takings += (day.hours[h] ?? 0) / (on.get(`${date}|${h}`)?.length ?? 1)
    row.hours += e.paid_minutes / 60
    out.set(e.profile_id, row)
  }
  return new Map([...out].map(([id, r]) => [id, { takings: round(r.takings), hours: round(r.hours, 1), perHour: r.hours ? round(r.takings / r.hours) : null }]))
}

/** Times each person clocked in more than `grace` minutes after their shift started (the shift they clocked in for). */
export function lateStarts(entries: Pick<TimeEntry, 'profile_id' | 'shift_id' | 'clock_in'>[], shifts: Pick<Shift, 'id' | 'starts_at'>[], grace = 5) {
  const starts = new Map(shifts.map(s => [s.id, Date.parse(s.starts_at)]))
  const out = new Map<string, number>()
  for (const e of entries) {
    const start = e.shift_id ? starts.get(e.shift_id) : undefined
    if (start !== undefined && Date.parse(e.clock_in) - start > grace * 60_000) out.set(e.profile_id, (out.get(e.profile_id) ?? 0) + 1)
  }
  return out
}

// ---------------- Advice ----------------

export type AdviceArea = 'hours' | 'sales' | 'menu' | 'team' | 'stock' | 'reviews'
export const ADVICE_AREAS: { id: AdviceArea; label: string; hint: string }[] = [
  { id: 'hours', label: msg('Opening hours'), hint: msg('When to open and close, from what each hour takes') },
  { id: 'sales', label: msg('Sales patterns'), hint: msg('How takings are moving, and when they come in') },
  { id: 'menu', label: msg('The menu'), hint: msg('What sells, what doesn’t, and what it makes') },
  { id: 'team', label: msg('The team'), hint: msg('Staffing against takings, and how shifts go') },
  { id: 'stock', label: msg('Stock and waste'), hint: msg('What’s thrown away and what’s running low') },
  { id: 'reviews', label: msg('Reviews'), hint: msg('What customers say on Google') },
]

export interface Advice {
  id: string
  area: AdviceArea
  /** good: keep it up; warn: worth acting on; info: worth knowing. */
  tone: 'good' | 'warn' | 'info'
  title: string
  text: string
  vars?: Record<string, string | number>
  /** The page to act on it. */
  to?: string
  /** How much it matters (bigger first). */
  weight: number
}

/** How figures read in the advice, in the person's language and number style. */
export interface AdviceFormat {
  money: (n: number) => string
  /** A day of the week, in the plural ("Mondays"). */
  days: (d: DayKey) => string
  /** A list in words ("Mondays, Tuesdays and Fridays"). */
  list: (items: string[]) => string
  hour: (h: number) => string
}

export interface AdviceInput {
  today: string
  /** Takings day by day over the last eight weeks or so (null: no till, or no pay access). */
  sales: SalesDay[] | null
  openingHours: OpeningHours | null
  /** Best sellers over the last four weeks (null: the till doesn't say). */
  items: SalesItem[] | null
  /** Menu items with their margin (Menu costing): price and margin known, the aim, and the price that would reach it. */
  menu: { name: string; marginPct: number; target: number; priceForTarget: number | null }[] | null
  /** Menu items against the area (Competitors): yours and the average nearby. */
  vsArea: { name: string; ours: number; avg: number; n: number }[] | null
  /** The last four weeks' timecards and rota, and who's who. */
  entries: TimeEntry[] | null
  shifts: Shift[] | null
  names: Map<string, string>
  /** What the team cost over the same four weeks (pay access), or null. */
  teamCost: number | null
  /** Waste over the four weeks: its cost, against deliveries, and the worst. */
  waste: { cost: number; ofPurchases: number | null; top: { name: string; cost: number }[] } | null
  lowStock: string[] | null
  reviews: { rating: number | null; count: number | null; lastMonth: number; low: number; unreplied: number } | null
}

// Thresholds: a quiet hour takes under 40% of a usual hour that day, a busy one 130% or more; a weak
// day under 60% of the best day's takings. A café's team usually costs 25–35% of takings.
const QUIET = 0.4, BUSY = 1.3, WEAK_DAY = 0.6, LABOUR_HIGH = 0.35, LABOUR_GOOD = 0.28

/** What the figures say, most important first. Each finding only when there's enough to go on. */
export function advise(input: AdviceInput, f: AdviceFormat): Advice[] {
  const out: Advice[] = []
  const add = (a: Advice) => out.push(a)
  const t0 = input.today
  const sales = input.sales ?? []
  const last4 = between(sales, addDays(t0, -27), t0), prev4 = between(sales, addDays(t0, -55), addDays(t0, -28))
  const traded = sales.filter(d => d.gross > 0)

  // Opening hours: the first and last hour open, day of the week by day of the week.
  if (traded.length >= 14 && input.openingHours) {
    const edges = edgeHours(sales, input.openingHours).filter(e => e.days >= 2 && e.perHour > 0)
    const quietOpen = edges.filter(e => e.first / e.perHour < QUIET)
    const quietClose = edges.filter(e => e.last / e.perHour < QUIET)
    const busyOpen = edges.filter(e => e.first / e.perHour >= BUSY)
    const busyClose = edges.filter(e => e.last / e.perHour >= BUSY)
    const avg = (list: EdgeHours[], k: 'first' | 'last') => list.reduce((s, e) => s + e[k], 0) / list.length
    const share = (list: EdgeHours[], k: 'first' | 'last') => Math.round(list.reduce((s, e) => s + e[k] / e.perHour, 0) / list.length * 100)
    if (quietOpen.length) add({ id: 'quiet-open', area: 'hours', tone: 'warn', weight: 80 + quietOpen.length, to: '/opening-hours',
      title: msg('Opening an hour later could pay'),
      text: msg('On {days} the first hour open takes {money} on average, {pct}% of a usual hour. Opening an hour later saves an hour of staff (and of lights and the machine) each of those days.'),
      vars: { days: f.list(quietOpen.map(e => f.days(e.day))), money: f.money(avg(quietOpen, 'first')), pct: share(quietOpen, 'first') } })
    if (quietClose.length) add({ id: 'quiet-close', area: 'hours', tone: 'warn', weight: 79 + quietClose.length, to: '/opening-hours',
      title: msg('Closing an hour earlier could pay'),
      text: msg('On {days} the last hour open takes {money} on average, {pct}% of a usual hour. Closing an hour earlier those days costs little in takings and saves an hour of staff.'),
      vars: { days: f.list(quietClose.map(e => f.days(e.day))), money: f.money(avg(quietClose, 'last')), pct: share(quietClose, 'last') } })
    if (busyOpen.length) add({ id: 'busy-open', area: 'hours', tone: 'info', weight: 60 + busyOpen.length, to: '/opening-hours',
      title: msg('Busy from the moment you open'),
      text: msg('On {days} the first hour takes {pct}% of a usual hour: people are waiting for you. Opening half an hour earlier could catch the ones going elsewhere.'),
      vars: { days: f.list(busyOpen.map(e => f.days(e.day))), pct: share(busyOpen, 'first') } })
    if (busyClose.length) add({ id: 'busy-close', area: 'hours', tone: 'info', weight: 59 + busyClose.length, to: '/opening-hours',
      title: msg('Still busy at closing time'),
      text: msg('On {days} the last hour takes {pct}% of a usual hour. Staying open a little later could be worth trying.'),
      vars: { days: f.list(busyClose.map(e => f.days(e.day))), pct: share(busyClose, 'last') } })
  }

  // Sales patterns.
  if (traded.length >= 14) {
    const week = weekdayAverages(sales).filter(w => w.days >= 2)
    const best = [...week].sort((a, b) => b.average - a.average)[0]
    const weak = week.filter(w => best && w.average < best.average * WEAK_DAY)
    if (best && weak.length) add({ id: 'weak-days', area: 'sales', tone: 'warn', weight: 70, to: '/sales',
      title: msg('Some days take much less'),
      text: msg('{days} take {money} on average, against {best} on {bestDays}. A reason to come in on those days (a loyalty bonus, a breakfast deal, a local event) or shorter hours could help.'),
      vars: { days: f.list(weak.map(w => f.days(w.day))), money: f.money(weak.reduce((s, w) => s + w.average, 0) / weak.length), best: f.money(best.average), bestDays: f.days(best.day) } })
    const hours = hourTotals(last4.length ? last4 : sales)
    const total = hours.reduce((s, v) => s + v, 0)
    if (total > 0) {
      const top = hours.map((v, h) => ({ h, v })).sort((a, b) => b.v - a.v).slice(0, 3).sort((a, b) => a.h - b.h)
      add({ id: 'peak-hours', area: 'sales', tone: 'info', weight: 50, to: '/rota',
        title: msg('When the takings come in'),
        text: msg('{pct}% of the day’s takings come in three hours: {hours}. Have the most people on then, and do the prep and cleaning outside them.'),
        vars: { pct: Math.round(top.reduce((s, x) => s + x.v, 0) / total * 100), hours: f.list(top.map(x => f.hour(x.h))) } })
    }
  }
  if (last4.length >= 14 && prev4.length >= 14) {
    const now = salesTotals(last4), before = salesTotals(prev4)
    const c = change(now.gross, before.gross)
    if (c !== null) add({ id: 'trend', area: 'sales', tone: c >= 0.05 ? 'good' : c <= -0.05 ? 'warn' : 'info', weight: c <= -0.05 ? 75 : 55, to: '/sales',
      title: c >= 0.05 ? msg('Takings are growing') : c <= -0.05 ? msg('Takings are down') : msg('Takings are steady'),
      text: msg('The last four weeks took {now}, {pct} on the four weeks before ({before}).'),
      vars: { now: f.money(now.gross), before: f.money(before.gross), pct: `${c >= 0 ? '+' : '−'}${Math.abs(Math.round(c * 100))}%` } })
    const a = change(now.average, before.average)
    if (a !== null && a <= -0.05) add({ id: 'ticket-down', area: 'sales', tone: 'warn', weight: 65, to: '/sales',
      title: msg('People are spending less each time'),
      text: msg('The average sale fell from {before} to {now}. Offer something with the coffee (a pastry, a bigger size): one in five saying yes puts it back.'),
      vars: { now: f.money(now.average), before: f.money(before.average) } })
    else if (a !== null && a >= 0.05) add({ id: 'ticket-up', area: 'sales', tone: 'good', weight: 40, to: '/sales',
      title: msg('People are spending more each time'),
      text: msg('The average sale went up from {before} to {now}. Whatever the team is suggesting at the till, keep it up.'),
      vars: { now: f.money(now.average), before: f.money(before.average) } })
  }

  // The menu: what sells, what doesn't, what it makes.
  const items = (input.items ?? []).filter(i => i.quantity > 0)
  if (items.length >= 4) {
    const total = items.reduce((s, i) => s + i.gross, 0)
    const top = [...items].sort((a, b) => b.gross - a.gross).slice(0, 3)
    add({ id: 'stars', area: 'menu', tone: 'good', weight: 45, to: '/sales',
      title: msg('Your best sellers'),
      text: msg('{items} bring in {pct}% of what the menu sells. Never run out of what goes in them, and put them where people see them first.'),
      vars: { items: f.list(top.map(i => i.name)), pct: Math.round(top.reduce((s, i) => s + i.gross, 0) / total * 100) } })
    const slow = items.filter(i => i.quantity < 28 / 7 * 2 && i.gross / total < 0.02)
    if (slow.length) add({ id: 'slow', area: 'menu', tone: 'warn', weight: 58, to: '/recipes',
      title: msg('Slow sellers'),
      text: msg('{items} sold fewer than two a week in the last four weeks. Drop them or swap them for something new: a shorter menu is quicker to make and wastes less.'),
      vars: { items: f.list(slow.map(i => i.name)) } })
  }
  const below = (input.menu ?? []).filter(m => m.marginPct < m.target).sort((a, b) => a.marginPct - b.marginPct)
  if (below.length) {
    const sellers = new Set(items.slice().sort((a, b) => b.gross - a.gross).slice(0, 5).map(i => i.name.toLowerCase()))
    const worst = below[0]
    const star = below.find(m => sellers.has(m.name.toLowerCase()))
    add({ id: 'margins', area: 'menu', tone: 'warn', weight: star ? 78 : 62, to: '/recipes',
      title: star ? msg('A best seller makes too little') : msg('Some prices don’t reach your margin'),
      text: star
        ? msg('{name} is one of your best sellers but makes {pct}% (you aim for {target}%). At {price} it would get there; on what it sells, that adds up fast.')
        : below.length === 1
          ? msg('{name} makes {pct}%, less than the {target}% you aim for: at {price} it would get there.')
          : msg('{n} menu items make less than you aim for. {name} is lowest at {pct}% (aim {target}%): at {price} it would get there.'),
      vars: { name: (star ?? worst).name, pct: Math.round((star ?? worst).marginPct), target: (star ?? worst).target, n: below.length,
        price: (star ?? worst).priceForTarget !== null ? f.money((star ?? worst).priceForTarget!) : '—' } })
  }
  const cheap = (input.vsArea ?? []).filter(x => x.n >= 2 && x.ours < x.avg * 0.9).sort((a, b) => a.ours / a.avg - b.ours / b.avg)
  if (cheap.length) add({ id: 'room-to-raise', area: 'menu', tone: 'info', weight: 52, to: '/competitors',
    title: msg('Room to raise a price'),
    text: msg('Your {name} is {ours}; the cafés around you charge {avg} on average. You could charge more and still be good value.'),
    vars: { name: cheap[0].name, ours: f.money(cheap[0].ours), avg: f.money(cheap[0].avg) } })

  // The team: staffing against takings, and how shifts go.
  const entries = (input.entries ?? []).filter(e => e.work_date >= addDays(t0, -27))
  if (entries.length && last4.length >= 7) {
    const perDay = takingsPerStaffHour(last4, entries).filter(d => d.perHour !== null && d.hours >= 4)
    if (perDay.length >= 3) {
      const sorted = [...perDay].sort((a, b) => a.perHour! - b.perHour!)
      const low = sorted[0], high = sorted[sorted.length - 1]
      if (low.perHour! < high.perHour! * 0.7) add({ id: 'staffing', area: 'team', tone: 'warn', weight: 72, to: '/rota',
        title: msg('More staff than takings on some days'),
        text: msg('On {low} each hour worked brings in {lowMoney}, against {highMoney} on {high}. One person fewer on {low}, or moved to {high}, would even it out.'),
        vars: { low: f.days(low.day), high: f.days(high.day), lowMoney: f.money(low.perHour!), highMoney: f.money(high.perHour!) } })
    }
    const hours = entries.reduce((s, e) => s + e.paid_minutes / 60, 0)
    const takings = salesTotals(last4).gross
    if (input.teamCost !== null && takings > 0) {
      const share = input.teamCost / takings
      add({ id: 'labour', area: 'team', tone: share > LABOUR_HIGH ? 'warn' : share <= LABOUR_GOOD ? 'good' : 'info', weight: share > LABOUR_HIGH ? 74 : 44, to: '/timecards',
        title: share > LABOUR_HIGH ? msg('The team costs a lot against takings') : msg('What the team costs against takings'),
        text: msg('Over the last four weeks the team cost {cost}, {pct}% of takings ({hours} hours worked). Cafés usually aim for 25–35%.'),
        vars: { cost: f.money(input.teamCost), pct: Math.round(share * 100), hours: Math.round(hours) } })
    }
    const people = [...takingsWhileOn(last4, entries)].filter(([, r]) => r.hours >= 8 && r.perHour !== null).sort((a, b) => b[1].perHour! - a[1].perHour!)
    if (people.length >= 2) add({ id: 'people', area: 'team', tone: 'info', weight: 48, to: '/timecards',
      title: msg('Takings while each person is on'),
      text: msg('Each hour {best} works brings in {bestMoney} (the most); {last}’s bring in {lastMoney}. Busier times count for a lot: use it to plan who works the peaks, not to judge.'),
      vars: { best: input.names.get(people[0][0]) ?? '—', bestMoney: f.money(people[0][1].perHour!), last: input.names.get(people.at(-1)![0]) ?? '—',
        lastMoney: f.money(people.at(-1)![1].perHour!) } })
  }
  if (entries.length && input.shifts) {
    const late = [...lateStarts(entries, input.shifts)].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])
    if (late.length) add({ id: 'late', area: 'team', tone: 'warn', weight: 56, to: '/timecards',
      title: msg('Late starts'),
      text: msg('{people} clocked in more than 5 minutes after their shift started 3 times or more in the last four weeks. Worth a word, and checking the rota suits them.'),
      vars: { people: f.list(late.map(([id, n]) => `${input.names.get(id) ?? '—'} (${n})`)) } })
    const forgot = new Map<string, number>()
    for (const e of entries) if (e.flags.includes('auto_clock_out')) forgot.set(e.profile_id, (forgot.get(e.profile_id) ?? 0) + 1)
    const often = [...forgot].filter(([, n]) => n >= 2)
    if (often.length) add({ id: 'clock-out', area: 'team', tone: 'info', weight: 42, to: '/timecards',
      title: msg('Forgetting to clock out'),
      text: msg('{people} forgot to clock out twice or more, so their timecards were closed by the app. A reminder at closing time saves fixing them later.'),
      vars: { people: f.list(often.map(([id]) => input.names.get(id) ?? '—')) } })
  }

  // Stock and waste.
  if (input.waste && input.waste.cost > 0) {
    const w = input.waste
    const high = w.ofPurchases !== null && w.ofPurchases > 4
    add({ id: 'waste', area: 'stock', tone: high ? 'warn' : 'info', weight: high ? 66 : 38, to: '/waste',
      title: high ? msg('Waste is high') : msg('What’s thrown away'),
      text: w.top.length
        ? msg('Waste cost {cost} in the last four weeks{share}, most of it {item} ({itemCost}). Order it in smaller batches or more often.')
        : msg('Waste cost {cost} in the last four weeks{share}.'),
      vars: { cost: f.money(w.cost), share: w.ofPurchases !== null ? ` (${w.ofPurchases}%)` : '', item: w.top[0]?.name ?? '', itemCost: f.money(w.top[0]?.cost ?? 0) } })
  }
  if (input.lowStock?.length) add({ id: 'low-stock', area: 'stock', tone: 'warn', weight: 54, to: '/stock',
    title: msg('Running low'),
    text: msg('{items} are at or below their reorder level. The order list has them by supplier, ready to send.'),
    vars: { items: f.list(input.lowStock.slice(0, 5)) + (input.lowStock.length > 5 ? ` (+${input.lowStock.length - 5})` : '') } })

  // Reviews.
  if (input.reviews) {
    const r = input.reviews
    if (r.unreplied > 0) add({ id: 'unreplied', area: 'reviews', tone: 'warn', weight: 57, to: '/reviews',
      title: msg('Reviews waiting for a reply'),
      text: r.unreplied === 1
        ? msg('A Google review has no reply. A short, warm reply (thanks, and something about their visit) is seen by everyone who reads it.')
        : msg('{n} Google reviews have no reply. A short, warm reply (thanks, and something about their visit) is seen by everyone who reads them.'),
      vars: { n: r.unreplied } })
    if (r.low > 0) add({ id: 'low-reviews', area: 'reviews', tone: 'warn', weight: 63, to: '/reviews',
      title: msg('Low ratings lately'),
      text: r.low === 1
        ? msg('A review of 3 stars or fewer in the last month. Read what it says and reply: is it something that happens often?')
        : msg('{n} reviews of 3 stars or fewer in the last month. Read what they have in common: slow service, a cold drink, the price?'),
      vars: { n: r.low } })
    else if (r.rating !== null && r.rating >= 4.5) add({ id: 'rating', area: 'reviews', tone: 'good', weight: 30, to: '/reviews',
      title: msg('Customers love it'),
      text: msg('{rating}★ on Google from {count} reviews. Ask happy regulars for a review: a card by the till with a QR code does it.'),
      vars: { rating: r.rating.toFixed(1), count: r.count ?? 0 } })
  }
  return out.sort((a, b) => b.weight - a.weight)
}
