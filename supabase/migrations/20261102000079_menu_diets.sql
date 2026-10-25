-- Vegan and vegetarian on the Allergens page, which the EU's 14 can't tell: each stock item says
-- whether it's vegan (nothing from animals), vegetarian (milk, eggs or honey; no meat or fish) or
-- neither (null: nobody has said yet). A menu item is vegan when every item in it is, vegetarian when
-- every item is at least that. What an item contains has to fit: milk or eggs aren't vegan, fish or
-- shellfish aren't vegetarian. menu_allergens() now gives the team each item's diet as well.
-- Who: admins set it, as the item's allergens; the team and finance partners read.

alter table public.stock_items
  add column diet text check (diet in ('vegan', 'vegetarian', 'neither')),
  add constraint stock_items_diet_fits check (
    diet is null or allergens is null
    or (diet <> 'vegan' or not allergens && array['milk', 'eggs', 'fish', 'crustaceans', 'molluscs'])
       and (diet <> 'vegetarian' or not allergens && array['fish', 'crustaceans', 'molluscs']));

-- As in the allergens migration, with each item's diet.
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
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'allergens', to_jsonb(i.allergens), 'may_contain', to_jsonb(i.may_contain),
                                          'diet', i.diet) order by i.name)
        from public.stock_items i
       where exists (select 1 from public.recipe_lines l join public.recipes r on r.id = l.recipe_id and r.active where l.item_id = i.id)), '[]'::jsonb))
  end
$$;
