// The demo's newsletter sign-ups (Website & SEO), with the `newsletter` migration's rules: only admins see
// and change the set-up; a list brought in puts each person on Customers once, as a lead from the website
// with a yes to marketing and the topics as tags. Easy Beans starts with its website's six topics and
// three sign-ups from people already on Customers.
import type { Api } from './api'
import type { Customer } from '../../shared/types'
import { NEWSLETTER_OFF, interestsProblem, readSignup, type NewsletterEvent, type NewsletterSettings } from '../../shared/newsletter'

interface Who { isAdmin: () => boolean; uid: () => string; nowIso: () => string; daysAgo: (n: number) => string }
type NewsletterApi = Pick<Api, 'newsletter' | 'saveNewsletter' | 'newsletterEvents' | 'makeNewsletterKey' | 'dropNewsletterKey' | 'importNewsletterList'>

const clone = <T,>(x: T): T => structuredClone(x)
const refuse = (text: string): never => { throw new Error(text) }

export function demoNewsletterApi(w: Who, customers: Customer[]): NewsletterApi {
  const admin = () => { if (!w.isAdmin()) refuse('Only an admin can set up the newsletter') }
  const settings: NewsletterSettings = {
    ...NEWSLETTER_OFF, enabled: true, ask_name: false, ask_phone: true,
    interests: [
      { key: 'coffee', label: 'Coffee tips', labels: { en: 'Coffee tips', es: 'Trucos de café' } },
      { key: 'spanish', label: 'Learning Spanish', labels: { en: 'Learning Spanish', es: 'Aprender español' } },
      { key: 'english', label: 'Learning English', labels: { en: 'Learning English', es: 'Aprender inglés' } },
      { key: 'menu', label: 'Menu updates', labels: { en: 'Menu updates', es: 'Novedades' } },
      { key: 'events', label: 'Events', labels: { en: 'Events', es: 'Eventos' } },
      { key: 'offers', label: 'Offers', labels: { en: 'Offers', es: 'Ofertas' } },
    ],
  }
  const event = (email: string, interests: string[], days: number, more: Partial<NewsletterEvent> = {}): NewsletterEvent[] => {
    const c = customers.find(x => x.email === email)
    return c ? [{ id: w.uid(), customer_id: c.id, action: 'signup', email, interests, lang: 'en', place: 'first_visit_popup', via: 'website', at: w.daysAgo(days), ...more }] : []
  }
  const events: NewsletterEvent[] = [
    ...event('hannah.becker@example.de', ['spanish', 'events'], 3),
    ...event('sofia.lindqvist@example.se', ['spanish', 'coffee', 'offers'], 8, { lang: 'es', place: 'newsletter_section' }),
    ...event('liam.oconnor@example.ie', ['events', 'offers'], 15),
  ]

  return {
    async newsletter() { admin(); return clone(settings) },
    async saveNewsletter(patch) {
      admin()
      if (patch.interests) {
        const problem = interestsProblem(patch.interests)
        if (problem) refuse(problem)
      }
      Object.assign(settings, clone(patch))
    },
    async newsletterEvents() { admin(); return clone(events).sort((a, b) => b.at.localeCompare(a.at)) },
    async makeNewsletterKey() {
      admin()
      const key = `nl_${w.uid().replace(/-/g, '').slice(0, 32)}DEMOKEY0`
      Object.assign(settings, { key_hint: key.slice(-4), key_made_at: w.nowIso() })
      return { key, key_hint: settings.key_hint!, key_made_at: settings.key_made_at! }
    },
    async dropNewsletterKey() { admin(); Object.assign(settings, { key_hint: null, key_made_at: null }) },
    async importNewsletterList(rows) {
      admin()
      let added = 0, skipped = 0
      const unknown = new Set<string>()
      for (const row of rows) {
        const read = readSignup({ ...row }, settings.interests, true)
        if ('problem' in read) { skipped++; continue }
        const s = read.signup
        s.unknown.forEach(u => unknown.add(u))
        let c = customers.find(x => x.email?.toLowerCase() === s.email)
        if (!c) {
          c = { id: w.uid(), kind: 'lead', first_name: s.first_name, last_name: s.last_name, email: s.email, phone: s.phone, company: null, source: 'website',
            instagram: null, birthday: null, tags: [], notes: null, marketing_consent: false, consent_at: null, last_contacted_at: null,
            created_at: w.nowIso(), updated_at: w.nowIso() }
          customers.unshift(c)
        }
        c.tags = [...c.tags, ...s.tags.filter(t => !c!.tags.includes(t))].slice(0, 20).sort((a, b) => a.localeCompare(b))
        if (!c.marketing_consent) Object.assign(c, { marketing_consent: true, consent_at: w.nowIso() })
        events.push({ id: w.uid(), customer_id: c.id, action: 'signup', email: s.email, interests: s.interests, lang: s.lang, place: s.place, via: 'import', at: s.at ?? w.nowIso() })
        added++
      }
      return { added, skipped, unknown: [...unknown] }
    },
  }
}
