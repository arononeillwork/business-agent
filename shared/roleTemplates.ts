// Ready-made roles, by kind of business: the Roles page's Category tab. Each is a role as the Active tab
// has them (what it's for, who it answers to, its duties) plus what its people can do in each area of
// the app. Adding one makes it an active role, to change to how the business works; the café's are
// also what an empty Roles page offers to start with (ROLE_PRESETS).
import { msg } from './i18n'
import { ROLE_PRESETS, frontLine, levels, type Duty, type DutyWhen, type RolePreset } from './roles'

export type RoleCategory = 'cafe' | 'restaurant' | 'salon' | 'other'

const d = (when: DutyWhen, ...texts: string[]): Duty[] => texts.map(text => ({ when, text }))

const OWNER = {
  permissions: levels('update'), positions: ['owner', 'propietario', 'propietaria', 'dueño', 'dueña'],
  duties: [
    ...d('core', msg('Hires the team and agrees their contracts and pay'), msg('Sets the prices and the opening hours'),
      msg('Keeps the licences, insurance and taxes up to date with the gestoría'), msg('Is who the team goes to with a problem')),
    ...d('weekly', msg('Checks the takings against the till and the bank'), msg('Pays the suppliers’ invoices')),
  ],
}

const RESTAURANT: RolePreset[] = [
  { id: 'restaurant.owner', name: msg('Owner'), ...OWNER,
    summary: msg('Runs the business: the team, the money, the suppliers and where the restaurant is going.') },
  { id: 'restaurant.manager', name: msg('Restaurant manager'), reportsTo: msg('Owner'), permissions: levels('update'),
    positions: ['manager', 'restaurant manager', 'gerente', 'encargado', 'encargada'],
    summary: msg('Runs the restaurant day to day: the floor, the team and the guests, so every service goes well.'),
    duties: [
      ...d('core', msg('Makes sure every shift has the right people on it'), msg('Looks after bookings, big tables and events'),
        msg('Deals with complaints, refunds and discounts')),
      ...d('weekly', msg('Writes and publishes the rota'), msg('Approves time off and the week’s timecards'), msg('Orders the drinks and dry stock')),
    ] },
  { id: 'restaurant.head-chef', name: msg('Head chef'), reportsTo: msg('Restaurant manager'),
    permissions: levels('update', { timeoff: 'read', timecards: 'read', calendar: 'read' }),
    positions: ['head chef', 'chef', 'jefe de cocina', 'jefa de cocina'],
    summary: msg('Runs the kitchen: the menu, the food, the kitchen team and food safety.'),
    duties: [
      ...d('core', msg('Writes the dishes and the recipes, and costs them'), msg('Keeps the kitchen safe, clean and to the food safety plan'),
        msg('Trains the cooks and checks every plate that goes out')),
      ...d('weekly', msg('Plans the kitchen’s shifts on the rota'), msg('Orders the food and checks the deliveries'), msg('Reviews the waste log')),
    ] },
  { id: 'restaurant.cook', name: msg('Cook'), reportsTo: msg('Head chef'), permissions: frontLine(),
    positions: ['cook', 'kitchen', 'cocina', 'cocinero', 'cocinera'],
    summary: msg('Cooks the food on their section: safe, on time and as it is on the menu.'),
    duties: [
      ...d('opening', msg('Checks and writes down the fridge and freezer temperatures'), msg('Does the day’s prep list')),
      ...d('service', msg('Makes each dish to the recipe and plates it as in the photo'), msg('Knows the allergens in every dish')),
      ...d('closing', msg('Labels, dates and puts away what’s left, and logs what’s thrown out in the Waste log'), msg('Cleans down their section')),
    ] },
  { id: 'restaurant.kitchen-porter', name: msg('Kitchen porter'), reportsTo: msg('Head chef'),
    permissions: frontLine({ calendar: 'none', stock: 'none' }),
    positions: ['kitchen porter', 'porter', 'friegaplatos', 'pinche'],
    summary: msg('Keeps the kitchen running: the washing up, the deliveries and a clean, safe kitchen.'),
    duties: [
      ...d('service', msg('Washes the pots, pans, plates and glasses as they come in'), msg('Keeps the floors dry and the bins emptied')),
      ...d('core', msg('Puts the deliveries away, oldest first'), msg('Helps with the prep when asked')),
      ...d('closing', msg('Cleans the kitchen, the equipment and the floor')),
    ] },
  { id: 'restaurant.waiter', name: msg('Waiter'), reportsTo: msg('Restaurant manager'),
    permissions: frontLine({ stock: 'none', foodsafety: 'none', waste: 'none' }),
    positions: ['waiter', 'waitress', 'server', 'camarero', 'camarera', 'sala'],
    summary: msg('Looks after the guests at their tables, from the welcome to the bill.'),
    duties: [
      ...d('opening', msg('Lays the tables and checks the section is ready')),
      ...d('service', msg('Takes orders and asks about allergies'), msg('Brings the food and drinks and checks everything’s right'),
        msg('Takes payments at the table')),
      ...d('closing', msg('Clears and resets the tables'), msg('Hands over the tips and the payments')),
    ] },
  { id: 'restaurant.bartender', name: msg('Bartender'), reportsTo: msg('Restaurant manager'),
    permissions: frontLine({ foodsafety: 'none' }),
    positions: ['bartender', 'bar', 'barman', 'barra'],
    summary: msg('Runs the bar: the drinks, the bar’s stock and the guests sitting at it.'),
    duties: [
      ...d('opening', msg('Sets up the bar: ice, garnishes, glasses and the fridges full')),
      ...d('service', msg('Makes the drinks to the recipe'), msg('Serves responsibly and never to anyone under age')),
      ...d('closing', msg('Cleans the bar and the beer lines'), msg('Logs what’s spilt or thrown out in the Waste log')),
      ...d('weekly', msg('Counts the bar’s stock')),
    ] },
]

