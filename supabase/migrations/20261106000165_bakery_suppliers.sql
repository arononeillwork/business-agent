-- Suppliers: Bakery is one of the kinds of thing a supplier supplies, with its own filter on the
-- Suppliers page next to Food (a bakery is food too, so it shows under both). Until an admin ticks it,
-- the page works it out from the supplier's type, name and items, as for the others (shared/stock.ts
-- suppliesOf). The list of kinds is as in the `supplier_supplies` migration, with bakery added.
alter table public.suppliers drop constraint suppliers_supplies_check;
alter table public.suppliers add constraint suppliers_supplies_check
  check (supplies <@ array['drinks', 'food', 'bakery', 'coffee', 'fruit_veg', 'groceries']::text[]);

-- Easy Beans (business 1): its two bakeries, kept in the catalogue (archived, not bought from now), with
-- their details filled in. Both are on file already, archived by the `supplier_invoice_senders`
-- migration, with little more than a name; anywhere they're missing they're added, archived.
--
-- Pan Bendito, the bakery at Centro Comercial Guadalmina, from its invoice 26-100101-438 of 31 August
-- 2026 to Easy Beans (customer 0243) and its website's legal notice (November 2026): the company is
-- Friendly Ferments, S.L., paid by transfer to the BBVA account the owner gave. It was on file as "Pan
-- Bendito Bakehouse" (Bakehouse is only its Instagram name), and is renamed as the shop calls itself.
--
-- By Eric, the French pâtisserie and boulangerie at El Corte Inglés, Puerto Banús ("Eric's bakery"),
-- from the café's notes on it and by-eric.es (November 2026): its website, its address, orders on
-- WhatsApp by 15:00 for pick-up the next day, and the wholesale prices it gave the café.
--
-- Only empty details are filled in, and notes are added to rather than replaced. Easy Beans is business
-- 1 when it's named so or Aron is on its team (as in the `coffee_suppliers` migration); anywhere else
-- nothing changes, and running it again changes nothing.
do $$
declare
  v_pb_name    constant text := 'Pan Bendito';
  v_pb_legal   constant text := 'Friendly Ferments, S.L.';
  v_pb_tax_id  constant text := 'B16703779';
  v_pb_phone   constant text := '+34 683 66 24 65';
  v_pb_email   constant text := 'hola@panbendito.com';
  v_pb_website constant text := 'https://www.panbendito.com';
  v_pb_address constant text := 'Centro Comercial Guadalmina, Bloque II, Local 17, 29670 San Pedro de Alcántara (Málaga)';
  v_pb_notes   constant text := 'Bakery at Centro Comercial Guadalmina (Instagram @panbendito_bakehouse), open Monday to '
                             || 'Saturday 8:30–20:00, closed Sunday; shop phone +34 951 05 77 33. Last invoice 26-100101-438 '
                             || 'of 31 Aug 2026, €28.14 with 10% IVA: croissant €0.98, chocolate napolitana €0.78, chocolate '
                             || 'cookie €0.97, cinnamon swirl €0.98, almond croissant €1.95 (each, before IVA). Health '
                             || 'registration (R.G.S.) 20.048722/MA.';
  v_eric_name    constant text := 'By Eric';
  v_eric_phone   constant text := '+34 683 16 94 37';
  v_eric_email   constant text := 'info@by-eric.es';
  v_eric_website constant text := 'https://by-eric.es';
  v_eric_address constant text := 'El Corte Inglés Puerto Banús (first floor), Calle Ramón Areces, 29660 Marbella';
  v_eric_notes   constant text := 'Artisan French pâtisserie and boulangerie (El Pan de Eric); main bakery in La Campana. '
                               || 'Wholesale at 30% off retail: croissant €1.40, almond croissant €2.00, pistachio croissant '
                               || '€2.70; pastries include raspberry, lemon and Normande tarts, pavlova, brownie and milhojas. '
                               || 'Croissants are best the same day; pastries keep 2 days. Orders on WhatsApp only, by 15:00 '
                               || 'for pick-up the next day at El Corte Inglés Puerto Banús (9:00–18:00). Instagram @byericmarbella.';
  v_sup uuid;
