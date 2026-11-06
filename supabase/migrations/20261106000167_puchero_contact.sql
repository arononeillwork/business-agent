-- Easy Beans (business 1): Puchero's contact details, from its website now that it's back (6 November
-- 2026; the `coffee_suppliers` migration added Puchero while the site was down):
--   * phone and WhatsApp +34 644 044 028, email info@puchero.co (somospuchero.com/contacto/);
--   * the roastery and company address, TOSTARIX S.L., Ctra. N-601, km 155, 47238 Hornillos de
--     Eresma, Valladolid (somospuchero.com/politica-de-privacidad/);
--   * its page for cafés and shops, where a trade account is opened (somospuchero.com/profesionales/).
-- And Brasil Fazenda Boa Vista's tasting notes, as on its page on Puchero's shop.
-- Each is filled only while still empty, so nothing the café has typed by then is changed; the address
-- replaces only the town the `coffee_suppliers` migration put there. Easy Beans is business 1 when it's
-- named so or Aron is on its team; anywhere else nothing changes, and running it again changes nothing.
do $$
begin
  if not exists (select 1 from public.business b
                  where b.id = 1
                    and (b.name ~* 'easy\s*beans'
                         or exists (select 1 from public.profiles p where p.business_id = 1 and p.full_name ~* '^\s*aron\M'))) then
    return;
  end if;
  -- Named, so the rules and the audit see Easy Beans (a migration runs signed out).
  perform set_config('app.business_id', '1', true);

  update public.suppliers
     set phone = coalesce(phone, '+34 644 044 028'),
         -- WhatsApp only with Puchero's own number: one the café typed may not take messages.
         whatsapp = case when phone is null then true else whatsapp end,
         email = coalesce(email, 'info@puchero.co'),
         order_url = coalesce(order_url, 'https://somospuchero.com/profesionales/'),
         address = case when address is null or address = 'Hornillos de Eresma, Valladolid'
                        then 'Ctra. N-601, km 155, 47238 Hornillos de Eresma, Valladolid' else address end,
         legal_name = coalesce(legal_name, 'Tostarix S.L.')
   where business_id = 1 and (name ~* '\mpuchero\M' or name ~* '\mtostarix\M');

  update public.coffees
     set tasting_notes = 'Chocolate dulce, cacao nibs, almendras. Acidez media, cuerpo sedoso y final dulce.'
   where business_id = 1 and name ~* 'boa\s*vista' and tasting_notes is null;

  perform set_config('app.business_id', '', true);
end $$;
