-- The café tablet's wrong PINs are kept, so its lockout works: five wrong in 10 minutes and that
-- person's PIN isn't tried again until the 10 minutes are up.
--
-- kiosk_punch() wrote each wrong try to kiosk_attempts and then raised 'Wrong PIN'. The app calls it
-- through the API (PostgREST), which runs each call in one transaction and undoes all of it when the
-- function raises: the wrong try was never kept, nothing was ever counted, and a 4-digit PIN could be
-- guessed without limit.
--
-- Now a wrong PIN isn't raised. The try is kept and the function answers with the API's error status
-- (400) and the same body a raised 'Wrong PIN' had, so the app, the one already on the tablets
-- included, shows "Wrong PIN" as before. Everything else is unchanged: what the kiosk does with a right
-- PIN, and the other errors, which keep nothing and are still raised.
create or replace function public.kiosk_punch(p_profile_id uuid, p_pin text, p_action text, p_position_id integer default null, p_break_type_id integer default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_hash    text;
  v_fails   int;
  v_entry   public.time_entries;
  v_break   public.breaks;
begin
  if public.my_role() is distinct from 'kiosk' then
    raise exception 'Kiosk only';
  end if;

  select count(*) into v_fails from public.kiosk_attempts
   where profile_id = p_profile_id and not ok and at > now() - interval '10 minutes';
  if v_fails >= 5 then
    raise exception 'Too many wrong PINs. Try again in 10 minutes or ask an admin.';
  end if;

  select pin_hash into v_hash from public.profiles where id = p_profile_id and active;
  if v_hash is null then
    raise exception 'No PIN set. Ask an admin to set your PIN.';
  end if;
  if v_hash <> extensions.crypt(p_pin, v_hash) then
    -- Kept (a raise would undo it), and answered as the error a raise would have been.
    insert into public.kiosk_attempts (profile_id, ok) values (p_profile_id, false);
    perform set_config('response.status', '400', true);
    return jsonb_build_object('code', 'P0001', 'message', 'Wrong PIN', 'details', null, 'hint', null);
  end if;
  insert into public.kiosk_attempts (profile_id, ok) values (p_profile_id, true);

  case p_action
    when 'in' then
      v_entry := public._clock_in(p_profile_id, 'kiosk', p_position_id, false);
    when 'out' then
      v_entry := public._clock_out(p_profile_id, 'kiosk');
    when 'break_start' then
      v_break := public._start_break(p_profile_id, p_break_type_id);
    when 'break_end' then
      v_break := public._end_break(p_profile_id);
    else
      raise exception 'Unknown action %', p_action;
  end case;

  return jsonb_build_object(
    'action', p_action,
    'at', now(),
    'full_name', (select full_name from public.profiles where id = p_profile_id),
    'entry', to_jsonb(v_entry),
    'break', to_jsonb(v_break),
    'summary', case when p_action = 'out' then
      (select to_jsonb(s) from public.time_entry_totals s where s.id = v_entry.id) end
  );
end;
$$;
alter function public.kiosk_punch(uuid, text, text, integer, integer) owner to app_definer;
