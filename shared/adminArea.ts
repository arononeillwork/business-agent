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
  created_at: string
}
export interface TodoCategory { id: string; name: string; colour: string }
export interface AdminTodos { todos: AdminTodo[]; categories: TodoCategory[] }
export type TodoInput = Partial<Pick<AdminTodo, 'title' | 'done' | 'planned_on' | 'category_id' | 'sales_prospect_id'>> & { id?: string }

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
/** The list in its groups: the earliest day first within each, done most recent first. */
export function groupTodos(todos: AdminTodo[], today: string): Record<TodoGroup, AdminTodo[]> {
  const out = Object.fromEntries(TODO_GROUPS.map(g => [g.id, [] as AdminTodo[]])) as Record<TodoGroup, AdminTodo[]>
  for (const t of todos) out[todoGroup(t, today)].push(t)
  const byDay = (a: AdminTodo, b: AdminTodo) => (a.planned_on ?? '').localeCompare(b.planned_on ?? '') || a.created_at.localeCompare(b.created_at)
  for (const g of ['overdue', 'today', 'soon', 'later'] as const) out[g].sort(byDay)
  out.done.sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
  return out
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
