-- One reel, one post about the café. A customer's reel with the café as a collaborator can come in
-- twice: first as a tag (post:<media id>, from the tags list), then, once the Facebook Page reads
-- collabs, as the collab (collab:<short code>). It's the same post: when the collab comes in, the tag it
-- was is folded into it. What was done about it, the rep it brought and the rewards it earned move over,
-- and the tag goes, so it isn't shown or paid for twice. A tag whose collab is kept already isn't kept
-- (worker/mentions.ts, keepMentions).

-- A post's short code from its link ("https://www.instagram.com/reel/DfjbumRCHYO/" → DfjbumRCHYO), as
-- shared/mentions.ts shortcodeOf.
create or replace function public.instagram_shortcode(p_link text) returns text
language sql immutable set search_path = ''
as $$
  select (regexp_match(btrim(coalesce(p_link, '')),
    '^(?:https?://)?(?:www\.|m\.)?instagram\.com/(?:[A-Za-z0-9_.]+/)?(?:p|reels?|tv)/([A-Za-z0-9_-]{5,40})', 'i'))[1]
$$;

-- Fold the tags of a collab's reel into it.
create or replace function public.fold_tags_into_collab(p_business int, p_collab text) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  c   public.instagram_mentions;
  t   public.instagram_mentions;
  v_n int := 0;
begin
  select * into c from public.instagram_mentions where business_id = p_business and id = p_collab and kind = 'collab';
  if c.id is null or public.instagram_shortcode(c.permalink) is null then return 0; end if;
  for t in select * from public.instagram_mentions i
            where i.business_id = p_business and i.kind = 'post'
              and public.instagram_shortcode(i.permalink) = public.instagram_shortcode(c.permalink)
  loop
    update public.instagram_mentions m set
      status         = case when m.status = 'new' then t.status else m.status end,
      reposted_url   = coalesce(m.reposted_url, t.reposted_url),
      decided_by     = coalesce(m.decided_by, t.decided_by),
      decided_at     = coalesce(m.decided_at, t.decided_at),
      followers      = coalesce(m.followers, t.followers),
      rep_checked_at = coalesce(m.rep_checked_at, t.rep_checked_at),
      put_forward    = m.put_forward or t.put_forward,
      account_window = coalesce(m.account_window, t.account_window),
      window_read_at = coalesce(m.window_read_at, t.window_read_at)
     where m.business_id = p_business and m.id = c.id;
    -- What the tag earned and the rep it brought go with it (a reward a post earned already stays the one).
    update public.rep_rewards w set mention_id = c.id
     where w.business_id = p_business and w.mention_id = t.id
       and not exists (select 1 from public.rep_rewards x where x.business_id = p_business and x.mention_id = c.id);
    update public.sales_reps r set found_mention_id = c.id where r.business_id = p_business and r.found_mention_id = t.id;
    delete from public.instagram_mentions where business_id = p_business and id = t.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
alter function public.fold_tags_into_collab(int, text) owner to app_definer;
revoke execute on function public.fold_tags_into_collab(int, text) from public, anon, authenticated;

create or replace function public.fold_tags_on_collab() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.fold_tags_into_collab(new.business_id, new.id);
  return null;
end $$;
alter function public.fold_tags_on_collab() owner to app_definer;
revoke execute on function public.fold_tags_on_collab() from public, anon, authenticated;

create trigger instagram_mentions_fold_tags after insert on public.instagram_mentions
  for each row when (new.kind = 'collab') execute function public.fold_tags_on_collab();

-- The ones in already.
select public.fold_tags_into_collab(business_id, id) from public.instagram_mentions where kind = 'collab';
