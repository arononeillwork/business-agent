-- Posts about the café, and what each post did for it.
--
-- 1. Collab reels and posts: a customer posts a reel with the café as a collaborator. It shows on the
--    café's own grid, but Instagram doesn't list it with the café's own posts; its collaborative_media
--    list does. They're kept with the tags and story mentions (instagram_mentions, kind 'collab'),
--    with how they did as far as Instagram shares (likes, comments, views), and the poster's followers
--    when Instagram says. An admin can add one by its link when Instagram doesn't list it (added_by).
-- 2. The people who post about the café are put on Sales reps & rewards by themselves, waiting for an
--    owner's OK: found_mention_id is the post that brought them. Each mention is looked at once
--    (rep_checked_at); someone put forward once (put_forward) isn't again, so an owner's no stands.
-- 3. New followers day by day (social_follower_days): Instagram keeps only the last 30 days of them;
--    kept here, Analytics → What each post did can show the followers a post brought for longer.

-- 1. Collabs, their figures, and the ones added by hand ------------------------------------------
alter table public.instagram_mentions drop constraint instagram_mentions_kind_check;
alter table public.instagram_mentions add constraint instagram_mentions_kind_check check (kind in ('story', 'post', 'collab'));
alter table public.instagram_mentions
  add column video boolean not null default false,
  add column likes int check (likes >= 0),
  add column comments int check (comments >= 0),
  add column views bigint check (views >= 0),
  add column shares int check (shares >= 0),
  add column saves int check (saves >= 0),
  -- When Instagram last gave the figures above.
  add column figures_at timestamptz,
  -- The poster's followers, when Instagram says (it does for people who've messaged the café).
  add column followers int check (followers >= 0),
  -- An admin added it by its link (null: Instagram listed it).
  add column added_by uuid references public.profiles (id) on delete set null,
  -- When the Worker looked at whether its poster should be put forward as a rep, and whether it did:
  -- someone put forward once (an owner may have said no) isn't put forward again.
  add column rep_checked_at timestamptz,
  add column put_forward boolean not null default false;
create index instagram_mentions_added_by_idx on public.instagram_mentions (added_by);
create index instagram_mentions_unchecked_idx on public.instagram_mentions (business_id, mentioned_at desc) where rep_checked_at is null;
create index instagram_mentions_username_idx on public.instagram_mentions (business_id, username);

-- 2. Reps found on Instagram ------------------------------------------------------------------------
alter table public.sales_reps add column found_mention_id text;
alter table public.sales_reps add constraint sales_reps_found_mention_fkey foreign key (business_id, found_mention_id)
  references public.instagram_mentions (business_id, id) on delete set null (found_mention_id);
create index sales_reps_found_mention_idx on public.sales_reps (business_id, found_mention_id);
-- The Worker adds them (the service role): their card code is made as for anyone else.
grant execute on function public.new_rep_code(text) to service_role;

-- 3. New followers each day -------------------------------------------------------------------------
create table public.social_follower_days (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source in ('instagram', 'tiktok', 'linkedin', 'facebook')),
  day         date not null,
  -- New followers that day, as the platform counts them.
  gained      int not null check (gained >= 0),
  updated_at  timestamptz not null default now()
);
select public.add_business_scope('public.social_follower_days');
create unique index social_follower_days_key on public.social_follower_days (business_id, source, day);
alter table public.social_follower_days enable row level security;
revoke all on public.social_follower_days from anon;
-- Admins read them (Analytics); only the Worker writes them.
create policy social_follower_days_admin on public.social_follower_days for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.social_follower_days from authenticated;

-- 4. The owners hear why someone found on Instagram is waiting for them (otherwise as in the
--    rep_owner_ok migration, which this replaces with the same signature).
create or replace function public.sales_rep_suggested() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_by     text := (select full_name from public.profiles where id = auth.uid());
  v_leader text := (select name from public.sales_reps where id = new.leader_id);
begin
  if new.approved then return null; end if;
  insert into public.notifications (profile_id, title, body, link)
  select a.id,
         case when new.found_mention_id is not null and v_by is null then new.name || ' posted about the café: waiting for your OK as a rep'
              when v_by is not null then v_by || ' added ' || new.name || ' as a rep: waiting for your OK'
              when v_leader is not null then v_leader || ' added ' || new.name || ' to their crew: waiting for your OK'
              else new.name || ' is waiting for your OK as a rep' end,
         concat_ws(' · ', case when v_leader is not null and v_by is not null then 'In ' || v_leader || '’s crew' end,
                   case when new.reach > 0 then 'Reaches ' || to_char(new.reach, 'FM999,999,999,990') || ' people' end, new.notes),
         '/sales-reps'
    from public.profiles a where a.role = 'admin' and a.can_see_pay and a.active and a.id is distinct from auth.uid();
  return null;
end $$;
