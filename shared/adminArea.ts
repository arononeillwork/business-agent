// The admin area's sections (/admin): Today, To-do, Onboarding and Team, beside the sales board
// (shared/salesTeam.ts). What each shows is worked out here, the same for the Worker, the app and the demo.
import { msg } from './i18n'
import { addDays } from './time'
import { introStage, type IntroStage, type RepIntroduction } from './hqReps'
import { followUpDue, type Prospect, type ProspectStage } from './salesTeam'

// ---------------------------------------------------------------------------------------------
// What happened with a contact
// ---------------------------------------------------------------------------------------------
export type ActivityKind = 'added' | 'stage' | 'signed_up' | 'paid' | 'instagram' | 'whatsapp' | 'call' | 'visit' | 'email' | 'demo' | 'note'
export interface SalesActivity { id: string; prospect_id: string; kind: ActivityKind; stage: ProspectStage | null; note: string | null; at: string }

/** What can be logged by hand, in the order offered. */
export const LOGGED_KINDS: { id: ActivityKind; label: string }[] = [
  { id: 'instagram', label: msg('Instagram message') }, { id: 'whatsapp', label: 'WhatsApp' }, { id: 'call', label: msg('Call') },
  { id: 'visit', label: msg('Visit') }, { id: 'email', label: msg('Email') }, { id: 'demo', label: msg('Demo') }, { id: 'note', label: msg('Note') },
]
export const isLoggedKind = (v: unknown): v is ActivityKind => LOGGED_KINDS.some(k => k.id === v)
/** The words for a line of history that isn't a move ("Moved to …" is said where it's shown). */
export const activityLabel = (k: ActivityKind) =>
  LOGGED_KINDS.find(x => x.id === k)?.label ?? (k === 'added' ? msg('Added') : k === 'signed_up' ? msg('Signed up with a code') : k === 'paid' ? msg('First payment') : msg('Moved'))

// ---------------------------------------------------------------------------------------------
// Messages to send
// ---------------------------------------------------------------------------------------------
export interface SalesTemplate { id: string; title: string; body: string; position: number }
export interface MessageFill { business: string; me: string; code: string | null; link: string }

/** A message with {business}, {me}, {code} and {link} filled in (a code the salesperson hasn't got yet: left out). */
export function fillTemplate(body: string, f: MessageFill): string {
  return body.replace(/\{(business|me|code|link)\}/g, (_, k: keyof MessageFill) => (k === 'code' ? f.code ?? '' : f[k]))
    .replace(/\(code \)|\(código \)/g, '').replace(/[ \t]{2,}/g, ' ').trim()
}
/** Instagram's own link to a message to someone (it opens the chat; the text is pasted). */
export const instagramMessageLink = (handle: string) => `https://ig.me/m/${handle}`
/** WhatsApp to a number, with the message written in. */
export const whatsAppMessageLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
export const emailLink = (email: string, text: string) => `mailto:${email}?body=${encodeURIComponent(text)}`

// ---------------------------------------------------------------------------------------------
// To-do (HQ's own list: the app's To-do page shows the same)
// ---------------------------------------------------------------------------------------------
export interface AdminTodo {
  id: string
  title: string
  done: boolean
  done_at: string | null
  /** The day it's for (the To-do page's calendar day); none: whenever. */
  planned_on: string | null
  category_id: string | null
  /** The contact it's about, on the sales board. */
  sales_prospect_id: string | null
  /** The list's own order, dragged (the To-do page's too): lowest first. */
  position?: number
  created_at: string
}
export interface TodoCategory { id: string; name: string; colour: string }
export interface AdminTodos { todos: AdminTodo[]; categories: TodoCategory[] }
export type TodoInput = Partial<Pick<AdminTodo, 'title' | 'done' | 'planned_on' | 'category_id' | 'sales_prospect_id' | 'position'>> & { id?: string }

