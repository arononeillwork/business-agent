// Easy Beans Coffee's own roles and staff rules, as the owners wrote them: the roles from
// "Easy_Beans_Roles_and_Responsibilities.pdf" (Google Drive, 15 Oct 2026) and the rules from the
// staff-facing parts of "EasyBeans Manual EN" (Operations Manual v1.0, August 2026: 3.7, 4.1, 4.3–4.5,
// 5.1–5.3, 6.1–6.2, 7.1–7.5, 7.7, 8.5–8.6 and the wet floor and accident rules in 1.1 and 1.5).
// The demo shows them, and supabase/seed/easy_beans.sql puts the same into the café's database
// (shared/handbookSeed.test.ts checks the two agree). Business data, not translated: the manual is in
// English, with a Spanish edition to come.
import type { DutyWhen } from '../../shared/roles'

export interface HandbookRole { name: string; summary?: string; position?: string; core: string[]; also: string[] }
export interface HandbookSection { title: string; intro?: string; rules: string[] }

export const EASY_BEANS_ROLES: HandbookRole[] = [
  { name: 'Head of People',
    core: ['Ensuring everyone does their defined role', 'Holding people accountable — saying what needs to be said', 'Making the difficult decisions',
      'Hiring (and letting people go)'],
    also: ['Performance and progress conversations', 'Setting expectations and standards', 'Resolving conflicts between staff', 'Onboarding new team members',
      'Training', 'Uniform and appearance standards', 'Holiday and sick cover planning', 'Tips policy'] },
  { name: 'Business Manager',
    core: [
      'Square system — setup and admin: staff schedule, pay, payment system items upkeep, discounts, customer experience, loyalty, sales analytics and reporting',
      'Licences, permits & compliance: opening licence (apertura), terraza / outdoor seating, music licence (SGAE / AGEDI), GDPR & CCTV compliance, insurance renewals',
      'Premises & utilities: water, electric, gas — bills & safety certificates; pest control (cockroaches, rodents, etc.); waste & recycling contract; physical jobs & repairs (cameras, leaks); plant upkeep',
      'Supplier relationships and pricing', 'Staff contracts', 'Legal issues', 'Outsourcing jobs (e.g. social media)'],
    also: ['Marketing and brand direction', 'Delivery platforms (Glovo / Uber Eats)', 'Community events & local partnerships', 'Big purchases and equipment decisions'] },
  { name: 'Investor',
    summary: 'Funding roadmap\nPhase 1 · Launch — Initial capital for fit-out, equipment, and opening stock.\nPhase 2 · Stabilise — Cover running costs and build a reserve until break-even.\nPhase 3 · Grow — Reinvest profits — new equipment, menu, and marketing.\nPhase 4 · Scale — Fund a major upgrade or a second Easy Beans site.',
    core: ['Generating funds to keep the café progressing', 'Selling old or unused equipment (e.g. the old coffee machine)', 'Working to bring in additional income',
      'Reinvesting profits into growth'],
    also: ['Covering cash shortfalls', 'Approving major spend', 'Identifying cost savings', 'Tracking return on investment'] },
  { name: 'Shop Manager',
    core: ['Food and drink ordering (all products)', 'Stock management (check, rotation, upkeep)', 'Waste management', 'Cleaning standards and oversight',
      'Banking and cash/till counting', 'Opening and closing procedures'],
    also: ['Bakery prep and standards', 'Receiving and checking deliveries', 'Coordinating with the bakery supplier', 'Ordering consumables (cups, napkins, etc.)',
      'Staff rota and scheduling', 'Security — key holding and alarm codes', 'Equipment maintenance and repairs', 'Playlist / music management',
      'Hygiene and safety compliance', 'First aid stock', 'Fridge / freezer temperature logs', 'Packaging / delivery presentation',
      'Customer complaints and refunds', 'Cash control (notes & coins in stock)'] },
  { name: 'Accountant',
    core: ['Purchases', 'Running payroll and social security', 'VAT (IVA) and tax filings', 'Reconciling Square payouts vs bank'],
    also: ['Bookkeeping and expense records', 'Gestoría and admin paperwork', 'Supplier invoices and payments', 'Pricing and menu changes',
      'Monthly profit and loss report', 'Outsourcing management', 'Cash flow monitoring', 'Competitor insights', 'Budgets and cost targets',
      'Grants and government funding opportunities'] },
  { name: 'Laptop Guy',
    core: ['Website', 'Email management', 'WiFi and internet connection', 'Google Business Profile & reviews', 'Social media management'],
    also: ['Menu, display & screen presentations', 'Document management', 'Tech accounts and software subscriptions', 'POS and hardware troubleshooting',
      'Online listings and directories'] },
  { name: 'Head Barista', position: 'Barista',
    core: ['Milk management (stock, rotation, quality)', 'Drink quality control and recipe consistency', 'Coffee & drinks recipes (master spec)',
      'Machine care: cleaning the grinder and coffee machine, descaling and servicing schedule, water filter / softener upkeep, daily espresso dial-in, grinder calibration',
      'Display presentation standards', 'Training baristas'],
    also: ['Signs and chalkboards', 'Coffee insights and trends', 'Labelling displays (allergens, prices)', 'Waste tracking (milk, beans, pastries)',
      'Display unit upkeep (temp, rotation, looking full)', 'Too Good To Go app', 'Matcha prep standards', 'Flagging low stock and supplies to shop manager',
      'Bar workflow and station setup', 'Testing new drinks and seasonal specials', 'Bean / roaster relationship'] },
  { name: 'Chef', position: 'Kitchen',
    core: ['Food quality standards', 'Presentation and plating', 'Recipe consistency'],
    also: ['Food prep', 'Labelling dates, best before dates, etc.', 'Portion control', 'Ingredient quality checks', 'Allergen matrix (available to customers)',
      'Ingredient traceability', 'Food hygiene and safety (HACCP)'] },
  { name: 'Barista / Bartender', position: 'Barista',
    core: ['Making coffee and all drinks', 'Customer service at the bar', 'Keeping bar and machines clean'],
    also: ['Taking orders on the till', 'Clearing and wiping tables', 'Menu and allergen knowledge', 'Serving bakery items', 'Loyalty sign-ups and upselling',
      'Opening or closing checklist tasks', 'Restocking during shift', 'Bins and end-of-day cleaning', 'Dishes and glassware', 'Logging waste'] },
  { name: 'Cleaner', position: 'Cleaner',
    core: ['Floors — sweep and mop (front and back)', 'Bathrooms — clean and restock', 'Bins and waste removal'],
    also: ['Tables, chairs, and surfaces', 'Back-of-house and storage areas', 'Windows and glass doors', 'Restroom checks during peak',
      'Dusting shelves and displays', 'Weekly deep clean rotation', 'Oven cleaning', 'Cleaning chemical safety (correct dilution)',
      'Cleaning and replacing towels', 'Flagging low cleaning supplies', 'Outdoor seating area'] },
]

