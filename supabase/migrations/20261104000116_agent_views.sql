-- Agents: ways for an owner to see the app (the Agents button at the top right: the Finance agent, the
-- Marketing agent, the Investor…), each showing the pages that part of the business needs. The usual
-- agents are in the app (shared/agents.ts); this keeps the owners' changes to them for the business
-- (Roles & responsibilities → Agents): which are on, their names, what they're for, their pages, and
-- agents of their own. Null: the usual agents as they are. Which agent each owner is viewing as is
-- their own, in their preferences (agentView).
--
-- The team reads it with the rest of the settings; only an owner (an admin with pay access) changes
-- it, and the server's own code (no signed-in user) may too, as for the other guarded columns.

alter table public.settings add column agent_views jsonb
  check (agent_views is null or (jsonb_typeof(agent_views) = 'array' and jsonb_array_length(agent_views) <= 50
    and octet_length(agent_views::text) <= 40000));

create or replace function public.guard_agent_views() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.agent_views is distinct from old.agent_views and auth.uid() is not null and not public.can_see_pay() then
    raise exception 'Only an owner changes the agents';
  end if;
  return new;
end $$;
revoke execute on function public.guard_agent_views() from public, anon, authenticated;
create trigger settings_agent_views before update of agent_views on public.settings
  for each row execute function public.guard_agent_views();