export type TodoGroup = 'overdue' | 'today' | 'soon' | 'later' | 'done'
export const TODO_GROUPS: { id: TodoGroup; label: string }[] = [
  { id: 'overdue', label: msg('Overdue') }, { id: 'today', label: msg('Today') }, { id: 'soon', label: msg('Coming up') },
  { id: 'later', label: msg('Whenever') }, { id: 'done', label: msg('Done') },
]
/** Where a job goes on the list: gone by, today, a day to come, no day, or done. */
export function todoGroup(t: Pick<AdminTodo, 'done' | 'planned_on'>, today: string): TodoGroup {
  if (t.done) return 'done'
  if (!t.planned_on) return 'later'
  return t.planned_on < today ? 'overdue' : t.planned_on === today ? 'today' : 'soon'
}
/** The list in its groups: in the order they were dragged into within each (the earliest day first, for those never moved), done most recent first. */
export function groupTodos(todos: AdminTodo[], today: string): Record<TodoGroup, AdminTodo[]> {
  const out = Object.fromEntries(TODO_GROUPS.map(g => [g.id, [] as AdminTodo[]])) as Record<TodoGroup, AdminTodo[]>
  for (const t of todos) out[todoGroup(t, today)].push(t)
  const byDay = (a: AdminTodo, b: AdminTodo) => (a.position ?? 0) - (b.position ?? 0) || (a.planned_on ?? '').localeCompare(b.planned_on ?? '')
    || a.created_at.localeCompare(b.created_at)
  for (const g of ['overdue', 'today', 'soon', 'later'] as const) out[g].sort(byDay)
  out.done.sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
  return out
}

/**
 * A job dragged within its group, from one place to another: it goes between its new neighbours (only
 * it is saved), or, when they're level (jobs never moved are all at 0), the group is numbered afresh in
 * its new order. What to save: each job whose place changes.
 */
export function reorderTodos(list: Pick<AdminTodo, 'id' | 'position'>[], from: number, to: number): { id: string; position: number }[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return []
  const moved = [...list]
  const [job] = moved.splice(from, 1)
  moved.splice(to, 0, job)
  const at = (i: number) => moved[i].position ?? 0
  const before = to > 0 ? at(to - 1) : null
  const after = to < moved.length - 1 ? at(to + 1) : null
  if (before === null && after !== null) return [{ id: job.id, position: after - 1 }]
  if (after === null && before !== null) return [{ id: job.id, position: before + 1 }]
  if (before !== null && after !== null && before < after) return [{ id: job.id, position: (before + after) / 2 }]
  const start = Math.min(...list.map(j => j.position ?? 0))
  return moved.map((j, i) => ({ id: j.id, position: start + i })).filter((c, i) => c.position !== (moved[i].position ?? 0))
}

/** A job as sent: its title, a day, done or not, a category and a contact; `{ error }` when something isn't right. */
export function cleanTodo(input: Record<string, unknown>, isNew: boolean): { row: Record<string, unknown> } | { error: string } {
  const row: Record<string, unknown> = {}
  const uuid = (v: unknown) => v === null || (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v))
  if ('title' in input || isNew) {
    const title = typeof input.title === 'string' ? input.title.trim().replace(/\s+/g, ' ').slice(0, 500) : ''
    if (!title) return { error: 'Say what the job is' }
    row.title = title
  }
  if ('done' in input) {
    if (typeof input.done !== 'boolean') return { error: 'Done or not' }
    row.done = input.done
  }
  if ('planned_on' in input) {
    const d = input.planned_on
    if (d !== null && d !== '' && (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d))) return { error: 'That isn’t a date' }
    row.planned_on = d || null
  }
  if ('position' in input) {
    if (typeof input.position !== 'number' || !Number.isFinite(input.position)) return { error: 'That isn’t a place in the order' }
    row.position = input.position
  }
  for (const k of ['category_id', 'sales_prospect_id'] as const) {
    if (!(k in input)) continue
    if (!uuid(input[k] ?? null)) return { error: k === 'category_id' ? 'Choose a category' : 'Choose a contact' }
    row[k] = input[k] ?? null
  }
  return { row }
}

// ---------------------------------------------------------------------------------------------
// Onboarding and the team's earnings (HQ's list of the businesses its reps brought, and its ledger)
// ---------------------------------------------------------------------------------------------
export interface HqRep { id: string; name: string; code: string; active: boolean }
export interface Earnings {
  /** Counted (approved, refunds taken off). */
  earned: number
  /** Waiting its 30 days, in case of a refund. */
  waiting: number
  /** Paid out to them. */
  paid: number
  /** Counted and not yet paid out. */
  owed: number
}
export interface HqOverview { introductions: RepIntroduction[]; reps: HqRep[]; earnings: Record<string, Earnings> }

