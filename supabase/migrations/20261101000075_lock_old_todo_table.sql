-- The old "ToDo" table: an early to-do board made in the dashboard, outside these migrations, before
-- the To Do List (migration 31). Its one policy let anyone holding the public key read, change or
-- delete every row. Nobody, signed in or not, reaches it through the API now; only the service role
-- and the dashboard do. Its rows are kept. (Only where the table exists: a fresh database has none.)
do $$
begin
  if to_regclass('public."ToDo"') is not null then
    drop policy if exists "ToDo anon all" on public."ToDo";
    alter table public."ToDo" enable row level security;
    revoke all on public."ToDo" from anon, authenticated;
    if to_regclass('public."ToDo_id_seq"') is not null then
      revoke all on sequence public."ToDo_id_seq" from anon, authenticated;
    end if;
  end if;
end $$;
