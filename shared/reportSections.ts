// The words of each report (Dashboards → Reports), from the figures: the same for a report sent now from
// the page (src/pages/ReportsTab.tsx, with what the page has loaded) and for one sent on a schedule by
// the Worker (worker/reportSchedules.ts, with what it reads itself). The caller passes its own way of
// saying things (`t`/`tn`, in the page's or the schedule's language) and of writing money and dates.
import type { DashRange } from './dashboards'
import type { DayCost } from './dailyCost'
import type { FreshBatch } from './freshBatches'
import { between, change, hoursByPerson, salesTotals } from './insights'
import { reportEmail, reportInfo, type ReportKind, type ReportSection } from './reports'
import { isLow, type StockItem, type StockMovement, type StockUnit, type Supplier } from './stock'
import { topJobs } from './todayGlance'
import type { SalesDay, SalesItems, TimeEntry, Todo } from './types'

export interface Say {
  t: (text: string, vars?: Record<string, string | number>) => string
  tn: (n: number, one: string, many: string, vars?: Record<string, string | number>) => string
}
export interface Formats {
  money: (n: number) => string
  number: (n: number) => string
  /** A time something happened: "Wed 30 Sep 09:40". */
  when: (iso: string) => string
  /** A stock unit, said: "bottles", "kg". */
  unit: (u: StockUnit) => string
  /** The business's date of a moment (YYYY-MM-DD). */
  date: (iso: string) => string
}

/** What the reports are written from; what's missing (null or undefined) wasn't read, and its report says why when it can. */
export interface ReportData {
  range: DashRange
  /** The last day with figures: today when the period runs past it. */
  until: string
  /** The till's takings over the period and the one before; an error when it couldn't be read; null: no till, or not for this person. */
  sales?: { days: SalesDay[] } | { error: string } | null
  costs?: DayCost[] | null
  items?: SalesItems | { error: string } | null
  entries?: TimeEntry[] | null
  /** Pay rates for the team's cost (owners at nothing when owner pay is off); none: no cost shown. */
  rates?: Map<string, number> | null
  multiplier?: number
  stock?: StockItem[] | null
  suppliers?: Pick<Supplier, 'id' | 'name'>[] | null
  moves?: StockMovement[] | null
  fresh?: FreshBatch[] | null
  todos?: Todo[] | null
  name: (profileId: string | null) => string
  canSeeFinances: boolean
}

