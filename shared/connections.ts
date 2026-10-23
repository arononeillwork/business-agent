// The apps a business can connect, in groups. In most groups the business picks ONE (Gmail or
// Outlook, Spotify or YouTube Music…); connecting another replaces it. Social media and file
// storage are the exceptions: connect as many as you use (the Legal page picks documents from
// whichever storage you choose). Shared by the Worker (which verifies a connection before
// calling it connected) and the app (which shows the choices).
import type { IntegrationProvider } from './types'
import { msg } from './i18n'

export type ConnectionGroup = 'communication' | 'email' | 'calendar' | 'files' | 'maps' | 'analytics' | 'social' | 'advertising' | 'payments' | 'online_payments' | 'music' | 'ai'

export interface ConnectionOption {
  id: IntegrationProvider | 'slack' | 'sms' | 'sharepoint' | 'dropbox' | 'apple_maps' | 'stripe'
  name: string
  by: string
  /** Shown but not selectable yet. */
  soon?: boolean
  /** What "connected" proves, in plain words (shown on the card). */
  proves?: string
}

export interface ConnectionGroupInfo {
  key: ConnectionGroup; title: string; options: ConnectionOption[]
  /** Only one app of the group can be connected at a time (enforced by the database too). */
  pickOne: boolean
}

export const GROUPS: ConnectionGroupInfo[] = [
  { key: 'communication', title: msg('Team messages'), pickOne: true, options: [
    { id: 'whatsapp', name: 'WhatsApp', by: 'Meta', proves: msg('A test message was delivered from the café’s number.') },
    { id: 'slack', name: 'Slack', by: 'Slack', soon: true },
    { id: 'sms', name: 'Text messages', by: 'Twilio', soon: true },
  ] },
  { key: 'email', title: msg('Email'), pickOne: true, options: [
    { id: 'gmail', name: 'Gmail', by: 'Google', proves: msg('A confirmation email was sent from this mailbox to itself.') },
    { id: 'outlook', name: 'Outlook', by: 'Microsoft', proves: msg('A confirmation email was sent from this mailbox to itself.') },
  ] },
  { key: 'calendar', title: msg('Calendar'), pickOne: true, options: [
    { id: 'google_calendar', name: 'Google Calendar', by: 'Google', proves: msg('Google Calendar has fetched the team calendar.') },
    { id: 'outlook_calendar', name: 'Outlook Calendar', by: 'Microsoft', proves: msg('Outlook has fetched the team calendar.') },
  ] },
  { key: 'files', title: msg('Files and storage'), pickOne: false, options: [
    { id: 'google_drive', name: 'Google Drive', by: 'Google', proves: msg('The “Business Agent” folder was created in this Drive.') },
    { id: 'onedrive', name: 'OneDrive', by: 'Microsoft', proves: msg('The “Business Agent” folder was created in this OneDrive.') },
    { id: 'sharepoint', name: 'SharePoint', by: 'Microsoft', soon: true },
    { id: 'dropbox', name: 'Dropbox', by: 'Dropbox', soon: true },
  ] },
  { key: 'maps', title: msg('Maps and search'), pickOne: false, options: [
    { id: 'google_business', name: 'Google Maps', by: 'Google', proves: msg('The café’s listing was found and can be updated.') },
    { id: 'apple_maps', name: 'Apple Maps', by: 'Apple', soon: true },
  ] },
  // How the website does: shown on the Analytics page.
  { key: 'analytics', title: msg('Analytics'), pickOne: false, options: [
    { id: 'search_console', name: 'Search Console', by: 'Google', proves: msg('Google confirmed this account can read the website’s search data.') },
  ] },
  { key: 'social', title: msg('Social media'), pickOne: false, options: [
    { id: 'instagram', name: 'Instagram', by: 'Meta', proves: msg('The profile and posts could be read, and posting was allowed.') },
    { id: 'facebook', name: 'Facebook', by: 'Meta', proves: msg('The Page was found and posting to it was allowed.') },
    { id: 'tiktok', name: 'TikTok', by: 'TikTok', proves: msg('The account signed in and TikTok confirmed it can post.') },
    { id: 'linkedin', name: 'LinkedIn', by: 'Microsoft', proves: msg('The account signed in and posting was allowed.') },
  ] },
  // Paid ads on the Ads page: as many as the business runs.
  { key: 'advertising', title: msg('Advertising'), pickOne: false, options: [
    { id: 'meta_ads', name: 'Meta Ads', by: 'Meta', proves: msg('The ad accounts could be read and the café’s one was picked.') },
    { id: 'google_ads', name: 'Google Ads', by: 'Google', proves: msg('The ad accounts could be read and the café’s one was picked.') },
  ] },
  // The till: Square or SumUp, one at a time. Stripe (online payments) can be added to either, and
  // the Sales page adds them up.
  { key: 'payments', title: msg('Payments and sales'), pickOne: true, options: [
    { id: 'square', name: 'Square', by: 'Block', proves: msg('The business and its locations were found and its payments can be read.') },
    { id: 'sumup', name: 'SumUp', by: 'SumUp', proves: msg('The SumUp account was found and its sales can be read.') },
  ] },
  { key: 'online_payments', title: msg('Online payments'), pickOne: false, options: [
    { id: 'stripe', name: 'Stripe', by: 'Stripe', proves: msg('The Stripe account was found and its payments can be read.') },
  ] },
  // Images made with AI for the menus and screens (Menu page), with the business's own API key.
  { key: 'ai', title: msg('AI images'), pickOne: false, options: [
    { id: 'higgsfield', name: 'Higgsfield', by: 'Higgsfield AI', proves: msg('Higgsfield accepted the API key.') },
  ] },
  { key: 'music', title: msg('Café music'), pickOne: true, options: [
    { id: 'spotify', name: 'Spotify', by: 'Spotify', proves: msg('The account signed in and its playlists can be read. Staff can play or pause it on the speaker.') },
    { id: 'youtube_music', name: 'YouTube Music', by: 'Google', proves: msg('The account signed in and its playlists can be read. Staff open the playlist on the café device.') },
  ] },
]

/** The choose-one group a provider belongs to (only one per group can be connected); null when any number can be. */
export function groupOf(provider: string): ConnectionGroup | null {
  return GROUPS.find(g => g.pickOne && g.options.some(o => o.id === provider))?.key ?? null
}

/**
 * The storage new files go to (Tax documents, exports, photos for posts) when Google Drive and OneDrive are
 * both connected: Google Drive first, as the Worker does (worker/connections.ts connectedOf).
 */
export function savingStorage<T extends { provider: string; status: string }>(rows: T[] | undefined | null): T | undefined {
  for (const p of ['google_drive', 'onedrive']) {
    const row = rows?.find(i => i.provider === p && i.status === 'connected')
    if (row) return row
  }
  return undefined
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

/** A website as typed ("easybeanscoffee.com", " https://www.x.es ") → https://… (null: none). The database takes http(s) only. */
export function cleanWebsite(typed: string | null | undefined): string | null {
  const w = (typed ?? '').trim()
  if (!w) return null
  return /^https?:\/\//i.test(w) ? w : `https://${w.replace(/^\/+/, '')}`
}
