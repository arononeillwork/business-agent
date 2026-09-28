// The apps a business can connect, in groups. In each group the business picks ONE (Gmail or
// Outlook, Google Drive or OneDrive…); connecting another replaces it. Shared by the Worker (which
// verifies a connection before calling it connected) and the app (which shows the choices).
import type { IntegrationProvider } from './types'

export type ConnectionGroup = 'communication' | 'email' | 'calendar' | 'files' | 'maps' | 'social' | 'music'

export interface ConnectionOption {
  id: IntegrationProvider | 'slack' | 'sms' | 'sharepoint' | 'dropbox' | 'facebook' | 'tiktok' | 'apple_maps'
  name: string
  by: string
  /** Shown but not selectable yet. */
  soon?: boolean
  /** What "connected" proves, in plain words (shown on the card). */
  proves?: string
}

export const GROUPS: { key: ConnectionGroup; title: string; hint: string; options: ConnectionOption[] }[] = [
  { key: 'communication', title: 'Team messages', hint: 'How the team hears about shifts and changes.', options: [
    { id: 'whatsapp', name: 'WhatsApp', by: 'Meta', proves: 'A test message was delivered from the café’s number.' },
    { id: 'slack', name: 'Slack', by: 'Slack', soon: true },
    { id: 'sms', name: 'Text messages', by: 'Twilio', soon: true },
  ] },
  { key: 'email', title: 'Email', hint: 'Team alerts for people who prefer email come from your own address.', options: [
    { id: 'gmail', name: 'Gmail', by: 'Google', proves: 'A confirmation email was sent from this mailbox to itself.' },
    { id: 'outlook', name: 'Outlook', by: 'Microsoft', proves: 'A confirmation email was sent from this mailbox to itself.' },
  ] },
  { key: 'calendar', title: 'Calendar', hint: 'The rota, closures and events in the calendar you already use.', options: [
    { id: 'google_calendar', name: 'Google Calendar', by: 'Google', proves: 'Google Calendar has fetched the team calendar.' },
    { id: 'outlook_calendar', name: 'Outlook Calendar', by: 'Microsoft', proves: 'Outlook has fetched the team calendar.' },
  ] },
  { key: 'files', title: 'Files and storage', hint: 'Timecard and registro exports, saved where your gestoría can find them.', options: [
    { id: 'google_drive', name: 'Google Drive', by: 'Google', proves: 'The “Business Agent” folder was created in this Drive.' },
    { id: 'onedrive', name: 'OneDrive', by: 'Microsoft', proves: 'The “Business Agent” folder was created in this OneDrive.' },
    { id: 'sharepoint', name: 'SharePoint', by: 'Microsoft', soon: true },
    { id: 'dropbox', name: 'Dropbox', by: 'Dropbox', soon: true },
  ] },
  { key: 'maps', title: 'Maps and search', hint: 'Opening hours, holiday closures and phone stay right where customers look.', options: [
    { id: 'google_business', name: 'Google Maps', by: 'Google', proves: 'The café’s listing was found and can be updated.' },
    { id: 'apple_maps', name: 'Apple Maps', by: 'Apple', soon: true },
  ] },
  { key: 'social', title: 'Social media', hint: 'Followers and recent posts here; share events and specials in one go.', options: [
    { id: 'instagram', name: 'Instagram', by: 'Meta', proves: 'The profile and posts could be read, and posting was allowed.' },
    { id: 'facebook', name: 'Facebook', by: 'Meta', soon: true },
    { id: 'tiktok', name: 'TikTok', by: 'TikTok', soon: true },
  ] },
  { key: 'music', title: 'Café music', hint: 'The approved playlist for the café. Everyone can also connect their own music on the Music page.', options: [
    { id: 'spotify', name: 'Spotify', by: 'Spotify', proves: 'The account signed in and its playlists can be read. Staff can play or pause it on the speaker.' },
    { id: 'youtube_music', name: 'YouTube Music', by: 'Google', proves: 'The account signed in and its playlists can be read. Staff open the playlist on the café device.' },
  ] },
]

/** Which group a provider belongs to (only one per group can be connected). */
export function groupOf(provider: string): ConnectionGroup | null {
  return GROUPS.find(g => g.options.some(o => o.id === provider))?.key ?? null
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
