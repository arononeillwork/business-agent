-- Easy Beans' start-of-day checklist, as the owners changed it: the tables go out without their three
-- steps; no ice machine to turn on, nor the light under the counter (the "Turn on" list has the counter's
-- lights already); clocking in comes straight after the alarm; the fridges are stocked with milk and
-- drinks; and watering the plants and checking the toilets come off.
-- Only business 1, and only what the `day_checklists` migration put in, found by its English words: anything
-- added or reworded in the app since stays as it is. The ticks of what comes off go with it.

do $$
declare v_alarm int;
begin
  if not exists (select 1 from public.business where id = 1) then return; end if;

  -- Steps that come off.
  delete from public.checklist_items s
   using public.checklist_items p
   where s.parent_id = p.id and s.business_id = 1 and p.business_id = 1 and p.list = 'opening'
     and ((p.text_en = 'Take out and lay out the tables outside'
           and s.text_en in ('Make sure the fabric above is tight, but not too tight, as they are not the best',
                             'Flower pots and menus on the tables, facing up in Spanish',
                             'Put one ashtray out the front of the café'))
       or (p.text_en = 'Turn on:' and s.text_en = 'Ice machine')
       or (p.text_en = 'Turn on the lights for:' and s.text_en = 'Under the counter'));

  -- Things that come off.
  delete from public.checklist_items
   where business_id = 1 and list = 'opening' and parent_id is null
     and text_en in ('Water the plants', 'Check the toilets are clean, and clean them if needed');

  -- The fridges: milk and drinks.
  update public.checklist_items
     set text_en = 'Stock the fridges with milk and drinks', text_es = 'Reponer los refrigeradores con leche y bebidas'
   where business_id = 1 and list = 'opening' and parent_id is null and text_en = 'Stock check the fridges: soda and milk';

  -- Clocking in, straight after the alarm (what was after the alarm moves down one).
  select sort into v_alarm from public.checklist_items
   where business_id = 1 and list = 'opening' and parent_id is null and text_en = 'Turn off the alarm'
   order by sort limit 1;
  if v_alarm is not null and exists (select 1 from public.checklist_items
       where business_id = 1 and list = 'opening' and parent_id is null and text_en = 'Clock in on the app') then
    update public.checklist_items set sort = sort + 1
     where business_id = 1 and list = 'opening' and parent_id is null and sort > v_alarm and text_en <> 'Clock in on the app';
    update public.checklist_items set sort = v_alarm + 1
     where business_id = 1 and list = 'opening' and parent_id is null and text_en = 'Clock in on the app';
  end if;
end $$;
