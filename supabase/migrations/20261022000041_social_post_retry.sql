-- A post that didn't go out anywhere can be fixed and posted again (Social planner → edit).
-- Each network's job had one dedupe key per post ('social:<post>:<network>'), so posting it again
-- queued nothing and the post sat on "Posting…". Now the first job keeps that key and each later
-- attempt adds its number (':2', ':3', …). Posting still happens once per time: only a 'scheduled'
-- post becomes 'publishing'.
create or replace function public._publish_social_post(p_id uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare v public.social_posts; v_ev public.calendar_events; t text; n int := 0; v_key text; v_earlier int;
begin
  update public.social_posts set status = 'publishing',
         results = (select coalesce(jsonb_object_agg(x, jsonb_build_object('status', 'queued')), '{}'::jsonb) from unnest(targets) x)
   where id = p_id and status = 'scheduled'
  returning * into v;
  if v.id is null then return 0; end if;
  if v.event_id is not null then select * into v_ev from public.calendar_events where id = v.event_id; end if;
  foreach t in array v.targets loop
    v_key := 'social:' || v.id || ':' || t;
    select count(*) into v_earlier from public.outbox where dedupe_key = v_key or dedupe_key like v_key || ':%';
    perform public._enqueue(t || '_post',
      jsonb_build_object('post_id', v.id, 'target', t, 'caption', v.caption, 'image_url', v.image_url, 'kind', v.kind, 'media', v.media)
      || case when t = 'google' and v_ev.id is not null
           then jsonb_build_object('title', v_ev.title, 'starts_on', v_ev.starts_on, 'ends_on', coalesce(v_ev.ends_on, v_ev.starts_on))
           else '{}'::jsonb end,
      v_key || case when v_earlier > 0 then ':' || (v_earlier + 1) else '' end);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public._publish_social_post(uuid) from public, anon, authenticated;
