// Scheduled reports (Dashboards → Reports): each minute, the schedules that are due (shared/reports.ts
// dueNow, in the business's time) are written out the same way the page writes a report
// (shared/reportSections.ts), from what the person who last changed the schedule can see, in its
// language, and emailed from the business's connected Gmail or Outlook, one email to each person. Each
// time is claimed before it's sent, so two runs in the same minute send it once; what went wrong is
// kept on the schedule for the page to show.
import type { SupabaseClient } from '@supabase/supabase-js'
import { es as spanishDates } from 'date-fns/locale/es'
import type { Env } from './supabase'
import { businessDb } from './supabase'
import { readBestSellers, readTakings, sendEmail } from './integrations'
import { planFeatures } from './billing'
import { dailyCosts, payrollRates } from '../shared/dailyCost'
import { REPORT_PERIODS, dueNow, reportInfo, reportRange, type ReportKind, type ReportSchedule } from '../shared/reports'
import { datesText, reportMail, reportSections, type Formats, type Say } from '../shared/reportSections'
import { unitLabel, type StockItem, type StockMovement } from '../shared/stock'
import type { FreshBatch } from '../shared/freshBatches'
import type { Expense, PayRate, Profile, Shift, TimeEntry, Todo } from '../shared/types'
import { TZ, addDays, formatLocal, formatMoney, formatNumber, localDate, setDateLocale, zonedIso } from '../shared/time'
import spanish from '../src/i18n/es/reports'

const es = spanish as Record<string, string>
const fill = (text: string, vars: Record<string, string | number> = {}) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))

/** Saying things in the schedule's language (the reports' Spanish, src/i18n/es/reports.ts). */
export function sayIn(language: 'en' | 'es'): Say {
  const word = (text: string) => (language === 'es' && es[text]) || text
  return {
    t: (text, vars) => fill(word(text), vars),
    tn: (n, one, many, vars) => fill(word(n === 1 ? one : many), { n: formatNumber(n), ...vars }),
  }
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

/** Send the business's schedules that are due now; how many went. */
export async function sendDueReports(env: Env, businessId: number, now = Date.now()) {
  const db = businessDb(env, businessId)
  const { data: rows, error } = await db.from('report_schedules').select('*').eq('active', true)
  if (error) throw new Error(error.message)
  if (!rows?.length) return 0
  const { data: biz } = await db.from('business').select('name, timezone, opening_hours').single()
  const tz = (biz?.timezone as string | null) ?? TZ
  let sent = 0
  for (const row of rows as ReportSchedule[]) {
    const s: ReportSchedule = { ...row, send_at: row.send_at.slice(0, 5) }
    const at = dueNow(s, now, tz)
    if (!at) continue
    // Claimed for this time first, only if nobody has since (a second run in the same minute finds it taken).
    const claim = db.from('report_schedules').update({ last_sent_at: at }).eq('id', s.id)
    const { data: claimed } = await (row.last_sent_at === null ? claim.is('last_sent_at', null) : claim.eq('last_sent_at', row.last_sent_at)).select('id')
    if (!claimed?.length) continue
    try {
      const failed = await sendSchedule(env, db, businessId, s, { name: biz?.name ?? 'Business Agent', tz, openingHours: biz?.opening_hours ?? null }, now)
      await db.from('report_schedules').update({ last_error: failed }).eq('id', s.id)
      sent++
    } catch (e) {
      await db.from('report_schedules').update({ last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500) }).eq('id', s.id)
    }
  }
  return sent
}

