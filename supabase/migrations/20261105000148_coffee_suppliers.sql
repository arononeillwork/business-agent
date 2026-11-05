-- Coffee suppliers: the roasters the coffees come from, shown on the Coffees page with how to pay them.
-- Many roasters are paid by bank transfer when the order is placed, so a supplier can keep the company
-- name the account is in (often not the brand: Puchero is Tostarix S.L.), the bank, and the IBAN and
-- BIC to send the money to. The IBAN and BIC are kept in capitals without spaces; the app shows the
-- IBAN in groups of four and checks its check digits before saving. Who sees and changes suppliers
-- is as before (the stock migration); the app shows the bank details to admins and to those who see
-- the money.
alter table public.suppliers
  add column legal_name text check (char_length(legal_name) <= 120),
  add column bank_name  text check (char_length(bank_name) <= 80),
  add column iban       text check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  add column bic        text check (bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$');

create or replace function public.supplier_bank_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.legal_name := nullif(btrim(new.legal_name), '');
  new.bank_name := nullif(btrim(new.bank_name), '');
  new.iban := nullif(upper(regexp_replace(new.iban, '[\s-]+', '', 'g')), '');
  new.bic := nullif(upper(regexp_replace(new.bic, '\s+', '', 'g')), '');
  return new;
end $$;
create trigger suppliers_bank_rules before insert or update on public.suppliers
  for each row execute function public.supplier_bank_rules();

-- Easy Beans (business 1): Puchero, the specialty roaster in Hornillos de Eresma (Valladolid), whose
-- Brasil Fazenda Boa Vista the café ordered on 23 October 2026 (order 87326: 2 kg of beans, €47.80
-- and €9.00 delivery before IVA, €63.47 in all, paid by bank transfer to Tostarix S.L.). Added with
-- its bank details, or, when the café has added Puchero already, its empty details filled in; and the
-- coffee added to the Coffees page unless it's there. Easy Beans is business 1 when it's named so or
-- Aron is on its team; anywhere else nothing changes, and running it again changes nothing.
do $$
declare
  v_sup uuid;
  v_notes text := 'First order 23 Oct 2026 (no. 87326): Brasil Fazenda Boa Vista Natural Espresso, 2 kg beans. '
               || '€47.80 + €9.00 delivery before IVA, €63.47 in all, paid by bank transfer.';
begin
  if not exists (select 1 from public.business b
                  where b.id = 1
                    and (b.name ~* 'easy\s*beans'
                         or exists (select 1 from public.profiles p where p.business_id = 1 and p.full_name ~* '^\s*aron\M'))) then
    return;
  end if;
  -- Named, so the rules and the audit see Easy Beans (a migration runs signed out).
  perform set_config('app.business_id', '1', true);

  select s.id into v_sup
    from public.suppliers s
   where s.business_id = 1 and (s.name ~* '\mpuchero\M' or s.name ~* '\mtostarix\M')
   order by s.active desc, s.created_at
   limit 1;
  if v_sup is null then
    insert into public.suppliers (business_id, name, legal_name, kind, supplies, website, address, payment_terms,
                                  bank_name, iban, bic, notes)
    values (1, 'Puchero', 'Tostarix S.L.', 'Coffee roaster', array['coffee'], 'https://somospuchero.com',
            'Hornillos de Eresma, Valladolid', 'Bank transfer when ordering',
            'Banco Santander', 'ES8600496064362216134651', 'BSCHESMMXXX', v_notes);
  else
    update public.suppliers
       set legal_name = coalesce(legal_name, 'Tostarix S.L.'),
           kind = coalesce(kind, 'Coffee roaster'),
           website = coalesce(website, 'https://somospuchero.com'),
           payment_terms = coalesce(payment_terms, 'Bank transfer when ordering'),
           bank_name = coalesce(bank_name, 'Banco Santander'),
           iban = coalesce(iban, 'ES8600496064362216134651'),
           bic = coalesce(bic, 'BSCHESMMXXX'),
           notes = coalesce(notes, v_notes)
     where id = v_sup;
  end if;

  insert into public.coffees (business_id, name, country, region, roaster, process, brew, bag_grams, bag_price, sort)
  select 1, 'Brasil Fazenda Boa Vista', 'BR', 'Fazenda Boa Vista', 'Puchero', 'natural', 'espresso', 2000, 47.80,
         coalesce((select max(sort) + 1 from public.coffees where business_id = 1), 1)
   where not exists (select 1 from public.coffees where business_id = 1 and name ~* 'boa\s*vista');

  perform set_config('app.business_id', '', true);
end $$;
