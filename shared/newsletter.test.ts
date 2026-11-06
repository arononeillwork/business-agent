import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  embedSnippet, formLanguage, formUrl, interestKey, interestsProblem, interestText, matchInterests, readList, readSignup, signedUpAt,
  type NewsletterInterest,
} from './newsletter'

const TOPICS: NewsletterInterest[] = [
  { key: 'coffee', label: 'Coffee tips', labels: { es: 'Trucos de café' } },
  { key: 'english', label: 'Learning English', labels: { en: 'Learning English', es: 'Aprender inglés' } },
  { key: 'offers', label: 'Offers', labels: {} },
]

afterEach(() => vi.useRealTimers())

describe('topics', () => {
  it('get a plain key from their name, another when it is taken', () => {
    expect(interestKey('Aprender inglés', [])).toBe('aprender-ingles')
    expect(interestKey('  Kids & Family!  ', [])).toBe('kids-family')
    expect(interestKey('Offers', ['offers'])).toBe('offers-2')
    expect(interestKey('Offers', ['offers', 'offers-2'])).toBe('offers-3')
    expect(interestKey('☕', [])).toBe('topic')
  })

  it('are worded in the visitor’s language, or by their name', () => {
    expect(interestText(TOPICS[1], 'es')).toBe('Aprender inglés')
    expect(interestText(TOPICS[0], 'en')).toBe('Coffee tips')
    expect(interestText(TOPICS[2], 'es')).toBe('Offers')
  })

  it('need a name each, said once, a key each, and twelve at most', () => {
    expect(interestsProblem(TOPICS)).toBeNull()
    expect(interestsProblem([...TOPICS, { key: 'x', label: '  ', labels: {} }])).toBe('Each topic needs a name')
    expect(interestsProblem([...TOPICS, { key: 'x', label: 'offers ', labels: {} }])).toBe('Two topics have the same name')
    expect(interestsProblem([...TOPICS, { key: 'offers', label: 'Deals', labels: {} }])).toBe('Two topics have the same key')
    expect(interestsProblem([{ key: 'x', label: 'x'.repeat(41), labels: {} }])).toBe('A topic’s name is up to 40 characters')
    expect(interestsProblem(Array.from({ length: 13 }, (_, i) => ({ key: `k${i}`, label: `T${i}`, labels: {} })))).toBe('Up to 12 topics')
  })

  it('are matched from keys or the words people saw, and the rest is said back', () => {
    expect(matchInterests(['english', 'Trucos de cafe', 'OFFERS', 'english', 'yoga', 7, ''], TOPICS))
      .toEqual({ keys: ['english', 'coffee', 'offers'], tags: ['Learning English', 'Coffee tips', 'Offers'], unknown: ['yoga'] })
    expect(matchInterests('aprender inglés; offers', TOPICS).keys).toEqual(['english', 'offers'])
    expect(matchInterests(undefined, TOPICS)).toEqual({ keys: [], tags: [], unknown: [] })
  })
})

describe('a sign-up', () => {
  it('is an email that is one, the topics the business has and the visitor’s language', () => {
    const read = readSignup({ email: '  Lucia@Example.COM ', name: 'Lucía García López', phone: '600 111 222', interests: ['english', 'yoga'],
      lang: 'ES', source: 'first_visit_popup', signed_up_at: '2026-10-17' }, TOPICS, false)
    expect(read).toEqual({ signup: {
      email: 'lucia@example.com', first_name: 'Lucía', last_name: 'García López', phone: '+34 600 111 222', interests: ['english'], tags: ['Learning English'],
      unknown: ['yoga'], lang: 'es', place: 'first_visit_popup', at: null,
    } })
  })

  it('takes a separate first and last name, and keeps when they signed up only from the website’s server', () => {
    vi.useFakeTimers({ now: new Date('2026-11-06T10:00:00Z') })
    const read = readSignup({ email: 'a@b.es', first_name: 'Ana', last_name: 'Ruiz', name: 'Ignored', lang: 'fr', place: 'footer', signed_up_at: '2026-10-17' }, TOPICS, true)
    expect(read).toMatchObject({ signup: { first_name: 'Ana', last_name: 'Ruiz', lang: null, place: 'footer', at: '2026-10-17T12:00:00.000Z', phone: null } })
  })

  it('says what’s wrong: an email that isn’t one, a phone that isn’t one', () => {
    expect(readSignup({ email: 'not-an-email' }, TOPICS, false)).toEqual({ problem: 'invalidEmail' })
    expect(readSignup({}, TOPICS, false)).toEqual({ problem: 'invalidEmail' })
    expect(readSignup({ email: 'a@b.es', phone: '12' }, TOPICS, false)).toEqual({ problem: 'invalidPhone' })
  })

  it('knows a sign-up date: a day, a time, a Spanish date; not one still to come', () => {
    vi.useFakeTimers({ now: new Date('2026-11-06T10:00:00Z') })
    expect(signedUpAt('2026-10-17T09:30:00Z')).toBe('2026-10-17T09:30:00.000Z')
    expect(signedUpAt('17/10/2026')).toBe('2026-10-17T12:00:00.000Z')
    expect(signedUpAt('2026-12-01')).toBeNull()
    expect(signedUpAt('yesterday')).toBeNull()
    expect(signedUpAt(20261017)).toBeNull()
  })
})

