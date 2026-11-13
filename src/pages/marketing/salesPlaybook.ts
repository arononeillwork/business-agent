// The sales page's content (/sell, src/pages/SellPage.tsx): for each kind of business the sales reps
// talk to, the problems its owners have, what The Business Agent does about each, and what the owner
// gets out of it. Edit the wording here; the page only lays it out.
//
// To add a kind of business (restaurants, barbers…): fill in its `points` and set `live: true`. Its card
// on the picker then opens /sell/<id>; until then it shows as "Coming soon". Every text is written in
// English through msg() and has its Spanish in src/i18n/es/sell.ts.
//
// This is a first draft built from what the app does today. It's a placeholder for the wording of the
// business plan: figures and claims belong here only once the plan backs them.
import { msg } from '../../i18n'

/** What the owner gets from a feature: more money coming in, time back, lower costs, or staying on the right side of the rules. */
export type Win = 'money' | 'time' | 'costs' | 'legal'

/** In the order the page shows them. `line` is what each means, in a few words. */
export const WINS: { id: Win; label: string; line: string }[] = [
  { id: 'money', label: msg('Make money'), line: msg('Sell more, and sell what would have gone in the bin') },
  { id: 'time', label: msg('Save time'), line: msg('Hours back, every week') },
  { id: 'costs', label: msg('Cut costs'), line: msg('Spend less, waste less, pay for fewer apps') },
  { id: 'legal', label: msg('Stay legal'), line: msg('The records the law asks for, kept for you') },
]

export interface PainPoint {
  /** The part of the URL after #, so a link goes to this card. */
  id: string
  /** The problem, in a few words. */
  title: string
  /** The owner's own words: how they'd say it across the counter. */
  says: string
  /** What The Business Agent does about it. */
  fix: string
  /** What the owner gets. */
  result: string
  /** The wins this is about; the first is the one it's listed under at the top of the page. */
  wins: Win[]
  /** The pages of the app that do it, as they're called in the menu. */
  pages: string[]
  /** The title of the film that shows it. */
  video: string
  /** The film itself, once it's made (video/, `npm run render:waste` and the rest): played on its card. */
  film?: { src: string; poster: string }
}

export interface BusinessType {
  /** The part of the URL: /sell/<id>. */
  id: string
  name: string
  /** One line on the picker's card. */
  blurb: string
  /** Whether its pain points are ready; false shows "Coming soon". */
  live: boolean
  points: PainPoint[]
}

