-- Daily checklists: what the team does to open the shop at the start of the day and to close it at the
-- end, each thing in English and Spanish (each person reads it in the language they use the app in),
-- some with steps under it (one level: an item with steps is done when they all are). Everyone on the
-- team ticks things off for the day, and the next day starts clear.
-- Who: the team reads them and ticks things off; whoever ticked something, or an admin, unticks it;
-- admins change the lists. Partners and the café tablet see none.

create table public.checklist_items (
  id          uuid primary key default gen_random_uuid(),
  list        text not null check (list in ('opening', 'closing')),
  -- The item it's a step of, in the same list; steps have no steps of their own.
  parent_id   uuid references public.checklist_items on delete cascade,
  text_en     text check (char_length(text_en) between 1 and 300),
  text_es     text check (char_length(text_es) between 1 and 300),
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid(),
  constraint checklist_items_words check (text_en is not null or text_es is not null)
);
select public.add_business_scope('public.checklist_items');
create index checklist_items_parent_id_idx on public.checklist_items (parent_id);
create index checklist_items_updated_by_idx on public.checklist_items (updated_by);

-- Tidy what's typed (a blank language is none); a step's item is in the same business and list, and
-- isn't a step itself. With the caller's rights, filtered by the row's business for the Worker.
create or replace function public.checklist_item_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.text_en := nullif(btrim(new.text_en), '');
  new.text_es := nullif(btrim(new.text_es), '');
  if new.text_en is null and new.text_es is null then
    raise exception 'Write what to do, in English or Spanish' using errcode = '22023';
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id or not exists (select 1 from public.checklist_items p
         where p.id = new.parent_id and p.business_id = new.business_id and p.list = new.list and p.parent_id is null) then
      raise exception 'A step goes under an item of the same checklist' using errcode = '22023';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.checklist_items s where s.parent_id = new.id) then
      raise exception 'An item with steps can''t be a step itself' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    -- Its steps would be left on the other one.
    if new.list <> old.list and exists (select 1 from public.checklist_items s where s.parent_id = new.id) then
      raise exception 'An item with steps stays on its checklist' using errcode = '22023';
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger checklist_items_rules before insert or update on public.checklist_items for each row execute function public.checklist_item_rules();
create trigger audit_checklist_items after insert or update or delete on public.checklist_items for each row execute function public.audit_row();

alter table public.checklist_items enable row level security;
revoke all on public.checklist_items from anon;
create policy checklist_items_read on public.checklist_items for select to authenticated using ((select public.is_staff()));
create policy checklist_items_admin on public.checklist_items for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Ticked off for a day: anyone on the team ticks a thing (an item without steps, or a step) for today
-- (a day either side, for the time zones); whoever ticked it, or an admin, unticks it.
create table public.checklist_ticks (
  item_id  uuid not null references public.checklist_items on delete cascade,
  day      date not null,
  done_by  uuid references public.profiles on delete set null default auth.uid(),
  done_at  timestamptz not null default now()
);
select public.add_business_scope('public.checklist_ticks');
alter table public.checklist_ticks add primary key (business_id, item_id, day);
create index checklist_ticks_item_id_idx on public.checklist_ticks (item_id);
create index checklist_ticks_done_by_idx on public.checklist_ticks (done_by);

create or replace function public.checklist_tick_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.checklist_items i where i.id = new.item_id and i.business_id = new.business_id) then
    raise exception 'That isn''t on the checklist' using errcode = '22023';
  end if;
  if exists (select 1 from public.checklist_items s where s.parent_id = new.item_id) then
    raise exception 'Tick off its steps' using errcode = '22023';
  end if;
  if new.day not between current_date - 1 and current_date + 1 then
    raise exception 'Only today''s checklist can be ticked off' using errcode = '22023';
  end if;
  -- Ticked by whoever is signed in, now (the Worker and the SQL editor keep what they give).
  if auth.uid() is not null then new.done_by := auth.uid(); end if;
  new.done_at := now();
  return new;
end $$;
create trigger checklist_ticks_rules before insert or update on public.checklist_ticks for each row execute function public.checklist_tick_rules();