const round2 = (n: number) => Math.round(n * 100) / 100
/** A rep's money from HQ's ledger: earn and clawback lines are what they earned (waiting until they count); payouts are what's paid. */
export function earningsOf(rewards: { rep_id: string; kind: string; status: string; amount: number | string }[], repId: string): Earnings {
  let earned = 0, waiting = 0, paid = 0
  for (const r of rewards) {
    if (r.rep_id !== repId || r.status === 'rejected') continue
    const amount = Number(r.amount)
    if (r.kind === 'earn' || r.kind === 'clawback') { if (r.status === 'pending') waiting += amount; else earned += amount }
    else if (r.kind === 'payout' && r.status === 'approved') paid -= amount
  }
  return { earned: round2(earned), waiting: round2(waiting), paid: round2(paid), owed: round2(earned - paid) }
}

/** Days from one day to another. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from.slice(0, 10)}T12:00:00Z`)) / 86_400_000)

/** What a business that signed up needs: help finishing set-up (3 days on), its payment fixed, or nothing. */
export type HelpNeeded = 'set_up' | 'payment' | null
export function helpNeeded(i: Pick<RepIntroduction, 'status' | 'plan' | 'set_up_at' | 'created_at'>, today: string): HelpNeeded {
  const stage: IntroStage = introStage(i)
  if (stage === 'behind') return 'payment'
  if (!i.set_up_at && stage !== 'cancelled' && daysBetween(i.created_at, today) >= 3) return 'set_up'
  return null
}
export const helpLabel = (h: Exclude<HelpNeeded, null>) => (h === 'set_up' ? msg('Set-up not finished') : msg('Payment failed'))

// ---------------------------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------------------------
export interface Today {
  /** Contacts whose follow-up is today or gone by. */
  followUps: Prospect[]
  /** Jobs for today or gone by, not done. */
  todos: AdminTodo[]
  /** Businesses that signed up with a code in the last 7 days. */
  newSignUps: RepIntroduction[]
  /** Businesses that need a hand: set-up not finished, or a payment that failed. */
  needHelp: RepIntroduction[]
}
export function todayList(prospects: Prospect[], todos: AdminTodo[], introductions: RepIntroduction[], today: string): Today {
  const weekAgo = addDays(today, -7)
  return {
    followUps: prospects.filter(p => followUpDue(p, today)).sort((a, b) => (a.follow_up_on ?? '').localeCompare(b.follow_up_on ?? '') || a.name.localeCompare(b.name)),
    todos: groupTodos(todos, today).overdue.concat(groupTodos(todos, today).today),
    newSignUps: introductions.filter(i => i.created_at.slice(0, 10) > weekAgo).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    needHelp: introductions.filter(i => helpNeeded(i, today)).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }
}
export const nothingToday = (t: Today) => !t.followUps.length && !t.todos.length && !t.newSignUps.length && !t.needHelp.length

// ---------------------------------------------------------------------------------------------
// People: everyone involved, who reports to whom, the substitutes bench and the investors (the
// admin_area_people migration)
// ---------------------------------------------------------------------------------------------
export type PersonKind = 'team' | 'bench' | 'investor'
export interface AdminPerson {
  id: string
  name: string
  /** What they do: "CEO", "Café Salesperson". */
  role: string | null
  /** On the team, on the substitutes bench, or an investor (the bench and investors are beside the team: they report to nobody, and nobody to them). */
  kind: PersonKind
  /** Whom they report to; none: the top. */
  reports_to: string | null
  /** Their order among those reporting to the same person. */
  position: number
  /** Labels of their own, as typed ("C TWO"). */
  labels?: string[]
}
export type PersonInput = Partial<Pick<AdminPerson, 'name' | 'role' | 'kind' | 'reports_to' | 'position' | 'labels'>> & { id?: string }

