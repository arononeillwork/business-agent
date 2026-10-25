// Staff rules: the house rules everyone on the team follows (being on time and clocking in, uniform
// and hygiene, food safety, phones, breaks, customers, the till, safety, respect), in sections.
// Admins write them or start from the usual ones for a café in Spain; each employee confirms they've
// read them, and is asked again when a section is added or changed after that.
import { msg } from './i18n'

export interface RuleSection {
  id: string
  title: string
  intro: string | null
  rules: string[]
  sort: number
  updated_at: string
}
export type RuleSectionInput = Partial<Omit<RuleSection, 'id' | 'updated_at'>> & { id?: string }

/** When someone last confirmed they'd read the rules. */
export interface RulesRead { profile_id: string; read_at: string }

/** The same limits as the database's. */
export const RULE_LIMITS = { title: 120, intro: 1000, rule: 500, rules: 50 }

/** Rules from the form, one per line: trimmed, bullets taken off, blanks and repeats left out. */
export function rulesFromLines(text: string): string[] {
  const seen = new Set<string>()
  return text.split('\n').map(l => l.replace(/^\s*[-•*·]\s*/, '').trim()).filter(r => {
    const key = r.toLowerCase()
    if (!r || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** What's wrong with a section before it's saved (the database says the same), or null. */
export function sectionProblem(s: Pick<RuleSection, 'title' | 'intro' | 'rules'>): string | null {
  if (!s.title.trim()) return msg('Give the section a title')
  if (s.title.trim().length > RULE_LIMITS.title) return msg('Keep the title to 120 characters')
  if ((s.intro ?? '').length > RULE_LIMITS.intro) return msg('Keep the introduction to 1,000 characters')
  if (!s.rules.length) return msg('Write at least one rule')
  if (s.rules.length > RULE_LIMITS.rules) return msg('A section can have up to 50 rules')
  if (s.rules.some(r => r.length > RULE_LIMITS.rule)) return msg('Keep each rule to 500 characters')
  return null
}

export const sortSections = <S extends Pick<RuleSection, 'sort' | 'title'>>(sections: S[]) =>
  [...sections].sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title))

/** When the rules last changed (a section added or edited); null when there are none. Taking one away asks nobody to read again. */
export const rulesChangedAt = (sections: Pick<RuleSection, 'updated_at'>[]) =>
  sections.reduce<string | null>((latest, s) => (!latest || s.updated_at > latest ? s.updated_at : latest), null)

/** read: confirmed since the last change; outdated: confirmed before it; never: not yet. */
export type ReadState = 'read' | 'outdated' | 'never'
export function readState(read: RulesRead | undefined, changedAt: string | null): ReadState {
  if (!read) return 'never'
  return changedAt && Date.parse(read.read_at) < Date.parse(changedAt) ? 'outdated' : 'read'
}

export interface RulePreset { title: string; intro?: string; rules: string[] }

/** The usual house rules for a café in Spain: a starting point, to change to how the business works. */
export const RULE_PRESETS: RulePreset[] = [
  { title: msg('Being on time and clocking in'), rules: [
    msg('Be ready to start at the time on the rota: come a few minutes early to change.'),
    msg('Clock in when you start and out when you finish, on the café tablet or your phone. The law asks for a record of everyone’s hours (registro de jornada).'),
    msg('Running late or ill? Tell the shift lead or the owner as soon as you know, not once the shift has started.'),
    msg('Want to swap a shift? Agree it with the shift lead first, so the rota stays right.'),
  ] },
  { title: msg('Uniform and hygiene'), rules: [
    msg('Wear the café’s uniform, clean, with closed shoes.'),
    msg('Tie long hair back, keep nails short and clean, and take off rings and watches before handling food.'),
    msg('Wash your hands when you start, after a break, after the toilet and after touching rubbish or raw food.'),
    msg('With vomiting or diarrhoea, don’t come in: tell us, and stay off until 48 hours after it’s stopped.'),
  ] },
  { title: msg('Food safety and allergens'), rules: [
    msg('Label everything you open or prepare with what it is and the date.'),
    msg('Check the fridge temperatures when you open and write them down.'),
    msg('Know the 14 allergens in what we serve. If a customer asks and you’re not sure, ask: never guess.'),
    msg('Anything past its date goes in the bin, and in the Waste log.'),
  ] },
  { title: msg('Phones and your things'), rules: [
    msg('Phones stay in your bag or locker during service: use them on your break.'),
    msg('Keep bags and coats in the staff area, not behind the bar.'),
  ] },
  { title: msg('Breaks, staff food and drinks'), rules: [
    msg('Take your break when the shift lead says, and start and end it on the app.'),
    msg('Staff food and drinks are as in Staff benefits; anything else goes through the till.'),
    msg('Eat and drink out of the customers’ sight.'),
  ] },
  { title: msg('Customers'), rules: [
    msg('Greet every customer and smile, even when it’s busy.'),
    msg('Tap water is free for customers who ask for it: it’s the law.'),
    msg('Pass complaints to the shift lead, and never argue with a customer.'),
    msg('If someone asks for the complaints form (hoja de quejas y reclamaciones), give it to them straight away and tell the shift lead.'),
  ] },
  { title: msg('The till and cash'), rules: [
    msg('Every sale goes through the till, every time.'),
    msg('Refunds and discounts only with the shift lead’s OK.'),
    msg('Never leave the till open or cash unattended.'),
    msg('Tips go in the tip jar and are shared out as agreed.'),
  ] },
  { title: msg('Health and safety'), rules: [
    msg('Know where the first aid kit, the fire extinguishers and the emergency exits are.'),
    msg('Wipe up spills straight away and put out the wet floor sign.'),
    msg('Tell the shift lead about any accident or injury the same day, however small.'),
    msg('Only use equipment you’ve been shown how to use.'),
  ] },
  { title: msg('Respect and privacy'), rules: [
    msg('Treat everyone with respect: no harassment, discrimination or bullying, ever.'),
    msg('Don’t post photos or videos of customers or the team without asking them.'),
    msg('What you know about customers and the team stays in the café.'),
    msg('Anything worrying you? Talk to the owner: it stays between you.'),
  ] },
]