describe('the form', () => {
  it('speaks the language asked for, else the browser’s, else Spanish', () => {
    expect(formLanguage('en', 'es-ES')).toBe('en')
    expect(formLanguage(null, 'fr-FR,fr;q=0.9,en;q=0.8')).toBe('en')
    expect(formLanguage('de', null)).toBe('es')
  })

  it('pastes into a website as a frame that grows to fit, listening only to the app', () => {
    expect(formUrl('https://app.test', 1, 'en')).toBe('https://app.test/api/site/1/newsletter?lang=en')
    const s = embedSnippet('https://app.test', 2)
    expect(s).toContain('<iframe id="business-agent-newsletter-2" src="https://app.test/api/site/2/newsletter"')
    expect(s).toContain('e.origin==="https://app.test"')
    expect(s).toContain('getElementById("business-agent-newsletter-2")')
  })
})

describe('a list brought in', () => {
  beforeEach(() => { vi.useFakeTimers({ now: new Date('2026-11-06T10:00:00Z') }) })

  it('reads Easy Beans’ website export: still subscribed, with a yes, their topics and when', () => {
    const csv = [
      'email,phone,source,lang,offer_optin,events_optin,interests,offer_code,offer_redeemed_at,unsubscribed_at,created_at,last_seen_at',
      '"ana@example.com","","first_visit_popup","es","true","true","offers,english","EB-1","","","2026-10-17T09:00:00Z","2026-10-17T09:00:00Z"',
      '"ben@example.com","","newsletter_section","en","false","true","","","","","2026-10-17T10:00:00Z",""',
      '"gone@example.com","","first_visit_popup","es","false","false","","","","2026-10-20T10:00:00Z","2026-10-17T11:00:00Z",""',
      '"test@example.com","","competition_test","","false","false","","","","","2026-10-17T12:00:00Z",""',
      '"not an email","","first_visit_popup","es","true","true","","","","","",""',
    ].join('\n')
    const list = readList(csv)
    expect(list.rows).toEqual([
      { email: 'ana@example.com', interests: ['offers', 'english'], lang: 'es', place: 'first_visit_popup', signed_up_at: '2026-10-17T09:00:00.000Z' },
      { email: 'ben@example.com', lang: 'en', place: 'newsletter_section', signed_up_at: '2026-10-17T10:00:00.000Z' },
    ])
    expect(list).toMatchObject({ notSubscribed: 2, skipped: 1 })
  })

  it('reads another service’s export (Spanish headings, a status, names, a phone that isn’t one left out)', () => {
    const csv = [
      'Correo electrónico;Nombre;Apellidos;Teléfono;Intereses;Fecha de alta;Estado',
      'LUIS@example.com;Luis;Pérez;600 000 000;{coffee,"english"};17/10/2026;suscrito',
      'marta@example.com;Marta;;12;;;baja',
      'luis@example.com;Luis;Again;;;;',
      'pepe@example.com;Pepe;;12;;;',
    ].join('\n')
    const list = readList(csv)
    expect(list.rows).toEqual([
      { email: 'luis@example.com', name: 'Luis Pérez', phone: '+34 600 000 000', interests: ['coffee', 'english'], signed_up_at: '2026-10-17T12:00:00.000Z' },
      { email: 'pepe@example.com', name: 'Pepe' },
    ])
    expect(list).toMatchObject({ notSubscribed: 1, skipped: 1 })
    expect(list.found).toEqual(expect.arrayContaining(['email', 'first_name', 'last_name', 'phone', 'interests', 'at', 'subscribed']))
  })
})
