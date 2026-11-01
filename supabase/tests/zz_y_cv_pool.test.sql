-- The CV pool (the `cv_pool` migration): someone kept for a job to come is an applicant with no job,
-- with the roles they'd suit and when they can work tidied, kept a year as everyone who applied. Their
-- CV file is kept on its own, one each: a new one replaces it, it stays with them when they're added to
-- a job, and it goes with them. Admins only.
-- People from the tests before it: maria (admin), julio (employee).

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

-- 1. In the pool: no job; the roles each once, in the order typed; kept a year from being added.
select pg_temp.act_as('maria@test');
do $$
declare v uuid;
begin
  insert into public.applicants (full_name, email, source, roles, available_from, availability, applied_on)
    values (' Marta Jiménez ', ' Marta@Example.ES ', 'window', array[' Barista ', 'Front of house', 'barista', '  '], '2026-12-01', '  Weekends  ', '2026-11-01')
    returning id into v;
  assert (select opening_id is null and full_name = 'Marta Jiménez' and email = 'marta@example.es' and stage = 'applied'
                 and roles = array['Barista', 'Front of house'] and available_from = '2026-12-01' and availability = 'Weekends'
                 and keep_until = '2027-11-01'
            from public.applicants where id = v), 'in the pool, tidied, kept a year';
  perform set_config('test.marta', v::text, false);
  update public.applicants set roles = '{}', availability = ' ' where id = v;
  assert (select roles = '{}' and availability is null from public.applicants where id = v), 'roles and availability can be cleared';
end $$;
select pg_temp.expect_error($q$insert into public.applicants (full_name, roles) values ('Long role', array[repeat('x', 61)])$q$, 'Keep each role to 60 characters');
select pg_temp.expect_error($q$insert into public.applicants (full_name, roles) values ('Many roles', array['a','b','c','d','e','f','g','h','i','j','k'])$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.applicants (full_name, availability) values ('Wordy', repeat('x', 201))$q$, 'check constraint');

-- 2. Her CV: one file each, a new one replaces it (who and when with it); only a data: URL of up to 10 MB.
do $$
declare v uuid := current_setting('test.marta')::uuid;
begin
  insert into public.applicant_cvs (applicant_id, file_name, mime_type, size, content)
    values (v, ' Marta CV.pdf ', 'application/pdf', 4, 'data:application/pdf;base64,JVBERg==');
  assert (select file_name = 'Marta CV.pdf' and added_by = auth.uid() from public.applicant_cvs where applicant_id = v), 'kept, name tidied, who added it';
  insert into public.applicant_cvs (applicant_id, file_name, mime_type, size, content)
    values (v, 'Marta CV 2026.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 3, 'data:application/octet-stream;base64,UEsD')
    on conflict (applicant_id) do update set file_name = excluded.file_name, mime_type = excluded.mime_type, size = excluded.size, content = excluded.content;
  assert (select count(*) from public.applicant_cvs where applicant_id = v) = 1, 'one CV each';
  assert (select file_name = 'Marta CV 2026.docx' and size = 3 from public.applicant_cvs where applicant_id = v), 'the new one replaces it';
end $$;
select pg_temp.expect_error($q$insert into public.applicant_cvs (applicant_id, file_name, size, content) values (gen_random_uuid(), 'x.pdf', 1, 'data:,x')$q$, 'Applicant not found');
select pg_temp.expect_error($q$update public.applicant_cvs set content = 'not a file' where applicant_id = current_setting('test.marta')::uuid$q$, 'check constraint');
select pg_temp.expect_error($q$update public.applicant_cvs set size = 10485761 where applicant_id = current_setting('test.marta')::uuid$q$, 'check constraint');
do $$
declare v uuid := current_setting('test.marta')::uuid;
begin
  update public.applicant_cvs set applicant_id = (select id from public.applicants where full_name = 'Lucía Romero' limit 1) where applicant_id = v;
  assert exists (select 1 from public.applicant_cvs where applicant_id = v), 'a CV stays with its applicant';
end $$;

-- 3. Added to a job: on its board at Applied, CV and all; and it goes with her.
do $$
declare v uuid := current_setting('test.marta')::uuid; v_job uuid;
begin
  insert into public.job_openings (title) values ('CV pool test job') returning id into v_job;
  update public.applicants set opening_id = v_job, stage = 'applied' where id = v;
  assert (select opening_id = v_job and keep_until = '2027-11-01' from public.applicants where id = v), 'on the job, kept as long as before';
  assert exists (select 1 from public.applicant_cvs where applicant_id = v), 'with her CV';
  delete from public.applicants where id = v;
  assert not exists (select 1 from public.applicant_cvs where applicant_id = v), 'her CV goes with her';
  delete from public.job_openings where id = v_job;
end $$;

-- 4. The team sees none of it, and can't add to it.
reset role;
insert into public.applicants (full_name) values ('CV pool test');
insert into public.applicant_cvs (applicant_id, file_name, size, content) select id, 'cv.pdf', 1, 'data:,x' from public.applicants where full_name = 'CV pool test';
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.applicants) = 0 and (select count(*) from public.applicant_cvs) = 0, 'employees see no CVs';
end $$;
select pg_temp.expect_error($q$insert into public.applicants (full_name) values ('Sneaky')$q$, 'row-level security');

-- Tidy up.
reset role; select set_config('request.jwt.claim.sub', '', false);
delete from public.applicants where full_name = 'CV pool test';
do $$ begin
  assert not exists (select 1 from public.applicant_cvs), 'gone with their applicants';
end $$;
