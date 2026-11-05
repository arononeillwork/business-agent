-- The menu on the business's own website: the website reads the menu from the app (GET
-- /api/site/<business>/menu, worker/site.ts), so what's listed and what it costs are changed in one
-- place, the Menu page (or Square, when the menu is read from it), and the website, Google Maps, the
-- screens and the printed menus all say the same.
-- Each business turns it on for itself (Website & SEO → The menu on your website): off, the address
-- answers "not found", the same as for a number that's no business. Admins change it (settings_write).
alter table public.settings
  add column website_menu boolean not null default false;

-- Easy Beans' website (easybeanscoffee.com) reads its menu from here.
update public.settings set website_menu = true where business_id = 1;
