// Newsletter sign-ups from the business's own website (Website & SEO → Newsletter sign-ups): the
// business's set-up (its topics, what the form asks), checking what a form or website sends, the
// form's own words (the form the app hosts speaks the visitor's language, not the app's), the snippet
// to paste into a website and reading a list brought in from a CSV. The newsletter migration has the
// same rules; the Worker's routes are in worker/newsletter.ts and the contract in docs/WEBSITE.md.
import { EMAIL, cleanDate, cleanPhone, parseCsv } from './customers'
import { msg } from './i18n'
import type { Country } from './country'

/** The languages the form speaks. */
export type FormLanguage = 'en' | 'es'
export const FORM_LANGUAGES: FormLanguage[] = ['en', 'es']

/** A topic people tick ("Learning English"). */
export interface NewsletterInterest {
  /** What a website sends for it ("english"): stays the same when the wording changes. */
  key: string
  /** Its name in the app, and the tag it gives people on Customers. */
  label: string
  /** How the form words it in each language, when that's not the label. */
  labels: Partial<Record<FormLanguage, string>>
}

/** A business's set-up (public.newsletter). The key itself is never read back: only its last characters. */
export interface NewsletterSettings {
  enabled: boolean
  interests: NewsletterInterest[]
  ask_name: boolean
  ask_phone: boolean
  /** The form's own heading and words; null: the app's. */
  heading: string | null
  intro: string | null
  /** The website key's last 4 characters, and when it was made; null: none. */
  key_hint: string | null
  key_made_at: string | null
}

export const NEWSLETTER_OFF: NewsletterSettings = {
  enabled: false, interests: [], ask_name: true, ask_phone: false, heading: null, intro: null, key_hint: null, key_made_at: null,
}
export const MAX_INTERESTS = 12
export const MAX_LABEL = 40

