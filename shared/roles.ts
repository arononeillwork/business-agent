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
  /** What its people can do in each area of the app (see ROLE_AREAS); an area left out is Read. */
  permissions?: RolePermissions
  /** The template it was started from (roleTemplates.ts), if any. */
  template?: string | null
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

// What a role lets its people do, area by area: Hidden (left out of their menu, and the page doesn't
// open; for a part of a page, not shown), Own (the To Do List: only the tasks given to them), Read (what
// the team has always had there) or Update (what an admin does there). Each area offers the levels that
// mean something there. Someone in several roles gets the most any of them gives; someone in none has
// Read everywhere; admins and owners have the most every area offers. The database checks Update
// (`can_update()`, the `role_permissions` migration) and Own (`todo_own_only()`, the
// `role_areas_own_tasks` migration).
export type RoleLevel = 'none' | 'own' | 'read' | 'update'
export type RoleArea = 'business' | 'company' | 'todo' | 'hours' | 'brand' | 'dashboards' | 'menu' | 'stock' | 'foodsafety' | 'waste' | 'expenses'
  | 'calendar' | 'rota' | 'timeoff' | 'timecards'
export type RolePermissions = Partial<Record<RoleArea, RoleLevel>>

export interface RoleAreaInfo {
  id: RoleArea
  label: string
  /** The menu pages it covers; none for a part of a page (the Business page's Company details). */
  pages: string[]
  /** The levels it offers, least first. Everywhere offers Read; Hidden isn't offered where everyone has their own shifts, holidays and hours. */
  levels: RoleLevel[]
  /** What Read, Own and Update let someone do there. */
  read: string
  own?: string
  update?: string
}
export const ROLE_AREAS: RoleAreaInfo[] = [
  { id: 'business', label: msg('Business'), pages: ['business'], levels: ['none', 'read'],
    read: msg('Sees the business’s details') },
  { id: 'company', label: msg('Company details'), pages: [], levels: ['none', 'read'],
    read: msg('Sees the Business page’s Company details: its CIF/NIF, currency and where team alerts go') },
  { id: 'todo', label: msg('To Do List'), pages: ['todo'], levels: ['none', 'own', 'read', 'update'],
    own: msg('Sees and ticks off only the tasks given to them'), read: msg('Sees the tasks and ticks them off'),
    update: msg('Sets up the lists and their categories') },
  { id: 'hours', label: msg('Opening hours'), pages: ['hours'], levels: ['none', 'read'],
    read: msg('Sees the opening hours (admins change them)') },
  { id: 'brand', label: msg('Brand'), pages: ['brand'], levels: ['none', 'read'],
    read: msg('Sees the logo, colours and fonts (admins change them)') },
  { id: 'dashboards', label: msg('Dashboards'), pages: ['dashboards'], levels: ['none', 'read'],
    read: msg('Builds their own dashboards from the figures') },
  { id: 'menu', label: msg('Menu'), pages: ['menu'], levels: ['none', 'read'],
    read: msg('Sees what’s on the menu (admins change it)') },
  { id: 'stock', label: msg('Stock'), pages: ['stock'], levels: ['none', 'read', 'update'],
    read: msg('Sees the stock and counts it'), update: msg('Adds items and changes what’s kept') },
  { id: 'foodsafety', label: msg('Food safety'), pages: ['foodsafety'], levels: ['none', 'read', 'update'],
    read: msg('Logs the checks'), update: msg('Sets up what’s checked and when') },
  { id: 'waste', label: msg('Waste log'), pages: ['waste'], levels: ['none', 'read', 'update'],
    read: msg('Logs what’s thrown out'), update: msg('Changes and removes what’s logged') },
  { id: 'expenses', label: msg('Expenses'), pages: ['expenses'], levels: ['none', 'read'],
    read: msg('Claims back what they paid for the business') },
  { id: 'calendar', label: msg('Calendar'), pages: ['calendar'], levels: ['none', 'read', 'update'],
    read: msg('Sees what’s on'), update: msg('Adds and changes events') },
  { id: 'rota', label: msg('Rota'), pages: ['rota'], levels: ['read', 'update'],
    read: msg('Sees the published rota and their own shifts'), update: msg('Adds, changes and publishes shifts') },
  { id: 'timeoff', label: msg('Time off'), pages: ['timeoff'], levels: ['read', 'update'],
    read: msg('Asks for time off and sees who’s away'), update: msg('Approves or declines the team’s time off') },
  { id: 'timecards', label: msg('Timecards'), pages: ['timecards'], levels: ['read', 'update'],
    read: msg('Clocks in and sees their own hours'), update: msg('Sees, fixes and approves the team’s hours') },
]
export const ROLE_AREA_IDS = ROLE_AREAS.map(a => a.id)
export const ROLE_LEVELS: { id: RoleLevel; label: string }[] = [
  { id: 'none', label: msg('Hidden') }, { id: 'own', label: msg('Own') }, { id: 'read', label: msg('Read') }, { id: 'update', label: msg('Update') },
]
const RANK: Record<RoleLevel, number> = { none: 0, own: 1, read: 2, update: 3 }
const areaOf = (area: RoleArea) => ROLE_AREAS.find(a => a.id === area)!

