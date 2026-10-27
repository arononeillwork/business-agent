// The set-up guide's ready-made starting points: for each kind of business, the apps it usually
// connects first, ticked or not. Only apps from the catalogue (shared/connections.ts) that can be
// connected today; the guide hides any that are switched off or still "coming soon".
import { GROUPS, type ConnectionGroup, type ConnectionGroupInfo, type ConnectionOption } from '../../shared/connections'
import type { IntegrationProvider } from '../../shared/types'
import { msg } from '../i18n'
import { FEATURES } from './features'

export type BusinessKind = 'cafe' | 'restaurant' | 'salon'

export interface SetupPreset {
  kind: BusinessKind
  name: string
  blurb: string
  /** What the agent says it can do with these, in the side panel. */
  agent: string
  /** The apps, in the order shown; `on` = ticked to start with. */
  apps: { id: IntegrationProvider; on: boolean }[]
}

export const PRESETS: SetupPreset[] = [
  {
    kind: 'cafe', name: msg('Café & coffee shop'), blurb: msg('Till, socials, reviews and a shared drive.'),
    agent: msg('With these connected I can post your daily specials, answer reviews and keep your files in one place.'),
    apps: [
      { id: 'square', on: true }, { id: 'instagram', on: true }, { id: 'facebook', on: true }, { id: 'tiktok', on: true },
      { id: 'google_business', on: true }, { id: 'google_drive', on: true }, { id: 'gmail', on: true },
      { id: 'google_calendar', on: false }, { id: 'whatsapp', on: false },
    ],
  },
  {
    kind: 'restaurant', name: msg('Restaurant & bar'), blurb: msg('Reviews, payments, socials and team messages.'),
    agent: msg('With these connected I can keep your Google listing right, answer reviews, post tonight’s specials and message the team.'),
    apps: [
      { id: 'square', on: true }, { id: 'google_business', on: true }, { id: 'instagram', on: true }, { id: 'facebook', on: true },
      { id: 'whatsapp', on: true }, { id: 'google_drive', on: true }, { id: 'gmail', on: true }, { id: 'google_calendar', on: true },
      { id: 'tiktok', on: false }, { id: 'meta_ads', on: false }, { id: 'search_console', on: false },
    ],
  },
  {
    kind: 'salon', name: msg('Salon & beauty'), blurb: msg('Socials, reviews, payments and client reminders.'),
    agent: msg('With these connected I can show off your best work on Instagram and TikTok, answer reviews and send reminders on WhatsApp.'),
    apps: [
      { id: 'instagram', on: true }, { id: 'tiktok', on: true }, { id: 'google_business', on: true }, { id: 'whatsapp', on: true },
      { id: 'square', on: true }, { id: 'google_calendar', on: true },
      { id: 'facebook', on: false }, { id: 'google_drive', on: false }, { id: 'gmail', on: false },
    ],
  },
]

/** Can this app be connected from here (in the catalogue, not "soon", not switched off)? */
const usable = (o: ConnectionOption) => !o.soon && (o.id !== 'square' || FEATURES.square)

/** An app's catalogue entry and its group. */
export function findApp(id: string): { o: ConnectionOption; g: ConnectionGroupInfo } | null {
  for (const g of GROUPS) {
    const o = g.options.find(x => x.id === id)
    if (o && usable(o)) return { o, g }
  }
  return null
}

/**
 * The groups worth showing as categories: those with at least one app that can be connected. Café
 * music stays on the Connections page: Spotify's sign-in always comes back there, not to the guide.
 */
export const SETUP_GROUPS: ConnectionGroupInfo[] = GROUPS
  .filter(g => g.key !== 'music')
  .map(g => ({ ...g, options: g.options.filter(usable) }))
  .filter(g => g.options.length > 0)

/** The groups a preset's ticked apps belong to (to start "customise by category" from them). */
export const groupsOf = (ids: string[]): ConnectionGroup[] =>
  SETUP_GROUPS.filter(g => g.options.some(o => ids.includes(o.id))).map(g => g.key)

/**
 * Tick an app in a list of ticked apps. In choose-one groups (Gmail or Outlook…), ticking one
 * unticks the others, since only one of them can be connected.
 */
export function tick(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter(x => x !== id)
  const g = findApp(id)?.g
  const rivals = g?.pickOne ? g.options.map(o => o.id as string).filter(x => x !== id) : []
  return [...ids.filter(x => !rivals.includes(x)), id]
}
