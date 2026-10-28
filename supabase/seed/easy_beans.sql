-- Easy Beans Coffee: business data. Idempotent; safe to re-run.
-- People are not seeded: they join through invites (the first sign-up becomes admin).
-- Easy Beans is business 1. A new database has it already, with a placeholder name (the
-- several_businesses migration): its details are filled in here only while it still has that name.

insert into public.business (id, name, business_type, address, phone, email, instagram, website, timezone,
  opening_hours, peak_hours, owners, suppliers, towns_followed, notes)
values (1,
  'Easy Beans Coffee',
  'Specialty café, drinks-first, owner-run',
  'C. Pizarro, 8, 29670 San Pedro de Alcántara, Málaga',
  '+34 695 415 335',
  'easybeanscafe@gmail.com',
  '@easy.beans.coffee',
  'https://www.easybeanscoffee.com/',
  'Europe/Madrid',
  '{"mon":{"open":"08:00","close":"18:00"},"tue":{"open":"08:00","close":"18:00"},
    "wed":{"open":"08:00","close":"18:00"},"thu":{"open":"08:00","close":"18:00"},
    "fri":{"open":"08:00","close":"18:00"},"sat":{"open":"09:00","close":"18:00"},
    "sun":{"open":"09:00","close":"16:00"}}',
  '{"start":"11:00","end":"15:00"}',
  '{"Aron O''Neill","Mark Murray"}',
  '[{"name":"By Eric","type":"Bakery","phone":"+34 683 16 94 37","email":"info@by-eric.es",
     "notes":"Croissants daily, pastries every 2 days"}]',
  '{"Marbella","Estepona","Benahavís","Málaga"}',
  'Weekday closing time to confirm: 18:00 (plan) vs 15:00 (Square rota).')
on conflict (id) do update set (name, business_type, address, phone, email, instagram, website, timezone,
  opening_hours, peak_hours, owners, suppliers, towns_followed, notes) = (excluded.name, excluded.business_type,
  excluded.address, excluded.phone, excluded.email, excluded.instagram, excluded.website, excluded.timezone,
  excluded.opening_hours, excluded.peak_hours, excluded.owners, excluded.suppliers, excluded.towns_followed, excluded.notes)
  where public.business.name = 'My business';

insert into public.business_admin_notes (business_id, notes) values (1, null) on conflict (business_id) do nothing;
insert into public.settings (business_id) values (1) on conflict (business_id) do nothing;

insert into public.positions (name, colour, sort) values
  ('Barista', '#F79BA4', 1),
  ('Kitchen', '#6B8E4E', 2),
  ('Cleaner', '#C6C2BB', 3),
  ('Propietario', '#B7A3D8', 4)
on conflict (business_id, name) do nothing;

insert into public.break_types (name, minutes, paid)
select * from (values ('Rest 15 min (paid)', 15, true), ('Lunch 30 min (unpaid)', 30, false)) v(name, minutes, paid)
where not exists (select 1 from public.break_types);

