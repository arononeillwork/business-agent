-- Pages by kind of business (the pages_by_kind migration): a business starts with the pages that don't
-- fit its kind hidden. The pub and the estate agency come from zzzzz_self_serve_sign_up; a café made
-- before any kind (the first business) still sees everything.
reset role;
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false), set_config('request.headers', '', false);
do $$
begin
  assert (select s.hidden_pages = array['coffees'] from public.settings s join public.business b on b.id = s.business_id where b.name = 'The Crown'),
    'a pub hides Coffees';
  assert (select 'menu' = any (s.hidden_pages) and 'stock' = any (s.hidden_pages) and 'foodsafety' = any (s.hidden_pages) and not 'rota' = any (s.hidden_pages)
            from public.settings s join public.business b on b.id = s.business_id where b.name = 'Casas del Sol'),
    'an estate agency hides the food and stock pages, never the rota';
  assert (select s.hidden_pages = '{}' from public.settings s where s.business_id = 1), 'the first business sees everything';
end $$;
