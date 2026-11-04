-- Company values: what the business stands for and how the team behaves (a line each, some with a point
-- under them), and the words nobody says in the café; each in English and Spanish, read in the language
-- each person uses the app in.
-- Who: the team reads them; admins change them. Partners and the café tablet see none.

create table public.company_values (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('value', 'word')),
  -- The value it's a point under; points have no points, and words have none.
  parent_id   uuid references public.company_values on delete cascade,
  text_en     text check (char_length(text_en) between 1 and 300),
  text_es     text check (char_length(text_es) between 1 and 300),
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid(),
  constraint company_values_words check (text_en is not null or text_es is not null),
  constraint company_values_word_alone check (kind = 'value' or parent_id is null)
);
select public.add_business_scope('public.company_values');
create index company_values_parent_id_idx on public.company_values (parent_id);
create index company_values_updated_by_idx on public.company_values (updated_by);

-- Tidy what's typed (a blank language is none); a point goes under a value of the same business, and
-- isn't one with points of its own. With the caller's rights, filtered by the row's business for the Worker.
create or replace function public.company_value_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.text_en := nullif(btrim(new.text_en), '');
  new.text_es := nullif(btrim(new.text_es), '');
  if new.text_en is null and new.text_es is null then
    raise exception 'Write it in English or Spanish' using errcode = '22023';
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id or not exists (select 1 from public.company_values p
         where p.id = new.parent_id and p.business_id = new.business_id and p.kind = 'value' and p.parent_id is null) then
      raise exception 'A point goes under one of the values' using errcode = '22023';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.company_values x where x.parent_id = new.id) then
      raise exception 'A value with points can''t be a point itself' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    if new.kind <> old.kind and exists (select 1 from public.company_values x where x.parent_id = new.id) then
      raise exception 'A value with points stays a value' using errcode = '22023';
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger company_values_rules before insert or update on public.company_values for each row execute function public.company_value_rules();
create trigger audit_company_values after insert or update or delete on public.company_values for each row execute function public.audit_row();

alter table public.company_values enable row level security;
revoke all on public.company_values from anon;
create policy company_values_read on public.company_values for select to authenticated using ((select public.is_staff()));
create policy company_values_admin on public.company_values for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Easy Beans (business 1): the owners' own values, and the words nobody says
-- ---------------------------------------------------------------------------
-- shared/companyValues.ts has the same; its test checks the two agree. Only when Easy Beans has none
-- yet, and without business 1 nothing at all.
do $$
declare
  v_values constant jsonb := $json$
{
  "values": [
    {"en": "Good energy in the café only: leave bad energy away from the café.", "es": "Solo buena energía en el café: la mala energía, fuera del café.", "points": [
      {"en": "There’s always someone having a worse day than you.", "es": "Siempre hay alguien que está teniendo un día peor que tú."}
    ]},
    {"en": "Greet every customer with a smile (even grumpy ones like Aron).", "es": "Recibe a cada cliente con una sonrisa (incluso a los gruñones como Aron)."},
    {"en": "You can always do your job better. Perfect doesn’t exist.", "es": "Siempre puedes hacer tu trabajo mejor. La perfección no existe."},
    {"en": "Upskill during and outside of working hours: for example, learning English or Spanish.", "es": "Sigue aprendiendo dentro y fuera del horario de trabajo: por ejemplo, inglés o español."},
    {"en": "No cursing allowed (for Aron mainly).", "es": "Prohibido decir palabrotas (sobre todo para Aron)."},
    {"en": "Never take anything for granted (for example, Aron’s first job was for 3 euros an hour).", "es": "Nunca des nada por sentado (por ejemplo, el primer trabajo de Aron fue por 3 euros la hora)."}
  ],
  "words": [
    {"en": "Horrible", "es": "Horrible"},
    {"en": "Stupido", "es": "Estúpido"}
  ]
}
$json$;
  v_kind text;
  v_item record;
  v_point record;
  v_id uuid;
begin
  if not exists (select 1 from public.business where id = 1) then return; end if;
  if exists (select 1 from public.company_values where business_id = 1) then return; end if;
  foreach v_kind in array array['value', 'word'] loop
    for v_item in select value as x, ordinality as n from jsonb_array_elements(v_values -> (v_kind || 's')) with ordinality loop
      insert into public.company_values (business_id, kind, text_en, text_es, sort)
      values (1, v_kind, v_item.x ->> 'en', v_item.x ->> 'es', v_item.n)
      returning id into v_id;
      for v_point in select value as x, ordinality as n from jsonb_array_elements(coalesce(v_item.x -> 'points', '[]')) with ordinality loop
        insert into public.company_values (business_id, kind, parent_id, text_en, text_es, sort)
        values (1, v_kind, v_id, v_point.x ->> 'en', v_point.x ->> 'es', v_point.n);
      end loop;
    end loop;
  end loop;
end $$;
