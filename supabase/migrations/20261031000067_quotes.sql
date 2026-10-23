-- Quotes & estimates: what the business offers to do for a price, line by line with its IVA, until
-- it's accepted, declined or runs out. Numbered Q-<year>-001 on, one after another each year. A
-- quote for an enquiry moves it to quoted, and accepted makes it won (migration 66). Once accepted
-- it can go to Invoices as a sales invoice (invoice_id); issuing it needs invoicing software.
-- Who: admins.

create table public.quotes (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique check (number ~ '^Q-[0-9]{4}-[0-9]{3,}$'),
  customer_id   uuid references public.customers on delete set null,
  enquiry_id    uuid references public.enquiries on delete set null,
  title         text not null check (char_length(title) between 1 and 160),
  status        text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  issued_on     date check (issued_on between '2000-01-01' and '2101-01-01'),
  valid_until   date check (valid_until between '2000-01-01' and '2101-01-01'),
  -- [{description, quantity, unit_price (without IVA), vat_rate}]
  lines         jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 100),
  -- Off every line before IVA.
  discount_pct  numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  -- Shown on the quote: what's included, the deposit, how to accept.
  terms         text check (char_length(terms) <= 4000),
  -- Only for the team.
  notes         text check (char_length(notes) <= 2000),
  -- Worked out here from the lines.
  net           numeric(12, 2) not null default 0,
  vat           numeric(12, 2) not null default 0,
  total         numeric(12, 2) not null default 0,
  invoice_id    uuid references public.invoices on delete set null,
  created_by    uuid references auth.users on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint quotes_dates check (issued_on is null or valid_until is null or valid_until >= issued_on)
);
create index quotes_enquiry_idx on public.quotes (enquiry_id);

create or replace function public.quote_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare v_year text;
begin
  new.title := btrim(new.title);
  new.terms := nullif(btrim(new.terms), '');
  new.notes := nullif(btrim(new.notes), '');
  if exists (select 1 from jsonb_array_elements(new.lines) l
              where jsonb_typeof(l) <> 'object'
                 or coalesce(btrim(l ->> 'description'), '') = '' or char_length(l ->> 'description') > 300
                 or coalesce(jsonb_typeof(l -> 'quantity'), '') <> 'number' or (l ->> 'quantity')::numeric <= 0
                 or coalesce(jsonb_typeof(l -> 'unit_price'), '') <> 'number' or (l ->> 'unit_price')::numeric < 0
                 or coalesce(jsonb_typeof(l -> 'vat_rate'), '') <> 'number' or (l ->> 'vat_rate')::numeric not in (21, 10, 4, 0)) then
    raise exception 'Every line needs a description, a quantity above 0, a price of 0 or more and one of the IVA rates (21, 10, 4 or 0)';
  end if;
  -- Each line less the discount, the IVA at each rate, and the total (the app's sums: shared/quotes.ts).
  select coalesce(sum(n), 0), coalesce(sum(round(n * r / 100, 2)), 0) into new.net, new.vat
    from (select (l ->> 'vat_rate')::numeric r,
                 sum(round(round((l ->> 'quantity')::numeric * (l ->> 'unit_price')::numeric, 2) * (1 - new.discount_pct / 100), 2)) n
            from jsonb_array_elements(new.lines) l group by 1) x;
  new.total := new.net + new.vat;
  -- Sent: dated today unless given, and good for 30 days unless said.
  if new.status <> 'draft' then new.issued_on := coalesce(new.issued_on, current_date); end if;
  if new.status = 'sent' then new.valid_until := coalesce(new.valid_until, new.issued_on + 30); end if;
  -- For an enquiry: the enquiry's person unless another was picked.
  if new.customer_id is null and new.enquiry_id is not null then
    new.customer_id := (select customer_id from public.enquiries where id = new.enquiry_id);
  end if;
  if tg_op = 'INSERT' then
    v_year := extract(year from coalesce(new.issued_on, current_date))::text;
    new.number := 'Q-' || v_year || '-' || lpad((coalesce((select max(split_part(number, '-', 3)::int) from public.quotes
                                                          where split_part(number, '-', 2) = v_year), 0) + 1)::text, 3, '0');
  else
    new.number := old.number;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger quotes_rules before insert or update on public.quotes for each row execute function public.quote_rules();
create trigger audit_quotes after insert or update or delete on public.quotes for each row execute function public.audit_row();

-- The enquiry it's for moves on: quoted once a quote is made, won when one is accepted.
create or replace function public.quote_moves_enquiry() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.enquiry_id is null then return null; end if;
  if new.status = 'accepted' then
    update public.enquiries set stage = 'won' where id = new.enquiry_id and stage <> 'won';
  elsif tg_op = 'INSERT' or new.enquiry_id is distinct from old.enquiry_id then
    update public.enquiries set stage = 'quoted' where id = new.enquiry_id and stage in ('new', 'contacted');
  end if;
  return null;
end $$;
create trigger quotes_move_enquiry after insert or update of status, enquiry_id on public.quotes
  for each row execute function public.quote_moves_enquiry();

alter table public.quotes enable row level security;
revoke all on public.quotes from anon;
create policy quotes_admin on public.quotes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
