// Text in the person's language. Write every piece of text on screen in English, through one of:
//   t('Save')                                   plain text
//   t('{n} of {total} shown', { n, total })     with values filled in
//   tn(count, '{n} shift', '{n} shifts')        one / many ({n} is the count)
//   tr('Signed in as {name}', { name: <b>…</b> }) with React elements filled in (links, bold)
//   msg('Premises')                             text defined in a list and shown later with t(x)
// Then add the Spanish to a file in src/i18n/es/. `npm test` lists anything missing.
import { Fragment, createElement, useSyncExternalStore, type ReactNode } from 'react'
import { LANGUAGES, type Language } from '../../shared/i18n'
import type { Preferences } from '../../shared/types'
import { setDateLocale } from '../../shared/time'

export { LANGUAGES, msg, type Language } from '../../shared/i18n'

type Vars = Record<string, string | number>
let language: Language = 'en'
let spanish: Record<string, string> = {}
const listeners = new Set<() => void>()

const fill = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all)) : text

const lookup = (text: string) => (language === 'es' && spanish[text]) || text

/** The text in the current language (English when there's no translation yet). */
export const t = (text: string, vars?: Vars) => fill(lookup(text), vars)

/**
 * The same English with another meaning in Spanish: tc('verb', 'Open') is "Abrir" where t('Open')
 * is "Abierta". The Spanish is kept under "context|text"; English shows the text as it is.
 */
export const tc = (context: string, text: string, vars?: Vars) => {
  const own = language === 'es' ? spanish[`${context}|${text}`] : undefined
  return fill(own ?? lookup(text), vars)
}

/** One or many: tn(3, '{n} item', '{n} items') → "3 items". English and Spanish share the rule. */
export const tn = (n: number, one: string, other: string, vars?: Vars) => t(n === 1 ? one : other, { n, ...vars })

/** Like t(), with React elements (a link, bold text) in place of the {placeholders}. */
export function tr(text: string, parts: Record<string, ReactNode>): ReactNode {
  const pieces = lookup(text).split(/\{(\w+)\}/g)
  return createElement(Fragment, null, ...pieces.map((p, i) => (i % 2 ? createElement(Fragment, { key: i }, p in parts ? parts[p] : `{${p}}`) : p)))
}

export const currentLanguage = () => language

/** BCP 47 tag for Intl formatting in the current language. */
export const locale = () => (language === 'es' ? 'es-ES' : 'en-GB')

/** Switch the whole app (loads the Spanish text the first time it's needed). */
export async function setLanguage(next: Language) {
  if (next === 'es') {
    const es = await import('./es')
    spanish = es.spanish
    setDateLocale(es.dateLocale)
  } else setDateLocale(undefined)
  if (next === language) return
  language = next
  document.documentElement.lang = next
  try { localStorage.setItem(CACHE, next) } catch { /* storage unavailable */ }
  listeners.forEach(l => l())
}

/** The current language; components using it re-render when it changes. */
export const useLanguage = () => useSyncExternalStore(
  l => { listeners.add(l); return () => { listeners.delete(l) } },
  () => language,
)

const CACHE = 'eb-language'

/**
 * The languages someone uses: the ones they picked (My account → Language) and the team's (picked by an
 * admin, `team`), in the usual order; everyone has at least one.
 */
export function chosenLanguages(p?: Preferences, team: readonly string[] = []): Language[] {
  const all = new Set([...(p?.languages ?? []), ...team])
  const mine = LANGUAGES.map(l => l.code).filter(c => all.has(c))
  return mine.length ? mine : [startingLanguage()]
}

/** The language to show a signed-in person: the one they last switched to, if it's still one of theirs. */
export function preferredLanguage(p?: Preferences, team: readonly string[] = []): Language {
  const mine = chosenLanguages(p, team)
  return p?.language && mine.includes(p.language) ? p.language : mine[0]
}

/**
 * The language to open in before anyone signs in: the last one used on this device, else English.
 * Not the browser's: people choose (My account, or the flags), so nobody is switched without asking.
 */
export function startingLanguage(): Language {
  try {
    const saved = localStorage.getItem(CACHE)
    if (saved === 'en' || saved === 'es') return saved
  } catch { /* storage unavailable */ }
  return 'en'
}
