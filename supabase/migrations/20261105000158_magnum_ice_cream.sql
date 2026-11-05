-- Easy Beans (business 1): The Magnum Ice Cream Company (Frigo, Carte D'Or Professional, Ben & Jerry's,
-- Calippo), from the business card of Oscar Gutiérrez Sánchez, their Sales Developer - IC, who answers on
-- WhatsApp at his mobile. Added on Suppliers, with Oscar as the contact, and on Contacts (the
-- `business_contacts` migration), so he's found by his name as well as by the company. When the café
-- has added either already, its empty details are filled in (WhatsApp ticked when it's his number, and
-- the supplier made active again if it was archived) and nothing else changes. Easy Beans is business 1
-- when it's named so or Aron is on its team (as in the `coffee_suppliers` migration); anywhere else
-- nothing changes, and running it again changes nothing.
do $$
declare
  v_name    constant text := 'Magnum Ice Cream Company';
  v_person  constant text := 'Oscar Gutiérrez Sánchez';
  v_phone   constant text := '+34 629 710 587';
  v_email   constant text := 'oscar.gutierrez-sanchez@magnumicecream.com';
  v_website constant text := 'https://corporate.magnumicecream.com';
  v_brands  constant text := 'Ice cream: Frigo, Carte D''Or Professional, Ben & Jerry''s and Calippo.';
  v_sup uuid;
  v_contact uuid;
begin
  if not exists (select 1 from public.business b
                  where b.id = 1
                    and (b.name ~* 'easy\s*beans'
                         or exists (select 1 from public.profiles p where p.business_id = 1 and p.full_name ~* '^\s*aron\M'))) then
    return;
  end if;
  -- Named, so the rules and the audit see Easy Beans (a migration runs signed out).
  perform set_config('app.business_id', '1', true);

  -- Suppliers: the company, with Oscar as who to call; active (bought from now), not only in the catalogue.
  select s.id into v_sup
    from public.suppliers s
   where s.business_id = 1 and (s.name ~* '\mmagnum\M' or s.name ~* '\mfrigo\M' or s.email ~* '@magnumicecream\.com$')
   order by s.active desc, s.created_at
   limit 1;
  if v_sup is null then
    insert into public.suppliers (business_id, name, kind, supplies, contact_name, phone, whatsapp, email, website, active, notes)
    values (1, v_name, 'Ice cream', array['food'], v_person, v_phone, true, v_email, v_website, true,
            v_brands || ' ' || v_person || ' is their Sales Developer - IC.');
  else
    update public.suppliers
       set kind = coalesce(kind, 'Ice cream'),
           contact_name = coalesce(contact_name, v_person),
           phone = coalesce(phone, v_phone),
           whatsapp = whatsapp or regexp_replace(coalesce(phone, v_phone), '\D', '', 'g') = '34629710587',
           email = coalesce(email, v_email),
           website = coalesce(website, v_website),
           active = true,
           notes = coalesce(notes, v_brands || ' ' || v_person || ' is their Sales Developer - IC.')
     where id = v_sup;
  end if;

  -- Contacts: Oscar himself.
  select c.id into v_contact
    from public.business_contacts c
   where c.business_id = 1
     and (c.email ~* '^oscar\.gutierrez-sanchez@magnumicecream\.com$'
          or regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = '34629710587'
          or (c.name ~* '^\s*(ó|o)scar\M' and coalesce(c.company, '') ~* 'magnum|frigo'))
   order by c.created_at
   limit 1;
  if v_contact is null then
    insert into public.business_contacts (business_id, name, job, company, phone, whatsapp, email, website, notes)
    values (1, v_person, 'Sales Developer - IC', v_name, v_phone, true, v_email, v_website, v_brands || ' Also on Suppliers.');
  else
    update public.business_contacts
       set job = coalesce(job, 'Sales Developer - IC'),
           company = coalesce(company, v_name),
           phone = coalesce(phone, v_phone),
           whatsapp = whatsapp or regexp_replace(coalesce(phone, v_phone), '\D', '', 'g') = '34629710587',
           email = coalesce(email, v_email),
           website = coalesce(website, v_website)
     where id = v_contact;
  end if;

  perform set_config('app.business_id', '', true);
end $$;