/** Each report picked, under its heading, in the email's order; a report with nothing to say is left out. */
export function reportSections(kinds: ReportKind[], d: ReportData, say: Say, f: Formats): ReportSection[] {
  const { t, tn } = say
  const r = d.range
  const out: ReportSection[] = []
  const qty = (n: number, u: StockUnit) => `${f.number(n)} ${f.unit(u)}`
  const inRange = (iso: string) => f.date(iso) >= r.from && f.date(iso) <= r.to
  const order: ReportKind[] = ['takings', 'best_sellers', 'team', 'stock', 'waste', 'fresh', 'jobs']
  for (const k of order.filter(x => kinds.includes(x))) {
    const lines: string[] = []
    if (k === 'takings') {
      if (!d.sales) lines.push(t('Connect Square, SumUp or Stripe to see takings here.'))
      else if ('error' in d.sales) lines.push(d.sales.error)
      else {
        const days = d.sales.days
        const now = salesTotals(between(days, r.from, d.until)), before = salesTotals(between(days, r.prevFrom, r.prevTo))
        const c = change(now.gross, before.gross)
        const pct = c === null ? null : Math.round(Math.abs(c) * 100)
        lines.push(t('Takings: {money}', { money: f.money(now.gross) }) + (pct === null ? ''
          : `, ${pct === 0 ? t('the same as the period before') : (c ?? 0) > 0 ? t('{pct}% up on the period before ({money})', { pct, money: f.money(before.gross) })
            : t('{pct}% down on the period before ({money})', { pct, money: f.money(before.gross) })}`))
        if (now.payments) lines.push(t('{n} payments, {money} on average', { n: f.number(now.payments), money: f.money(now.average) }))
        if (now.refunds) lines.push(t('{money} refunded', { money: f.money(now.refunds) }))
        const open = (d.costs ?? []).filter(x => x.open)
        const cost = open.reduce((a, x) => a + x.total, 0)
        if (cost > 0) {
          const taken = between(days, r.from, d.until)
          const gap = taken.filter(x => open.some(o => o.date === x.date)).reduce((a, x) => a + x.gross, 0) - cost
          lines.push(t('Breakeven: {money} to run the business over {n} open days', { money: f.money(cost), n: open.length }))
          lines.push(gap >= 0 ? t('{money} over breakeven', { money: f.money(gap) }) : t('{money} short of breakeven', { money: f.money(-gap) }))
          const above = open.filter(o => (taken.find(x => x.date === o.date)?.gross ?? 0) > o.total).length
          lines.push(t('{above} of {days} open days took more than they cost', { above, days: open.length }))
        }
      }
    }
    if (k === 'best_sellers') {
      if (!d.items) lines.push(t('Connect Square, SumUp or Stripe to see takings here.'))
      else if ('error' in d.items) lines.push(d.items.error)
      else if (!d.items.items) lines.push(t('Best sellers come from Square: Stripe and SumUp send payments only.'))
      else {
        const top = [...d.items.items].sort((a, b) => b.gross - a.gross).slice(0, 5)
        if (!top.length) lines.push(t('Nothing sold yet.'))
        top.forEach((i, n) => lines.push(t('{n}. {name}: {money} ({sold} sold)', { n: n + 1, name: i.name, money: f.money(i.gross), sold: f.number(i.quantity) })))
      }
    }
    if (k === 'team' && d.entries) {
      const by = [...hoursByPerson(d.entries)].sort((a, b) => b[1] - a[1])
      if (!by.length) lines.push(t('No timecards in this period yet.'))
      else {
        lines.push(t('{hours} hours worked in all', { hours: f.number(Math.round(by.reduce((a, [, h]) => a + h, 0) * 10) / 10) }))
        if (d.canSeeFinances && d.rates) {
          const cost = d.entries.reduce((a, e) => a + e.paid_minutes / 60 * (d.rates!.get(e.profile_id) ?? 0), 0) * (d.multiplier ?? 1)
          lines.push(t('Team cost: {money}, with Social Security', { money: f.money(cost) }))
        }
        for (const [id, h] of by) lines.push(t('{name}: {hours} h', { name: d.name(id), hours: f.number(Math.round(h * 10) / 10) }))
      }
    }
    if (k === 'stock' && d.stock) {
      const low = d.stock.filter(isLow).sort((a, b) => a.name.localeCompare(b.name))
      if (!low.length) lines.push(t('Nothing is low. Nothing to order.'))
      for (const i of low) {
        const sup = d.suppliers?.find(x => x.id === i.supplier_id)?.name
        lines.push(t('{name}: {left} left (reorder at {at})', { name: i.name, left: qty(i.on_hand, i.unit), at: qty(i.reorder_at ?? 0, i.unit) }) + (sup ? ` · ${sup}` : ''))
      }
    }
    if (k === 'waste' && d.moves && d.stock) {
      const wasted = d.moves.filter(m => m.reason === 'waste' && !m.undone_at && inRange(m.at))
      const item = (id: string) => d.stock!.find(i => i.id === id)
      lines.push(tn(wasted.length, '{n} thing thrown away', '{n} things thrown away'))
      if (d.canSeeFinances && wasted.length) {
        lines.push(t('Cost: {money}', { money: f.money(wasted.reduce((a, m) => a + Math.abs(m.change) * (item(m.item_id)?.cost_per_unit ?? 0), 0)) }))
      }
      const per = new Map<string, number>()
      for (const m of wasted) per.set(m.item_id, (per.get(m.item_id) ?? 0) + Math.abs(m.change))
      for (const [id, n] of [...per].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        const i = item(id)
        if (i) lines.push(`${i.name}: ${qty(n, i.unit)}`)
      }
    }
    if (k === 'fresh' && d.fresh) {
      const made = d.fresh.filter(b => inRange(b.made_at)).sort((a, b) => b.made_at.localeCompare(a.made_at))
      lines.push(tn(made.length, '{n} batch made', '{n} batches made'))
      const sold = made.filter(b => b.cleared === 'sold').length, binned = made.filter(b => b.cleared === 'binned').length
      if (sold) lines.push(tn(sold, '{n} sold out', '{n} sold out'))
      if (binned) lines.push(tn(binned, '{n} thrown away', '{n} thrown away'))
      for (const b of made.slice(0, 8)) {
        lines.push(t('{name}, made {when}', { name: b.quantity ? `${b.name} × ${f.number(b.quantity)}` : b.name, when: f.when(b.made_at) }))
      }
    }
    if (k === 'jobs' && d.todos) {
      const open = d.todos.filter(x => !x.done)
      const done = d.todos.filter(x => x.done && x.done_at && inRange(x.done_at))
      lines.push(tn(open.length, '{n} open', '{n} open'))
      lines.push(tn(done.length, '{n} done in this period', '{n} done in this period'))
      for (const x of topJobs(d.todos, 5)) lines.push(`${x.starred ? '★ ' : ''}${x.title}${x.assignee_id ? ` (${d.name(x.assignee_id)})` : ''}`)
    }
    if (lines.length) out.push({ title: t(reportInfo(k).label), lines })
  }
  return out
}

/** "Wed 30 Sep 2026", or "28 Sep – 30 Sep 2026", with the caller's date formatting (and language). */
export const datesText = (r: Pick<DashRange, 'from' | 'to'>, format: (iso: string, pattern: string) => string) => {
  const noon = (d: string) => `${d}T12:00:00Z`
  return r.from === r.to ? format(noon(r.from), 'EEE d MMM yyyy') : `${format(noon(r.from), 'd MMM')} – ${format(noon(r.to), 'd MMM yyyy')}`
}

/**
 * The whole email: its subject, heading, the reports and who it's from; on a schedule, which one (so
 * whoever gets it knows why it came, and who to ask to stop it).
 */
export function reportMail(o: { business: string; period: string; dates: string; sender: string; sections: ReportSection[]; schedule?: string }, say: Say) {
  const { t } = say
  return reportEmail({
    ...o, from: o.sender,
    subject: t('{business} report · {period} ({dates})', { business: o.business, period: o.period, dates: o.dates }),
    heading: t('{business} · {period}: {dates}', { business: o.business, period: o.period, dates: o.dates }),
    footer: o.schedule
      ? t('Sent by The Business Agent on the schedule “{schedule}”, set up by {name}.', { schedule: o.schedule, name: o.sender })
      : t('Sent by {name} from The Business Agent.', { name: o.sender }),
  })
}
