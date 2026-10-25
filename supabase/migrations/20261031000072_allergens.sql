-- Allergens: the EU's 14 (Regulation 1169/2011) on each stock item: what it contains (null: nobody
-- has said yet, which isn't the same as none) and may contain (traces). A menu item has what its
-- items have (Menu costing's recipes); menu_allergens() gives the whole team the dishes and their
-- items' allergens without the costs, so anyone serving can answer a customer.
-- Who: admins set an item's allergens (as its other details); the team and finance partners read.

alter table public.stock_items
  add column allergens   text[] check (allergens <@ array['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'nuts', 'celery',
                                                         'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs']),
  add column may_contain text[] not null default '{}' check (may_contain <@ array['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk',
                                                         'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs']);

-- Each once, in order; a trace of something it already contains isn't a trace.
create or replace function public.stock_allergen_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.allergens is not null then new.allergens := array(select distinct x from unnest(new.allergens) x order by 1); end if;
  new.may_contain := array(select distinct x from unnest(new.may_contain) x where new.allergens is null or x <> all (new.allergens) order by 1);
  return new;
end $$;
create trigger stock_items_allergens before insert or update of allergens, may_contain on public.stock_items
  for each row execute function public.stock_allergen_rules();

-- The menu's allergens for the team: active dishes with their variants and what goes in them
-- (items only, no quantities or costs), and those items' allergens. Null for anyone else.
create or replace function public.menu_allergens() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when public.is_staff() or public.partner_can('finances') then jsonb_build_object(
    'dishes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', r.name, 'category', r.category,
               'variants', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price_change', 0) order by v.sort, v.name)
                                       from public.recipe_variants v where v.recipe_id = r.id), '[]'::jsonb),
               'lines', coalesce((select jsonb_agg(jsonb_build_object('item_id', l.item_id, 'quantity', 1, 'unit', l.unit, 'variant_id', l.variant_id,
                                                                      'replaces_item_id', l.replaces_item_id) order by l.sort)
                                    from public.recipe_lines l where l.recipe_id = r.id), '[]'::jsonb))
             order by r.category nulls last, r.name)
        from public.recipes r where r.active), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'allergens', to_jsonb(i.allergens), 'may_contain', to_jsonb(i.may_contain)) order by i.name)
        from public.stock_items i
       where exists (select 1 from public.recipe_lines l join public.recipes r on r.id = l.recipe_id and r.active where l.item_id = i.id)), '[]'::jsonb))
  end
$$;
revoke execute on function public.menu_allergens() from public, anon;
grant execute on function public.menu_allergens() to authenticated;
