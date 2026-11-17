// Customer suggestions (Sales section): the ideas customers give the business ("oat milk at no extra cost",
// "open earlier on Saturdays"), kept for the team, not shown to customers. They're mostly added through
// the business's AI assistant (worker/suggestionTools.ts) and sorted on the page by dragging ideas that
// say the same thing into one section; a section's counter is how many times customers asked for it.
// The `customer_suggestions` migration has the same rules (the demo and the AI tools follow them).
import { msg } from './i18n'

export interface CustomerSuggestion {
  id: string
  /** The idea, in the customer's words or close to them. */
  text: string
  /** Who suggested it, when known: "Lucía, a regular". */
  customer: string | null
  /** Where it was heard: "At the counter", "Google review", "Instagram". */
  source: string | null
  /** The day it was heard (YYYY-MM-DD, the business's day). */
  heard_on: string
  /** The section it's sorted into; none while it's not sorted yet. */
  group_id: string | null
  created_at: string
}
export type SuggestionInput = Partial<Omit<CustomerSuggestion, 'id' | 'created_at'>> & { id?: string }

/** A section: ideas that say the same thing. */
export interface SuggestionGroup {
  id: string
  name: string
  created_at: string
}

/** The same limits as the database's. */
export const SUGGESTION_LIMITS = { text: 1000, customer: 120, source: 80, group: 120 } as const

/** Where ideas are usually heard, offered when one is added on the page (anything else is fine too). */
export const USUAL_SOURCES: string[] = [
  msg('At the counter'),
  msg('Google review'),
  msg('Instagram'),
  msg('Email'),
  msg('WhatsApp'),
  msg('Website'),
]

const tidy = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
const fold = (s: string) => tidy(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** What's wrong with an idea before it's saved, in English (the page translates it), or null. */
export function suggestionProblem(s: Pick<SuggestionInput, 'text' | 'customer' | 'source'>): string | null {
  const text = tidy(s.text)
  if (!text) return msg('Write the idea')
  if (text.length > SUGGESTION_LIMITS.text) return msg('Keep the idea to 1,000 characters')
  if (tidy(s.customer).length > SUGGESTION_LIMITS.customer) return msg('Keep who suggested it to 120 characters')
  if (tidy(s.source).length > SUGGESTION_LIMITS.source) return msg('Keep where it was heard to 80 characters')
  return null
}

/** What's wrong with a section's name, in English, or null. */
export function groupProblem(name: string | null | undefined): string | null {
  const n = tidy(name)
  if (!n) return msg('Give the section a name')
  if (n.length > SUGGESTION_LIMITS.group) return msg('Keep the section name to 120 characters')
  return null
}

/** An idea as saved: spaces tidied, blanks none. */
export function tidySuggestion<T extends SuggestionInput>(s: T): T {
  return { ...s, text: tidy(s.text), customer: tidy(s.customer) || null, source: tidy(s.source) || null }
}

export const tidyGroupName = (name: string) => tidy(name)

/** A section named after an idea (dropping one idea on another starts a section): its first words. */
export function nameFromIdea(text: string, max = 60): string {
  const t = tidy(text).replace(/[.!?…]+$/, '')
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[,;:\s]+$/, '')}…`
}

export interface BoardSection { group: SuggestionGroup; ideas: CustomerSuggestion[] }
export interface Board {
  /** Sections, the most asked for first. */
  sections: BoardSection[]
  /** Ideas not sorted into a section yet, newest first. */
  unsorted: CustomerSuggestion[]
  /** Every idea. */
  total: number
}

const newestFirst = (a: CustomerSuggestion, b: CustomerSuggestion) =>
  b.heard_on.localeCompare(a.heard_on) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)

/** The page: each section with its ideas (the most asked for first, then by name), and those not sorted yet. */
export function boardOf(ideas: CustomerSuggestion[], groups: SuggestionGroup[]): Board {
  const sections = groups.map(group => ({ group, ideas: ideas.filter(i => i.group_id === group.id).sort(newestFirst) }))
  sections.sort((a, b) => b.ideas.length - a.ideas.length || a.group.name.localeCompare(b.group.name) || a.group.id.localeCompare(b.group.id))
  const known = new Set(groups.map(g => g.id))
  return { sections, unsorted: ideas.filter(i => !i.group_id || !known.has(i.group_id)).sort(newestFirst), total: ideas.length }
}

/** Whether an idea or a section mentions the search (accents and case aside). */
export function matchesSuggestion(i: Pick<CustomerSuggestion, 'text' | 'customer' | 'source'>, search: string, group?: Pick<SuggestionGroup, 'name'> | null): boolean {
  const q = fold(search)
  if (!q) return true
  return [i.text, i.customer, i.source, group?.name].some(x => x && fold(x).includes(q))
}

/** A section by id or name: the same name (accents, case and spaces aside), else the one name containing it. */
export function findGroup(groups: SuggestionGroup[], which: string): SuggestionGroup | null {
  const q = fold(which)
  if (!q) return null
  const exact = groups.find(g => g.id === which || fold(g.name) === q)
  if (exact) return exact
  const part = groups.filter(g => fold(g.name).includes(q))
  return part.length === 1 ? part[0] : null
}
