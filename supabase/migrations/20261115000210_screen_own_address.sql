-- A screen's own address: a page on the business's own website that shows the screen, such as
-- easybeanscoffee.com/display-menu, the address Easy Beans' TV opens. The Screens page shows it with
-- the screen's links, and the code to put on that page: the page shows the screen's own link inside
-- it, so what's picked on the Screens page reaches it within a minute, as it does at the screen's links.
-- Null: none. The public feed carries it too (it's the business's own public page).

alter table public.screens
  add column own_url text check (own_url ~* '^https://[^\s/]+\.\S+$' and char_length(own_url) <= 2000);
