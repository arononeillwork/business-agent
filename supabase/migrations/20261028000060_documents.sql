-- Documents hub: kept documents (tax_documents, migration 48) can also live under
-- "Business Agent/Documents/…" in the café's Drive or OneDrive (contracts, insurance policies, the
-- lease, certificates), not only under Tax. Each can have a friendlier title, tags and the day it
-- runs out. The hub lists them all with what each belongs to (an invoice, a licence, the Tax page).
-- Who: as before, admins with pay access; a gestoría with finances access reads.

alter table public.tax_documents drop constraint tax_documents_folder_check;
alter table public.tax_documents add constraint tax_documents_folder_check
  check (cardinality(folder) between 1 and 8 and folder[1] in ('Tax', 'Documents'));

alter table public.tax_documents add column title text check (char_length(title) <= 200);
alter table public.tax_documents add column tags text[] not null default '{}'
  check (cardinality(tags) <= 20);
alter table public.tax_documents add column expires_on date check (expires_on between '1990-01-01' and '2101-01-01');

-- Tidy what's typed (as migration 48), the title and tags too.
create or replace function public.tax_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_table_name = 'tax_settings' then
    new.gestor_email := nullif(lower(btrim(new.gestor_email)), '');
  elsif tg_table_name = 'tax_filings' then
    new.reference := nullif(btrim(new.reference), '');
    new.notes := nullif(btrim(new.notes), '');
    -- Filed: the day it was filed (today unless given); back to to-do: no filing day.
    if new.status = 'filed' then new.filed_on := coalesce(new.filed_on, current_date);
    elsif new.status in ('to_do', 'with_gestor') then new.filed_on := null;
    end if;
  else
    new.notes := nullif(btrim(new.notes), '');
    new.title := nullif(btrim(new.title), '');
    new.tags := coalesce(array(select distinct left(btrim(x), 40) from unnest(new.tags) x where btrim(x) <> '' order by 1), '{}');
    if tg_op = 'UPDATE' then
      -- Where the file is and who added it don't change; only what it is and when it's for.
      new.storage := old.storage; new.file_id := old.file_id; new.size := old.size; new.sha256 := old.sha256;
      new.uploaded_by := old.uploaded_by; new.uploaded_at := old.uploaded_at;
    end if;
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
