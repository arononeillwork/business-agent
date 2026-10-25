-- Brand page: the brand's documents (the guidelines PDF, logo packs, templates). Each one is either
-- uploaded on the page and kept here (content, a data: URL of up to 10 MB), or picked where it already
-- is in the café's Google Drive or OneDrive, and then only where it is is kept, as on the Legal page
-- (the legal documents migration); the Worker adds picked ones and shows them from there.
-- Who: the whole team and partners read, as they read the rest of the brand; admins add and change.
create table public.brand_documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 200),
  storage      text not null check (storage in ('upload', 'google_drive', 'onedrive')),
  file_id      text check (char_length(file_id) between 1 and 200),
  file_name    text not null check (char_length(file_name) between 1 and 255),
  mime_type    text check (char_length(mime_type) <= 255),
  size         bigint check (size >= 0),
  modified_at  timestamptz,
  link         text check (link ~* '^https://'),
  location     text check (char_length(location) <= 500),
  content      text check (content is null or (content like 'data:%' and length(content) <= 14000000)),
  added_by     uuid references auth.users on delete set null default auth.uid(),
  added_at     timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- An upload has its file and no storage id; a picked one the other way round.
  constraint brand_documents_where check ((storage = 'upload') = (content is not null) and (storage = 'upload') = (file_id is null)),
  unique (storage, file_id)
);
create index brand_documents_added_by_idx on public.brand_documents (added_by);

-- Tidy the title; where the file is, the file itself and who added it don't change once it's on the page.
create or replace function public.brand_document_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.location := nullif(btrim(new.location), '');
  if tg_op = 'UPDATE' then
    new.storage := old.storage; new.file_id := old.file_id; new.content := old.content; new.file_name := old.file_name;
    new.mime_type := old.mime_type; new.size := old.size; new.added_by := old.added_by; new.added_at := old.added_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger brand_documents_rules before insert or update on public.brand_documents for each row execute function public.brand_document_rules();
-- No row audit: an upload's whole file would be copied into the audit log with it.

alter table public.brand_documents enable row level security;
revoke all on public.brand_documents from anon;
create policy brand_documents_read on public.brand_documents for select to authenticated
  using ((select public.is_staff()) or (select public.is_partner()));
create policy brand_documents_admin on public.brand_documents for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
