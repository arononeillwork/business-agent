-- The admin area's sections (/admin, the admin_area migration): Today, Sales, To-do, Onboarding, Team.
-- All of it is Business Agent HQ's own rows, reached only through the Worker (worker/adminArea.ts).
--
-- 1. Contacts are customers (a café to sign up) or partners (a roaster or supplier who could bring cafés).
-- 2. Each salesperson has a rep code (Julio's is JULIO27; Maria gets one), so a café that signs up with
--    it moves its card by itself: to Signed up at sign-up, to Paying at its first payment (from HQ's list
--    of the businesses its reps brought, rep_introductions). A sign-up with no card gets one.
-- 3. Each card keeps what happened: messages, calls, visits, notes, and each move.
-- 4. Messages to send, with the business, the salesperson and their code filled in.
-- 5. The to-do list is HQ's own (the app's To-do page, signed in as HQ, shows the same); a job can be
--    about a card.
-- The code live before this never names the new columns or tables.

-- ---------------------------------------------------------------------------
-- 1. Customer or partner
-- ---------------------------------------------------------------------------
alter table public.sales_prospects
  add column kind text not null default 'customer' check (kind in ('customer', 'partner')),
  -- The business that signed up for it, on HQ's list.
  add column introduction_id uuid references public.rep_introductions on delete set null;
create unique index sales_prospects_introduction_key on public.sales_prospects (business_id, introduction_id) where introduction_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Each salesperson's rep code
-- ---------------------------------------------------------------------------
alter table public.sales_team add column rep_id uuid references public.sales_reps on delete set null;
create unique index sales_team_rep_key on public.sales_team (business_id, rep_id) where rep_id is not null;