const SALON: RolePreset[] = [
  { id: 'salon.owner', name: msg('Owner'), ...OWNER,
    summary: msg('Runs the business: the team, the money, the suppliers and where the salon is going.') },
  { id: 'salon.manager', name: msg('Salon manager'), reportsTo: msg('Owner'), permissions: levels('update', { foodsafety: 'none' }),
    positions: ['manager', 'salon manager', 'gerente', 'encargado', 'encargada'],
    summary: msg('Runs the salon day to day: the team, the bookings and the clients, so every day runs on time.'),
    duties: [
      ...d('core', msg('Makes sure every day has the right people on it'), msg('Deals with complaints and rebookings'),
        msg('Trains new starters and keeps the standards up')),
      ...d('weekly', msg('Writes and publishes the rota'), msg('Approves time off and the week’s timecards'), msg('Orders the products and checks the deliveries')),
    ] },
  { id: 'salon.senior-stylist', name: msg('Senior stylist'), reportsTo: msg('Salon manager'),
    permissions: levels('read', { stock: 'update', todo: 'update', foodsafety: 'none' }),
    positions: ['senior stylist', 'estilista senior'],
    summary: msg('Looks after the salon’s regular clients and helps the newer stylists grow.'),
    duties: [
      ...d('core', msg('Cuts, colours and styles to the client’s wishes'), msg('Trains and checks the apprentices’ work'),
        msg('Keeps the product shelves stocked and tells the manager what’s running low')),
    ] },
  { id: 'salon.stylist', name: msg('Stylist'), reportsTo: msg('Salon manager'),
    permissions: frontLine({ foodsafety: 'none', waste: 'none' }),
    positions: ['stylist', 'hairdresser', 'estilista', 'peluquero', 'peluquera'],
    summary: msg('Cuts, colours and styles: the client’s time in the chair is theirs.'),
    duties: [
      ...d('core', msg('Talks through what the client wants before starting'), msg('Cuts, colours and styles to the client’s wishes'),
        msg('Recommends the right products for at home')),
      ...d('closing', msg('Cleans their station, the tools and the basins')),
    ] },
  { id: 'salon.beauty-therapist', name: msg('Beauty therapist'), reportsTo: msg('Salon manager'),
    permissions: frontLine({ foodsafety: 'none', waste: 'none' }),
    positions: ['beauty therapist', 'therapist', 'esteticista'],
    summary: msg('Gives the treatments: nails, skin, lashes and brows, safely and to a high standard.'),
    duties: [
      ...d('core', msg('Checks each client’s allergies and skin before a treatment'), msg('Gives the treatments booked'),
        msg('Sterilises the tools and changes the towels after every client')),
    ] },
  { id: 'salon.receptionist', name: msg('Receptionist'), reportsTo: msg('Salon manager'),
    permissions: levels('read', { calendar: 'update', todo: 'update', dashboards: 'none', foodsafety: 'none', waste: 'none' }),
    positions: ['receptionist', 'reception', 'recepción', 'recepcionista'],
    summary: msg('The first and last face clients see: bookings, payments and a warm welcome.'),
    duties: [
      ...d('core', msg('Answers the phone and messages and books the appointments'), msg('Welcomes clients and offers them a drink'),
        msg('Takes payments and sells the products')),
      ...d('closing', msg('Confirms tomorrow’s appointments')),
    ] },
  { id: 'salon.apprentice', name: msg('Apprentice'), reportsTo: msg('Senior stylist'),
    permissions: frontLine({ foodsafety: 'none', waste: 'none' }),
    positions: ['apprentice', 'junior', 'aprendiz', 'ayudante'],
    summary: msg('Learning the trade: helps the stylists and keeps the salon tidy.'),
    duties: [
      ...d('core', msg('Washes the clients’ hair and gets them ready'), msg('Sweeps up and keeps the stations tidy'),
        msg('Practises on training days')),
    ] },
]