/** A role's level in an area: Read when it doesn't say or names one the area doesn't offer. */
export function levelIn(permissions: RolePermissions | undefined, area: RoleArea): RoleLevel {
  const level = permissions?.[area] ?? 'read'
  return areaOf(area).levels.includes(level) ? level : 'read'
}

/** Every area at one level, then some changed: `levels('read', { rota: 'update' })`. An area that doesn't offer it gets Read. */
export const levels = (all: RoleLevel, but: RolePermissions = {}): Record<RoleArea, RoleLevel> =>
  Object.fromEntries(ROLE_AREA_IDS.map(a => [a, levelIn({ [a]: but[a] ?? all }, a)])) as Record<RoleArea, RoleLevel>

/** The team on the floor: their own tasks, and not the business's details or the dashboards; then what's different. */
export const frontLine = (but: RolePermissions = {}) => levels('read', { business: 'none', dashboards: 'none', todo: 'own', ...but })

/** The most every area offers: admins, owners and managers. */
export const fullAccess = (): Record<RoleArea, RoleLevel> =>
  Object.fromEntries(ROLE_AREAS.map(a => [a.id, a.levels[a.levels.length - 1]])) as Record<RoleArea, RoleLevel>

/**
 * What someone can do in each area: admins everything; an employee the most their roles give, or Read
 * when they're in none. Partners and the café tablet aren't in roles: Read here, and their own rules
 * say which pages they open.
 */
export function permissionsOf(person: { id: string; role: string } | null, roles: Pick<JobRole, 'people' | 'permissions'>[]): Record<RoleArea, RoleLevel> {
  if (person?.role === 'admin') return fullAccess()
  const mine = person?.role === 'employee' ? roles.filter(r => r.people.includes(person.id)) : []
  if (!mine.length) return levels('read')
  return Object.fromEntries(ROLE_AREA_IDS.map(area => [area,
    mine.map(r => levelIn(r.permissions, area)).reduce((a, b) => (RANK[b] > RANK[a] ? b : a))])) as Record<RoleArea, RoleLevel>
}

/** The menu pages someone's roles leave out (and that don't open for them). A part of a page they're
 *  hidden from (the Company details) is left out by the page itself. */
export const hiddenByRole = (permissions: Record<RoleArea, RoleLevel>) =>
  ROLE_AREAS.filter(a => permissions[a.id] === 'none').flatMap(a => a.pages)

/** Permissions as saved: every area, each a level the area offers. */
export const tidyPermissions = (permissions: RolePermissions | undefined): Record<RoleArea, RoleLevel> =>
  Object.fromEntries(ROLE_AREA_IDS.map(a => [a, levelIn(permissions, a)])) as Record<RoleArea, RoleLevel>

/** A person's roles by name, in the roles' order ("Barista / Bartender"): what the app calls them. */
export const roleNamesOf = (personId: string | undefined, roles: Pick<JobRole, 'people' | 'name' | 'sort'>[]) =>
  sortRoles(roles.filter(r => !!personId && r.people.includes(personId))).map(r => r.name)

export interface RolePreset {
  /** Its template id: the business category, then the role (`cafe.barista`). */
  id?: string
  /** What its people can do in each area; an area left out is Read. */
  permissions?: RolePermissions
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
    id: 'cafe.owner', permissions: levels('update'),
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
    id: 'cafe.shop-manager', permissions: levels('update'),
    name: msg('Shop manager'), reportsTo: msg('Owner'), positions: ['shop manager', 'gerente', 'encargado general', 'encargada general'],
    summary: msg('Runs the café day to day: the team, the rota, the stock and the standards, so the owner doesn’t have to.'),
    duties: [
      ...d('core', msg('Makes sure every shift has the right people on it'), msg('Trains new starters and keeps the standards up'),
        msg('Orders the stock and checks the deliveries'), msg('Deals with problems the shift lead can’t')),
      ...d('weekly', msg('Writes and publishes the rota'), msg('Approves time off and the week’s timecards'),
        msg('Checks the food safety and waste logs are done')),
    ],
  },
  {
    id: 'cafe.shift-lead', permissions: levels('update', { timeoff: 'read', calendar: 'read' }),
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
    // The Business page's contact details but not the company's; not the brand, the menu, the stock or expenses.
    id: 'cafe.barista', permissions: frontLine({ business: 'read', company: 'none', brand: 'none', menu: 'none', stock: 'none', expenses: 'none' }),
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
    id: 'cafe.kitchen', permissions: frontLine(),
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
    id: 'cafe.cleaner', permissions: frontLine({ calendar: 'none', stock: 'none', waste: 'none' }),
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
