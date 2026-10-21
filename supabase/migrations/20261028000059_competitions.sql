-- Competitions (Marketing): giveaways, draws and contests the business runs on Instagram, in the
-- café or by email, each with its prize (a shop item from Stock, or anything else), how people enter,
-- its bases legales and captions, and its entries (commenters pasted from Instagram, customers who
-- said yes to marketing, slips from the jar). The draw picks the winners and reserves at random.
-- Who: admins.

create table public.competitions (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 120),
  kind            text not null default 'custom'
                  check (kind in ('instagram_giveaway', 'email_draw', 'photo_contest', 'name_a_drink', 'in_cafe', 'quiz', 'referral', 'sports_prediction', 'custom')),
  -- Where it runs.
  channels        text[] not null default '{}'
                  check (channels <@ array['instagram', 'facebook', 'tiktok', 'in_cafe', 'website', 'email', 'whatsapp']),
  -- Drawn: the winners are picked (only the draw sets it). Closed: over, kept for the record.
  status          text not null default 'draft' check (status in ('draft', 'scheduled', 'live', 'drawn', 'closed')),
  starts_on       date check (starts_on between '2000-01-01' and '2101-01-01'),
  -- The last day to enter.
  ends_on         date check (ends_on between '2000-01-01' and '2101-01-01'),
  draw_on         date check (draw_on between '2000-01-01' and '2101-01-01'),
  prize           text check (char_length(prize) <= 200),
  -- What it's worth, IVA included (over €300 the business pays IRPF on it).
  prize_value     numeric(10, 2) check (prize_value >= 0),
  -- A shop or stock item given as the prize: giving it takes it off the stock.
  prize_item_id   uuid references public.stock_items on delete set null,
  winners         int not null default 1 check (winners between 1 and 50),
  reserves        int not null default 2 check (reserves between 0 and 20),
  -- What people do to enter, step by step.
  how_to_enter    text[] not null default '{}' check (cardinality(how_to_enter) <= 10),
  -- Who can enter: {min_age, spain_only, one_entry_per_person, marketing_signup}.
  rules           jsonb not null default '{}' check (jsonb_typeof(rules) = 'object'),
  -- The bases legales, as edited.
  terms           text check (char_length(terms) <= 20000),
  -- The post, in English and Spanish (Instagram allows 2,200 characters).
  caption         text check (char_length(caption) <= 2200),
  caption_es      text check (char_length(caption_es) <= 2200),
  notes           text check (char_length(notes) <= 2000),
  -- Set by the draw: when, by whom, and how many valid entries it drew from.
  drawn_at        timestamptz,
  drawn_by        uuid references auth.users on delete set null,
  entry_count     int check (entry_count >= 0),
  -- When the winners had their prizes.
  prize_given_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users on delete set null default auth.uid(),
  constraint competitions_dates check ((starts_on is null or ends_on is null or ends_on >= starts_on)
                                       and (ends_on is null or draw_on is null or draw_on >= ends_on)),
  constraint competitions_drawn check (status <> 'drawn' or drawn_at is not null)
);
create index competitions_dates_idx on public.competitions (ends_on) where status <> 'closed';

create table public.competition_entries (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.competitions on delete cascade,
  name            text check (char_length(name) <= 120),
  -- Instagram or TikTok username, without the @.
  handle          text check (handle ~ '^[a-z0-9._]{1,30}$'),
  email           text check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone           text check (char_length(phone) <= 30),
  source          text not null default 'manual' check (source in ('manual', 'instagram_paste', 'customers', 'csv', 'in_cafe')),
  customer_id     uuid references public.customers on delete set null,
  -- False: left out of the draw (a duplicate account, a rule not met), with why in the note.
  valid           boolean not null default true,
  note            text check (char_length(note) <= 300),
  -- Set by the draw: 1 to the number of winners are the winners, then the reserves in order.
  rank            int check (rank >= 1),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users on delete set null default auth.uid(),
  constraint competition_entries_someone check (coalesce(name, handle, email, phone) is not null)
);
-- Each person once: the same username, or the same email, is one entry.
create unique index competition_entries_handle_key on public.competition_entries (competition_id, lower(handle)) where handle is not null;
create unique index competition_entries_email_key on public.competition_entries (competition_id, lower(email)) where email is not null;
create index competition_entries_rank_idx on public.competition_entries (competition_id, rank) where rank is not null;
create index competition_entries_customer_idx on public.competition_entries (customer_id);

