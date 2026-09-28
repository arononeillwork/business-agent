// The apps a business can connect, in groups. In most groups the business picks ONE (Gmail or
// Outlook, Google Drive or OneDrive…); connecting another replaces it. Social media is the
// exception: connect as many as you use. Shared by the Worker (which verifies a connection before
// calling it connected) and the app (which shows the choices).
import type { IntegrationProvider } from './types'

export type ConnectionGroup = 'communication' | 'email' | 'calendar' | 'files' | 'maps' | 'social' | 'payments' | 'music'

export interface ConnectionOption {
  id: IntegrationProvider | 'slack' | 'sms' | 'sharepoint' | 'dropbox' | 'apple_maps' | 'sumup' | 'stripe'
  name: string
  by: string
  /** Shown but not selectable yet. */
  soon?: boolean
  /** What "connected" proves, in plain words (shown on the card). */
  proves?: string
}

export interface ConnectionGroupInfo {
  key: ConnectionGroup; title: string; hint: string; options: ConnectionOption[]
  /** Only one app of the group can be connected at a time (enforced by the database too). */
  pickOne: boolean
}

export const GROUPS: ConnectionGroupInfo[] = [
  { key: 'communication', title: 'Team messages', hint: 'How the team hears about shifts and changes.', pickOne: true, options: [
    { id: 'whatsapp', name: 'WhatsApp', by: 'Meta', proves: 'A test message was delivered from the café’s number.' },
    { id: 'slack', name: 'Slack', by: 'Slack', soon: true },
    { id: 'sms', name: 'Text messages', by: 'Twilio', soon: true },
  ] },
  { key: 'email', title: 'Email', hint: 'Team alerts for people who prefer email come from your own address.', pickOne: true, options: [
    { id: 'gmail', name: 'Gmail', by: 'Google', proves: 'A confirmation email was sent from this mailbox to itself.' },
    { id: 'outlook', name: 'Outlook', by: 'Microsoft', proves: 'A confirmation email was sent from this mailbox to itself.' },
  ] },
  { key: 'calendar', title: 'Calendar', hint: 'The rota, closures and events in the calendar you already use.', pickOne: true, options: [
    { id: 'google_calendar', name: 'Google Calendar', by: 'Google', proves: 'Google Calendar has fetched the team calendar.' },
    { id: 'outlook_calendar', name: 'Outlook Calendar', by: 'Microsoft', proves: 'Outlook has fetched the team calendar.' },
  ] },
  { key: 'files', title: 'Files and storage', hint: 'Timecard and registro exports, saved where your gestoría can find them.', pickOne: true, options: [
    { id: 'google_drive', name: 'Google Drive', by: 'Google', proves: 'The “Business Agent” folder was created in this Drive.' },
    { id: 'onedrive', name: 'OneDrive', by: 'Microsoft', proves: 'The “Business Agent” folder was created in this OneDrive.' },
    { id: 'sharepoint', name: 'SharePoint', by: 'Microsoft', soon: true },
    { id: 'dropbox', name: 'Dropbox', by: 'Dropbox', soon: true },
  ] },
  { key: 'maps', title: 'Maps and search', hint: 'Opening hours, holiday closures and phone stay right where customers look.', pickOne: false, options: [
    { id: 'google_business', name: 'Google Maps', by: 'Google', proves: 'The café’s listing was found and can be updated.' },
    { id: 'apple_maps', name: 'Apple Maps', by: 'Apple', soon: true },
  ] },
  { key: 'social', title: 'Social media', hint: 'Connect every account you post to, then plan and schedule posts for all of them on the Social planner.', pickOne: false, options: [
    { id: 'instagram', name: 'Instagram', by: 'Meta', proves: 'The profile and posts could be read, and posting was allowed.' },
    { id: 'facebook', name: 'Facebook', by: 'Meta', proves: 'The Page was found and posting to it was allowed.' },
    { id: 'tiktok', name: 'TikTok', by: 'TikTok', proves: 'The account signed in and TikTok confirmed it can post.' },
  ] },
  { key: 'payments', title: 'Payments and sales', hint: 'Your till: takings on the Finances page, next to what the team costs.', pickOne: true, options: [
    { id: 'square', name: 'Square', by: 'Block', proves: 'The business and its locations were found and its payments can be read.' },
    { id: 'sumup', name: 'SumUp', by: 'SumUp', soon: true },
    { id: 'stripe', name: 'Stripe', by: 'Stripe', soon: true },
  ] },
  { key: 'music', title: 'Café music', hint: 'The approved playlist for the café. Everyone can also connect their own music on the Music page.', pickOne: true, options: [
    { id: 'spotify', name: 'Spotify', by: 'Spotify', proves: 'The account signed in and its playlists can be read. Staff can play or pause it on the speaker.' },
    { id: 'youtube_music', name: 'YouTube Music', by: 'Google', proves: 'The account signed in and its playlists can be read. Staff open the playlist on the café device.' },
  ] },
]

/** The choose-one group a provider belongs to (only one per group can be connected); null when any number can be. */
export function groupOf(provider: string): ConnectionGroup | null {
  return GROUPS.find(g => g.pickOne && g.options.some(o => o.id === provider))?.key ?? null
}

export const optionName = (provider: string) =>
  GROUPS.flatMap(g => g.options).find(o => o.id === provider)?.name ?? (provider === 'google' ? 'Google Maps' : provider)

/** Which calendar app fetched the feed, from its User-Agent (null: a person's browser or unknown). */
export function calendarAppFromAgent(userAgent: string | null | undefined): 'google_calendar' | 'outlook_calendar' | null {
  const ua = userAgent ?? ''
  if (/google/i.test(ua)) return 'google_calendar'
  if (/outlook|microsoft|exchange|office/i.test(ua)) return 'outlook_calendar'
  return null
}

/** Add-to-calendar links for the team calendar feed. */
export function addToCalendarUrl(app: 'google_calendar' | 'outlook_calendar', feedUrl: string) {
  return app === 'google_calendar'
    ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feedUrl.replace(/^https?:/, 'webcal:'))}`
    : `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent('Team calendar')}`
}
