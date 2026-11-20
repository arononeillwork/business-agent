-- Someone found on Instagram (Hiring): an applicant, on a job or in the CV pool, with their Instagram,
-- added by their profile's link (instagram.com/itselmus) or their @. Kept as Instagram's names are:
-- no @, in lower case, letters, digits, dots and underscores, up to 30. A link or an @ written here
-- (the app, or an AI assistant writing the row) is tidied to that; anything else is refused.
-- With no name yet they go by their @ (the app writes it as their name); they move through the
-- stages in the CV pool's own lane on the board until there's a job for them.
-- The code live before this keeps working: it never names the column.

alter table public.applicants
  add column instagram text check (instagram ~ '^[a-z0-9._]{1,30}$');

-- "https://www.instagram.com/ItsElmus/?hl=en", "instagram.com/itselmus", "@ItsElmus", " itselmus " → "itselmus"; empty → none.
create or replace function public.applicant_instagram_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.instagram := nullif(lower(regexp_replace(regexp_replace(btrim(new.instagram), '^(https?://)?(www\.)?instagram\.com/@?', '', 'i'),
                                               '^@|[/?#].*$', '', 'g')), '');
  return new;
end $$;
create trigger applicants_instagram_rules before insert or update of instagram on public.applicants
  for each row execute function public.applicant_instagram_rules();
