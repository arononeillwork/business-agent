-- Leaderboard (Team section) and each person's own Square login.
--
-- 1. public.team_leaderboard(from, to): everyone's clock-ins for the Leaderboard, added up, so the whole
--    team sees the board without reading each other's timecards (employees only read their own). Per
--    person: clock-ins, those for a rota shift, on time (within 5 minutes of the shift's start, as Late
--    starts on Dashboards) and late, paid minutes on finished timecards, days worked, the order of their
--    on-time and late starts ("oolo…", for streaks; no dates or times) and daily checklist items ticked.
--    shared/leaderboard.ts clockStats() does the same for the demo.
-- 2. square_team_links: a person here and their Square team member, so the Leaderboard knows who sold
--    what (each Square payment says which team member took it). Admins see them; only the Worker writes
--    them (it checks the team member in Square first).

create or replace function public.team_leaderboard(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- The team (owners, shop managers, employees) and the Worker; not partners or the café tablet.
  if not (public.is_staff() or auth.uid() is null) then
    raise exception 'Only the team sees the leaderboard' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 then
    raise exception 'Give a period of up to three months' using errcode = '22023';
  end if;
  return coalesce((
    with entries as (
      select t.profile_id, t.clock_in, t.clock_out, t.paid_minutes, t.work_date, s.starts_at,
             s.starts_at is not null and t.clock_in > s.starts_at + interval '5 minutes' as late
        from public.time_entry_totals t
        left join public.shifts s on s.id = t.shift_id
       where t.work_date between p_from and p_to
    ),
    clock as (
      select profile_id,
             count(*)::int as clock_ins,
             count(*) filter (where starts_at is not null)::int as on_shift,
             count(*) filter (where starts_at is not null and not late)::int as on_time,
             count(*) filter (where late)::int as late,
             coalesce(sum(paid_minutes) filter (where clock_out is not null), 0)::int as minutes,
             count(distinct work_date)::int as days,
             coalesce(string_agg(case when late then 'l' else 'o' end, '' order by clock_in) filter (where starts_at is not null), '') as starts
        from entries group by profile_id
    ),
    ticks as (
      select done_by as profile_id, count(*)::int as ticks
        from public.checklist_ticks
       where day between p_from and p_to and done_by is not null
       group by done_by
    )
    select jsonb_agg(jsonb_build_object(
             'profile_id', p.id, 'clock_ins', coalesce(c.clock_ins, 0), 'on_shift', coalesce(c.on_shift, 0),
             'on_time', coalesce(c.on_time, 0), 'late', coalesce(c.late, 0), 'minutes', coalesce(c.minutes, 0),
             'days', coalesce(c.days, 0), 'starts', coalesce(c.starts, ''), 'ticks', coalesce(k.ticks, 0)) order by p.full_name)
      from public.profiles p
      left join clock c on c.profile_id = p.id
      left join ticks k on k.profile_id = p.id
     where p.active and p.role in ('admin', 'employee') and (c.profile_id is not null or k.profile_id is not null)
  ), '[]'::jsonb);
end $$;
alter function public.team_leaderboard(date, date) owner to app_definer;
revoke execute on function public.team_leaderboard(date, date) from public, anon;
grant execute on function public.team_leaderboard(date, date) to authenticated;

create table public.square_team_links (
  profile_id         uuid not null references public.profiles on delete cascade,
  -- Square's id for the team member ("TMoK_hJBSJlX4Hx3").
  team_member_id     text not null check (team_member_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  -- Added to Square from here (Add to Square), rather than someone already in Square linked.
  created_in_square  boolean not null default false,
  linked_at          timestamptz not null default now(),
  linked_by          uuid references auth.users on delete set null
);
select public.add_business_scope('public.square_team_links');
alter table public.square_team_links add primary key (business_id, profile_id);
alter table public.square_team_links add constraint square_team_links_member_key unique (business_id, team_member_id);
create index square_team_links_profile_id_idx on public.square_team_links (profile_id);
create index square_team_links_linked_by_idx on public.square_team_links (linked_by);
create trigger audit_square_team_links after insert or update or delete on public.square_team_links for each row execute function public.audit_row();

alter table public.square_team_links enable row level security;
revoke all on public.square_team_links from anon;
-- Admins read them (the Team panel); each person reads their own. The Worker writes them.
create policy square_team_links_read on public.square_team_links for select to authenticated
  using ((select public.is_admin()) or profile_id = (select auth.uid()));
revoke insert, update, delete on public.square_team_links from authenticated;
