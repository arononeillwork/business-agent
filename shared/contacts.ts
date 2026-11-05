// Contacts: the people the business calls on (the lawyer, the bank, the plumber…), with their phone,
// WhatsApp, email and website. Only the owners (admins with pay access) see and change them (the
// `business_contacts` migration, whose rules the demo and the AI tools follow). Easy Beans starts with its
// own (the test checks the two agree). What someone does is one of the usual jobs, kept by its English
// name and shown in each person's language, or the business's own words.
import { msg } from './i18n'
import { EMAIL, cleanPhone } from './customers'
import { cleanWebsite } from './connections'

export interface Contact {
  id: string
  name: string
  /** What they do for the business: a usual job's English name ("Lawyer"), or the business's own words. */
  job: string | null
  /** Their firm or bank: "BBVA". */
  company: string | null
  /** As saved everywhere: "+34 600 000 000". */
  phone: string | null
  /** They answer on WhatsApp at that number. */
  whatsapp: boolean
  email: string | null
  website: string | null
  notes: string | null
}
export type ContactInput = Partial<Omit<Contact, 'id'>> & { id?: string; name: string }

/** The same limits as the database's. */
export const CONTACT_LIMITS = { name: 120, job: 80, company: 120, email: 254, website: 300, notes: 2000 } as const

/** The people a business usually calls on, kept by their English name. */
export const USUAL_JOBS: string[] = [
  msg('Lawyer'),
  msg('Accountant / gestoría'),
  msg('Bank advisor'),
  msg('Insurance agent'),
  msg('Landlord'),
  msg('Plumber'),
  msg('Electrician'),
  msg('Plumber & electrician'),
  msg('Handyman'),
  msg('Locksmith'),
  msg('Coffee machine technician'),
  msg('Refrigeration technician'),
  msg('Pest control'),
]

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()

/** What someone does, in the person's language (`translate`: the app's t()). */
export const jobName = (job: string | null | undefined, translate: (s: string) => string) =>
  !job ? '' : USUAL_JOBS.includes(job) ? translate(job) : job

/** What's typed as what someone does, as saved: a usual job in any language becomes its English name. */
export function jobKey(typed: string | null | undefined, translate: (s: string) => string): string | null {
  const v = (typed ?? '').trim()
  if (!v) return null
  return USUAL_JOBS.find(j => fold(j) === fold(v) || fold(translate(j)) === fold(v)) ?? v
}

/** A contact as saved: blanks are none, the phone and website written the usual way, WhatsApp only with a phone. */
export function tidyContact<T extends ContactInput>(c: T): T {
  const text = (v: string | null | undefined) => v?.trim() || null
  const phone = text(c.phone)
  return {
    ...c, name: c.name.trim(), job: text(c.job), company: text(c.company), email: text(c.email), notes: text(c.notes),
    phone: phone && (cleanPhone(phone) ?? phone), website: cleanWebsite(c.website), whatsapp: !!phone && !!c.whatsapp,
  }
}

/** What's wrong before it's saved (the database says the same), or null. Pass it tidied. */
export function contactProblem(c: ContactInput): string | null {
  if (!c.name.trim()) return msg('Give them a name')
  if (c.name.length > CONTACT_LIMITS.name) return msg('Keep the name to 120 characters')
  if ((c.job ?? '').length > CONTACT_LIMITS.job) return msg('Keep what they do to 80 characters')
  if ((c.company ?? '').length > CONTACT_LIMITS.company) return msg('Keep the company to 120 characters')
  if (c.phone && !/^\+[0-9][0-9 ]{4,24}$/.test(c.phone)) return msg('Write the phone number with its country code, like +34 600 000 000')
  if (c.email && (c.email.length > CONTACT_LIMITS.email || !EMAIL.test(c.email))) return msg('Enter a full email address, like name@example.com')
  if (c.website && (c.website.length > CONTACT_LIMITS.website || !/^https?:\/\/[^\s/]+\S*$/i.test(c.website))) return msg('The link needs to start with https://')
  if ((c.notes ?? '').length > CONTACT_LIMITS.notes) return msg('Keep the notes to 2,000 characters')
  return null
}

/** In order of what they do (in the person's language; those without a job last), then by name. */
export function sortContacts<T extends Pick<Contact, 'name' | 'job'>>(list: T[], translate: (s: string) => string): T[] {
  const job = (c: T) => (c.job ? fold(jobName(c.job, translate)) : '￿')
  return [...list].sort((a, b) => job(a).localeCompare(job(b)) || fold(a.name).localeCompare(fold(b.name)))
}

/** Does the search box match them (name, job in either language, company, email, notes; a phone by its digits)? */
export function matchesContact(c: Contact, q: string, translate: (s: string) => string) {
  const term = fold(q)
  if (!term) return true
  const digits = term.replace(/[\s+]/g, '')
  if (/^\d{3,}$/.test(digits) && c.phone?.replace(/\D/g, '').includes(digits)) return true
  return fold([c.name, c.job, jobName(c.job, translate), c.company, c.email, c.website, c.notes].filter(Boolean).join(' ')).includes(term)
}

/** A website as shown on its button: "bbva.es". */
export const siteName = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')

/**
 * Easy Beans' own, as the owners gave them (the `business_contacts` migration puts the same in its database, and the
 * `lawyer_email` migration Eduardo's email).
 */
export const EASY_BEANS_CONTACTS: Omit<Contact, 'id'>[] = [
  { name: 'Eduardo Torquino', job: 'Lawyer', company: null, phone: '+34 747 758 327', whatsapp: false, email: 'torquino71@gmail.com', website: null,
    notes: null },
  { name: 'Daniel Cruz Luna', job: 'Bank advisor', company: 'BBVA', phone: '+34 955 677 963', whatsapp: false, email: 'daniel.cruz.luna@bbva.com',
    website: 'https://www.bbva.es', notes: null },
  { name: 'Miguel', job: 'Plumber & electrician', company: null, phone: '+34 632 042 132', whatsapp: true, email: null, website: null, notes: null },
]
