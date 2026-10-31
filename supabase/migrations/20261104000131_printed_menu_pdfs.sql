-- Printed menus in more than one language, and as the PDFs they were designed as. A menu design says
-- the language it's in (English or Spanish; none: its words are the menu's own) and what it's a menu
-- of (drinks, food, the fridge or other), so Menu design → Physical can be narrowed to one language
-- and one type; and it can be a PDF made elsewhere, opened to print as it is.
--
-- Easy Beans (business 1) gets its five printed menus as PDFs: Drinks and Bebidas, Comida, The Fridge
-- and La Nevera. Each is shown by a picture of its page (the design's image, the whole menu) and
-- prints from its PDF; both are served with the app (public/menus/easy-beans). And its three menus
-- written from the menu (the `menu` migration's template: Drinks, Food and The fridge menu, headed in
-- English) say their type and language too.

alter table public.menu_designs
  add column language text check (language in ('en', 'es')),
  add column kind text check (kind in ('drinks', 'food', 'fridge', 'other')),
  add column pdf_url text check (pdf_url ~* '^https://\S+$' and char_length(pdf_url) <= 2000);

do $$
declare
  m record;
  v_design uuid;
  v_image uuid;
  v_base constant text := 'https://businesssagent.com/menus/easy-beans/';
begin
  if not exists (select 1 from public.business where id = 1) then return; end if;
  perform set_config('app.business_id', '1', true);

  update public.menu_designs d set language = 'en', kind = t.kind
    from (values ('Drinks menu', 'drinks'), ('Food menu', 'food'), ('The fridge menu', 'fridge')) t(name, kind)
   where d.business_id = 1 and d.name = t.name and d.format = 'physical' and d.mode = 'background' and d.kind is null;

  for m in
    select * from (values
      ('Drinks',     'en', 'drinks', 'drinks-en', 1),
      ('Bebidas',    'es', 'drinks', 'drinks-es', 2),
      ('Comida',     'es', 'food',   'food-es',   3),
      ('The Fridge', 'en', 'fridge', 'fridge-en', 4),
      ('La Nevera',  'es', 'fridge', 'fridge-es', 5)) t(name, language, kind, file, n)
     order by n
  loop
    -- Once each: not again if it's there already (by its PDF).
    continue when exists (select 1 from public.menu_designs where business_id = 1 and pdf_url = v_base || m.file || '.pdf');
    insert into public.menu_designs (business_id, name, format, size, mode, style, title, footer, show_descriptions, show_allergens,
                                     language, kind, pdf_url, created_at)
    values (1, m.name, 'physical', 'a4_portrait', 'full', 'boxed', null, null, false, false,
            m.language, m.kind, v_base || m.file || '.pdf', now() - make_interval(secs => 6 - m.n))
    returning id into v_design;
    insert into public.menu_images (business_id, design_id, url, source, status, stored)
    values (1, v_design, v_base || m.file || '.jpg', 'link', 'ready', true)
    returning id into v_image;
    update public.menu_designs set image_id = v_image where id = v_design;
  end loop;

  perform set_config('app.business_id', '', true);
end $$;
