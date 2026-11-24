-- Member codes for the coffee club (the coffee_club migration's members): a short code each, the same for as long as
-- the membership lasts, shown as a barcode on the member's pass on the business's website (docs/WEBSITE.md) so the
-- till can scan it once scanning comes. Eight characters a person can read out or type too: letters and digits
-- without 0/O and 1/I. Made by the database for every member, those already here included; unique in the business;
-- never changed.

create or replace function public.club_member_code(p_business int) returns text
language plpgsql volatile set search_path = ''
as $$
declare
  v_letters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    select string_agg(substr(v_letters, 1 + floor(random() * 32)::int, 1), '') into v_code from generate_series(1, 8);
    exit when not exists (select 1 from public.coffee_club_members where business_id = p_business and card_code = v_code);
  end loop;
  return v_code;
end $$;
revoke execute on function public.club_member_code(int) from public, anon, authenticated;
grant execute on function public.club_member_code(int) to service_role;

alter table public.coffee_club_members add column card_code text check (card_code ~ '^[A-HJ-NP-Z2-9]{8}$');
update public.coffee_club_members set card_code = public.club_member_code(business_id) where card_code is null;
alter table public.coffee_club_members alter column card_code set not null;
create unique index coffee_club_members_card_key on public.coffee_club_members (business_id, card_code);

-- A new member gets one; a member's code stays theirs.
create or replace function public.club_member_code_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.card_code := coalesce(new.card_code, public.club_member_code(new.business_id));
  else
    new.card_code := old.card_code;
  end if;
  return new;
end $$;
create trigger coffee_club_members_code before insert or update on public.coffee_club_members
  for each row execute function public.club_member_code_rules();
