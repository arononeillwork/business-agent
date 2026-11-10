-- One reel, one post about the café (the one_post_per_reel migration): a tag that comes in first, and
-- the same reel as a collab after it, are one post, with what was done about it, the rep it brought and
-- what it earned on the collab.

create function pg_temp.as_worker() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', json_build_object('x-business-id', (select min(id) from public.business)::text)::text, false);
  set role service_role;
end $$;

do $$ begin
  assert public.instagram_shortcode('https://www.instagram.com/reel/DfReel0001/') = 'DfReel0001', 'a reel''s link';
  assert public.instagram_shortcode('instagram.com/nora.eats/p/DfPost_0001-x?igsh=1') = 'DfPost_0001-x', 'a post''s, under the poster';
  assert public.instagram_shortcode('https://example.com/reel/DfReel0001/') is null, 'not Instagram''s';
  assert public.instagram_shortcode(null) is null, 'no link';
end $$;

-- Nora's reel came in as a tag: looked at, put forward as a rep, reposted, and a reward logged for it.
select pg_temp.as_worker();
insert into public.instagram_mentions (id, kind, username, permalink, mentioned_at, status, reposted_url, rep_checked_at, put_forward) values
  ('post:1801', 'post', 'nora.reel', 'https://www.instagram.com/reel/DfReel0001/', now() - interval '3 days', 'reposted',
   'https://www.instagram.com/stories/easy.beans/1/', now() - interval '2 days', true),
  -- Someone else's tag of another post stays as it is.
  ('post:1802', 'post', 'tomas.reel', 'https://www.instagram.com/p/DfOther001/', now() - interval '2 days', 'new', null, null, false);
insert into public.sales_reps (name, kind, instagram, approved, found_mention_id) values ('Nora', 'customer', 'nora.reel', true, 'post:1801');
insert into public.rep_rewards (rep_id, kind, label, amount, status, mention_id)
select id, 'earn', 'A post about us', 5, 'pending', 'post:1801' from public.sales_reps where instagram = 'nora.reel';

-- Then the same reel as a collab, through the Facebook Page (as keepMentions keeps them: an upsert).
insert into public.instagram_mentions (id, kind, username, permalink, mentioned_at, video, views, likes)
values ('collab:DfReel0001', 'collab', 'nora.reel', 'https://www.instagram.com/reel/DfReel0001/', now() - interval '3 days', true, 8000, 400)
on conflict (business_id, id) do update set views = excluded.views, likes = excluded.likes;

do $$ begin
  assert not exists (select 1 from public.instagram_mentions where id = 'post:1801'), 'the tag is folded in';
  assert (select status = 'reposted' and reposted_url is not null and rep_checked_at is not null and put_forward and views = 8000
            from public.instagram_mentions where id = 'collab:DfReel0001'), 'what was done about it, on the collab';
  assert (select found_mention_id = 'collab:DfReel0001' from public.sales_reps where instagram = 'nora.reel'), 'the rep it brought';
  assert (select count(*) = 1 from public.rep_rewards where mention_id = 'collab:DfReel0001'), 'what it earned';
  assert exists (select 1 from public.instagram_mentions where id = 'post:1802'), 'another post''s tag stays';
end $$;

-- The next look brings the figures up to date: still one.
insert into public.instagram_mentions (id, kind, username, permalink, mentioned_at, video, views, likes)
values ('collab:DfReel0001', 'collab', 'nora.reel', 'https://www.instagram.com/reel/DfReel0001/', now() - interval '3 days', true, 9100, 420)
on conflict (business_id, id) do update set views = excluded.views, likes = excluded.likes;
do $$ begin
  assert (select count(*) from public.instagram_mentions where public.instagram_shortcode(permalink) = 'DfReel0001') = 1, 'one post per reel';
  assert (select views = 9100 from public.instagram_mentions where id = 'collab:DfReel0001'), 'its figures up to date';
end $$;

-- Tidy up for the tests after.
reset role;
delete from public.rep_rewards where mention_id = 'collab:DfReel0001';
delete from public.notifications where body like '%nora.reel%' or title like '%Nora%';
delete from public.sales_reps where instagram = 'nora.reel';
delete from public.instagram_mentions where id in ('collab:DfReel0001', 'post:1802');