-- 2026 holidays: 8 national, 4 Andalucía, 2 Marbella local; nearby towns as "area" (to confirm).
insert into public.calendar_events (starts_on, title, category, town, source, external_id, confirmed)
values
  ('2026-01-01', 'Año Nuevo', 'national', null, 'import', 'es-2026-01-01', true),
  ('2026-01-06', 'Epifanía del Señor', 'national', null, 'import', 'es-2026-01-06', true),
  ('2026-04-03', 'Viernes Santo', 'national', null, 'import', 'es-2026-04-03', true),
  ('2026-05-01', 'Fiesta del Trabajo', 'national', null, 'import', 'es-2026-05-01', true),
  ('2026-08-15', 'Asunción de la Virgen', 'national', null, 'import', 'es-2026-08-15', true),
  ('2026-10-12', 'Fiesta Nacional de España', 'national', null, 'import', 'es-2026-10-12', true),
  ('2026-12-08', 'Inmaculada Concepción', 'national', null, 'import', 'es-2026-12-08', true),
  ('2026-12-25', 'Natividad del Señor', 'national', null, 'import', 'es-2026-12-25', true),
  ('2026-02-28', 'Día de Andalucía', 'regional', 'Andalucía', 'import', 'an-2026-02-28', true),
  ('2026-04-02', 'Jueves Santo', 'regional', 'Andalucía', 'import', 'an-2026-04-02', true),
  ('2026-11-02', 'Todos los Santos (trasladado del domingo)', 'regional', 'Andalucía', 'import', 'an-2026-11-02', true),
  ('2026-12-07', 'Día de la Constitución (trasladado del domingo)', 'regional', 'Andalucía', 'import', 'an-2026-12-07', true),
  ('2026-06-11', 'San Bernabé', 'local', 'Marbella', 'import', 'marbella-2026-06-11', true),
  ('2026-10-19', 'San Pedro de Alcántara', 'local', 'Marbella', 'import', 'marbella-2026-10-19', true),
  ('2026-05-15', 'San Isidro Labrador', 'area', 'Estepona', 'import', 'estepona-2026-05-15', false),
  ('2026-07-16', 'Virgen del Carmen', 'area', 'Estepona', 'import', 'estepona-2026-07-16', false),
  ('2026-08-17', 'Fiesta local', 'area', 'Benahavís', 'import', 'benahavis-2026-08-17', false),
  ('2026-08-19', 'Toma de Málaga', 'area', 'Málaga', 'import', 'malaga-2026-08-19', false),
  ('2026-09-08', 'Virgen de la Victoria', 'area', 'Málaga', 'import', 'malaga-2026-09-08', false),
  ('2026-10-07', 'Fiesta local', 'area', 'Benahavís', 'import', 'benahavis-2026-10-07', false)
on conflict (business_id, source, external_id) where external_id is not null do nothing;

-- Sports competitions are seeded by migration 20260926000018_sports.sql.

-- Monthly expenses, from the Accounts sheet ("Monthly Costs" tab, 26 Sep 2026).
insert into public.expenses (name, amount, sort, source, category)
select v.name, v.amount, v.sort, 'sheet', v.category
  from (values
    ('Rent', 1530.00, 1, 'Premises'), ('Staff wages', 4300.00, 2, 'People'), ('Electricity', 200.00, 3, 'Utilities'),
    ('Insurance', 100.00, 4, 'Premises'), ('Council tax', 50.00, 5, 'Premises'), ('Broadband', 20.00, 6, 'Utilities'),
    ('Accountant', 100.00, 7, 'Services'), ('Water', 50.00, 8, 'Utilities'), ('Cleaning supplies', 20.00, 9, 'Supplies'),
    ('Cleaning', 50.00, 10, 'Services'), ('Loan', 641.53, 11, 'Finance'), ('Automo costs', 80.00, 12, 'Services'),
    ('Wastage', 50.00, 13, 'Stock'), ('Freebies', 30.00, 14, 'Stock'), ('Non-retail supplies', 500.00, 15, 'Supplies'),
    ('Printing / labels', 50.00, 16, 'Marketing'), ('Advertising / social media', 50.00, 17, 'Marketing'),
    ('Security system', 43.56, 18, 'Premises')
  ) as v(name, amount, sort, category)
 where not exists (select 1 from public.expenses where source = 'sheet');

