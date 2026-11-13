-- The business's details on its own website: the website reads its address, phone, WhatsApp,
-- email, social accounts and opening hours (with the closures on the Calendar) from the app (GET
-- /api/site/<business>/details, worker/site.ts, shared/websiteDetails.ts), so they're changed in one
-- place, the Business and Opening hours pages, and the website, Google Maps and the app all say the
-- same. Each business turns it on for itself (Website & SEO → Your details on your website); off,
-- the address answers "not found", as for a number that's no business. Admins change it (settings_write).
alter table public.settings
  add column website_details boolean not null default false;

-- Two more ways to reach a business, on the Business page: the number people message on WhatsApp
-- (as phones are kept: "+34 600 000 000") and its TikTok (without the @).
alter table public.business
  add column whatsapp text check (whatsapp ~ '^\+[0-9][0-9 ]{4,24}$'),
  add column tiktok text check (tiktok ~ '^[a-z0-9._]{1,30}$');

-- Easy Beans' website (easybeanscoffee.com) reads its details from here. What it showed until now
-- fills in what the app doesn't have yet, so nothing goes missing from it; the owner changes them on
-- the Business page from then on.
update public.settings set website_details = true
 where business_id = 1 and exists (select 1 from public.business where id = 1 and name ilike 'easy beans%');
update public.business set
  whatsapp = coalesce(whatsapp, '+34 695 415 335'),
  tiktok = coalesce(tiktok, 'easybeanscoffee'),
  email = coalesce(email, 'easybeanscafe@gmail.com'),
  instagram = coalesce(instagram, '@easy.beans.coffee'),
  address = coalesce(address, 'Calle Pizarro 8, 29670 San Pedro de Alcántara, Málaga')
 where id = 1 and name ilike 'easy beans%';
