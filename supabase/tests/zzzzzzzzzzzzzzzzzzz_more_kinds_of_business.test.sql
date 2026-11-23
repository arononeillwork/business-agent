-- More kinds of business on HQ's sales board (the more_kinds_of_business migration): Dad on the sales
-- team with a code, Pan Bendito a bakery, and the new contacts each in the right lane as the right kind,
-- once, whatever is run again. HQ and its sales team were made by earlier tests.
select set_config('test.hq', (select id::text from public.business where is_hq), false);
select public.start_more_kinds_of_business();
select public.start_more_kinds_of_business();
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  assert (select count(*) from public.sales_team where business_id = v_hq and name = 'Dad') = 1, 'Dad on the sales team, once';
  assert (select m.position = (select max(position) from public.sales_team where business_id = v_hq) and r.code is not null
            from public.sales_team m join public.sales_reps r on r.id = m.rep_id where m.business_id = v_hq and m.name = 'Dad'), 'at the end, with a code';

  assert (select business_type from public.sales_prospects where business_id = v_hq and instagram = 'panbendito_bakehouse') = 'bakery', 'Pan Bendito a bakery';

  assert (select string_agg(p.name || '@' || m.name || ':' || p.business_type, ', ' order by p.name)
            from public.sales_prospects p join public.sales_team m on m.id = p.member_id
           where p.business_id = v_hq and p.name in ('Eric''s Bakery', 'Mable', 'McCabe McGinn', 'TFI Local Link Longford Westmeath Roscommon',
                                                     'The Castletown Inn', 'The Squealing Pig'))
    = 'Eric''s Bakery@Aron:bakery, Mable@Aron:construction, McCabe McGinn@Aron:construction, '
      'TFI Local Link Longford Westmeath Roscommon@Aron:transport, The Castletown Inn@Ryan:pub, The Squealing Pig@Dad:restaurant',
    'the contacts, once each, in the right lanes';
  assert (select count(*) from public.sales_prospects where business_id = v_hq and instagram in ('officialsquealingpig', 'mccabe.mcginn')) = 2, 'by their Instagram';
  assert (select website = 'https://maps.app.goo.gl/PE9JXYk2Yn6id8jt5' and town = 'Celbridge'
            from public.sales_prospects where business_id = v_hq and name = 'The Castletown Inn'), 'The Castletown Inn by its Google Maps link, in its town';
  assert (select website from public.sales_prospects where business_id = v_hq and name = 'Mable') = 'https://mable.ie', 'Mable by its website';
  assert (select notes from public.sales_prospects where business_id = v_hq and name = 'TFI Local Link Longford Westmeath Roscommon') = 'Bus services',
    'TFI Local Link: bus services';
end $$;

-- Every kind there is can be kept; one there isn't, can't.
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  perform set_config('app.business_id', v_hq::text, true);
  insert into public.sales_prospects (business_id, name, phone, business_type)
  select v_hq, 'Kind ' || k, '+34 600 000 1' || n, k
    from unnest(array['cafe', 'restaurant', 'bakery', 'pub', 'barber', 'garage', 'construction', 'transport', 'financial', 'other']) with ordinality t(k, n);
  delete from public.sales_prospects where business_id = v_hq and name like 'Kind %';
  begin
    insert into public.sales_prospects (business_id, name, phone, business_type) values (v_hq, 'Kind florist', '+34 600 000 199', 'florist');
    assert false, 'a florist isn''t one of the kinds';
  exception when check_violation then null;
  end;
end $$;

-- HQ's people (the lawyer_and_investors migration), once: Eduardo, the lawyer, reporting to Aron;
-- Eric Lein at the top of the investors; every investor labelled C TWO. HQ's people as a new database
-- starts them (an earlier test leaves none), then the changes.
delete from public.admin_people where business_id = current_setting('test.hq')::int;
select public.start_admin_area_people();
select public.start_lawyer_and_investors();
select public.start_lawyer_and_investors();
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  assert (select string_agg(p.name || ':' || p.role || '>' || b.name || ':' || p.kind, ', ')
            from public.admin_people p join public.admin_people b on b.id = p.reports_to where p.business_id = v_hq and p.name = 'Eduardo')
    = 'Eduardo:Lawyer>Aron:team', 'Eduardo on the team, once, the lawyer, reporting to Aron';
  assert (select string_agg(name || ':' || array_to_string(labels, '/'), ', ' order by position, name)
            from public.admin_people where business_id = v_hq and kind = 'investor')
    = 'Eric Lein:C TWO, Giorgos:C TWO, Ollie:C TWO', 'Eric Lein first, once; every investor labelled C TWO, once';
  assert (select labels from public.admin_people where business_id = v_hq and name = 'Alejandro') = '{C TWO}', 'the team''s labels as they were';
end $$;
