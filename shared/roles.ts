// Roles & responsibilities: who does what in the business. Each role (head barista, shop manager,
// chef…) says what it's for, who it answers to, who's in it and, when it's worked on the rota, as which
// position; then its duties: its core responsibilities, what's also part of the role, and any done at
// a set time (opening, during service, closing, each week). Admins write them or start from the
// presets (a café's usual roles, added in the language they use the app in); the whole team reads them.
import { msg } from './i18n'

export type DutyWhen = 'core' | 'also' | 'opening' | 'service' | 'closing' | 'weekly'
export const DUTY_WHEN: { id: DutyWhen; label: string }[] = [
  { id: 'core', label: msg('Core responsibilities') },
  { id: 'also', label: msg('Also part of the role') },
  { id: 'opening', label: msg('Opening') },
  { id: 'service', label: msg('During service') },
  { id: 'closing', label: msg('Closing') },
  { id: 'weekly', label: msg('Every week') },
]
export const DUTY_WHENS = DUTY_WHEN.map(w => w.id)

export interface Duty { when: DutyWhen; text: string }

export interface JobRole {
  id: string
  name: string
  summary: string | null
  /** The rota position it's worked as (Barista, Kitchen…), when it has one. */
  position_id: number | null
  /** The role it answers to. */
  reports_to: string | null
  /** Who's in it (profile ids). */
  people: string[]
  duties: Duty[]
  sort: number
  updated_at: string
}
export type JobRoleInput = Partial<Omit<JobRole, 'id' | 'updated_at'>> & { id?: string }

/** The same limits as the database's. */
export const ROLE_LIMITS = { name: 80, summary: 1000, duty: 300, duties: 60 }

/** Duties from the form (one per line in each group): trimmed, blanks and repeats in a group left out. */
export function dutiesFromLines(lines: Partial<Record<DutyWhen, string>>): Duty[] {
  return DUTY_WHENS.flatMap(when => {
    const seen = new Set<string>()
    return (lines[when] ?? '').split('\n').map(l => l.replace(/^\s*[-•*·]\s*/, '').trim()).filter(text => {
      const key = text.toLowerCase()
      if (!text || seen.has(key)) return false
      seen.add(key)
      return true
    }).map(text => ({ when, text }))
  })
}

/** The other way: each group's duties, one per line, for the form. */
export const linesOf = (duties: Duty[]): Record<DutyWhen, string> =>
  Object.fromEntries(DUTY_WHENS.map(when => [when, duties.filter(d => d.when === when).map(d => d.text).join('\n')])) as Record<DutyWhen, string>

/** The groups that have duties, in the day's order. */
export const dutiesByWhen = (duties: Duty[]) =>
  DUTY_WHEN.map(w => ({ ...w, duties: duties.filter(d => d.when === w.id).map(d => d.text) })).filter(g => g.duties.length)

/** What's wrong with a role before it's saved (the database says the same), or null. */
export function roleProblem(r: Pick<JobRole, 'name' | 'summary' | 'duties'>): string | null {
  if (!r.name.trim()) return msg('Give the role a name')
  if (r.name.trim().length > ROLE_LIMITS.name) return msg('Keep the name to 80 characters')
  if ((r.summary ?? '').length > ROLE_LIMITS.summary) return msg('Keep what it’s for to 1,000 characters')
  if (r.duties.length > ROLE_LIMITS.duties) return msg('A role can have up to 60 duties')
  if (r.duties.some(d => d.text.length > ROLE_LIMITS.duty)) return msg('Keep each duty to 300 characters')
  return null
}

/** Roles in their order: the page's, the AI connector's. */
export const sortRoles = <R extends Pick<JobRole, 'sort' | 'name'>>(roles: R[]) =>
  [...roles].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))

export interface RolePreset {
  name: string
  summary: string
  /** The preset it answers to, by name. */
  reportsTo?: string
  /** Rota position names it matches (any language), to link it to one. */
  positions: string[]
  duties: Duty[]
}

const d = (when: DutyWhen, ...texts: string[]): Duty[] => texts.map(text => ({ when, text }))

