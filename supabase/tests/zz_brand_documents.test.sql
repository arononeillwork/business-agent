-- Brand page documents: uploads kept here, picked files only where they are; the team reads, admins change.
-- Reuses the people of the tests before it: maria (by now an admin), julio (employee).

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

-- 1. An admin uploads one and picks one from Drive.
select pg_temp.act_as('maria@test');
do $$
declare v_up uuid; v_pick uuid;
begin
  insert into public.brand_documents (title, storage, file_name, mime_type, size, content)
    values ('  EB Brand Guidelines ', 'upload', 'EB_Brand_Guidelines.pdf', 'application/pdf', 20, 'data:application/pdf;base64,JVBERi0xLjQ=') returning id into v_up;
  insert into public.brand_documents (title, storage, file_id, file_name, link)
    values ('Logo pack', 'google_drive', 'g-logos', 'Logo pack.zip', 'https://drive.google.com/file/d/g-logos/view') returning id into v_pick;
  assert (select title = 'EB Brand Guidelines' and added_by = auth.uid() from public.brand_documents where id = v_up), 'title tidied, adder kept';
  -- Renaming keeps the file and where it is.
  update public.brand_documents set title = 'Guidelines', content = 'data:text/plain;base64,eA==', file_name = 'other.pdf' where id = v_up;
  assert (select title = 'Guidelines' and content = 'data:application/pdf;base64,JVBERi0xLjQ=' and file_name = 'EB_Brand_Guidelines.pdf'
          from public.brand_documents where id = v_up), 'only the title changes';
end $$;
-- An upload has its file and no storage id; a picked one the other way round; no repeats.
select pg_temp.expect_error($q$insert into public.brand_documents (title, storage, file_name) values ('No file', 'upload', 'x.pdf')$q$, 'brand_documents_where');
select pg_temp.expect_error($q$insert into public.brand_documents (title, storage, file_name, content) values ('Odd', 'google_drive', 'x.pdf', 'data:,x')$q$, 'brand_documents_where');
select pg_temp.expect_error($q$insert into public.brand_documents (title, storage, file_name, content) values ('Not a file', 'upload', 'x.pdf', 'hello')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.brand_documents (title, storage, file_id, file_name) values ('Again', 'google_drive', 'g-logos', 'Logo pack.zip')$q$, 'duplicate key');
select pg_temp.expect_error($q$insert into public.brand_documents (title, storage, file_id, file_name) values ('Dropbox', 'dropbox', 'd1', 'x.pdf')$q$, 'check constraint');

-- 2. The team reads them (the file too); only admins add, change or remove.
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.brand_documents) = 2, 'the team reads them';
  assert (select content is not null from public.brand_documents where storage = 'upload'), 'and the uploaded file';
  update public.brand_documents set title = 'Mine';
  assert not found, 'employees can’t rename';
  delete from public.brand_documents;
  assert not found, 'employees can’t remove';
end $$;
select pg_temp.expect_error($q$insert into public.brand_documents (title, storage, file_name, content) values ('x', 'upload', 'x.pdf', 'data:,x')$q$, 'row-level security');
select pg_temp.act_as('maria@test');
delete from public.brand_documents where storage = 'google_drive';
do $$ begin assert (select count(*) from public.brand_documents) = 1, 'admin removes'; end $$;
reset role;