/** A role's duties as stored: its core responsibilities, then what's also part of it. */
export const handbookDuties = (r: HandbookRole) => [
  ...r.core.map(text => ({ when: 'core' as DutyWhen, text })), ...r.also.map(text => ({ when: 'also' as DutyWhen, text })),
]

export const EASY_BEANS_RULES: HandbookSection[] = [
  { title: 'Standards', rules: [
    'No earphones. Not one in, not on a quiet shift.',
    'Do not be on your phone constantly. If it is quiet, find something to do — clean, restock, prep, or work on something personal like learning Spanish or English. This applies to the owners too.',
    'Phones off customer-facing surfaces.',
    'Look up. A customer walking in should be greeted before they reach the counter.',
  ] },
  { title: 'Uniform & appearance', rules: [
    'Short term — staff\'s own choice of clothing. Keep it clean and presentable.',
    'Long term — branded Easy Beans t-shirts.',
    'Hair tied back. Nails short and clean. No strong perfume.',
  ] },
  { title: 'Hygiene', rules: [
    'Wash hands: on arrival, after the toilet, after bins or money, after touching your face or phone, and between raw and ready-to-eat food.',
    'Cuts covered with a blue plaster and a glove over it.',
  ] },
  { title: 'If you are sick', rules: [
    'Tell Mark or Aron as soon as you feel unwell. Do not work for at least a day.',
    'If it is a stomach bug — vomiting or diarrhoea — stay off until 48 hours after symptoms have fully stopped. This one is not optional.',
  ] },
  { title: 'Breaks', intro: 'You are on your feet for most of a shift. A break spent standing is not a break.', rules: [
    'Take proper breaks. Go and relax, switch off, get away from the counter for a bit.',
    'Do not stand for your break. Sit down properly.',
    'Mind your posture on the stools — sit upright, feet supported, do not hunch over your phone.',
  ] },
  { title: 'Holiday & time off', rules: [
    'We are small and just starting out, so cover is tight. Please give 3–4 weeks notice for holidays. We hope to reduce this as we grow.',
    'Ask Mark or Aron directly.',
  ] },
  { title: 'Service standards', rules: [
    'Greet every customer before they reach the counter. Eye contact and a hello is enough.',
    'Spanish or English — follow the customer\'s lead.',
    'Know the menu. If you do not know an ingredient, check. Never guess, especially on allergens.',
    'Repeat the order back before ringing it in.',
    'Hand drinks over, do not slide them.',
    'Thank them by name if you know it. Regulars are the whole business in a town this size.',
  ] },
  { title: 'Presentation', rules: [
    'Every item leaves the counter looking like the photo.',
    'Wipe the cup or bowl rim before it goes out.',
    'No fingerprints on glassware.',
    'If it does not look right, remake it.',
  ] },
  { title: 'Complaints', rules: [
    'Listen fully. Do not defend, do not explain over them.',
    'Apologise for the experience, whatever the cause.',
    'Fix it — remake the drink, replace the item. No argument for anything under a few euros.',
    'If they are still unhappy, call an owner. Do not handle it alone.',
    'Tell an owner the same day, even if it was resolved.',
    'Hoja de reclamaciones — the official complaint form must be available on request. If a customer asks for it, hand it over without hesitation or comment. Refusing is a fineable offence.',
  ] },
  { title: 'Allergens', intro: 'Spanish law requires the 14 declarable allergens to be known and given accurately on request.', rules: [
    'Never guess. If you do not know, check the sheet. If it is not on the sheet, say you cannot confirm it.',
    'For a coeliac or severe allergy order: clean jug, clean equipment, fresh gloves. Cross-contamination is the real risk, not the ingredient list.',
  ] },
  { title: 'Food safety & waste', rules: [
    'Ready-to-eat above raw, always.',
    'Everything covered and dated — day opened, day to use by.',
    'First in, first out. New stock goes behind old stock, never in front.',
    'Nothing stored on the floor.',
    'If milk or fresh product has been above 8°C for more than two hours, do not serve it.',
    'Anything binned for safety is said out loud to an owner, not quietly thrown.',
  ] },
  { title: 'Till & cash', rules: [
    'Every sale goes through the till.',
    'Refunds require an owner\'s approval unless it is a remake.',
    'Cash above the float goes to the safe during the day.',
    'Cash discrepancies get reported, not covered. Never quietly cover a shortfall from your own pocket. An unexplained gap is information.',
  ] },
  { title: 'Safety & accidents', rules: [
    'If the floor is wet, put the sign out. Every time, even for a small spill.',
    'Every incident — customer or staff — is logged the same day in the accident book: date, time, who, what happened, what was done, who was told.',
    'If you call 112, call an owner immediately afterwards. Do not wait until it is resolved.',
  ] },
  { title: 'Stock & deliveries', rules: [
    'Anything running low goes on the list when you notice it, not at close.',
    'Never sign for a delivery you have not checked. Once it is signed, it is yours.',
  ] },
  { title: 'Data protection', rules: [
    'Customer data (loyalty, bookings, marketing lists) falls under GDPR/LOPD. Do not share it, do not take it home.',
    'Card terminal receipts — never write down full card numbers.',
  ] },
  { title: 'Suggestions', intro: 'We are always open to suggestions. We listen to our staff and to our customers — if you think something could work better, say so.', rules: [
    'Bring ideas to Mark or Aron. Nothing is too small.',
    'If an idea is not taken up straight away, it is usually timing rather than the idea.',
    'Gradual, perfected progress beats doing everything at once. One change, done properly, then the next.',
  ] },
]
