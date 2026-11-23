-- People and the kinds of business on the sales board (the admin_area_people migration): HQ's to start
-- (once, whatever is run again), a sign-up's card is the kind of business it signed up as, and the
-- people's rules: whom someone reports to is on the team, never round in a circle, and someone who leaves
-- (or becomes an investor) passes whoever reported to them up. HQ was made by an earlier test.

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

-- 1. HQ's to start, once --------------------------------------------------------------------------
select pg_temp.as_editor();
select set_config('test.hq', (select id::text from public.business where is_hq), false);
select public.start_admin_area_people();
select public.start_admin_area_people();
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  -- The chart: the CEO at the top, the heads under him, the sales team under Alejandro; the investors beside it.
  assert (select string_agg(p.name || '>' || coalesce(b.name, '-') || ':' || p.kind, ', ' order by p.position)
            from public.admin_people p left join public.admin_people b on b.id = p.reports_to where p.business_id = v_hq)
    = 'Aron>-:team, Alejandro>Aron:team, Ryan>Alejandro:team, Mark>Alejandro:team, Julio>Alejandro:team, Maria>Alejandro:team, '
      'Kim>Aron:team, Zoe>Aron:team, Giorgos>-:investor, Ollie>-:investor', 'everyone, once, reporting to the right person';
  assert (select role from public.admin_people where business_id = v_hq and name = 'Alejandro') = 'Head of Product / Sales Manager', 'with what they do';
  assert (select string_agg(name, ', ' order by position) from public.admin_people where business_id = v_hq and labels = '{C TWO}') = 'Alejandro, Kim',
    'Alejandro and Kim labelled C TWO';

  -- Ryan, Mark, Mum and Aron on the sales team after Maria and Julio, each with a code of their own.
  assert (select string_agg(m.name, ', ' order by m.position) from public.sales_team m where m.business_id = v_hq)
    = 'Maria Cortes, Julio Cesar, Ryan, Mark, Mum, Aron', 'a lane each, at the end';
  assert (select count(*) filter (where r.code is not null and r.business_id = v_hq)
            from public.sales_team m join public.sales_reps r on r.id = m.rep_id where m.business_id = v_hq and m.name in ('Ryan', 'Mark', 'Mum', 'Aron')) = 4,
    'and a code each';

  -- Their contacts, each in the right lane, as the right kind of business; everything already there a café.
  assert (select string_agg(p.name || '@' || m.name || ':' || p.business_type || ':' || p.kind, ', ' order by p.name)
            from public.sales_prospects p join public.sales_team m on m.id = p.member_id
           where p.business_id = v_hq and p.name in ('Al Andalus Roasters', 'Aora Beauty Marbella', 'Charliebyb', 'Cocobrew', 'Empowered Money', 'Moca Marbella',
                                                     'Pan Bendito Bakehouse', 'Piccolina Grand Cafe', 'Sovaz Spain', 'The DPF Centre', 'The Juice Jar'))
    = 'Al Andalus Roasters@Julio Cesar:cafe:partner, Aora Beauty Marbella@Mark:other:customer, Charliebyb@Ryan:barber:customer, '
      'Cocobrew@Mark:cafe:customer, Empowered Money@Aron:financial:customer, Moca Marbella@Mark:cafe:customer, Pan Bendito Bakehouse@Ryan:cafe:customer, '
      'Piccolina Grand Cafe@Mark:cafe:customer, Sovaz Spain@Julio Cesar:cafe:customer, The DPF Centre@Mark:garage:customer, '
      'The Juice Jar@Mum:cafe:customer', 'the contacts, once each';
  assert (select count(*) from public.sales_prospects where business_id = v_hq and instagram in ('sovaz.spain', 'cocobrew_')) = 2, 'by their Instagram';
  assert (select website = 'https://www.juicejar.com' and notes = '10 franchise locations' from public.sales_prospects where business_id = v_hq and name = 'The Juice Jar'),
    'The Juice Jar''s website and locations';
  assert (select instagram from public.sales_prospects where business_id = v_hq and name = 'Charliebyb') = 'charliebyb', 'by its Instagram';
  assert (select website from public.sales_prospects where business_id = v_hq and name = 'Empowered Money') = 'https://www.linkedin.com/company/empowered-money/home/',
    'Empowered Money by its LinkedIn';
  assert (select business_type from public.sales_prospects where business_id = v_hq and instagram = 'the_bootes_cafe') = 'cafe', 'the board so far: cafés';

  -- The job, at the top of HQ's list, once.
  assert (select count(*) from public.todos where business_id = v_hq and title = 'Register a tax-free residency') = 1, 'on the to-do list, once';
  assert (select t.position < 0 and not t.done from public.todos t where t.business_id = v_hq and t.title = 'Register a tax-free residency'), 'at the top, not done';
end $$;

