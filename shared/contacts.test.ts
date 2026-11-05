import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EASY_BEANS_CONTACTS, contactProblem, jobKey, jobName, matchesContact, siteName, sortContacts, tidyContact, type Contact,
} from './contacts'

// A stand-in for the app's t(): Spanish for a few usual jobs.
const SPANISH: Record<string, string> = { 'Lawyer': 'Abogado', 'Bank advisor': 'Asesor bancario', 'Plumber & electrician': 'Fontanero y electricista' }
const es = (s: string) => SPANISH[s] ?? s
const en = (s: string) => s

const contact = (name: string, p: Partial<Contact> = {}): Contact =>
  ({ id: name, name, job: null, company: null, phone: null, whatsapp: false, email: null, website: null, notes: null, ...p })

describe('contacts', () => {
  it('keeps a usual job by its English name and shows it in the person’s language; anything else as written', () => {
    expect(jobName('Lawyer', es)).toBe('Abogado')
    expect(jobName('Lawyer', en)).toBe('Lawyer')
    expect(jobName('Window cleaner', es)).toBe('Window cleaner')
    expect(jobName(null, es)).toBe('')
    expect(jobKey(' abogado ', es)).toBe('Lawyer')
    expect(jobKey('LAWYER', es)).toBe('Lawyer')
    expect(jobKey('Asesor Bancário', es)).toBe('Bank advisor')
    expect(jobKey('Window cleaner', es)).toBe('Window cleaner')
    expect(jobKey('  ', es)).toBeNull()
  })

  it('tidies what’s typed: the phone and website the usual way, blanks as none, WhatsApp only with a phone', () => {
    const c = tidyContact({ name: ' Eduardo Torquino ', phone: '+34 747 75 83 27', website: 'www.bbva.es', email: ' ', company: '', whatsapp: true })
    expect(c).toMatchObject({ name: 'Eduardo Torquino', phone: '+34 747 758 327', website: 'https://www.bbva.es', email: null, company: null, whatsapp: true })
    expect(tidyContact({ name: 'Daniel', phone: '955677963' }).phone).toBe('+34 955 677 963')
    expect(tidyContact({ name: 'Miguel', phone: ' ', whatsapp: true })).toMatchObject({ phone: null, whatsapp: false })
  })

  it('says what’s wrong before it’s saved, as the database would', () => {
    expect(contactProblem(tidyContact({ name: ' ' }))).toBe('Give them a name')
    expect(contactProblem(tidyContact({ name: 'Pepe', phone: '12' }))).toBe('Write the phone number with its country code, like +34 600 000 000')
    expect(contactProblem(tidyContact({ name: 'Pepe', email: 'pepe@' }))).toBe('Enter a full email address, like name@example.com')
    expect(contactProblem(tidyContact({ name: 'Pepe', website: 'https://bad link' }))).toBe('The link needs to start with https://')
    expect(contactProblem(tidyContact({ name: 'Pepe', job: 'x'.repeat(81) }))).toBe('Keep what they do to 80 characters')
    expect(contactProblem(tidyContact({ name: 'Pepe', phone: '+44 20 7946 0958', email: 'pepe@example.com', website: 'pepe.es' }))).toBeNull()
  })

  it('puts them in order of what they do, in the person’s language, then by name; no job last', () => {
    const list = [contact('Miguel', { job: 'Plumber & electrician' }), contact('Zoe'), contact('Eduardo', { job: 'Lawyer' }), contact('Daniel', { job: 'Bank advisor' })]
    expect(sortContacts(list, en).map(c => c.name)).toEqual(['Daniel', 'Eduardo', 'Miguel', 'Zoe'])
    // Abogado, Asesor bancario, Fontanero y electricista.
    expect(sortContacts(list, es).map(c => c.name)).toEqual(['Eduardo', 'Daniel', 'Miguel', 'Zoe'])
  })

  it('finds them by name, job in either language, company, or a phone number’s digits', () => {
    const daniel = contact('Daniel Cruz Luna', { job: 'Bank advisor', company: 'BBVA', phone: '+34 955 677 963', email: 'daniel.cruz.luna@bbva.com' })
    expect(matchesContact(daniel, 'cruz', es)).toBe(true)
    expect(matchesContact(daniel, 'asesor', es)).toBe(true)
    expect(matchesContact(daniel, 'bank', es)).toBe(true)
    expect(matchesContact(daniel, 'bbva', es)).toBe(true)
    expect(matchesContact(daniel, '677 963', es)).toBe(true)
    expect(matchesContact(daniel, 'plumber', es)).toBe(false)
    expect(matchesContact(daniel, ' ', es)).toBe(true)
  })

  it('shows a website by its name', () => {
    expect(siteName('https://www.bbva.es/')).toBe('bbva.es')
    expect(siteName('http://abogados.example/contacto')).toBe('abogados.example/contacto')
  })

  it('has Easy Beans’ own, each fine to save', () => {
    for (const c of EASY_BEANS_CONTACTS) {
      expect(contactProblem(c)).toBeNull()
      expect(tidyContact(c)).toEqual(c)
    }
    expect(EASY_BEANS_CONTACTS.map(c => [c.name, c.job, c.phone, c.whatsapp])).toEqual([
      ['Eduardo Torquino', 'Lawyer', '+34 747 758 327', false],
      ['Daniel Cruz Luna', 'Bank advisor', '+34 955 677 963', false],
      ['Miguel', 'Plumber & electrician', '+34 632 042 132', true],
    ])
  })

  it('puts the same into Easy Beans’ database (the `business_contacts` migration)', () => {
    const dir = join(import.meta.dirname, '../supabase/migrations')
    const sql = readFileSync(join(dir, readdirSync(dir).find(f => f.endsWith('_business_contacts.sql'))!), 'utf8')
    expect(JSON.parse(sql.split('$json$')[1])).toEqual(EASY_BEANS_CONTACTS)
  })
})
