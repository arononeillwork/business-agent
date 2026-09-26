-- Easy Beans Coffee: business data. Idempotent; safe to re-run.
-- People are not seeded: they join through invites (the first sign-up becomes admin).

insert into public.business (id, name, business_type, address, phone, email, instagram, timezone,
  opening_hours, peak_hours, owners, suppliers, towns_followed, notes)
values (1,
  'Easy Beans Coffee',
  'Specialty café, drinks-first, owner-run',
  'C. Pizarro, 8, 29670 San Pedro de Alcántara, Málaga',
  '+34 695 415 335',
  'easybeanscafe@gmail.com',
  '@easy.beans.coffee',
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
on conflict (id) do nothing;

insert into public.business_admin_notes (id, notes) values (1, null) on conflict (id) do nothing;
insert into public.settings (id) values (1) on conflict (id) do nothing;

insert into public.positions (name, colour, sort) values
  ('Barista', '#6d4c41', 1),
  ('Kitchen', '#558b2f', 2),
  ('Cleaner', '#0277bd', 3),
  ('Propietario', '#6a1b9a', 4)
on conflict (name) do nothing;

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
on conflict (source, external_id) where external_id is not null do nothing;

-- Football: whole competitions (fixtures synced from football-data.org by the Worker cron).
insert into public.sports_follows (kind, provider, provider_id, name, alerts) values
  ('competition', 'football-data', 'PD',  'La Liga', 'big_matches'),
  ('competition', 'football-data', 'PL',  'Premier League', 'big_matches'),
  ('competition', 'football-data', 'ELC', 'EFL Championship', 'none'),
  ('competition', 'football-data', 'DED', 'Eredivisie', 'big_matches'),
  ('competition', 'football-data', 'CL',  'UEFA Champions League', 'big_matches'),
  ('competition', 'football-data', 'WC',  'FIFA World Cup', 'all'),
  ('competition', 'football-data', 'EC',  'UEFA European Championship', 'all')
on conflict (provider, provider_id) do nothing;
