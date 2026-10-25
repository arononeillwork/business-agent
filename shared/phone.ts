// Phone numbers as a country calling code picked from a list plus the number itself. Stored as one
// string ("+34 600 000 000"), as before. Country names come from the browser (Intl.DisplayNames),
// in the person's language, so only the codes live here.

/** ISO country → calling code. Where countries share a code, the first listed is the one assumed. */
export const CALLING_CODES: [string, string][] = [
  ['ES', '34'], ['GB', '44'], ['IE', '353'], ['US', '1'], ['CA', '1'], ['FR', '33'], ['DE', '49'], ['IT', '39'], ['PT', '351'],
  ['NL', '31'], ['BE', '32'], ['LU', '352'], ['CH', '41'], ['AT', '43'], ['DK', '45'], ['SE', '46'], ['NO', '47'], ['FI', '358'],
  ['IS', '354'], ['PL', '48'], ['CZ', '420'], ['SK', '421'], ['HU', '36'], ['RO', '40'], ['BG', '359'], ['GR', '30'], ['CY', '357'],
  ['MT', '356'], ['HR', '385'], ['SI', '386'], ['RS', '381'], ['BA', '387'], ['ME', '382'], ['MK', '389'], ['AL', '355'], ['XK', '383'],
  ['EE', '372'], ['LV', '371'], ['LT', '370'], ['UA', '380'], ['MD', '373'], ['BY', '375'], ['RU', '7'], ['KZ', '7'], ['TR', '90'],
  ['GE', '995'], ['AM', '374'], ['AZ', '994'], ['AD', '376'], ['MC', '377'], ['SM', '378'], ['LI', '423'], ['GI', '350'], ['GG', '44'],
  ['JE', '44'], ['IM', '44'], ['FO', '298'], ['GL', '299'],
  ['MA', '212'], ['DZ', '213'], ['TN', '216'], ['LY', '218'], ['EG', '20'], ['SN', '221'], ['ML', '223'], ['CI', '225'], ['GH', '233'],
  ['NG', '234'], ['CM', '237'], ['CV', '238'], ['GQ', '240'], ['GA', '241'], ['CG', '242'], ['CD', '243'], ['AO', '244'], ['ET', '251'],
  ['KE', '254'], ['TZ', '255'], ['UG', '256'], ['RW', '250'], ['MZ', '258'], ['ZM', '260'], ['ZW', '263'], ['MG', '261'], ['MU', '230'],
  ['ZA', '27'], ['NA', '264'], ['BW', '267'], ['SD', '249'], ['SO', '252'], ['MR', '222'], ['GM', '220'], ['GN', '224'], ['BJ', '229'],
  ['TG', '228'], ['BF', '226'], ['NE', '227'], ['TD', '235'], ['LR', '231'], ['SL', '232'], ['GW', '245'], ['ST', '239'], ['SC', '248'],
  ['IL', '972'], ['PS', '970'], ['LB', '961'], ['JO', '962'], ['SY', '963'], ['IQ', '964'], ['KW', '965'], ['SA', '966'], ['YE', '967'],
  ['OM', '968'], ['AE', '971'], ['QA', '974'], ['BH', '973'], ['IR', '98'], ['AF', '93'], ['PK', '92'], ['IN', '91'], ['BD', '880'],
  ['LK', '94'], ['NP', '977'], ['MV', '960'], ['CN', '86'], ['HK', '852'], ['MO', '853'], ['TW', '886'], ['JP', '81'], ['KR', '82'],
  ['MN', '976'], ['VN', '84'], ['TH', '66'], ['MY', '60'], ['SG', '65'], ['ID', '62'], ['PH', '63'], ['KH', '855'], ['LA', '856'],
  ['MM', '95'], ['BN', '673'], ['AU', '61'], ['NZ', '64'], ['FJ', '679'], ['PG', '675'],
  ['MX', '52'], ['GT', '502'], ['BZ', '501'], ['SV', '503'], ['HN', '504'], ['NI', '505'], ['CR', '506'], ['PA', '507'], ['CU', '53'],
  ['DO', '1'], ['PR', '1'], ['JM', '1'], ['BS', '1'], ['BB', '1'], ['TT', '1'], ['HT', '509'], ['CO', '57'], ['VE', '58'], ['EC', '593'],
  ['PE', '51'], ['BO', '591'], ['CL', '56'], ['AR', '54'], ['UY', '598'], ['PY', '595'], ['BR', '55'], ['GY', '592'], ['SR', '597'],
]

export const DEFAULT_COUNTRY = 'ES'

export const callingCode = (country: string) => CALLING_CODES.find(([c]) => c === country)?.[1] ?? '34'

/**
 * Split a saved number into its country and the rest. A number without a + is taken as local to
 * `fallback` (Spain unless said otherwise); the longest matching code wins (+353 before +35…).
 */
export function splitPhone(value: string | null | undefined, fallback = DEFAULT_COUNTRY): { country: string; number: string } {
  const v = (value ?? '').trim()
  if (!v.startsWith('+')) return { country: fallback, number: v }
  const digits = v.slice(1).replace(/\D/g, '')
  const match = [...CALLING_CODES].sort((a, b) => b[1].length - a[1].length).find(([, code]) => digits.startsWith(code))
  if (!match) return { country: fallback, number: v }
  // The first country with that code (Spain for +34, the UK for +44, the US for +1).
  const country = fallback && callingCode(fallback) === match[1] ? fallback : CALLING_CODES.find(([, code]) => code === match[1])![0]
  // Keep the person's own spacing after the code.
  let seen = 0, i = 1
  while (i < v.length && seen < match[1].length) { if (/\d/.test(v[i])) seen++; i++ }
  return { country, number: v.slice(i).trim() }
}

/** The number to save: "+34 600 000 000", or '' when no number was typed. */
export function joinPhone(country: string, number: string) {
  const n = number.replace(/[^\d ]/g, '').replace(/\s+/g, ' ').trim()
  return n ? `+${callingCode(country)} ${n}` : ''
}

/** A country's flag as emoji (regional indicator letters). */
export const flagEmoji = (country: string) =>
  String.fromCodePoint(...[...country.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