/** One sign-up or unsubscribe (public.newsletter_events). */
export interface NewsletterEvent {
  id: string
  customer_id: string
  action: 'signup' | 'unsubscribe'
  email: string
  interests: string[]
  lang: string | null
  place: string | null
  via: 'form' | 'website' | 'import'
  at: string
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** A key for a new topic, from its name: "Aprender inglés" → "aprender-ingles" (another if that's taken). */
export function interestKey(label: string, taken: string[]): string {
  const base = fold(label).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'topic'
  let key = base
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`
  return key
}

/** What a topic is called on the form, in a language. */
export const interestText = (i: NewsletterInterest, lang: FormLanguage) => i.labels[lang] || i.label

/**
 * The topics as typed, tidied and checked like the database does: a name each (up to 40 characters),
 * no name or key twice. Returns the problem, in English, for the app to translate.
 */
export function interestsProblem(list: NewsletterInterest[]): string | null {
  if (list.length > MAX_INTERESTS) return msg('Up to 12 topics')
  const names = new Set<string>(), keys = new Set<string>()
  for (const i of list) {
    const name = i.label.trim().toLowerCase()
    if (!name) return msg('Each topic needs a name')
    if (name.length > MAX_LABEL) return msg('A topic’s name is up to 40 characters')
    if (names.has(name)) return msg('Two topics have the same name')
    if (keys.has(i.key)) return msg('Two topics have the same key')
    names.add(name)
    keys.add(i.key)
  }
  return null
}

/**
 * Which topics something sent means. A website may send the keys ("english") or the words people saw
 * ("Aprender inglés", "Learning English"), in any case and with or without accents. Anything else is
 * left out (and said back, so a website sending a topic the business doesn't have notices).
 */
export function matchInterests(sent: unknown, interests: NewsletterInterest[]): { keys: string[]; tags: string[]; unknown: string[] } {
  const raw = Array.isArray(sent) ? sent : typeof sent === 'string' ? sent.split(/[,;|]/) : []
  const keys: string[] = [], unknown: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string' || !v.trim()) continue
    const f = fold(v.trim())
    const hit = interests.find(i => i.key === f || [i.label, ...Object.values(i.labels)].some(l => !!l && fold(l) === f))
    if (hit) { if (!keys.includes(hit.key)) keys.push(hit.key) }
    else if (!unknown.includes(v.trim()) && unknown.length < 20) unknown.push(v.trim().slice(0, 60))
  }
  return { keys, tags: keys.map(k => interests.find(i => i.key === k)!.label), unknown }
}

/** A sign-up, checked and ready to save. */
export interface Signup {
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  /** The topics' keys, and their labels (the tags). */
  interests: string[]
  tags: string[]
  /** Topics sent that the business doesn't have. */
  unknown: string[]
  lang: FormLanguage | null
  /** Where on the website ("footer"). */
  place: string | null
  /** When they signed up, for a list brought in (only with the website key); null: now. */
  at: string | null
}

/** The problems a sign-up can have; the form shows them in its language (FORM_TEXT). */
export type SignupProblem = 'invalidEmail' | 'invalidPhone'

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/**
 * What a form or website sent, checked: an email that is one; a phone that is one, or none (without its
 * country code, the business's country's: an Irish "087 123 4567" is +353 87 123 4567); the topics the
 * business has. A name is split in two ("Lucía García López" → Lucía, García López). `when` (a date or a
 * time) is kept only from a website's server (`trusted`), for a list brought in.
 */
export function readSignup(body: Record<string, unknown>, interests: NewsletterInterest[], trusted: boolean, country?: Country): { signup: Signup } | { problem: SignupProblem } {
  const email = (text(body.email, 300) ?? '').toLowerCase()
  if (!EMAIL.test(email) || email.length > 254) return { problem: 'invalidEmail' }
  const rawPhone = text(body.phone, 40)
  const phone = rawPhone ? cleanPhone(rawPhone, country) : null
  if (rawPhone && !phone) return { problem: 'invalidPhone' }
  let first = text(body.first_name, 100), last = text(body.last_name, 100)
  const name = text(body.name, 200)
  if (name && !first && !last) {
    const parts = name.split(/\s+/)
    first = parts[0].slice(0, 100)
    last = parts.slice(1).join(' ').slice(0, 100) || null
  }
  const lang = typeof body.lang === 'string' ? body.lang.trim().toLowerCase().slice(0, 2) : ''
  const picked = matchInterests(body.interests, interests)
  return {
    signup: {
      email, first_name: first, last_name: last, phone, interests: picked.keys, tags: picked.tags, unknown: picked.unknown,
      lang: (FORM_LANGUAGES as string[]).includes(lang) ? lang as FormLanguage : null,
      place: text(body.place ?? body.source, 60),
      at: trusted ? signedUpAt(body.signed_up_at) : null,
    },
  }
}

/** A date or a time someone signed up ("2026-10-17", "2026-10-17T09:30:00Z", "17/10/2026"); null when it isn't one or is still to come. */
export function signedUpAt(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const day = cleanDate(v)
  const t = day && v.trim().length <= 10 ? Date.parse(`${day}T12:00:00Z`) : Date.parse(v.trim())
  if (Number.isNaN(t) || t > Date.now() || t < Date.parse('2000-01-01')) return null
  return new Date(t).toISOString()
}

/** The language a visitor reads: the one asked for, else their browser's first we have, else the business's country's (Ireland's English, Spain's Spanish). */
export function formLanguage(asked: string | null | undefined, acceptLanguage: string | null | undefined, country?: string | null): FormLanguage {
  const a = (asked ?? '').toLowerCase().slice(0, 2)
  if ((FORM_LANGUAGES as string[]).includes(a)) return a as FormLanguage
  for (const part of (acceptLanguage ?? '').split(',')) {
    const l = part.trim().toLowerCase().slice(0, 2)
    if ((FORM_LANGUAGES as string[]).includes(l)) return l as FormLanguage
  }
  return country === 'IE' ? 'en' : 'es'
}

/** The form's words. Its own (the business's heading and intro) win over these. */
export const FORM_TEXT: Record<FormLanguage, Record<'heading' | 'intro' | 'topics' | 'all' | 'name' | 'email' | 'phone' | 'button' | 'sending' | 'done'
  | 'invalidEmail' | 'invalidPhone' | 'failed' | 'tooMany' | 'consent' | 'off', string>> = {
  en: {
    heading: 'Join our newsletter',
    intro: 'News, offers and events from {business}, now and then.',
    topics: 'I want to hear about',
    all: 'All of it',
    name: 'Your name',
    email: 'Your email',
    phone: 'Phone (optional)',
    button: 'Sign up',
    sending: 'Signing up…',
    done: 'You’re on the list. Thank you!',
    invalidEmail: 'Enter a valid email.',
    invalidPhone: 'Enter a valid phone number, or leave it empty.',
    failed: 'That didn’t work. Try again in a minute.',
    tooMany: 'Too many sign-ups from here just now. Try again later.',
    consent: 'By signing up you agree to get emails from {business}. You can unsubscribe at any time.',
    off: 'This newsletter isn’t taking sign-ups just now.',
  },
  es: {
    heading: 'Suscríbete a nuestra newsletter',
    intro: 'Novedades, ofertas y eventos de {business}, de vez en cuando.',
    topics: 'Quiero saber de',
    all: 'Todo',
    name: 'Tu nombre',
    email: 'Tu email',
    phone: 'Teléfono (opcional)',
    button: 'Suscribirme',
    sending: 'Suscribiendo…',
    done: 'Ya estás en la lista. ¡Gracias!',
    invalidEmail: 'Escribe un email válido.',
    invalidPhone: 'Escribe un teléfono válido, o déjalo vacío.',
    failed: 'No ha funcionado. Inténtalo de nuevo en un minuto.',
    tooMany: 'Demasiadas suscripciones desde aquí ahora mismo. Inténtalo más tarde.',
    consent: 'Al suscribirte aceptas recibir emails de {business}. Puedes darte de baja cuando quieras.',
    off: 'Esta newsletter no admite suscripciones ahora mismo.',
  },
}
export const formText = (lang: FormLanguage, key: keyof (typeof FORM_TEXT)['en'], business: string) => FORM_TEXT[lang][key].replace('{business}', business)

/** The form's address: a link to share, or to show inside a website. */
export const formUrl = (origin: string, business: number, lang?: FormLanguage) =>
  `${origin}/api/site/${business}/newsletter${lang ? `?lang=${lang}` : ''}`

/** Where a website sends sign-ups. */
export const signupUrl = (origin: string, business: number) => `${origin}/api/site/${business}/signup`

/** The message the form sends the website it's shown in, with its height, so the frame fits it. */
export const HEIGHT_MESSAGE = 'business-agent:newsletter-height'

/**
 * What to paste into a website (Wix, Squarespace, WordPress… all take a piece of HTML): the form in
 * a frame that grows to fit it. Without a language, the form follows the visitor's browser.
 */
export function embedSnippet(origin: string, business: number, lang?: FormLanguage): string {
  const id = `business-agent-newsletter-${business}`
  return [
    `<iframe id="${id}" src="${formUrl(origin, business, lang)}" title="Newsletter" loading="lazy"`,
    `  style="width:100%;max-width:480px;height:520px;border:0;background:transparent"></iframe>`,
    `<script>addEventListener("message",function(e){if(e.origin==="${origin}"&&e.data&&e.data.type==="${HEIGHT_MESSAGE}")`,
    `document.getElementById("${id}").style.height=e.data.height+"px"})</script>`,
  ].join('\n')
}

// ---------------------------------------------------------------------------------------------
// A list brought in (CSV): another newsletter service's export, or a website's
// ---------------------------------------------------------------------------------------------

/** One person from the list, as it's sent to the Worker. */
export interface ListRow {
  email: string
  name?: string
  phone?: string
  interests?: string[]
  lang?: string
  place?: string
  signed_up_at?: string
}

type ListField = 'email' | 'name' | 'first_name' | 'last_name' | 'phone' | 'interests' | 'lang' | 'place' | 'at' | 'unsubscribed' | 'subscribed'
// Column headings people use, in English and Spanish (Mailchimp's, Brevo's and Easy Beans' website's among them).
const HEADINGS: Record<ListField, string[]> = {
  email: ['email', 'e mail', 'email address', 'mail', 'correo', 'correo electronico'],
  name: ['name', 'full name', 'nombre completo', 'nombre y apellidos'],
  first_name: ['first name', 'firstname', 'given name', 'nombre'],
  last_name: ['last name', 'lastname', 'surname', 'apellido', 'apellidos'],
  phone: ['phone', 'phone number', 'mobile', 'telefono', 'movil', 'whatsapp', 'sms'],
  interests: ['interests', 'interest', 'topics', 'groups', 'tags', 'intereses', 'temas', 'grupos', 'etiquetas'],
  lang: ['lang', 'language', 'idioma'],
  place: ['source', 'signup source', 'form', 'origen', 'formulario'],
  at: ['created at', 'signed up', 'signed up at', 'signup date', 'date', 'optin time', 'confirm time', 'date added', 'fecha', 'fecha de alta', 'alta'],
  unsubscribed: ['unsubscribed', 'unsubscribed at', 'unsub time', 'baja', 'fecha de baja', 'dado de baja'],
  subscribed: ['subscribed', 'status', 'subscription status', 'estado', 'suscrito'],
}
const plain = (s: string) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim()
/** A status that means they're not (or no longer) subscribed. */
const GONE = new Set(['no', 'n', 'false', '0', 'unsubscribed', 'cleaned', 'bounced', 'baja', 'dado de baja'])
/** A yes/no cell that says no. */
const FALSY = new Set(['', 'no', 'n', 'false', 'f', '0'])
/** Yes-to-marketing columns (a website may have one per kind, like Easy Beans' offer_optin and events_optin). */
const OPT_IN = new Set(['optin', 'opt in', 'offer optin', 'events optin', 'marketing', 'marketing consent', 'consent', 'acepta marketing', 'consentimiento'])

/**
 * The people on a list who are still subscribed, with an email. Someone unsubscribed (a date in an
 * "unsubscribed" column, "no" or "unsubscribed" as their status, or no to every yes-to-marketing
 * column) is left out: there's no yes to bring in. A phone that isn't one is left out, not the person.
 */
export function readList(text: string): { rows: ListRow[]; notSubscribed: number; skipped: number; found: ListField[] } {
  const [head = [], ...lines] = parseCsv(text)
  const used = new Set<ListField>()
  const fields = head.map(h => {
    const p = plain(h)
    const f = (Object.keys(HEADINGS) as ListField[]).find(k => !used.has(k) && HEADINGS[k].includes(p))
    if (f) used.add(f)
    return f ?? null
  })
  const optIns = head.flatMap((h, i) => (OPT_IN.has(plain(h)) && !fields[i] ? [i] : []))
  const rows: ListRow[] = []
  const seen = new Set<string>()
  let notSubscribed = 0, skipped = 0
  for (const line of lines) {
    const get = (f: ListField) => { const i = fields.indexOf(f); return i >= 0 ? (line[i] ?? '').trim() : '' }
    const email = get('email').toLowerCase()
    if (!EMAIL.test(email) || email.length > 254 || seen.has(email)) { skipped++; continue }
    const unsubscribed = !FALSY.has(plain(get('unsubscribed')))
    const gone = GONE.has(plain(get('subscribed')))
    const noYes = optIns.length > 0 && optIns.every(i => FALSY.has(plain(line[i] ?? '')))
    if (unsubscribed || gone || noYes) { notSubscribed++; continue }
    seen.add(email)
    const name = get('name') || [get('first_name'), get('last_name')].filter(Boolean).join(' ')
    const phone = get('phone') ? cleanPhone(get('phone')) : null
    // "{english,offers}" (a database's list), "english, offers" or "english;offers".
    const interests = get('interests').replace(/^\{|\}$/g, '').split(/[,;|]/).map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
    const at = signedUpAt(get('at'))
    rows.push({
      email,
      ...(name && { name: name.slice(0, 200) }),
      ...(phone && { phone }),
      ...(interests.length && { interests }),
      ...(get('lang') && { lang: get('lang') }),
      ...(get('place') && { place: get('place').slice(0, 60) }),
      ...(at && { signed_up_at: at }),
    })
  }
  return { rows, notSubscribed, skipped, found: fields.filter((f): f is ListField => !!f) }
}
