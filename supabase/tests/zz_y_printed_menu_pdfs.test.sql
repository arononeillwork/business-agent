-- Printed menus in more than one language, and as PDFs (the `printed_menu_pdfs` migration): Easy Beans
-- (business 1) has its five printed menus, each with its language, type, PDF and the picture of its
-- page in use; a design's language, type and PDF take only what they should.
-- People from the tests before it: maria (admin), julio (employee).

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

-- 1. The admin sees the five PDFs, in order, each showing the picture of its page.
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select array_agg(name || ':' || language || ':' || kind order by created_at) from public.menu_designs where pdf_url is not null)
       = array['Drinks:en:drinks', 'Bebidas:es:drinks', 'Comida:es:food', 'The Fridge:en:fridge', 'La Nevera:es:fridge'],
         'the five printed menus, with their language and type';
  assert not exists (select 1 from public.menu_designs d
                      where d.pdf_url is not null
                        and (d.format <> 'physical' or d.mode <> 'full' or d.size <> 'a4_portrait'
                             or not exists (select 1 from public.menu_images i where i.id = d.image_id and i.design_id = d.id and i.status = 'ready'
                                              and i.url = replace(d.pdf_url, '.pdf', '.jpg')))),
         'each an A4 page that is its picture, from the same place as its PDF';
end $$;

-- 2. Any design can say its language and type; only English or Spanish, and the four types; a PDF only at an https address.
do $$
declare v uuid;
begin
  insert into public.menu_designs (name, format, size, language, kind) values ('PDF test card', 'physical', 'a5_portrait', 'es', 'other') returning id into v;
  update public.menu_designs set language = null, kind = 'food' where id = v;
  assert (select language is null and kind = 'food' from public.menu_designs where id = v), 'changed, and back to any language';
end $$;
select pg_temp.expect_error($q$update public.menu_designs set language = 'fr' where name = 'PDF test card'$q$, 'check constraint');
select pg_temp.expect_error($q$update public.menu_designs set kind = 'wine' where name = 'PDF test card'$q$, 'check constraint');
select pg_temp.expect_error($q$update public.menu_designs set pdf_url = 'http://example.com/menu.pdf' where name = 'PDF test card'$q$, 'check constraint');

-- 3. The team doesn't see the designs (admins make them), PDFs or not.
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.menu_designs) = 0, 'an employee sees no designs';
end $$;

-- Tidy up.
reset role; select set_config('request.jwt.claim.sub', '', false);
delete from public.menu_designs where name = 'PDF test card';
