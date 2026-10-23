-- Legal page (migration 65): documents that stay in the café's Drive or OneDrive, kept here only as
-- where each one is. Tidied, each file once, where it is fixed once added; admins only (a gestoría with
-- finances access reads). And Google Drive and OneDrive can now be connected at the same time.
-- People from the tests before it: maria (admin), julio (employee), tax-partner and rota-partner (zz_tax).

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

-- 1. Both storages at once: connecting OneDrive no longer disconnects Google Drive (or forgets its access).
reset role;
insert into public.integration_secrets (provider, ciphertext) values ('google_drive', 'sealed-drive'), ('onedrive', 'sealed-onedrive')
  on conflict (provider) do update set ciphertext = excluded.ciphertext;
update public.integrations set status = 'connected', account_label = 'cafe@gmail.com' where provider = 'google_drive';
update public.integrations set status = 'connected', account_label = 'cafe@outlook.com' where provider = 'onedrive';
do $$ begin
  assert (select count(*) from public.integrations where provider in ('google_drive', 'onedrive') and status = 'connected') = 2, 'both stay connected';
  assert (select count(*) from public.integration_secrets where provider in ('google_drive', 'onedrive')) = 2, 'and both keep their access';
  assert public.integration_group('google_drive') is null and public.integration_group('onedrive') is null, 'files are no longer a choose-one group';
  assert public.integration_group('gmail') = 'email' and public.integration_group('square') = 'payments', 'the other groups are as they were';
end $$;
update public.integrations set status = 'disconnected', account_label = null where provider in ('google_drive', 'onedrive');
delete from public.integration_secrets where provider in ('google_drive', 'onedrive');

-- 2. An admin adds documents picked in either storage.
select pg_temp.act_as('maria@test');
do $$ begin
  insert into public.legal_documents (title, kind, storage, file_id, file_name, mime_type, size, link, location, notes)
    values ('  Contrato de arrendamiento ', 'lease', 'google_drive', 'drive-file-1', 'Contrato arrendamiento.pdf', 'application/pdf', 248695,
            'https://drive.google.com/file/d/drive-file-1/view', ' ', '  ');
  insert into public.legal_documents (title, kind, storage, file_id, file_name, link, location)
    values ('Escritura de constitución', 'company', 'onedrive', 'ms-item-9', 'escritura_SL.pdf', 'https://onedrive.live.com/?id=ms-item-9', 'Documents/Legal');
  assert (select title = 'Contrato de arrendamiento' and notes is null and location is null and added_by = auth.uid()
          from public.legal_documents where file_id = 'drive-file-1'), 'tidied and stamped';
end $$;
select pg_temp.expect_error($q$insert into public.legal_documents (title, storage, file_id, file_name) values ('Again', 'google_drive', 'drive-file-1', 'x.pdf')$q$, 'duplicate key');
select pg_temp.expect_error($q$insert into public.legal_documents (title, storage, file_id, file_name) values ('X', 'dropbox', 'f', 'x.pdf')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.legal_documents (title, kind, storage, file_id, file_name) values ('X', 'magic', 'onedrive', 'f', 'x.pdf')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.legal_documents (title, storage, file_id, file_name, link) values ('X', 'onedrive', 'f', 'x.pdf', 'javascript:alert(1)')$q$, 'check constraint');

-- What it is and its notes can change; where the file is can't.
do $$ begin
  update public.legal_documents set title = 'Arrendamiento del local', kind = 'contract', storage = 'onedrive', file_id = 'elsewhere', notes = 'Ends 2031'
   where file_id = 'drive-file-1';
  assert (select title = 'Arrendamiento del local' and kind = 'contract' and notes = 'Ends 2031' from public.legal_documents where file_id = 'drive-file-1'), 'details change';
  assert (select storage from public.legal_documents where file_id = 'drive-file-1') = 'google_drive', 'the file stays where it is';
end $$;

-- 3. Nobody else changes them; the gestoría reads.
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.legal_documents) = 0, 'employees see no legal documents';
  update public.legal_documents set title = 'x'; get diagnostics n = row_count;
  assert n = 0, 'and change none';
end $$;
select pg_temp.expect_error($q$insert into public.legal_documents (title, storage, file_id, file_name) values ('Sneaky', 'onedrive', 's', 's.pdf')$q$, 'row-level security');

select pg_temp.act_as('tax-partner@test');
do $$ declare n int; begin
  assert (select count(*) from public.legal_documents) = 2, 'the gestoría reads';
  delete from public.legal_documents; get diagnostics n = row_count;
  assert n = 0, 'and deletes nothing';
end $$;

select pg_temp.act_as('rota-partner@test');
do $$ begin
  assert (select count(*) from public.legal_documents) = 0, 'a partner without finances access sees none';
end $$;

-- 4. Taking one off the list (the file stays in Drive or OneDrive) is an admin's to do, and is audited.
select pg_temp.act_as('maria@test');
delete from public.legal_documents where file_id = 'ms-item-9';
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select count(*) from public.legal_documents) = 1, 'removed from the list';
  assert exists (select 1 from public.audit_log where table_name = 'legal_documents' and action = 'delete'), 'and the removal is in the audit log';
end $$;