/** Write one schedule's report and email it to each person; what didn't go (null: everyone got it). */
export async function sendSchedule(env: Env, db: SupabaseClient, businessId: number, s: ReportSchedule,
  biz: { name: string; tz: string; openingHours: Record<string, unknown> | null }, now = Date.now()): Promise<string | null> {
  // Its figures are what whoever last changed it can see.
  const { data: sender } = await db.from('profiles').select('id, full_name, role, can_see_pay, active').eq('id', s.updated_by ?? '').maybeSingle()
  if (!sender || !sender.active || sender.role !== 'admin') throw new Error('Whoever last changed this schedule is no longer an admin. Save it again to send it as you.')
  const pay = !!sender.can_see_pay
  const takings = pay && (await planFeatures(env, businessId)).has('takings')
  const kinds = s.kinds.filter(k => reportInfo(k).needs.every(n => (n === 'sales' ? takings : n === 'pay' ? pay : true)))
  if (!kinds.length) throw new Error('None of its reports can be sent by whoever last changed it.')

  // Who gets it: the team's and the contacts' addresses as they are now (contacts only for owners), and the others.
  const { data: people } = await db.from('profiles').select('id, full_name, email, role, active, can_see_pay')
  const team = (people ?? []) as Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'active' | 'can_see_pay'>[]
  const { data: contacts } = pay && s.contacts.length ? await db.from('business_contacts').select('id, email').in('id', s.contacts) : { data: [] }
  const to = [...new Set([
    ...team.filter(p => s.team.includes(p.id) && p.active && p.email).map(p => p.email!.toLowerCase()),
    ...((contacts ?? []) as { id: string; email: string | null }[]).filter(c => c.email).map(c => c.email!.toLowerCase()),
    ...s.emails,
  ])]
  if (!to.length) throw new Error('Nobody it goes to has an email address now.')

  const day = localDate(new Date(now), biz.tz)
  const range = reportRange(s.period, day)
  const until = range.to > day ? day : range.to
  const has = (k: ReportKind) => kinds.includes(k)
  const iso = (d: string) => zonedIso(d, '00:00', biz.tz)
  const rows = async <T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data ?? []) as T[]
  }

  const [sales, items, settings, payRates, expenses, shifts, entries, stock, suppliers, moves, fresh, todos] = await Promise.all([
    has('takings') ? readTakings(env, db, range.prevFrom, range.to, biz.tz) : null,
    has('best_sellers') ? readBestSellers(env, db, range.from, range.to, biz.tz) : null,
    db.from('settings').select('employer_cost_multiplier, owner_pay').maybeSingle().then(r => r.data as { employer_cost_multiplier: number | null; owner_pay: boolean | null } | null),
    pay ? rows<PayRate>(db.from('pay_rates').select('profile_id, effective_from, hourly_rate')) : [],
    has('takings') ? rows<Expense>(db.from('expenses').select('*')) : [],
    has('takings') ? rows<Shift>(db.from('shifts').select('*').gte('starts_at', iso(range.from)).lt('starts_at', iso(addDays(until, 1)))) : [],
    has('team') ? rows<TimeEntry>(db.from('time_entry_totals').select('*').gte('clock_in', iso(range.from)).lt('clock_in', iso(addDays(range.to, 1)))) : null,
    has('stock') || has('waste') ? rows<StockItem>(db.from('stock_items').select('*')) : null,
    has('stock') ? rows<{ id: string; name: string }>(db.from('suppliers').select('id, name')) : null,
    has('waste') ? rows<StockMovement>(db.from('stock_movements').select('*').eq('reason', 'waste').gte('at', iso(range.from)).lt('at', iso(addDays(range.to, 1)))) : null,
    has('fresh') ? rows<FreshBatch>(db.from('fresh_batches').select('*').gte('made_at', iso(range.from)).lt('made_at', iso(addDays(range.to, 1)))) : null,
    has('jobs') ? rows<Todo>(db.from('todos').select('id, title, assignee_id, done, status, done_at, starred, pinned, position')) : null,
  ])
  // The latest pay rate each person has: breakeven counts everyone at theirs; the team's cost leaves owners out when owner pay is off.
  const rates = new Map<string, number>()
  for (const r of [...payRates].sort((a, b) => a.effective_from.localeCompare(b.effective_from))) rates.set(r.profile_id, Number(r.hourly_rate))
  const multiplier = Number(settings?.employer_cost_multiplier ?? 1)
  const costs = has('takings') && pay
    ? dailyCosts(range.from, until, { expenses: expenses.map(e => ({ ...e, amount: Number(e.amount) })), shifts, rates, multiplier, openingHours: biz.openingHours as never })
    : null

  const say = sayIn(s.language)
  const f: Formats = {
    money: formatMoney, number: formatNumber, when: iso => formatLocal(iso, 'EEE d MMM HH:mm', biz.tz), unit: u => say.t(unitLabel(u)), date: iso => localDate(iso, biz.tz),
  }
  // Dates in the schedule's language while it's written (put back straight after; nothing waits in between).
  setDateLocale(s.language === 'es' ? spanishDates : undefined)
  let mail: { subject: string; text: string }
  try {
    const sections = reportSections(kinds, {
      range, until, sales, costs, items, entries,
      rates: pay ? payrollRates(rates, team, settings?.owner_pay !== false) : null,
      multiplier,
      stock: stock?.map(i => ({ ...i, on_hand: Number(i.on_hand), reorder_at: num(i.reorder_at), cost_per_unit: num(i.cost_per_unit) })) ?? null,
      suppliers, moves: moves?.map(m => ({ ...m, change: Number(m.change) })) ?? null,
      fresh: fresh?.map(b => ({ ...b, quantity: num(b.quantity) })) ?? null, todos,
      name: id => team.find(p => p.id === id)?.full_name ?? '—', canSeeFinances: pay,
    }, say, f)
    mail = reportMail({ business: biz.name, period: say.t(REPORT_PERIODS.find(p => p.id === s.period)!.label), dates: datesText(range, (i, p) => formatLocal(i, p, biz.tz)),
      sender: sender.full_name, sections, schedule: s.name }, say)
  } finally {
    setDateLocale(undefined)
  }

  const failed: string[] = []
  for (const address of to) {
    try {
      await sendEmail(env, db, { to: address, subject: mail.subject, text: mail.text })
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e)
      // No mailbox (or its access gone): nobody gets it this time.
      if (/No mailbox connected/.test(why)) throw new Error(why)
      failed.push(`${address}: ${why}`)
    }
  }
  return failed.length ? `Not sent to ${failed.join('; ')}`.slice(0, 500) : null
}