-- Roles & responsibilities and Staff rules: Easy Beans' own (src/data/easyBeansHandbook.ts, from the
-- owners' roles document and the operations manual). Only while there are none, so what's changed in
-- the app is never overwritten. Generated from that file; src/data/easyBeansHandbook.test.ts checks they agree.
insert into public.job_roles (name, summary, position_id, duties, sort)
select v.name, v.summary, (select id from public.positions where name = v.position), v.duties::jsonb, v.sort
from (values
  ('Head of People', null, null,
   '[{"when":"core","text":"Ensuring everyone does their defined role"},{"when":"core","text":"Holding people accountable — saying what needs to be said"},{"when":"core","text":"Making the difficult decisions"},{"when":"core","text":"Hiring (and letting people go)"},{"when":"also","text":"Performance and progress conversations"},{"when":"also","text":"Setting expectations and standards"},{"when":"also","text":"Resolving conflicts between staff"},{"when":"also","text":"Onboarding new team members"},{"when":"also","text":"Training"},{"when":"also","text":"Uniform and appearance standards"},{"when":"also","text":"Holiday and sick cover planning"},{"when":"also","text":"Tips policy"}]', 0),
  ('Business Manager', null, null,
   '[{"when":"core","text":"Square system — setup and admin: staff schedule, pay, payment system items upkeep, discounts, customer experience, loyalty, sales analytics and reporting"},{"when":"core","text":"Licences, permits & compliance: opening licence (apertura), terraza / outdoor seating, music licence (SGAE / AGEDI), GDPR & CCTV compliance, insurance renewals"},{"when":"core","text":"Premises & utilities: water, electric, gas — bills & safety certificates; pest control (cockroaches, rodents, etc.); waste & recycling contract; physical jobs & repairs (cameras, leaks); plant upkeep"},{"when":"core","text":"Supplier relationships and pricing"},{"when":"core","text":"Staff contracts"},{"when":"core","text":"Legal issues"},{"when":"core","text":"Outsourcing jobs (e.g. social media)"},{"when":"also","text":"Marketing and brand direction"},{"when":"also","text":"Delivery platforms (Glovo / Uber Eats)"},{"when":"also","text":"Community events & local partnerships"},{"when":"also","text":"Big purchases and equipment decisions"}]', 1),
  ('Investor', 'Funding roadmap
Phase 1 · Launch — Initial capital for fit-out, equipment, and opening stock.
Phase 2 · Stabilise — Cover running costs and build a reserve until break-even.
Phase 3 · Grow — Reinvest profits — new equipment, menu, and marketing.
Phase 4 · Scale — Fund a major upgrade or a second Easy Beans site.', null,
   '[{"when":"core","text":"Generating funds to keep the café progressing"},{"when":"core","text":"Selling old or unused equipment (e.g. the old coffee machine)"},{"when":"core","text":"Working to bring in additional income"},{"when":"core","text":"Reinvesting profits into growth"},{"when":"also","text":"Covering cash shortfalls"},{"when":"also","text":"Approving major spend"},{"when":"also","text":"Identifying cost savings"},{"when":"also","text":"Tracking return on investment"}]', 2),
  ('Shop Manager', null, null,
   '[{"when":"core","text":"Food and drink ordering (all products)"},{"when":"core","text":"Stock management (check, rotation, upkeep)"},{"when":"core","text":"Waste management"},{"when":"core","text":"Cleaning standards and oversight"},{"when":"core","text":"Banking and cash/till counting"},{"when":"core","text":"Opening and closing procedures"},{"when":"also","text":"Bakery prep and standards"},{"when":"also","text":"Receiving and checking deliveries"},{"when":"also","text":"Coordinating with the bakery supplier"},{"when":"also","text":"Ordering consumables (cups, napkins, etc.)"},{"when":"also","text":"Staff rota and scheduling"},{"when":"also","text":"Security — key holding and alarm codes"},{"when":"also","text":"Equipment maintenance and repairs"},{"when":"also","text":"Playlist / music management"},{"when":"also","text":"Hygiene and safety compliance"},{"when":"also","text":"First aid stock"},{"when":"also","text":"Fridge / freezer temperature logs"},{"when":"also","text":"Packaging / delivery presentation"},{"when":"also","text":"Customer complaints and refunds"},{"when":"also","text":"Cash control (notes & coins in stock)"}]', 3),
  ('Accountant', null, null,
   '[{"when":"core","text":"Purchases"},{"when":"core","text":"Running payroll and social security"},{"when":"core","text":"VAT (IVA) and tax filings"},{"when":"core","text":"Reconciling Square payouts vs bank"},{"when":"also","text":"Bookkeeping and expense records"},{"when":"also","text":"Gestoría and admin paperwork"},{"when":"also","text":"Supplier invoices and payments"},{"when":"also","text":"Pricing and menu changes"},{"when":"also","text":"Monthly profit and loss report"},{"when":"also","text":"Outsourcing management"},{"when":"also","text":"Cash flow monitoring"},{"when":"also","text":"Competitor insights"},{"when":"also","text":"Budgets and cost targets"},{"when":"also","text":"Grants and government funding opportunities"}]', 4),
  ('Laptop Guy', null, null,
   '[{"when":"core","text":"Website"},{"when":"core","text":"Email management"},{"when":"core","text":"WiFi and internet connection"},{"when":"core","text":"Google Business Profile & reviews"},{"when":"core","text":"Social media management"},{"when":"also","text":"Menu, display & screen presentations"},{"when":"also","text":"Document management"},{"when":"also","text":"Tech accounts and software subscriptions"},{"when":"also","text":"POS and hardware troubleshooting"},{"when":"also","text":"Online listings and directories"}]', 5),
  ('Head Barista', null, 'Barista',
   '[{"when":"core","text":"Milk management (stock, rotation, quality)"},{"when":"core","text":"Drink quality control and recipe consistency"},{"when":"core","text":"Coffee & drinks recipes (master spec)"},{"when":"core","text":"Machine care: cleaning the grinder and coffee machine, descaling and servicing schedule, water filter / softener upkeep, daily espresso dial-in, grinder calibration"},{"when":"core","text":"Display presentation standards"},{"when":"core","text":"Training baristas"},{"when":"also","text":"Signs and chalkboards"},{"when":"also","text":"Coffee insights and trends"},{"when":"also","text":"Labelling displays (allergens, prices)"},{"when":"also","text":"Waste tracking (milk, beans, pastries)"},{"when":"also","text":"Display unit upkeep (temp, rotation, looking full)"},{"when":"also","text":"Too Good To Go app"},{"when":"also","text":"Matcha prep standards"},{"when":"also","text":"Flagging low stock and supplies to shop manager"},{"when":"also","text":"Bar workflow and station setup"},{"when":"also","text":"Testing new drinks and seasonal specials"},{"when":"also","text":"Bean / roaster relationship"}]', 6),
  ('Chef', null, 'Kitchen',
   '[{"when":"core","text":"Food quality standards"},{"when":"core","text":"Presentation and plating"},{"when":"core","text":"Recipe consistency"},{"when":"also","text":"Food prep"},{"when":"also","text":"Labelling dates, best before dates, etc."},{"when":"also","text":"Portion control"},{"when":"also","text":"Ingredient quality checks"},{"when":"also","text":"Allergen matrix (available to customers)"},{"when":"also","text":"Ingredient traceability"},{"when":"also","text":"Food hygiene and safety (HACCP)"}]', 7),
  ('Barista / Bartender', null, 'Barista',
   '[{"when":"core","text":"Making coffee and all drinks"},{"when":"core","text":"Customer service at the bar"},{"when":"core","text":"Keeping bar and machines clean"},{"when":"also","text":"Taking orders on the till"},{"when":"also","text":"Clearing and wiping tables"},{"when":"also","text":"Menu and allergen knowledge"},{"when":"also","text":"Serving bakery items"},{"when":"also","text":"Loyalty sign-ups and upselling"},{"when":"also","text":"Opening or closing checklist tasks"},{"when":"also","text":"Restocking during shift"},{"when":"also","text":"Bins and end-of-day cleaning"},{"when":"also","text":"Dishes and glassware"},{"when":"also","text":"Logging waste"}]', 8),
  ('Cleaner', null, 'Cleaner',
   '[{"when":"core","text":"Floors — sweep and mop (front and back)"},{"when":"core","text":"Bathrooms — clean and restock"},{"when":"core","text":"Bins and waste removal"},{"when":"also","text":"Tables, chairs, and surfaces"},{"when":"also","text":"Back-of-house and storage areas"},{"when":"also","text":"Windows and glass doors"},{"when":"also","text":"Restroom checks during peak"},{"when":"also","text":"Dusting shelves and displays"},{"when":"also","text":"Weekly deep clean rotation"},{"when":"also","text":"Oven cleaning"},{"when":"also","text":"Cleaning chemical safety (correct dilution)"},{"when":"also","text":"Cleaning and replacing towels"},{"when":"also","text":"Flagging low cleaning supplies"},{"when":"also","text":"Outdoor seating area"}]', 9)
) v (name, summary, position, duties, sort)
where not exists (select 1 from public.job_roles);