/** Labels as kept: each tidied, at most 40 characters, once (whatever the capitals), at most 10. */
export function cleanLabels(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) return null
  const out: string[] = []
  for (const raw of v as string[]) {
    const l = raw.trim().replace(/\s+/g, ' ').slice(0, 40)
    if (l && !out.some(x => x.toLowerCase() === l.toLowerCase())) out.push(l)
  }
  return out.length <= 10 ? out : null
}
export const isPersonKind = (v: unknown): v is PersonKind => v === 'team' || v === 'bench' || v === 'investor'

/** Someone as sent: a name, what they do, team, bench or investor, whom they report to; `{ error }` when something isn't right. */
export function cleanPerson(input: Record<string, unknown>, isNew: boolean): { row: Record<string, unknown> } | { error: string } {
  const row: Record<string, unknown> = {}
  if ('name' in input || isNew) {
    const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ').slice(0, 80) : ''
    if (!name) return { error: 'Give them a name' }
    row.name = name
  }
  if ('role' in input) {
    if (input.role !== null && typeof input.role !== 'string') return { error: 'Say what they do' }
    row.role = typeof input.role === 'string' ? input.role.trim().replace(/\s+/g, ' ').slice(0, 80) || null : null
  }
  if ('kind' in input || isNew) {
    const kind = input.kind ?? 'team'
    if (!isPersonKind(kind)) return { error: 'Someone is on the team, on the bench or an investor' }
    row.kind = kind
  }
  if ('reports_to' in input) {
    const r = input.reports_to
    if (r !== null && (typeof r !== 'string' || !/^[0-9a-f-]{36}$/i.test(r))) return { error: 'Choose someone on the team to report to' }
    row.reports_to = r
  }
  if (row.kind && row.kind !== 'team') row.reports_to = null
  if ('labels' in input) {
    const labels = cleanLabels(input.labels)
    if (!labels) return { error: 'Up to 10 labels' }
    row.labels = labels
  }
  if ('position' in input) {
    if (!Number.isInteger(input.position)) return { error: 'That isn’t a place in the order' }
    row.position = input.position
  }
  return { row }
}

/** Whether `id` reporting to `boss` would go round in a circle (the boss is them, or reports to them in the end). */
export function reportsInACircle(people: Pick<AdminPerson, 'id' | 'reports_to'>[], id: string, boss: string | null): boolean {
  const up = new Map(people.map(p => [p.id, p.reports_to]))
  const seen = new Set<string>()
  for (let at = boss; at; at = up.get(at) ?? null) {
    if (at === id) return true
    if (seen.has(at)) return true
    seen.add(at)
  }
  return false
}

export interface PersonNode { person: AdminPerson; reports: PersonNode[] }
export interface OrgChart {
  /** The top of the team (the CEO), each with who reports to them, all the way down. */
  team: PersonNode[]
  /** The substitutes bench: ready to step in. */
  bench: AdminPerson[]
  investors: AdminPerson[]
}
const byOrder = (a: AdminPerson, b: AdminPerson) => a.position - b.position || a.name.localeCompare(b.name)

/**
 * The chart: the team from the top down, each person's reports in their order, and the bench and the investors beside
 * it. Someone whose boss isn't there any more (or who would go round in a circle) is at the top.
 */
export function orgChart(people: AdminPerson[]): OrgChart {
  const team = people.filter(p => (p.kind ?? 'team') === 'team')
  const ids = new Set(team.map(p => p.id))
  const top = (p: AdminPerson) => !p.reports_to || !ids.has(p.reports_to) || reportsInACircle(team, p.id, p.reports_to)
  const placed = new Set<string>()
  const node = (p: AdminPerson): PersonNode => {
    placed.add(p.id)
    return { person: p, reports: team.filter(x => x.reports_to === p.id && !placed.has(x.id) && !top(x)).sort(byOrder).map(node) }
  }
  return { team: team.filter(top).sort(byOrder).map(node), bench: people.filter(p => p.kind === 'bench').sort(byOrder),
    investors: people.filter(p => p.kind === 'investor').sort(byOrder) }
}

/** Everyone who reports to someone, however far down. */
export const teamUnder = (n: PersonNode): number => n.reports.reduce((a, r) => a + 1 + teamUnder(r), 0)
