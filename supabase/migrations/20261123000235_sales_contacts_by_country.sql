-- The sales board (the admin area's Sales, /admin) shown by country: each contact is in Spain or Ireland
-- (or not said yet), so the board can be shown for one of them.
--
-- 1. sales_prospects.country: ES or IE, as business.country (the country migration); none until it's said.
-- 2. A business that signs up with a salesperson's code: its card is in the country it signed up in.
-- 3. HQ's contacts so far, each in its country. The Marbella team's are in Spain, and so are Harrison's
--    Barbershop and Dailys Brunch; the rest are in Ireland. A contact added since stays unsaid, to set
--    from the board.
--
-- The code live before this never names the new column.

-- ---------------------------------------------------------------------------
-- 1. The country
-- ---------------------------------------------------------------------------
alter table public.sales_prospects add column country text check (country in ('ES', 'IE'));

-- ---------------------------------------------------------------------------
-- 2. A sign-up's card, in its country
-- ---------------------------------------------------------------------------
-- As the more_kinds_of_business migration has it, and the card has the country of the business that signed
-- up (a card already on the board keeps a country it has).
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
        insert into public.sales_prospects (business_id, member_id, name, stage, introduction_id, business_type, country)
        values (new.business_id, v_member, left(new.name, 120), 'trial', new.id,
                case new.kind when 'cafe' then 'cafe' when 'restaurant' then 'restaurant' when 'pub' then 'pub' else 'other' end,
                (select b.country from public.business b where b.id = new.introduced))
        returning id into v_card;
      else
        update public.sales_prospects
           set introduction_id = new.id, member_id = coalesce(member_id, v_member),
               country = coalesce(country, (select b.country from public.business b where b.id = new.introduced)),
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
-- 3. HQ's contacts, each in its country
-- ---------------------------------------------------------------------------
-- Once, for HQ (a brand-new database runs `select public.start_sales_contacts_by_country();` after the
-- other start_ functions). Only a contact whose country isn't said yet is changed.
create or replace function public.start_sales_contacts_by_country() returns void
language plpgsql set search_path = ''
as $$
declare v_hq int := (select id from public.business where is_hq);
begin
  if v_hq is null then return; end if;
  perform set_config('app.business_id', v_hq::text, true);
  update public.sales_prospects p set country = c.country
    from (values
      ('ES', 'Santa Roaster'), ('ES', 'The Bootes Cafe'), ('ES', 'Al Andalus Roasters'), ('ES', 'Alma Specialty Coffee'), ('ES', 'Keki Marbella'),
      ('ES', 'Roasted Spain'), ('ES', 'Sovaz Spain'), ('ES', 'Beïty Marbella'), ('ES', 'Charliebyb'), ('ES', 'Pan Bendito Bakehouse'),
      ('ES', 'Six Barbershop'), ('ES', 'Aora Beauty Marbella'), ('ES', 'Cocobrew'), ('ES', 'Moca Marbella'), ('ES', 'Piccolina Grand Cafe'),
      ('ES', 'Harrison''s Barbershop'), ('ES', 'Dailys Brunch'),
      ('IE', 'The DPF Centre'), ('IE', 'The Juice Jar'), ('IE', 'Empowered Money'), ('IE', 'Eric''s Bakery'), ('IE', 'The Squealing Pig'),
      ('IE', 'The Castletown Inn'), ('IE', 'McCabe McGinn'), ('IE', 'Mable'), ('IE', 'TFI Local Link Longford Westmeath Roscommon')) c(country, name)
   where p.business_id = v_hq and p.country is null and public.sales_name_key(p.name) = public.sales_name_key(c.name);
  perform set_config('app.business_id', '', true);
end $$;
revoke execute on function public.start_sales_contacts_by_country() from public, anon, authenticated, service_role;

select public.start_sales_contacts_by_country();
