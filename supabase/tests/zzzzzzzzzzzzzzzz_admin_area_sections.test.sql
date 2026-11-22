-- The admin area's sections (the admin_area_sections migration): the roasters as partners, each
-- salesperson's rep code, a card's history, the messages to start from, and a sign-up with a code moving
-- its card (to Signed up, then Paying), never stopping the sign-up. HQ was made by an earlier test.

create function pg_temp.as_worker(p_business int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', json_build_object('x-business-id', p_business::text)::text, false);
  set role service_role;
end $$;

create function pg_temp.as_editor() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.headers', '', false);
end $$;

-- 1. HQ's to start ----------------------------------------------------------------------------------
select pg_temp.as_editor();
select set_config('test.hq', (select id::text from public.business where is_hq), false);
select public.start_admin_area();
select public.start_admin_area_sections();
select public.start_admin_area_sections();
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  assert (select string_agg(instagram || ' ' || kind, ', ' order by instagram) from public.sales_prospects where business_id = v_hq)
    = 'kekimarbella customer, roasted.spain partner, santaroaster partner, the_bootes_cafe customer', 'the roasters are partners';
  assert (select r.code from public.sales_team m join public.sales_reps r on r.id = m.rep_id where m.business_id = v_hq and m.name = 'Julio Cesar') = 'JULIO27',
    'Julio Cesar is the rep with JULIO27';
  assert (select r.code ~ '^MARIA\d{2,3}$' and r.name = 'Maria Cortes' and r.kind = 'ambassador' and r.approved and r.business_id = v_hq
            from public.sales_team m join public.sales_reps r on r.id = m.rep_id where m.business_id = v_hq and m.name = 'Maria Cortes'),
    'Maria Cortes has a code of her own';
  assert (select count(*) from public.sales_templates where business_id = v_hq) = 7, 'the messages to start from, once';
  assert (select count(*) from public.sales_templates where business_id = v_hq and body ~ '\{(business|me|code|link)\}') = 7, 'each with something filled in';
end $$;

-- 2. A code for someone new, through the Worker ---------------------------------------------------
select pg_temp.as_worker(current_setting('test.hq')::int);
do $$
declare v_member uuid; v_rep uuid;
begin
  insert into public.sales_team (name, position) values ('Lola Pérez', 9) returning id into v_member;
  v_rep := public.admin_area_give_code(v_member);
  assert (select code ~ '^LOLA\d{2,3}$' from public.sales_reps where id = v_rep), 'a code from her name';
  assert (select rep_id = v_rep from public.sales_team where id = v_member), 'and she''s linked to it';
  assert public.admin_area_give_code(v_member) = v_rep, 'asked again: the same one';
  perform set_config('test.lola', v_member::text, false);
end $$;

-- 3. A card's history -------------------------------------------------------------------------------
do $$
declare v uuid;
begin
  insert into public.sales_prospects (name, phone) values ('Bar Historia', '+34 600 000 001') returning id into v;
  update public.sales_prospects set stage = 'contacted' where id = v;
  update public.sales_prospects set notes = 'Liked it' where id = v;
  update public.sales_prospects set stage = 'demo' where id = v;
  assert (select string_agg(kind || coalesce(':' || stage, ''), ', ' order by at, kind) from public.sales_activity where prospect_id = v)
    = 'added:to_contact, stage:contacted, stage:demo', 'added, then each move (a change that isn''t a move isn''t one)';
  assert (select bool_and(business_id = current_setting('test.hq')::int) from public.sales_activity where prospect_id = v), 'HQ''s';
  insert into public.sales_activity (prospect_id, kind, note) values (v, 'call', 'Spoke to Ana');
  delete from public.sales_prospects where id = v;
  assert not exists (select 1 from public.sales_activity where prospect_id = v), 'and goes with the card';
end $$;

-- 4. A sign-up with a code moves its card ------------------------------------------------------------
-- (HQ's list is written by create_business() and the billing sync; here straight into it, as they do.)
select pg_temp.as_editor();
select set_config('app.business_id', current_setting('test.hq'), false);
do $$
declare
  v_hq     int := current_setting('test.hq')::int;
  v_julio  uuid := (select rep_id from public.sales_team where business_id = v_hq and name = 'Julio Cesar');
  v_maria  uuid := (select rep_id from public.sales_team where business_id = v_hq and name = 'Maria Cortes');
  v_free   int[] := array(select id from public.business b where not is_hq
                            and not exists (select 1 from public.rep_introductions i where i.business_id = v_hq and i.introduced = b.id) order by id limit 4);
  v_keki   uuid := (select id from public.sales_prospects where business_id = v_hq and instagram = 'kekimarbella');
  v_intro  uuid;
begin
  assert cardinality(v_free) = 4, 'four businesses to sign up';
  -- Keki Marbella signs up with JULIO27 (its name as typed at sign-up): its card is found by name, and moves.
  insert into public.rep_introductions (rep_id, introduced, code, name, kind) values (v_julio, v_free[1], 'JULIO27', 'KEKI  marbella!', 'cafe') returning id into v_intro;
  assert (select stage = 'trial' and introduction_id = v_intro from public.sales_prospects where id = v_keki), 'Keki Marbella: signed up';
  assert exists (select 1 from public.sales_activity where prospect_id = v_keki and kind = 'signed_up' and note = 'Signed up with the code JULIO27'), 'and its history says so';
  -- Setting up isn't a move; its first payment is.
  update public.rep_introductions set set_up_at = now() where id = v_intro;
  assert (select stage = 'trial' from public.sales_prospects where id = v_keki), 'still signed up';
  update public.rep_introductions set first_paid_at = now(), status = 'active', plan = 'pro' where id = v_intro;
  assert (select stage = 'won' from public.sales_prospects where id = v_keki), 'paying';
  assert (select count(*) from public.sales_activity where prospect_id = v_keki and kind = 'paid') = 1, 'once';
  update public.rep_introductions set first_paid_at = first_paid_at where id = v_intro;
  assert (select count(*) from public.sales_activity where prospect_id = v_keki and kind = 'paid') = 1, 'and only once';
  assert (select count(*) from public.sales_activity where prospect_id = v_keki and kind = 'signed_up') = 1, 'signed up once too';

  -- A café that signed up with Maria's code and had no card gets one, in her lane.
  insert into public.rep_introductions (rep_id, introduced, code, name) select v_maria, v_free[2], code, 'Café Nuevo' from public.sales_reps where id = v_maria;
  assert (select m.name = 'Maria Cortes' and p.stage = 'trial' and p.kind = 'customer'
            from public.sales_prospects p join public.sales_team m on m.id = p.member_id where p.business_id = v_hq and p.name = 'Café Nuevo'), 'a new card in Maria''s lane';
  assert exists (select 1 from public.sales_activity a join public.sales_prospects p on p.id = a.prospect_id where p.name = 'Café Nuevo' and a.kind = 'added')
     and exists (select 1 from public.sales_activity a join public.sales_prospects p on p.id = a.prospect_id where p.name = 'Café Nuevo' and a.kind = 'signed_up'),
    'added and signed up';

  -- A rep who isn't on the sales team: in nobody's lane.
  insert into public.rep_introductions (rep_id, introduced, code, name) values (null, v_free[3], 'OTHER1', 'Bar Sin Lane');
  assert (select member_id is null and stage = 'trial' from public.sales_prospects where business_id = v_hq and name = 'Bar Sin Lane'), 'nobody''s yet';

  -- Whatever goes wrong with the board, the sign-up goes through (a name that can't be a card's).
  insert into public.rep_introductions (rep_id, introduced, code, name) values (v_julio, v_free[4], 'JULIO27', '   ') returning id into v_intro;
  assert exists (select 1 from public.rep_introductions where id = v_intro), 'the sign-up is kept';
  assert not exists (select 1 from public.sales_prospects where introduction_id = v_intro), 'with no card';

  -- Tidy up.
  delete from public.rep_introductions where business_id = v_hq and introduced = any (v_free);
  delete from public.sales_prospects where business_id = v_hq and name in ('Café Nuevo', 'Bar Sin Lane');
  update public.sales_prospects set stage = 'to_contact' where id = v_keki;
  assert (select introduction_id is null from public.sales_prospects where id = v_keki), 'a sign-up taken off HQ''s list leaves the card';
end $$;

-- 5. A job on HQ's to-do list about a card ----------------------------------------------------------
select pg_temp.as_worker(current_setting('test.hq')::int);
do $$
declare v uuid; v_card uuid := (select id from public.sales_prospects where business_id = current_setting('test.hq')::int and instagram = 'the_bootes_cafe');
begin
  insert into public.todos (title, planned_on, sales_prospect_id) values ('Call back The Bootes Cafe', current_date, v_card) returning id into v;
  assert (select business_id = current_setting('test.hq')::int and created_by is null and sales_prospect_id = v_card from public.todos where id = v), 'HQ''s, about the card';
  delete from public.todos where id = v;
end $$;

select pg_temp.as_editor();
select set_config('app.business_id', current_setting('test.hq'), false);
delete from public.sales_reps where id = (select rep_id from public.sales_team where id = current_setting('test.lola')::uuid);
delete from public.sales_team where id = current_setting('test.lola')::uuid;
select set_config('app.business_id', '', false);
