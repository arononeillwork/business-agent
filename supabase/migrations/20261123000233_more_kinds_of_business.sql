-- The sales board (the admin area's Sales, /admin), more of it:
--
-- 1. Four more kinds of business a contact can be: a bakery, a pub, a construction firm and a transport
--    company (the admin_area_people migration has the others). A pub that signs up with a salesperson's
--    code now goes with the pubs, not the restaurants.
-- 2. HQ's: Dad on the sales team (a lane and a code), Pan Bendito Bakehouse a bakery, and eight more
--    contacts:
--      Aron: Eric's Bakery (bakery), McCabe McGinn and Mable (construction), TFI Local Link Longford
--            Westmeath Roscommon (transport: bus services)
--      Dad:  The Squealing Pig (restaurant)
--      Ryan: The Castletown Inn in Celbridge (pub, by its Google Maps link)
--
-- The code live before this never writes the new kinds, and the rows are HQ's own.

-- ---------------------------------------------------------------------------
-- 1. The kinds of business
-- ---------------------------------------------------------------------------
alter table public.sales_prospects drop constraint sales_prospects_business_type_check;
alter table public.sales_prospects add constraint sales_prospects_business_type_check
  check (business_type in ('cafe', 'restaurant', 'barber', 'bakery', 'pub', 'garage', 'construction', 'transport', 'financial', 'other'));

-- As the admin_area_people migration has it, and a pub that signs up is a pub now (a salon or an estate
-- agent is still something else).
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
        insert into public.sales_prospects (business_id, member_id, name, stage, introduction_id, business_type)
        values (new.business_id, v_member, left(new.name, 120), 'trial', new.id,
                case new.kind when 'cafe' then 'cafe' when 'restaurant' then 'restaurant' when 'pub' then 'pub' else 'other' end)
        returning id into v_card;
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

-- ---------------------------------------------------------------------------
-- 2. HQ's: Dad, Pan Bendito a bakery, and the new contacts
-- ---------------------------------------------------------------------------
-- Once, for HQ (a brand-new database runs `select public.start_more_kinds_of_business();` after
-- `select public.start_admin_area_people();`). Nothing already there is changed: Dad only when nobody on
-- the sales team is called Dad; Pan Bendito only while it's still a café; a contact only when its
-- Instagram, or its name, isn't on the board.
create or replace function public.start_more_kinds_of_business() returns void
language plpgsql set search_path = ''
as $$
declare
  v_hq int := (select id from public.business where is_hq);
  v_id uuid;
  r record;
begin
  if v_hq is null then return; end if;
  perform set_config('app.business_id', v_hq::text, true);

  if not exists (select 1 from public.sales_team where business_id = v_hq and lower(split_part(btrim(name), ' ', 1)) = 'dad') then
    insert into public.sales_team (business_id, name, position)
    values (v_hq, 'Dad', (select coalesce(max(position), 0) + 1 from public.sales_team where business_id = v_hq))
    returning id into v_id;
    perform public.admin_area_give_code(v_id);
  end if;

  update public.sales_prospects set business_type = 'bakery'
   where business_id = v_hq and business_type = 'cafe'
     and (instagram = 'panbendito_bakehouse' or public.sales_name_key(name) = public.sales_name_key('Pan Bendito Bakehouse'));

  for r in select * from (values
      ('Aron', 'Eric''s Bakery', null, null, null, 'bakery', null),
      ('Dad', 'The Squealing Pig', 'officialsquealingpig', null, null, 'restaurant', null),
      ('Ryan', 'The Castletown Inn', null, 'https://maps.app.goo.gl/PE9JXYk2Yn6id8jt5', 'Celbridge', 'pub', null),
      ('Aron', 'McCabe McGinn', 'mccabe.mcginn', null, null, 'construction', null),
      ('Aron', 'Mable', null, 'https://mable.ie', null, 'construction', null),
      ('Aron', 'TFI Local Link Longford Westmeath Roscommon', null,
       'https://www.linkedin.com/company/tfi-local-link-longford-westmeath-roscommon/home/', null, 'transport', 'Bus services'))
      c(who, name, instagram, website, town, business_type, notes)
  loop
    if not exists (select 1 from public.sales_prospects
                    where business_id = v_hq and (instagram = r.instagram or public.sales_name_key(name) = public.sales_name_key(r.name))) then
      insert into public.sales_prospects (business_id, member_id, name, instagram, website, town, kind, business_type, notes)
      values (v_hq, (select id from public.sales_team where business_id = v_hq and lower(split_part(btrim(name), ' ', 1)) = lower(r.who)
                      order by position limit 1),
              r.name, r.instagram, r.website, r.town, 'customer', r.business_type, r.notes);
    end if;
  end loop;
  perform set_config('app.business_id', '', true);
end $$;
revoke execute on function public.start_more_kinds_of_business() from public, anon, authenticated, service_role;

select public.start_more_kinds_of_business();