/** A café's usual roles: a starting point, to change to how the business works. */
export const ROLE_PRESETS: RolePreset[] = [
  {
    name: msg('Owner'), positions: ['owner', 'propietario', 'propietaria', 'dueño', 'dueña'],
    summary: msg('Runs the business: the team, the money, the suppliers and where the café is going.'),
    duties: [
      ...d('core', msg('Hires the team and agrees their contracts and pay'), msg('Sets the menu, the prices and the opening hours'),
        msg('Keeps the licences, insurance and taxes up to date with the gestoría'), msg('Is who the team goes to with a problem')),
      ...d('weekly', msg('Publishes the rota and approves time off'), msg('Approves the week’s timecards'),
        msg('Checks the takings against the till and the bank'), msg('Pays the suppliers’ invoices')),
    ],
  },
  {
    name: msg('Shift lead'), reportsTo: msg('Owner'), positions: ['shift lead', 'encargado', 'encargada', 'manager'],
    summary: msg('Runs the shift: the team on it, the till and the customers, so service goes smoothly.'),
    duties: [
      ...d('opening', msg('Opens up and checks the café is ready before the doors open'), msg('Counts the float into the till'),
        msg('Checks who’s on and shares out the jobs for the shift')),
      ...d('service', msg('Keeps the queue moving and helps wherever it’s busiest'), msg('Deals with complaints, refunds and discounts'),
        msg('Makes sure everyone takes their break')),
      ...d('closing', msg('Checks the closing jobs are done before anyone leaves'), msg('Cashes up and records the takings'),
        msg('Locks up and sets the alarm')),
      ...d('core', msg('Tells the owner about anything that broke, ran out or went wrong')),
    ],
  },
  {
    name: msg('Barista'), reportsTo: msg('Shift lead'), positions: ['barista'],
    summary: msg('Makes the coffee and looks after the customers: the face of the café.'),
    duties: [
      ...d('opening', msg('Switches on the espresso machine and grinders and lets them warm up'),
        msg('Dials in the espresso and tastes it before the first customer'), msg('Fills up the milk, cups, lids, sugar and napkins')),
      ...d('service', msg('Takes orders and payments at the till'), msg('Makes every drink to the recipe, the same each time'),
        msg('Keeps the bar, the steam wand and the counter clean as they go'), msg('Clears and wipes the tables')),
      ...d('closing', msg('Backflushes the machine and cleans the group heads, portafilters and steam wand'),
        msg('Cleans the grinders and puts the beans away'), msg('Puts milk and fresh food in the fridge, labelled and dated')),
      ...d('weekly', msg('Counts the coffee, milk and cups for the stock count')),
    ],
  },
  {
    name: msg('Kitchen'), reportsTo: msg('Shift lead'), positions: ['kitchen', 'cocina', 'cook', 'chef', 'cocinero', 'cocinera'],
    summary: msg('Prepares the food: safe, on time and as it is on the menu.'),
    duties: [
      ...d('opening', msg('Checks and writes down the fridge and freezer temperatures'), msg('Does the day’s prep list')),
      ...d('service', msg('Makes each dish to the recipe and plates it as in the photo'),
        msg('Keeps raw and ready-to-eat food apart, and knows the allergens in every dish'), msg('Cleans down as they go')),
      ...d('closing', msg('Labels, dates and puts away what’s left, and logs what’s thrown out in the Waste log'),
        msg('Cleans the kitchen, the equipment and the floor')),
      ...d('weekly', msg('Checks the stock and tells the shift lead what to order')),
    ],
  },
  {
    name: msg('Cleaner'), reportsTo: msg('Owner'), positions: ['cleaner', 'cleaning', 'limpieza', 'limpiador', 'limpiadora'],
    summary: msg('Keeps the café clean and safe for the customers and the team.'),
    duties: [
      ...d('core', msg('Cleans the toilets and refills the soap, paper and toilet roll'), msg('Sweeps and mops the floors'),
        msg('Takes out the rubbish and the recycling'), msg('Cleans the windows, the doors and the terrace')),
      ...d('weekly', msg('Deep cleans the fridges, the shelves and behind the machines'),
        msg('Tells the shift lead when cleaning products are running low')),
    ],
  },
]

/** The rota position a preset is worked as, matched by name. */
export const presetPosition = <P extends { id: number; name: string; active: boolean }>(preset: RolePreset, positions: P[]) =>
  positions.find(p => p.active && preset.positions.includes(p.name.trim().toLowerCase()))?.id ?? null
