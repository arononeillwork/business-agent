// How each person is told about each kind of notification: in the app (the bell), on their devices
// (push), or both. Kept in their preferences (profiles.preferences.notify); both unless they chose.
// The Notifications page sets it; the Worker reads it when it pushes (worker/push.ts).
import { msg } from './i18n'
import type { AppNotification, Preferences } from './types'

export type NotifyTopic = 'holidays' | 'events' | 'licences' | 'reviews' | 'mentions' | 'other'
export type NotifyChannel = 'app' | 'push' | 'both'

export const NOTIFY_TOPICS: { key: NotifyTopic; label: string; detail: string; admins: boolean }[] = [
  { key: 'holidays', label: msg('Bank holidays'), detail: msg('The days before each public holiday'), admins: true },
  { key: 'events', label: msg('Event and match reminders'), detail: msg('The bell on a calendar event or match'), admins: true },
  { key: 'licences', label: msg('Licences and renewals'), detail: msg('Before one runs out'), admins: true },
  { key: 'reviews', label: msg('Google reviews'), detail: msg('Each new review'), admins: true },
  { key: 'mentions', label: msg('Instagram tags and mentions'), detail: msg('When someone tags you or mentions you in their story'), admins: true },
  { key: 'other', label: msg('Everything else'), detail: msg('Posts to put out, approvals, connections and the rest'), admins: false },
]

/** Which kind a notification is, from what it carries. */
export function notificationTopic(n: Pick<AppNotification, 'kind' | 'link'>): NotifyTopic {
  if (n.kind === 'bank_holiday') return 'holidays'
  if (n.kind === 'review') return 'reviews'
  if (n.kind === 'instagram_mention') return 'mentions'
  if (n.link === '/licences') return 'licences'
  if (n.link === '/calendar' || n.link === '/sports') return 'events'
  return 'other'
}

/** How this person is told about this kind (a test always goes everywhere). */
export function channelFor(prefs: Preferences | null | undefined, topic: NotifyTopic | 'test'): NotifyChannel {
  if (topic === 'test') return 'both'
  return prefs?.notify?.[topic] ?? 'both'
}

export const pushes = (c: NotifyChannel) => c !== 'app'
