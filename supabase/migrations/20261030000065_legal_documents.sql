-- Legal page: the business's legal documents (the lease, the company's deeds, insurance policies,
-- contracts, licences, its own policies…). Each one stays where it already is in the café's own
-- Google Drive or OneDrive: an admin picks it there, and this keeps only where it is and what it is,
-- so the page can list it, show it and open it there. Nothing is copied.
-- Who: admins; a gestoría with finances access reads.

-- 1. Google Drive and OneDrive no longer exclude each other: a business can keep both connected and
--    choose which one to pick documents from. Where a feature saves new files (Tax, exports, photos
--    for posts) it still uses one: Google Drive when both are connected (worker/connections.ts).
create or replace function public.integration_group(p text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p in ('gmail', 'outlook') then 'email'
    when p in ('google_calendar', 'outlook_calendar') then 'calendar'
    when p in ('spotify', 'youtube_music') then 'music'
    when p = 'whatsapp' then 'communication'
    when p in ('square', 'sumup') then 'payments'
  end
$$;

-- 2. The documents.
create table public.legal_documents (
  id           uuid primary key default gen_random_uuid(),
  -- What it's called on the page (the file's name until someone renames it).
  title        text not null check (char_length(title) between 1 and 200),
  kind         text not null default 'other'
               check (kind in ('lease', 'company', 'insurance', 'contract', 'licence', 'employment', 'policy', 'other')),
  -- Where the file is: which storage, and its id there.
  storage      text not null check (storage in ('google_drive', 'onedrive')),
  file_id      text not null check (char_length(file_id) between 1 and 200),
  -- The file as it was when picked (its name, type and size there).
  file_name    text not null check (char_length(file_name) between 1 and 255),
  mime_type    text check (char_length(mime_type) <= 255),
  size         bigint check (size >= 0),
  modified_at  timestamptz,
  -- Its own page in Drive or OneDrive.
  link         text check (link ~* '^https://'),
  -- The folder it's in there ("Documents/Lease"), when the storage says (Google's picker doesn't).
  location     text check (char_length(location) <= 500),
  notes        text check (char_length(notes) <= 2000),
  added_by     uuid references auth.users on delete set null default auth.uid(),
  added_at     timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (storage, file_id)
);
create index legal_documents_kind_idx on public.legal_documents (kind, title);

-- Tidy what's typed; where the file is and who added it don't change once it's on the list.
create or replace function public.legal_document_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.notes := nullif(btrim(new.notes), '');
  new.location := nullif(btrim(new.location), '');
  if tg_op = 'UPDATE' then
    new.storage := old.storage; new.file_id := old.file_id;
    new.added_by := old.added_by; new.added_at := old.added_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger legal_documents_rules before insert or update on public.legal_documents for each row execute function public.legal_document_rules();
create trigger audit_legal_documents after insert or update or delete on public.legal_documents for each row execute function public.audit_row();

alter table public.legal_documents enable row level security;
revoke all on public.legal_documents from anon;
create policy legal_documents_admin on public.legal_documents for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy legal_documents_partner_read on public.legal_documents for select to authenticated using ((select public.partner_can('finances')));