alter table public.checklist_ticks enable row level security;
revoke all on public.checklist_ticks from anon;
create policy checklist_ticks_read on public.checklist_ticks for select to authenticated using ((select public.is_staff()));
create policy checklist_ticks_tick on public.checklist_ticks for insert to authenticated with check ((select public.is_staff()));
create policy checklist_ticks_untick on public.checklist_ticks for delete to authenticated
  using ((select public.is_staff()) and (done_by = (select auth.uid()) or (select public.is_admin())));

-- ---------------------------------------------------------------------------
-- Easy Beans (business 1): the owners' own checklists, in English and Spanish
-- ---------------------------------------------------------------------------
-- From their "Employee Checklist" (shared/checklists.ts has the same; its test checks the two agree).
-- Only when Easy Beans has no checklist yet, and without business 1 nothing at all.
do $$
declare
  v_lists constant jsonb := $json$
{
  "opening": [
    {"en": "Open the 2 shutters", "es": "Abrir las 2 persianas"},
    {"en": "Turn off the alarm", "es": "Apagar la alarma"},
    {"en": "Take out and lay out the tables outside", "es": "Sacar y colocar las mesas afuera", "steps": [
      {"en": "Make sure the fabric above is tight, but not too tight, as they are not the best", "es": "Asegurarse de que la tela de arriba esté bien tensa, pero no demasiado, ya que no es la mejor"},
      {"en": "Flower pots and menus on the tables, facing up in Spanish", "es": "Colocar las macetas y los menús en las mesas, en español y hacia arriba"},
      {"en": "Put one ashtray out the front of the café", "es": "Colocar un cenicero delante de la cafetería"}
    ]},
    {"en": "Turn on:", "es": "Encender:", "steps": [
      {"en": "Coffee machine", "es": "Cafetera"},
      {"en": "Ice machine", "es": "Máquina de hielo"},
      {"en": "Lights under the counter", "es": "Luces debajo del mostrador"},
      {"en": "Till system", "es": "Sistema de caja"}
    ]},
    {"en": "Set up the awnings outside (front and back)", "es": "Instalar los toldos exteriores (delantero y trasero)"},
    {"en": "Clock in on the app", "es": "Fichar la entrada en la app"},
    {"en": "Turn on the lights for:", "es": "Encender las luces de:", "steps": [
      {"en": "The front 2 fridges", "es": "Los 2 refrigeradores delanteros"},
      {"en": "The back 2 fridges", "es": "Los 2 refrigeradores traseros"},
      {"en": "The outside lights (logo light), from the fuse board (box of electrics)", "es": "Las luces exteriores (luz del logo), desde el cuadro eléctrico"},
      {"en": "The sign in front of the coffee machine", "es": "El letrero frente a la cafetera"},
      {"en": "Under the counter", "es": "Debajo del mostrador"}
    ]},
    {"en": "Check the stock of bakery items, and bake more if needed", "es": "Revisar el inventario de productos de panadería y hornear más si es necesario", "steps": [
      {"en": "Turn the oven on to 175 degrees for 5 minutes", "es": "Precalentar el horno a 175 grados durante 5 minutos"},
      {"en": "Prep the pastries", "es": "Preparar los pasteles"},
      {"en": "Place the pastries on a tray (put the tray upside down)", "es": "Colocar los pasteles en una bandeja (con la bandeja boca abajo)"},
      {"en": "Start a timer for 18 minutes (check at 17 minutes)", "es": "Poner el temporizador 18 minutos (revisar a los 17 minutos)"},
      {"en": "Leave to rest for 5 minutes on the trays", "es": "Dejar reposar 5 minutos en las bandejas"}
    ]},
    {"en": "Stock the fridges with pastries", "es": "Reponer los refrigeradores con pasteles", "steps": [
      {"en": "Make sure the sign words and prices are correct", "es": "Asegurarse de que los letreros y los precios sean correctos"}
    ]},
    {"en": "Stock check the fridges: soda and milk", "es": "Revisar el inventario de los refrigeradores: refrescos y leche", "steps": [
      {"en": "Place an order if needed", "es": "Hacer un pedido si es necesario"}
    ]},
    {"en": "Put music on", "es": "Poner música"},
    {"en": "Stock check and update the system", "es": "Revisar el inventario y actualizar el sistema"},
    {"en": "Water the plants", "es": "Regar las plantas"},
    {"en": "Put the chalkboard sign out", "es": "Colocar el cartel de pizarra", "steps": [
      {"en": "Update the message if needed", "es": "Actualizar el mensaje si es necesario"},
      {"en": "The sign always has to have a Spanish and an English message", "es": "El cartel siempre debe tener un mensaje en español y en inglés"}
    ]},
    {"en": "Check the toilets are clean, and clean them if needed", "es": "Revisar que los baños estén limpios y limpiarlos si es necesario"},
    {"en": "Check and clean the display fridges", "es": "Revisar y limpiar los refrigeradores de exhibición"},
    {"en": "Fill up the dog bowl and put it outside, on the corner", "es": "Llenar el bebedero del perro y colocarlo afuera, en la esquina"},
    {"en": "Cockroach sweep: kill and remove", "es": "Revisar si hay cucarachas y eliminarlas"},
    {"en": "Brush the front of the shop, in front of the shutter", "es": "Barrer la entrada de la tienda, delante de la persiana"},
    {"en": "Clean and wipe each table", "es": "Limpiar cada mesa"}
  ],
  "closing": [
    {"en": "Make sure all the dishes are cleaned", "es": "Asegurarse de que todos los platos estén limpios"},
    {"en": "Restock the fridge drinks so that they are full", "es": "Reponer las bebidas del refrigerador hasta que esté lleno", "steps": [
      {"en": "Check the stock levels and tell Mark what is needed", "es": "Revisar las existencias y decirle a Mark lo que se necesita"}
    ]},
    {"en": "Turn off the outside lights for the logo (at the back of the shop)", "es": "Apagar las luces exteriores del logo (en la parte trasera de la tienda)"},
    {"en": "Turn off the front display fridge light for the bakery items", "es": "Apagar la luz del refrigerador de exhibición delantero de los productos de panadería"},
    {"en": "Move the plant and everything else inside", "es": "Meter la planta y todo lo demás dentro"},
    {"en": "Turn off:", "es": "Apagar:", "steps": [
      {"en": "Coffee machine", "es": "Cafetera"},
      {"en": "Grinder", "es": "Molinillo"},
      {"en": "Lights under the counter", "es": "Luces debajo del mostrador"},
      {"en": "Coffee station light", "es": "Luz de la estación de café"},
      {"en": "All fans and the AC", "es": "Todos los ventiladores y el aire acondicionado"},
      {"en": "The black extension lead under the smoothie machine desk", "es": "El cable alargador negro debajo del mostrador de la máquina de batidos"},
      {"en": "TV and music", "es": "TV y música"}
    ]},
    {"en": "Remove the bakery items from the front display unit", "es": "Retirar los productos de panadería del expositor delantero"},
    {"en": "Pull down both shutters", "es": "Bajar las dos persianas"},
    {"en": "Clock out on the app", "es": "Fichar la salida en la app"},
    {"en": "Turn on the alarm", "es": "Activar la alarma"}
  ]
}
$json$;
  v_list text;
  v_item record;
  v_step record;
  v_id uuid;
begin
  if not exists (select 1 from public.business where id = 1) then return; end if;
  if exists (select 1 from public.checklist_items where business_id = 1) then return; end if;
  foreach v_list in array array['opening', 'closing'] loop
    for v_item in select value as x, ordinality as n from jsonb_array_elements(v_lists -> v_list) with ordinality loop
      insert into public.checklist_items (business_id, list, text_en, text_es, sort)
      values (1, v_list, v_item.x ->> 'en', v_item.x ->> 'es', v_item.n)
      returning id into v_id;
      for v_step in select value as x, ordinality as n from jsonb_array_elements(coalesce(v_item.x -> 'steps', '[]')) with ordinality loop
        insert into public.checklist_items (business_id, list, parent_id, text_en, text_es, sort)
        values (1, v_list, v_id, v_step.x ->> 'en', v_step.x ->> 'es', v_step.n);
      end loop;
    end loop;
  end loop;
end $$;