-- A rep for a salesperson who has none (their code made from their name, as for every rep), or the one
-- they have. As the Worker for HQ, or in the SQL editor with app.business_id set.
create or replace function public.admin_area_give_code(p_member uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_member public.sales_team;
  v_rep uuid;
begin
  select * into v_member from public.sales_team where id = p_member;
  if v_member.id is null then raise exception 'No such salesperson'; end if;
  if v_member.rep_id is not null then return v_member.rep_id; end if;
  insert into public.sales_reps (name, kind, categories, notes)
  values (v_member.name, 'ambassador', '{cafe}', 'On the sales team in the admin area.')
  returning id into v_rep;
  update public.sales_team set rep_id = v_rep where id = p_member;
  return v_rep;
end $$;
alter function public.admin_area_give_code(uuid) owner to app_definer;
revoke execute on function public.admin_area_give_code(uuid) from public, anon, authenticated;
grant execute on function public.admin_area_give_code(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. What happened with each contact
-- ---------------------------------------------------------------------------
create table public.sales_activity (
  id          uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.sales_prospects on delete cascade,
  -- added, stage (moved: to `stage`), signed_up and paid (by themselves); the rest logged by hand.
  kind        text not null check (kind in ('added', 'stage', 'signed_up', 'paid', 'instagram', 'whatsapp', 'call', 'visit', 'email', 'demo', 'note')),
  stage       text check (stage in ('to_contact', 'contacted', 'demo', 'trial', 'won', 'lost')),
  note        text check (char_length(note) <= 2000),
  -- The moment itself, so what happens in one go (added, then signed up) keeps its order.
  at          timestamptz not null default clock_timestamp()
);
select public.add_business_scope('public.sales_activity');
create index sales_activity_prospect_idx on public.sales_activity (prospect_id, at);
alter table public.sales_activity enable row level security;
revoke all on public.sales_activity from anon, authenticated;

-- A card's own history: when it was added, and each move. In the card's business, whoever writes it.
create or replace function public.sales_prospect_history() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.sales_activity (business_id, prospect_id, kind, stage) values (new.business_id, new.id, 'added', new.stage);
  elsif new.stage is distinct from old.stage then
    insert into public.sales_activity (business_id, prospect_id, kind, stage) values (new.business_id, new.id, 'stage', new.stage);
  end if;
  return null;
end $$;
create trigger sales_prospects_history after insert or update of stage on public.sales_prospects
  for each row execute function public.sales_prospect_history();

-- ---------------------------------------------------------------------------
-- 4. Messages to send
-- ---------------------------------------------------------------------------
create table public.sales_templates (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(btrim(title)) between 1 and 80),
  -- {business}, {me}, {code} and {link} are filled in.
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  position   int not null default 0,
  created_at timestamptz not null default now()
);
select public.add_business_scope('public.sales_templates');
alter table public.sales_templates enable row level security;
revoke all on public.sales_templates from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. A job on the to-do list about a contact
-- ---------------------------------------------------------------------------
alter table public.todos add column sales_prospect_id uuid references public.sales_prospects on delete set null;
create index todos_sales_prospect_idx on public.todos (sales_prospect_id) where sales_prospect_id is not null;

-- ---------------------------------------------------------------------------
-- 6. A sign-up with a salesperson's code moves its card
-- ---------------------------------------------------------------------------
-- A business's name to compare by: "Café Lola", "cafe lola!" → "cafelola".
create or replace function public.sales_name_key(p_name text) returns text
language sql immutable set search_path = ''
as $$
  select regexp_replace(translate(lower(coalesce(p_name, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'), '[^a-z0-9]', '', 'g');
$$;

-- On HQ's list when a business signs up with a rep's code, and again as it sets up and pays (written by
-- create_business(), add_rep_code(), rep_introduction_sync() and record_rep_commission(), which run as
-- their owner). Its card: the one already linked, else one with the same name (the salesperson's
-- first), else a new one in the salesperson's lane. Signed up → the Signed up column; first payment →
-- Paying. A card is never moved back. It never stops a sign-up or a payment: if anything here goes
-- wrong, the board is left as it was and a warning is logged.
create or replace function public.sales_board_from_introduction() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_member  uuid;
  v_card    uuid;
begin
  begin
    select id into v_member from public.sales_team where business_id = new.business_id and rep_id = new.rep_id and new.rep_id is not null;
    select id into v_card from public.sales_prospects where business_id = new.business_id and introduction_id = new.id;
    if v_card is null then
      select id into v_card from public.sales_prospects
       where business_id = new.business_id and introduction_id is null and public.sales_name_key(name) = public.sales_name_key(new.name)
       order by (member_id is not distinct from v_member) desc, created_at limit 1;
      if v_card is null then
        insert into public.sales_prospects (business_id, member_id, name, stage, introduction_id)
        values (new.business_id, v_member, left(new.name, 120), 'trial', new.id) returning id into v_card;
      else
        update public.sales_prospects
           set introduction_id = new.id, member_id = coalesce(member_id, v_member),
               stage = case when stage = 'won' then stage else 'trial' end
         where id = v_card;
      end if;
      insert into public.sales_activity (business_id, prospect_id, kind, note)
      values (new.business_id, v_card, 'signed_up', 'Signed up with the code ' || new.code);
    end if;
    if new.first_paid_at is not null and (tg_op = 'INSERT' or old.first_paid_at is null) then
      update public.sales_prospects set stage = 'won' where id = v_card and stage <> 'won';
      insert into public.sales_activity (business_id, prospect_id, kind, note) values (new.business_id, v_card, 'paid', 'First payment');
    end if;
  exception when others then
    raise warning 'The sales board couldn''t follow % (%): %', new.name, new.id, sqlerrm;
  end;
  return null;
end $$;
create trigger rep_introductions_board after insert or update of first_paid_at on public.rep_introductions
  for each row execute function public.sales_board_from_introduction();

-- ---------------------------------------------------------------------------
-- 7. HQ's to start
-- ---------------------------------------------------------------------------
-- Once, for HQ (a brand-new database runs it after start_admin_area()): the roasters are partners,
-- Julio Cesar is the rep with JULIO27 and Maria Cortes gets a code, and the messages to start from.
create or replace function public.start_admin_area_sections() returns void
language plpgsql set search_path = ''
as $$
declare
  v_hq int := (select id from public.business where is_hq);
  v_member uuid;
begin
  if v_hq is null then return; end if;
  perform set_config('app.business_id', v_hq::text, true);
  update public.sales_prospects set kind = 'partner' where business_id = v_hq and instagram in ('santaroaster', 'roasted.spain');
  update public.sales_team m set rep_id = r.id
    from public.sales_reps r
   where m.business_id = v_hq and r.business_id = v_hq and m.name = 'Julio Cesar' and r.code = 'JULIO27' and m.rep_id is null
     and not exists (select 1 from public.sales_team x where x.business_id = v_hq and x.rep_id = r.id);
  for v_member in select id from public.sales_team where business_id = v_hq and rep_id is null loop
    perform public.admin_area_give_code(v_member);
  end loop;
  if not exists (select 1 from public.sales_templates where business_id = v_hq) then
    insert into public.sales_templates (business_id, title, body, position) values
      (v_hq, 'First message', 'Hi {business}! I''m {me} from The Business Agent. We help cafés run the rota, the legal hours record, Square sales and Instagram from one app. Could I show you in 10 minutes, at a quiet time for you? Your first month is free with my code {code}.', 1),
      (v_hq, 'Primer mensaje', '¡Hola {business}! Soy {me}, de The Business Agent. Ayudamos a cafeterías a llevar los turnos, el registro de jornada, las ventas de Square e Instagram desde una sola app. ¿Te lo enseño en 10 minutos, a una hora tranquila para ti? Con mi código {code} el primer mes es gratis.', 2),
      (v_hq, 'Follow-up', 'Hi again {business}, just following up on my message about The Business Agent. Happy to pop in for 10 minutes whenever suits you, or try it yourself with your first month free: {link}', 3),
      (v_hq, 'Seguimiento', 'Hola de nuevo, {business}. Te escribo por lo de The Business Agent. Me paso 10 minutos cuando te venga bien, o pruébalo tú con el primer mes gratis: {link}', 4),
      (v_hq, 'After the demo', 'Thanks for your time today! Here''s your link to start, with your first month free: {link} (code {code}). I''ll help you set it up: Square, Google and Instagram take about half an hour together.', 5),
      (v_hq, 'Después de la demo', '¡Gracias por tu tiempo hoy! Aquí tienes tu enlace para empezar, con el primer mes gratis: {link} (código {code}). Te ayudo a configurarlo: Square, Google e Instagram, en una media hora juntos.', 6),
      (v_hq, 'Partner: roaster or supplier', 'Hi {business}! I''m {me} from The Business Agent, an app for cafés. You see café owners every week: each café that signs up with your code gets its first month free, and you earn €50 when it first pays plus 20% of what it pays in its first year. Fancy a chat?', 7);
  end if;
  perform set_config('app.business_id', '', true);
end $$;
revoke execute on function public.start_admin_area_sections() from public, anon, authenticated, service_role;

select public.start_admin_area_sections();