const OTHER: RolePreset[] = [
  { id: 'other.owner', name: msg('Owner'), ...OWNER,
    summary: msg('Runs the business: the team, the money, the suppliers and where the business is going.') },
  { id: 'other.manager', name: msg('Manager'), reportsTo: msg('Owner'), permissions: levels('update'),
    positions: ['manager', 'gerente', 'encargado', 'encargada'],
    summary: msg('Runs the business day to day: the team, the rota and the customers.'),
    duties: [
      ...d('core', msg('Makes sure every shift has the right people on it'), msg('Trains new starters and keeps the standards up'),
        msg('Deals with problems the supervisor can’t')),
      ...d('weekly', msg('Writes and publishes the rota'), msg('Approves time off and the week’s timecards')),
    ] },
  { id: 'other.supervisor', name: msg('Supervisor'), reportsTo: msg('Manager'),
    permissions: levels('update', { timeoff: 'read', calendar: 'read' }),
    positions: ['supervisor', 'shift lead', 'supervisora'],
    summary: msg('Runs the shift: the team on it and the customers, so the day goes smoothly.'),
    duties: [
      ...d('opening', msg('Opens up and checks everything is ready'), msg('Checks who’s on and shares out the jobs for the shift')),
      ...d('closing', msg('Checks the closing jobs are done before anyone leaves'), msg('Locks up and sets the alarm')),
      ...d('core', msg('Fixes clock-ins that went wrong'), msg('Tells the manager about anything that broke, ran out or went wrong')),
    ] },
  { id: 'other.team-member', name: msg('Team member'), reportsTo: msg('Supervisor'), permissions: frontLine(),
    positions: ['team', 'team member', 'staff', 'equipo'],
    summary: msg('Does the work of the shift and looks after the customers.'),
    duties: [
      ...d('core', msg('Comes in on time for their shifts and clocks in'), msg('Looks after the customers'),
        msg('Does the jobs the supervisor gives them')),
    ] },
  { id: 'other.cleaner', name: msg('Cleaner'), reportsTo: msg('Manager'), permissions: frontLine({ calendar: 'none', stock: 'none', waste: 'none' }),
    positions: ['cleaner', 'cleaning', 'limpieza', 'limpiador', 'limpiadora'],
    summary: msg('Keeps the place clean and safe for the customers and the team.'),
    duties: [
      ...d('core', msg('Cleans the toilets and refills the soap, paper and toilet roll'), msg('Sweeps and mops the floors'),
        msg('Takes out the rubbish and the recycling')),
      ...d('weekly', msg('Tells the supervisor when cleaning products are running low')),
    ] },
]

export const ROLE_CATEGORIES: { id: RoleCategory; label: string; templates: RolePreset[] }[] = [
  { id: 'cafe', label: msg('Café'), templates: ROLE_PRESETS },
  { id: 'restaurant', label: msg('Restaurant & bar'), templates: RESTAURANT },
  { id: 'salon', label: msg('Salon & beauty'), templates: SALON },
  { id: 'other', label: msg('Any business'), templates: OTHER },
]

export const ROLE_TEMPLATES = ROLE_CATEGORIES.flatMap(c => c.templates)

/** The category a business's own roles are likely in, from what it says it is. */
export function categoryOf(businessType: string | null | undefined): RoleCategory {
  const type = (businessType ?? '').toLowerCase()
  if (/caf|coffee|tea|bakery|panader|cafeter/.test(type)) return 'cafe'
  if (/restaurant|bar\b|pub|bistro|tapas|kitchen|cocina/.test(type)) return 'restaurant'
  if (/salon|salón|beauty|hair|nail|barber|peluquer|estética|spa/.test(type)) return 'salon'
  return 'other'
}
