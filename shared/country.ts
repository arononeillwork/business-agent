// The countries The Business Agent works in: Spain and Ireland. A business has one (business.country,
// asked at sign-up; the country migration), and the app's rules, labels and defaults follow it: time
// zone, VAT rates, the tax ID, the phone prefix, the working-time record, who does the books. The app
// sets the current one when a business loads (setCountry), as it does the currency and time zone.
import { msg } from './i18n.ts'

export type Country = 'ES' | 'IE'
export const COUNTRY_CODES: Country[] = ['ES', 'IE']

export interface CountryProfile {
  code: Country
  name: string
  /** The time zone a business there starts with (the Canaries pick theirs). */
  timezone: string
  locale: string
  callingCode: string
  /** VAT rates a business there charges, lowest first, and the usual one for food and drink served. */
  vatRates: number[]
  defaultVat: number
  /** What the business's tax ID is called. */
  taxIdLabel: string
  taxIdHelp: string
  /** The record of each person's working hours the law asks for, how it's known, and how long it's kept. */
  hoursRecord: { name: string; law: string; years: number }
  /** Who usually does the books and payroll. */
  adviser: string
  /** Where staff benefits and leave rules are checked (Staff benefits). */
  lawSource: { label: string; url: string }
}

export const COUNTRIES: Record<Country, CountryProfile> = {
  ES: {
    code: 'ES', name: msg('Spain'), timezone: 'Europe/Madrid', locale: 'es-ES', callingCode: '34',
    vatRates: [0, 4, 10, 21], defaultVat: 10,
    taxIdLabel: 'CIF / NIF', taxIdHelp: msg('A CIF (B12345678) for a company, or a NIF or NIE for a self-employed person'),
    hoursRecord: { name: msg('Registro de jornada'), law: msg('Estatuto de los Trabajadores, art. 34.9'), years: 4 },
    adviser: msg('gestoría'),
    lawSource: { label: 'BOE', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430' },
  },
  IE: {
    code: 'IE', name: msg('Ireland'), timezone: 'Europe/Dublin', locale: 'en-IE', callingCode: '353',
    vatRates: [0, 9, 13.5, 23], defaultVat: 13.5,
    taxIdLabel: msg('VAT or CRO number'), taxIdHelp: msg('A VAT number (IE1234567T) or the company’s CRO number'),
    // Kept 3 years: section 25 of the Act. S.I. 473/2001 (the Records (Prescribed Form and Exemptions) Regulations) sets their form.
    hoursRecord: { name: msg('Working time records'), law: msg('Organisation of Working Time Act 1997, s.25'), years: 3 },
    adviser: msg('accountant'),
    lawSource: { label: 'Workplace Relations Commission', url: 'https://www.workplacerelations.ie/en/what_you_should_know/' },
  },
}

/**
 * Pages a new business there starts with hidden: none, now that Grants and Tax have Ireland's own (Revenue's
 * returns, the LEO's and SEAI's grants). Keep in step with seed_new_business() (the Irish tax and grants migration).
 */
export const COUNTRY_HIDDEN_PAGES: Record<Country, string[]> = { ES: [], IE: [] }

export const isCountry = (c: unknown): c is Country => c === 'ES' || c === 'IE'
/** The country of a time zone: Dublin's is Ireland, the rest Spain (the two the app knows). */
export const countryFromTimeZone = (tz: string | null | undefined): Country => (tz === 'Europe/Dublin' ? 'IE' : 'ES')

let current: Country = 'ES'
/** Set by the app when a business loads; unknown stays Spain. */
export function setCountry(c: string | null | undefined) { current = isCountry(c) ? c : 'ES' }
export const currentCountry = () => current
export const countryProfile = (c: Country = current) => COUNTRIES[c]

/** The VAT rates to pick from here: the country's, plus one already saved that isn't among them. */
export function vatChoices(saved?: number | null, c: Country = current): number[] {
  const rates = COUNTRIES[c].vatRates
  return saved == null || rates.includes(Number(saved)) ? rates : [...rates, Number(saved)].sort((a, b) => a - b)
}

/**
 * An Irish tax ID, tidied (spaces gone, capitals), or null when it isn't one: a VAT number (IE, seven
 * digits and one or two letters, or the older IE + digit + letter + five digits + letter) or a company's
 * CRO number (up to six digits).
 */
export function irishTaxId(raw: string): string | null {
  const v = raw.replace(/[\s.-]/g, '').toUpperCase()
  if (/^\d{1,6}$/.test(v)) return v
  const vat = v.startsWith('IE') ? v : `IE${v}`
  if (/^IE\d{7}[A-W][A-IW]?$/.test(vat) || /^IE\d[A-Z+*]\d{5}[A-W]$/.test(vat)) return vat
  return null
}