insert into public.staff_rules (title, intro, rules, sort)
select v.title, v.intro, v.rules::jsonb, v.sort
from (values
  ('Standards', null,
   '["No earphones. Not one in, not on a quiet shift.","Do not be on your phone constantly. If it is quiet, find something to do — clean, restock, prep, or work on something personal like learning Spanish or English. This applies to the owners too.","Phones off customer-facing surfaces.","Look up. A customer walking in should be greeted before they reach the counter."]', 0),
  ('Uniform & appearance', null,
   '["Short term — staff''s own choice of clothing. Keep it clean and presentable.","Long term — branded Easy Beans t-shirts.","Hair tied back. Nails short and clean. No strong perfume."]', 1),
  ('Hygiene', null,
   '["Wash hands: on arrival, after the toilet, after bins or money, after touching your face or phone, and between raw and ready-to-eat food.","Cuts covered with a blue plaster and a glove over it."]', 2),
  ('If you are sick', null,
   '["Tell Mark or Aron as soon as you feel unwell. Do not work for at least a day.","If it is a stomach bug — vomiting or diarrhoea — stay off until 48 hours after symptoms have fully stopped. This one is not optional."]', 3),
  ('Breaks', 'You are on your feet for most of a shift. A break spent standing is not a break.',
   '["Take proper breaks. Go and relax, switch off, get away from the counter for a bit.","Do not stand for your break. Sit down properly.","Mind your posture on the stools — sit upright, feet supported, do not hunch over your phone."]', 4),
  ('Holiday & time off', null,
   '["We are small and just starting out, so cover is tight. Please give 3–4 weeks notice for holidays. We hope to reduce this as we grow.","Ask Mark or Aron directly."]', 5),
  ('Clocking in & out', null,
   '["Clock in when you start and out when you finish, on the café tablet or your phone."]', 6),
  ('Service standards', null,
   '["Greet every customer before they reach the counter. Eye contact and a hello is enough.","Spanish or English — follow the customer''s lead.","Know the menu. If you do not know an ingredient, check. Never guess, especially on allergens.","Repeat the order back before ringing it in.","Hand drinks over, do not slide them.","Thank them by name if you know it. Regulars are the whole business in a town this size."]', 7),
  ('Presentation', null,
   '["Every item leaves the counter looking like the photo.","Wipe the cup or bowl rim before it goes out.","No fingerprints on glassware.","If it does not look right, remake it."]', 8),
  ('Complaints', null,
   '["Listen fully. Do not defend, do not explain over them.","Apologise for the experience, whatever the cause.","Fix it — remake the drink, replace the item. No argument for anything under a few euros.","If they are still unhappy, call an owner. Do not handle it alone.","Tell an owner the same day, even if it was resolved.","Hoja de reclamaciones — the official complaint form must be available on request. If a customer asks for it, hand it over without hesitation or comment. Refusing is a fineable offence."]', 9),
  ('Allergens', 'Spanish law requires the 14 declarable allergens to be known and given accurately on request.',
   '["Never guess. If you do not know, check the sheet. If it is not on the sheet, say you cannot confirm it.","For a coeliac or severe allergy order: clean jug, clean equipment, fresh gloves. Cross-contamination is the real risk, not the ingredient list."]', 10),
  ('Food safety & waste', null,
   '["Ready-to-eat above raw, always.","Everything covered and dated — day opened, day to use by.","First in, first out. New stock goes behind old stock, never in front.","Nothing stored on the floor.","If milk or fresh product has been above 8°C for more than two hours, do not serve it.","Anything binned for safety is said out loud to an owner, not quietly thrown."]', 11),
  ('Till & cash', null,
   '["Every sale goes through the till.","Refunds require an owner''s approval unless it is a remake.","Cash above the float goes to the safe during the day.","Cash discrepancies get reported, not covered. Never quietly cover a shortfall from your own pocket. An unexplained gap is information."]', 12),
  ('Safety & accidents', null,
   '["If the floor is wet, put the sign out. Every time, even for a small spill.","Every incident — customer or staff — is logged the same day in the accident book: date, time, who, what happened, what was done, who was told.","If you call 112, call an owner immediately afterwards. Do not wait until it is resolved."]', 13),
  ('Stock & deliveries', null,
   '["Anything running low goes on the list when you notice it, not at close.","Never sign for a delivery you have not checked. Once it is signed, it is yours."]', 14),
  ('Data protection', null,
   '["Customer data (loyalty, bookings, marketing lists) falls under GDPR/LOPD. Do not share it, do not take it home.","Card terminal receipts — never write down full card numbers."]', 15),
  ('Suggestions', 'We are always open to suggestions. We listen to our staff and to our customers — if you think something could work better, say so.',
   '["Bring ideas to Mark or Aron. Nothing is too small.","If an idea is not taken up straight away, it is usually timing rather than the idea.","Gradual, perfected progress beats doing everything at once. One change, done properly, then the next."]', 16)
) v (title, intro, rules, sort)
where not exists (select 1 from public.staff_rules);