begin
  if not exists (select 1 from public.business b
                  where b.id = 1
                    and (b.name ~* 'easy\s*beans'
                         or exists (select 1 from public.profiles p where p.business_id = 1 and p.full_name ~* '^\s*aron\M'))) then
    return;
  end if;
  -- Named, so the rules and the audit see Easy Beans (a migration runs signed out).
  perform set_config('app.business_id', '1', true);

  -- Pan Bendito (Friendly Ferments, S.L.).
  select s.id into v_sup
    from public.suppliers s
   where s.business_id = 1
     and (s.name ~* '\mpan\s*bendito\M' or s.legal_name ~* '\mfriendly\s+ferments\M' or s.tax_id = v_pb_tax_id
          or s.email ~* '@panbendito\.com$' or s.website ~* '^https?://(www\.)?panbendito\.com')
   order by s.active desc, s.created_at
   limit 1;
  if v_sup is null then
    insert into public.suppliers (business_id, name, legal_name, tax_id, kind, supplies, phone, email, website, address,
                                  account_number, bank_name, iban, bic, active, notes)
    values (1, v_pb_name, v_pb_legal, v_pb_tax_id, 'Bakery', array['food', 'bakery'], v_pb_phone, v_pb_email, v_pb_website,
            v_pb_address, '0243', 'BBVA', 'ES7001824136930201833425', 'BBVAESMMXXX', false, v_pb_notes);
  else
    update public.suppliers
       set name = case when name ~* '^\s*pan\s+bendito\s+bakehouse\s*$' then v_pb_name else name end,
           legal_name = coalesce(legal_name, v_pb_legal),
           tax_id = coalesce(tax_id, v_pb_tax_id),
           kind = coalesce(kind, 'Bakery'),
           supplies = case when 'bakery' = any(supplies) then supplies
                           when supplies = '{}' then array['food', 'bakery']
                           else supplies || array['bakery'] end,
           phone = coalesce(phone, v_pb_phone),
           email = coalesce(email, v_pb_email),
           website = coalesce(website, v_pb_website),
           address = coalesce(address, v_pb_address),
           account_number = coalesce(account_number, '0243'),
           -- The bank and BIC go with the IBAN: only when it has none.
           bank_name = case when iban is null then 'BBVA' else bank_name end,
           bic = case when iban is null then 'BBVAESMMXXX' else bic end,
           iban = coalesce(iban, 'ES7001824136930201833425'),
           notes = case when notes ~* '26-100101-438|friendly ferments|panbendito_bakehouse' then notes
                        else concat_ws(' ', regexp_replace(notes, '([^.!?])\s*$', '\1.'), v_pb_notes) end
     where id = v_sup;
  end if;

  -- By Eric.
  v_sup := null;
  select s.id into v_sup
    from public.suppliers s
   where s.business_id = 1
     and (s.name ~* '^\s*by\s*eric\M' or s.name ~* '\meric''?s\s+bak' or s.email ~* '@by-eric\.es$'
          or s.website ~* '^https?://(www\.)?by-eric\.es')
   order by s.active desc, s.created_at
   limit 1;
  if v_sup is null then
    insert into public.suppliers (business_id, name, kind, supplies, phone, whatsapp, email, website, address, cutoff, active, notes)
    values (1, v_eric_name, 'Bakery', array['food', 'bakery'], v_eric_phone, true, v_eric_email, v_eric_website, v_eric_address,
            '15:00', false, 'Croissants daily, pastries every 2 days. ' || v_eric_notes);
  else
    update public.suppliers
       set kind = coalesce(kind, 'Bakery'),
           supplies = case when 'bakery' = any(supplies) then supplies
                           when supplies = '{}' then array['food', 'bakery']
                           else supplies || array['bakery'] end,
           phone = coalesce(phone, v_eric_phone),
           whatsapp = whatsapp or regexp_replace(coalesce(phone, v_eric_phone), '\D', '', 'g') = '34683169437',
           email = coalesce(email, v_eric_email),
           website = coalesce(website, v_eric_website),
           address = coalesce(address, v_eric_address),
           cutoff = coalesce(cutoff, '15:00'),
           notes = case when notes ~* '30% off retail|el pan de eric|byericmarbella' then notes
                        else concat_ws(' ', regexp_replace(notes, '([^.!?])\s*$', '\1.'), v_eric_notes) end
     where id = v_sup;
  end if;

  perform set_config('app.business_id', '', true);
end $$;
