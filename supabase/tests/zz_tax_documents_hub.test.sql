-- Documents hub: kept documents live under Tax or Documents (nowhere else), with a title, tags and
-- an expiry tidied; admins with pay access write, a gestoría with finances access reads, staff see nothing.
-- People from the tests before it: maria (admin with pay access by now), julio (employee), tax-partner (zz_tax).

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

select pg_temp.act_as('maria@test');
do $$
declare v uuid;
begin
  insert into public.tax_documents (name, kind, year, size, storage, file_id, folder, title, tags, expires_on)
    values ('Contrato alquiler local.pdf', 'contract', 2026, 120000, 'google_drive', 'hub-1', '{Documents,Contracts}',
            '  Lease of the premises ', '{" local", "lease", "local", ""}', '2031-03-31')
    returning id into v;
  assert (select title = 'Lease of the premises' and tags = '{lease,local}' and expires_on = '2031-03-31'
          from public.tax_documents where id = v), 'title and tags tidied';
  update public.tax_documents set title = ' ', tags = '{}', file_id = 'other' where id = v;
  assert (select title is null and tags = '{}' and file_id = 'hub-1' from public.tax_documents where id = v), 'cleared; the file stays where it is';
end $$;
select pg_temp.expect_error($q$insert into public.tax_documents (name, kind, year, size, storage, file_id, folder)
  values ('photo.jpg', 'other', 2026, 10, 'google_drive', 'hub-2', '{Social,Posts}')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.tax_documents (name, kind, year, size, storage, file_id, folder, tags)
  values ('many.pdf', 'other', 2026, 10, 'google_drive', 'hub-3', '{Documents}',
          '{a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u}')$q$, 'check constraint');
do $$ begin
  -- The Tax page's documents are as they were.
  insert into public.tax_documents (name, kind, year, quarter, size, storage, file_id, folder)
    values ('Nómina septiembre.pdf', 'payslip', 2026, 3, 10, 'google_drive', 'hub-4', '{Tax,2026,Q3,Payslips}');
end $$;

select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.tax_documents) = 0, 'employees see no documents';
end $$;
select pg_temp.expect_error($q$insert into public.tax_documents (name, kind, year, size, storage, file_id, folder)
  values ('Sneaky.pdf', 'other', 2026, 10, 'google_drive', 'hub-5', '{Documents}')$q$, 'row-level security');

select pg_temp.act_as('tax-partner@test');
do $$ declare n int; begin
  assert (select count(*) from public.tax_documents where folder[1] = 'Documents') = 1, 'the gestoría reads the hub’s documents';
  update public.tax_documents set title = 'x'; get diagnostics n = row_count;
  assert n = 0, 'and changes none';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