const CAFES: PainPoint[] = [
  {
    id: 'food-waste', wins: ['money', 'costs'], pages: [msg('Freshly made'), msg('Offers & specials'), msg('Screens')],
    title: msg('Food waste'),
    says: msg('“Whatever we haven’t sold by closing goes in the bin.”'),
    fix: msg('Log each batch with how long it keeps, in days or hours. As it nears the end, the system puts it on offer by itself, say 50% off, and shows it on the café’s screens and menu. Once it sells out, the offer stops.'),
    result: msg('Food that would have been binned sells at a discount instead: less waste, more takings, and nobody has to remember.'),
    video: msg('Food waste: from shelf life to 50% off on the screen'),
    film: { src: '/video/food-waste.mp4', poster: '/video/food-waste.jpg' },
  },
  {
    id: 'regulars', wins: ['money'], pages: [msg('Customers'), msg('Loyalty & gift cards'), msg('Campaigns'), msg('Messages')],
    title: msg('Customers who never come back'),
    says: msg('“We get a rush on Saturday and then nothing on Tuesday. I’ve no way to bring people back.”'),
    fix: msg('Customers, loyalty rewards (with Square) and offers in one place. Send a WhatsApp or an email to bring regulars in on a quiet day, and run a competition to get new faces through the door.'),
    result: msg('Quiet days get a reason to come in, and regulars come back more often.'),
    video: msg('Filling a quiet Tuesday'),
  },
  {
    id: 'costing', wins: ['money', 'costs'], pages: [msg('Menu costing'), msg('Menu'), msg('Suppliers')],
    title: msg('Prices set by feel'),
    says: msg('“I’m not sure what a flat white really costs me, or which items actually make money.”'),
    fix: msg('Build each drink and bite from its ingredients and supplier prices, and see what it costs and what it earns. The advisor flags a price that’s below your margin.'),
    result: msg('Prices set on real costs, so every sale earns what the owner thinks it does.'),
    video: msg('What does a flat white really cost?'),
  },
  {
    id: 'reviews', wins: ['money'], pages: [msg('Reviews'), msg('Opening hours'), msg('Website & SEO')],
    title: msg('Reviews and the Google listing'),
    says: msg('“Reviews pile up and I never answer them. Google still has the wrong opening hours.”'),
    fix: msg('Every review in one place, with a suggested reply written for the owner, and the Google listing kept right by itself: opening hours, holidays and closures update it as they change.'),
    result: msg('People choosing where to go on their phone find a café that looks open, looked after and well reviewed.'),
    video: msg('Every review answered in a minute'),
  },
  {
    id: 'social', wins: ['money', 'time'], pages: [msg('Social planner'), msg('Content')],
    title: msg('Instagram and TikTok never get posted'),
    says: msg('“I know we should post, but nobody has the time or the ideas.”'),
    fix: msg('A list of ideas for posts the whole team can see. Anyone makes the photo or video on their phone and hands it in, and the owner turns it into a scheduled post in one press.'),
    result: msg('A café that’s always posting, without the owner writing every caption.'),
    video: msg('From an idea to a scheduled post'),
  },
  {
    id: 'rota', wins: ['time'], pages: [msg('Rota'), msg('Time off'), msg('Team')],
    title: msg('The rota lives on WhatsApp'),
    says: msg('“Every week I rebuild the rota, and someone still doesn’t see the change.”'),
    fix: msg('One rota the whole team sees on their phone, with time off requests and team messages in the same place, instead of a rota rebuilt in a chat every week.'),
    result: msg('The rota goes out in minutes, and “who’s in on Saturday?” stops being a question.'),
    video: msg('A week’s rota in five minutes'),
  },
  {
    id: 'hours-pay', wins: ['time'], pages: [msg('Timecards'), msg('Tips')],
    title: msg('Adding up hours and tips'),
    says: msg('“Every month I lose an evening working out who did how many hours, and how to split the tips.”'),
    fix: msg('Staff clock in on their phone. The hours add themselves up, and the tips left at the till come in from Square and are shared by hours worked.'),
    result: msg('Payroll hours ready at month end, and no arguments about the tips.'),
    video: msg('Month end without the spreadsheet'),
  },
  {
    id: 'registro', wins: ['legal', 'time'], pages: [msg('Timecards')],
    title: msg('The working-hours record'),
    says: msg('“I know Spain wants a record of everyone’s hours, but I’m not sure ours would pass an inspection.”'),
    fix: msg('Every clock-in is the record. Each month’s registro de jornada is ready to print, with corrections kept, and Spanish public holidays are already in.'),
    result: msg('The legal record is kept without extra work, and it’s there if an inspector asks.'),
    video: msg('The registro de jornada, done for you'),
  },
  {
    id: 'one-change', wins: ['time'], pages: [msg('Menu'), msg('Opening hours'), msg('Screens'), msg('Website & SEO')],
    title: msg('Changing a price in five places'),
    says: msg('“When a price or the hours change, I have to fix the menu, the screen, the website and Google, and I always miss one.”'),
    fix: msg('Change it once. The menu, the screens, the website, the printed menu and the Google listing all follow.'),
    result: msg('No screen showing an old price, and no Google listing saying the café is closed.'),
    video: msg('Change a price once, and everything follows'),
  },
  {
    id: 'paperwork', wins: ['legal', 'time'], pages: [msg('Allergens'), msg('Food safety'), msg('Daily checklists'), msg('Legal & licences')],
    title: msg('Allergens, cleaning logs and licences'),
    says: msg('“It’s all paper, and it’s always out of date the day the inspector comes.”'),
    fix: msg('Allergens kept with each menu item, food safety logs and daily opening and closing checklists the team ticks off on their phones, and licences with their renewal dates in one place.'),
    result: msg('The paperwork is current without anyone chasing it.'),
    video: msg('Inspector at the door? It’s all here'),
  },
  {
    id: 'stock', wins: ['costs'], pages: [msg('Stock'), msg('Suppliers'), msg('Wholesale'), msg('Invoices')],
    title: msg('Running out, or over-ordering'),
    says: msg('“We run out of oat milk on a Saturday, or order too much and it goes off.”'),
    fix: msg('Stock counts, supplier details and invoices in one place, with the café’s basket compared across suppliers so the owner sees where it’s paying over the odds.'),
    result: msg('Fewer emergency runs, less stock written off, and a better price from suppliers.'),
    video: msg('Never run out of oat milk again'),
  },
  {
    id: 'numbers', wins: ['money', 'time'], pages: [msg('Dashboards'), msg('Business advisor'), msg('Analytics')],
    title: msg('Not knowing how the day is going'),
    says: msg('“I only find out how we did when the accountant tells me.”'),
    fix: msg('Takings against last week by day and by hour, team cost against takings, best and slow sellers. The business advisor reads the same figures and says what to try.'),
    result: msg('Decisions made on this week’s numbers, not last quarter’s.'),
    video: msg('The advisor tells you what to try'),
  },
  {
    id: 'owner', wins: ['time'], pages: [msg('AI assistants'), msg('Today')],
    title: msg('The owner can’t be everywhere'),
    says: msg('“I’m behind the counter all day, and the admin waits until I’m too tired for it.”'),
    fix: msg('The whole app works on a phone. And the owner can simply ask their own AI, Claude or ChatGPT: “who’s working Saturday?”, “move Maria to the late shift”, typed or said.'),
    result: msg('The admin gets done in the gaps in the day, not at 11pm.'),
    video: msg('Just say it'),
  },
  {
    id: 'apps', wins: ['costs'], pages: [msg('Pricing'), msg('Compare')],
    title: msg('Too many apps, too many bills'),
    says: msg('“A rota app, a loyalty app, a scheduler, a stock app… and none of them talk to each other.”'),
    fix: msg('One app for the team, the money and the marketing, with one price for the whole team, not per person. There’s a Free plan, and Business is free for the first two months.'),
    result: msg('One login and one bill instead of several, and nothing to copy between them.'),
    video: msg('One app instead of ten'),
  },
]

/** The kinds of business, in the order of the picker. */
export const BUSINESS_TYPES: BusinessType[] = [
  { id: 'cafes', name: msg('Cafés'), blurb: msg('Coffee shops, bakeries and brunch spots'), live: true, points: CAFES },
  { id: 'restaurants', name: msg('Restaurants'), blurb: msg('Restaurants and bars'), live: false, points: [] },
  { id: 'barbers', name: msg('Barbers'), blurb: msg('Barbers, salons and beauty'), live: false, points: [] },
]

export const businessType = (id: string | undefined) => BUSINESS_TYPES.find(b => b.id === id && b.live)