-- 2. Only the kinds of business there are ----------------------------------------------------------
select pg_temp.as_worker(current_setting('test.hq')::int);
do $$
begin
  begin
    insert into public.sales_prospects (name, phone, business_type) values ('Panadería X', '+34 600 000 002', 'bakery');
    assert false, 'a bakery isn''t one of the kinds';
  exception when check_violation then null;
  end;
end $$;

-- 3. A sign-up's card is the kind of business it signed up as ---------------------------------------
select pg_temp.as_editor();
select set_config('app.business_id', current_setting('test.hq'), false);
do $$
declare
  v_hq   int := current_setting('test.hq')::int;
  v_mark uuid := (select rep_id from public.sales_team where business_id = v_hq and name = 'Mark');
  v_free int[] := array(select id from public.business b where not is_hq
                          and not exists (select 1 from public.rep_introductions i where i.business_id = v_hq and i.introduced = b.id) order by id limit 2);
begin
  assert cardinality(v_free) = 2, 'two businesses to sign up';
  insert into public.rep_introductions (rep_id, introduced, code, name, kind) select v_mark, v_free[1], code, 'Bar Nuevo', 'pub' from public.sales_reps where id = v_mark;
  insert into public.rep_introductions (rep_id, introduced, code, name, kind) select v_mark, v_free[2], code, 'Salón Nuevo', 'salon' from public.sales_reps where id = v_mark;
  assert (select string_agg(p.name || ':' || p.business_type || '@' || m.name, ', ' order by p.name)
            from public.sales_prospects p join public.sales_team m on m.id = p.member_id where p.business_id = v_hq and p.name in ('Bar Nuevo', 'Salón Nuevo'))
    = 'Bar Nuevo:restaurant@Mark, Salón Nuevo:other@Mark', 'a pub with the restaurants, a salon something else, in Mark''s lane';
  delete from public.rep_introductions where business_id = v_hq and introduced = any (v_free);
  delete from public.sales_prospects where business_id = v_hq and name in ('Bar Nuevo', 'Salón Nuevo');
end $$;

-- 4. Who reports to whom, through the Worker -------------------------------------------------------
select pg_temp.as_worker(current_setting('test.hq')::int);
do $$
declare
  v_hq        int := current_setting('test.hq')::int;
  v_aron      uuid := (select id from public.admin_people where business_id = v_hq and name = 'Aron');
  v_alejandro uuid := (select id from public.admin_people where business_id = v_hq and name = 'Alejandro');
  v_ryan      uuid := (select id from public.admin_people where business_id = v_hq and name = 'Ryan');
  v_giorgos   uuid := (select id from public.admin_people where business_id = v_hq and name = 'Giorgos');
  v_lola      uuid;
  v_ana       uuid;
begin
  -- Tidied, and HQ's.
  insert into public.admin_people (name, role, reports_to, labels) values ('  Lola   Pérez ', ' ', v_ryan, '{" C  TWO ", "c two", "", Board}') returning id into v_lola;
  assert (select name = 'Lola Pérez' and role is null and labels = '{C TWO,Board}' and business_id = v_hq from public.admin_people where id = v_lola), 'tidied, HQ''s';

  -- Never to an investor, to someone in another business, to themselves, or to someone below them.
  begin
    insert into public.admin_people (name, reports_to) values ('X', v_giorgos);
    assert false, 'not to an investor';
  exception when check_violation then null;
  end;
  begin
    update public.admin_people set reports_to = v_lola where id = v_alejandro;
    assert false, 'not round in a circle';
  exception when check_violation then null;
  end;
  begin
    update public.admin_people set reports_to = v_aron where id = v_aron;
    assert false, 'not to themselves';
  exception when check_violation then null;
  end;

  -- An investor reports to nobody.
  insert into public.admin_people (name, kind, reports_to) values ('Ana', 'investor', v_aron) returning id into v_ana;
  assert (select reports_to is null from public.admin_people where id = v_ana), 'an investor reports to nobody';

  -- Ryan leaves: Lola reports to Alejandro. Alejandro becomes an investor: whoever reported to him, to Aron.
  delete from public.admin_people where id = v_ryan;
  assert (select reports_to = v_alejandro from public.admin_people where id = v_lola), 'up to whom Ryan reported to';
  update public.admin_people set kind = 'investor' where id = v_alejandro;
  assert (select reports_to is null from public.admin_people where id = v_alejandro), 'an investor now, reporting to nobody';
  assert not exists (select 1 from public.admin_people where reports_to = v_alejandro), 'and nobody reports to him';
  assert (select reports_to = v_aron from public.admin_people where id = v_lola), 'Lola reports to Aron';
end $$;

-- 5. Everyone taken off at once (as when a business is deleted) ----------------------------------------
select pg_temp.as_editor();
delete from public.admin_people where business_id = current_setting('test.hq')::int;
do $$ begin assert not exists (select 1 from public.admin_people where business_id = current_setting('test.hq')::int), 'all gone, in one go'; end $$;
