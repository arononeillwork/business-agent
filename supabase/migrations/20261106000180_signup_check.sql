-- The sign-up check (worker/signupCheck.ts). The sign-up form sends its Cloudflare Turnstile answer in
-- the new account's user_metadata ("captcha"), and an invite carries the Worker's mark ("invite"), so
-- Supabase's "before user created" hook can read them. Neither is any use once the account exists, and
-- user_metadata goes into every sign-in token (a Turnstile answer is up to 2 KB), so they aren't kept.
create or replace function public.drop_signup_check()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.raw_user_meta_data ? 'captcha' or new.raw_user_meta_data ? 'invite' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'captcha' - 'invite';
  end if;
  return new;
end $$;
revoke execute on function public.drop_signup_check() from public, anon, authenticated;

create trigger drop_signup_check
  before insert on auth.users
  for each row execute function public.drop_signup_check();
