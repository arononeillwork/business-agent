-- The sales board shown by country (the sales_contacts_by_country migration): a contact is in Spain,
-- Ireland or not said; HQ's contacts so far each in theirs, once, without changing one already said; and
-- a business that signs up with a salesperson's code has its card in the country it signed up in. HQ,
-- its sales team and its contacts were made by earlier tests.
select set_config('test.hq', (select id::text from public.business where is_hq), false);
select set_config('app.business_id', current_setting('test.hq'), false);

-- 1. Spain, Ireland or not said --------------------------------------------------------------------
do $$
begin
  begin
    insert into public.sales_prospects (name, phone, country) values ('Café X', '+33 600 000 001', 'FR');
    assert false, 'France isn''t one of the countries';
  exception when check_violation then null;
  end;
end $$;

-- 2. HQ's contacts, each in its country, once ------------------------------------------------------
update public.sales_prospects set country = 'ES' where business_id = current_setting('test.hq')::int and name = 'Mable';
insert into public.sales_prospects (name, phone) values ('Café Sin País', '+34 600 000 301');
select public.start_sales_contacts_by_country();
select public.start_sales_contacts_by_country();
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  assert (select string_agg(name || ':' || coalesce(country, '-'), ', ' order by name) from public.sales_prospects
           where business_id = v_hq and name in ('Alma Specialty Coffee', 'Harrison''s Barbershop', 'Six Barbershop', 'Eric''s Bakery',
                                                 'The Castletown Inn', 'TFI Local Link Longford Westmeath Roscommon', 'Mable', 'Café Sin País'))
    = 'Alma Specialty Coffee:ES, Café Sin País:-, Eric''s Bakery:IE, Harrison''s Barbershop:ES, Mable:ES, Six Barbershop:ES, '
      'TFI Local Link Longford Westmeath Roscommon:IE, The Castletown Inn:IE',
    'each in its country; one already said kept; one not on the list not said';
end $$;
delete from public.sales_prospects where business_id = current_setting('test.hq')::int and name = 'Café Sin País';

-- 3. A sign-up's card, in the country it signed up in ----------------------------------------------
do $$
declare
  v_hq   int := current_setting('test.hq')::int;
  v_rep  uuid := (select rep_id from public.sales_team where business_id = v_hq and name = 'Dad');
  v_free int := (select id from public.business b where not is_hq
                  and not exists (select 1 from public.rep_introductions i where i.business_id = v_hq and i.introduced = b.id) order by id limit 1);
  v_was  text := (select country from public.business where id = v_free);
begin
  assert v_rep is not null and v_free is not null, 'a salesperson with a code, and a business to sign up';
  update public.business set country = 'IE' where id = v_free;
  insert into public.rep_introductions (rep_id, introduced, code, name, kind) select v_rep, v_free, code, 'Café Dublín', 'cafe' from public.sales_reps where id = v_rep;
  assert (select p.country || ':' || p.business_type || '@' || m.name from public.sales_prospects p join public.sales_team m on m.id = p.member_id
           where p.business_id = v_hq and p.name = 'Café Dublín') = 'IE:cafe@Dad', 'in Ireland, as it signed up, in Dad''s lane';
  delete from public.rep_introductions where business_id = v_hq and introduced = v_free;
  delete from public.sales_prospects where business_id = v_hq and name = 'Café Dublín';
  update public.business set country = v_was where id = v_free;
end $$;