-- Tidy what's typed; what the draw sets (when, who, the ranks) changes only through the draw.
create or replace function public.competition_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare v_drawing boolean := current_setting('competitions.drawing', true) is not distinct from 'on';
begin
  if tg_table_name = 'competitions' then
    new.name := btrim(new.name);
    new.prize := nullif(btrim(new.prize), '');
    new.terms := nullif(btrim(new.terms), '');
    new.caption := nullif(btrim(new.caption), '');
    new.caption_es := nullif(btrim(new.caption_es), '');
    new.notes := nullif(btrim(new.notes), '');
    new.how_to_enter := coalesce(array(select btrim(s) from unnest(new.how_to_enter) with ordinality u(s, i)
                                        where btrim(s) <> '' order by i), '{}');
    new.channels := coalesce(array(select distinct c from unnest(new.channels) c order by c), '{}');
    new.rules := '{"min_age": 18, "spain_only": true, "one_entry_per_person": true, "marketing_signup": false}'::jsonb || coalesce(new.rules, '{}');
    if not v_drawing then
      if tg_op = 'INSERT' then
        new.drawn_at := null; new.drawn_by := null; new.entry_count := null;
      else
        new.drawn_at := old.drawn_at; new.drawn_by := old.drawn_by; new.entry_count := old.entry_count;
      end if;
      if new.status = 'drawn' and new.drawn_at is null then
        raise exception 'Draw the winners first' using errcode = '22023';
      end if;
      -- Drawn stays drawn (or closed): the winners can't be undone by moving it back.
      if new.drawn_at is not null and new.status not in ('drawn', 'closed') then new.status := 'drawn'; end if;
    end if;
    if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  else
    new.name := nullif(regexp_replace(btrim(new.name), '\s+', ' ', 'g'), '');
    new.handle := nullif(lower(regexp_replace(btrim(new.handle), '^@', '')), '');
    new.email := nullif(lower(btrim(new.email)), '');
    new.phone := nullif(regexp_replace(btrim(new.phone), '\s+', ' ', 'g'), '');
    new.note := nullif(btrim(new.note), '');
    if not v_drawing then
      if tg_op = 'INSERT' then
        new.rank := null;
        if exists (select 1 from public.competitions where id = new.competition_id and drawn_at is not null) then
          raise exception 'The draw is done: no more entries' using errcode = '22023';
        end if;
      else
        new.rank := old.rank;
        new.competition_id := old.competition_id;
      end if;
    end if;
    if tg_op = 'UPDATE' then new.created_at := old.created_at; new.created_by := old.created_by; end if;
  end if;
  return new;
end $$;

create trigger competitions_rules before insert or update on public.competitions for each row execute function public.competition_rules();
create trigger competition_entries_rules before insert or update on public.competition_entries for each row execute function public.competition_rules();
create trigger audit_competitions after insert or update or delete on public.competitions for each row execute function public.audit_row();
create trigger audit_competition_entries after insert or update or delete on public.competition_entries for each row execute function public.audit_row();

alter table public.competitions enable row level security;
alter table public.competition_entries enable row level security;
revoke all on public.competitions, public.competition_entries from anon;
create policy competitions_admin on public.competitions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy competition_entries_admin on public.competition_entries for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- The draw: the winners and then the reserves, picked at random from the valid entries
-- (gen_random_uuid() is drawn from the strong random source), once. Runs as the person drawing,
-- so only admins can. Returns how many were picked.
create or replace function public.draw_competition(p_id uuid) returns int
language plpgsql set search_path = ''
as $$
declare v_c record; v_valid int; v_picked int;
begin
  select * into v_c from public.competitions where id = p_id for update;
  if not found then raise exception 'No such competition' using errcode = 'P0002'; end if;
  if v_c.drawn_at is not null then raise exception 'It has already been drawn' using errcode = '22023'; end if;
  select count(*) into v_valid from public.competition_entries where competition_id = p_id and valid;
  if v_valid = 0 then raise exception 'There are no entries to draw from' using errcode = '22023'; end if;
  perform set_config('competitions.drawing', 'on', true);
  update public.competition_entries e set rank = r.rk
    from (select id, row_number() over (order by gen_random_uuid()) rk
            from public.competition_entries where competition_id = p_id and valid) r
   where e.id = r.id and r.rk <= v_c.winners + v_c.reserves;
  get diagnostics v_picked = row_count;
  update public.competitions set drawn_at = now(), drawn_by = auth.uid(), entry_count = v_valid, status = 'drawn' where id = p_id;
  perform set_config('competitions.drawing', '', true);
  return v_picked;
end $$;
revoke execute on function public.draw_competition(uuid) from public, anon;
grant execute on function public.draw_competition(uuid) to authenticated;
