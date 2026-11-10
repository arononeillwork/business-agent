// Support tickets (the support_tickets migration). Someone in a business tells The Business Agent about a
// problem, a question or an idea from Help (src/components/HelpDialog.tsx), or from the error screen
// (src/app/ErrorBoundary.tsx), and follows it under Help → Your requests; HQ's admins answer on the
// Businesses page, under Support (src/components/HqSupport.tsx). The rules here are
// public.create_support_ticket()'s and public.alert_support_tickets()'s, for the app to check before it sends
// and for the demo to keep (supabase/tests prove the database's own).
import { msg } from './i18n'
import { LIMITS as ERROR_LIMITS, scrubPath } from './appErrors'

export type SupportKind = 'not_working' | 'question' | 'idea'
/** open, being looked at (looking), answered, closed. */
export type SupportStatus = 'open' | 'looking' | 'answered' | 'closed'

export const SUPPORT_KINDS: { key: SupportKind; label: string }[] = [
  { key: 'not_working', label: msg('Something isn’t working') },
  { key: 'question', label: msg('A question') },
  { key: 'idea', label: msg('An idea') },
]
export const STATUS_ORDER: SupportStatus[] = ['open', 'looking', 'answered', 'closed']

/**
 * Five a person in 24 hours, at least MIN_LENGTH characters and at most MAX_LENGTH; the same words from the
 * same person in 24 hours are the one they sent. HQ hears about "Something isn't working" at most once
 * every ALERT_MINUTES.
 */
export const SUPPORT = { PER_DAY: 5, MIN_LENGTH: 10, MAX_LENGTH: 2000, REPLY_MAX: 4000, ALERT_MINUTES: 15, VERSION: 64, BROWSER: 300 }

/** Where a notification about someone's own ticket takes them: Help, open at Your requests. */
export const MY_REQUESTS_LINK = '/?help=requests'
/** Where HQ's admins' notification takes them: the Businesses page's Support section. */
export const SUPPORT_LINK = '/hq/businesses#support'

/** What the app sends: what they wrote, and the page they were on, the app's build and the browser. */
export interface SupportDraft {
  kind: SupportKind
  message: string
  page: string | null
  app_version: string | null
  browser: string | null
  /** From the error screen: the error's fingerprint (shared/appErrors.ts), so HQ sees the two together. */
  error_fingerprint: string | null
}

/** A ticket as the person who sent it sees it (Help → Your requests). */
export interface SupportTicket {
  id: number
  kind: SupportKind
  message: string
  page: string | null
  app_version: string | null
  browser: string | null
  error_fingerprint: string | null
  status: SupportStatus
  reply: string | null
  replied_at: string | null
  created_at: string
  updated_at: string
}

/** A ticket on HQ's back-office (public.hq_support_tickets()): whose business, and who sent it. */
export interface HqSupportTicket extends SupportTicket {
  business_id: number
  business_name: string | null
  user_id: string | null
  person: string | null
  email: string | null
  replied_by_name: string | null
}

/** What the database (and the demo) say when they refuse one, here so the app can say them in Spanish too. */
export const SUPPORT_REFUSALS = [
  msg('Sign in to send us a request'),
  msg('You’ve sent us 5 requests today, the most there can be in a day. Send more tomorrow, or write to us by email.'),
]

/** Text as it's compared for "the same again": spaces tidied, capitals or not. */
export const sameText = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()

/** What's wrong with a message's length, or null (the database says the same). */
export function messageProblem(message: string): string | null {
  const n = message.trim().length
  if (n < SUPPORT.MIN_LENGTH) return msg('Say a little more: at least 10 characters')
  if (n > SUPPORT.MAX_LENGTH) return msg('Keep it to 2,000 characters')
  return null
}

/** A draft as it's sent: the message trimmed, the page a path only (no query string, secret links hidden), nothing too long. */
export function cleanDraft(d: SupportDraft): SupportDraft {
  const text = (v: string | null | undefined, max: number) => v?.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) || null
  return {
    kind: SUPPORT_KINDS.some(k => k.key === d.kind) ? d.kind : 'question',
    message: d.message.trim(),
    page: d.page?.startsWith('/') ? scrubPath(d.page) : null,
    app_version: text(d.app_version, SUPPORT.VERSION),
    browser: text(d.browser, Math.min(SUPPORT.BROWSER, ERROR_LIMITS.userAgent)),
    error_fingerprint: d.kind === 'not_working' && d.error_fingerprint && /^[0-9a-f]{32}$/.test(d.error_fingerprint) ? d.error_fingerprint : null,
  }
}

const DAY = 86_400_000

/**
 * Whether someone may send this now, from their own tickets: `duplicate` is the one they sent with the same
 * words in the last 24 hours (it's that one, not a second); `full` when they've sent PER_DAY in that time.
 */
export function newTicketCheck(mine: readonly Pick<SupportTicket, 'id' | 'message' | 'created_at'>[], message: string, now = Date.now()) {
  const today = mine.filter(t => Date.parse(t.created_at) > now - DAY)
  const same = sameText(message)
  const duplicate = today.filter(t => sameText(t.message) === same).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return { duplicate: duplicate?.id ?? null, full: today.length >= SUPPORT.PER_DAY, sentToday: today.length }
}

/** On one line, at most `max` characters (an ellipsis when cut), as the notifications quote it. */
export function excerpt(text: string, max: number): string {
  const line = text.trim().replace(/\s+/g, ' ')
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** HQ's admins' notification for the problem reports held for it (public.alert_support_tickets() writes the same). */
export function alertText(n: number, latest: string): { title: string; body: string } {
  return {
    title: n === 1 ? '1 new problem report' : `${n} new problem reports`,
    body: `Latest: “${excerpt(latest, 100)}”. On Businesses, under Support.`,
  }
}

/** The person's notification when HQ replies, or closes their ticket (public.hq_answer_support_ticket() writes the same). */
export function answerText(reply: string | null, message: string): { title: string; body: string } {
  return reply
    ? { title: 'The Business Agent answered your request', body: excerpt(reply, 140) }
    : { title: 'Your request is closed', body: `You wrote: “${excerpt(message, 140)}”` }
}

/** HQ's list in its order: open ones first, then being looked at, answered and closed, the newest first in each. */
export function hqOrder<T extends Pick<SupportTicket, 'status' | 'created_at' | 'id'>>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    || b.created_at.localeCompare(a.created_at) || b.id - a.id)
}
