-- Synced folders (Content, admins): a folder in the business's OneDrive (or Google Drive, once The Business
-- Agent may read a folder there) whose photos and videos show on the Content page straight from it.
-- Nothing is copied: the Worker lists each one (content_items, source 'folder', with an address it serves
-- from the folder itself) and looks at the folder again when the page opens, adding the new ones and taking
-- off the ones gone from it. Taken off the page by an admin, one is hidden rather than deleted, so the next
-- look doesn't bring it back. Taking a folder off the page takes its photos and videos with it.
-- shared/contentFolders.ts has the same rules.

create table public.content_folders (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null check (provider in ('onedrive', 'google_drive')),
  -- The folder's own id in OneDrive or Google Drive.
  folder_id       text not null check (char_length(folder_id) between 1 and 500),
  name            text not null check (char_length(btrim(name)) between 1 and 300),
  -- Where it is, to show ("Pictures › Camera Roll").
  path            text check (char_length(path) <= 1000),
  last_synced_at  timestamptz,
  last_error      text check (char_length(last_error) <= 500),
  created_by      uuid references auth.users on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);
select public.add_business_scope('public.content_folders');
create unique index content_folders_key on public.content_folders (business_id, provider, folder_id);
create index content_folders_created_by_idx on public.content_folders (created_by);
create trigger audit_content_folders after insert or delete on public.content_folders
  for each row execute function public.audit_row();

alter table public.content_folders enable row level security;
revoke all on public.content_folders from anon;
-- Admins see them and take one off the page; the Worker adds them (it checks the folder can be read first)
-- and keeps them up to date.
create policy content_folders_admin_read on public.content_folders for select to authenticated using ((select public.is_admin()));
create policy content_folders_admin_delete on public.content_folders for delete to authenticated using ((select public.is_admin()));
revoke insert, update on public.content_folders from authenticated;

-- A photo or video from a folder: which folder, and the file's id there (source_id). Hidden: taken off the
-- page by an admin, still in the folder.
alter table public.content_items
  add column folder_id uuid references public.content_folders (id) on delete cascade,
  add column hidden boolean not null default false;
create index content_items_folder_idx on public.content_items (folder_id);
alter table public.content_items drop constraint content_items_source_check;
alter table public.content_items add constraint content_items_source_check check (source in ('google_photos', 'upload', 'folder'));
-- Google Photos and a folder name their own id for it; an upload doesn't.
alter table public.content_items drop constraint content_items_check;
alter table public.content_items add constraint content_items_source_id_given check ((source = 'upload') = (source_id is null));
alter table public.content_items add constraint content_items_folder_given check ((source = 'folder') = (folder_id is not null));
-- Each file once per folder.
create unique index content_items_folder_file on public.content_items (business_id, folder_id, source_id) where source = 'folder';
grant update (hidden) on public.content_items to authenticated;
