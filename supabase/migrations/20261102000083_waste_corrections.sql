-- Waste log: an entry can be changed or taken off by whoever logged it, or by an admin. The stock
-- history still isn't rewritten (the stock migration: a mistake is put right with another movement):
-- the entry is marked undone and a correction puts its stock back; a change is the undone entry plus
-- a new one, kept on the day and with the person of the first. The Waste page leaves undone ones out.
alter table public.stock_movements
  add column undone_at timestamptz,
  add column undone_by uuid references auth.users on delete set null;
create index if not exists stock_movements_undone_by_idx on public.stock_movements (undone_by);

/** Take a waste entry off the log: it's marked undone and its stock comes back. */
create or replace function public.undo_waste(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare m public.stock_movements;
begin
  if not public.is_staff() then raise exception 'Only the team changes the waste log' using errcode = '42501'; end if;
  select * into m from public.stock_movements where id = p_id for update;
  if not found or m.reason <> 'waste' then raise exception 'That isn’t on the waste log' using errcode = 'P0002'; end if;
  if m."by" is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Only an admin or whoever logged it can change it' using errcode = '42501';
  end if;
  if m.undone_at is not null then raise exception 'That’s already off the waste log' using errcode = '22023'; end if;
  update public.stock_movements set undone_at = now(), undone_by = auth.uid() where id = p_id;
  -- Goes through stock_move like any other, so the item's figure follows.
  insert into public.stock_movements (item_id, reason, change, note)
    values (m.item_id, 'correction', -m.change, coalesce(nullif(btrim(p_note), ''), 'Taken off the waste log'));
end $$;
revoke execute on function public.undo_waste(uuid, text) from public, anon;
grant execute on function public.undo_waste(uuid, text) to authenticated;

/** Change a waste entry (what, how many, why, the note): the old one is undone and the new one takes its place. */
create or replace function public.edit_waste(p_id uuid, p_item_id uuid, p_quantity numeric, p_reason text, p_note text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare m public.stock_movements; v_id uuid;
begin
  if not (p_quantity > 0) then raise exception 'Enter how many' using errcode = '22023'; end if;
  select * into m from public.stock_movements where id = p_id;
  perform public.undo_waste(p_id, 'Waste log entry changed');
  insert into public.stock_movements (item_id, reason, change, waste_reason, note)
    values (p_item_id, 'waste', -p_quantity, p_reason, p_note) returning id into v_id;
  -- Still on the day it was logged, by whoever logged it.
  update public.stock_movements set at = m.at, "by" = m."by" where id = v_id;
  return v_id;
end $$;
revoke execute on function public.edit_waste(uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.edit_waste(uuid, uuid, numeric, text, text) to authenticated;
