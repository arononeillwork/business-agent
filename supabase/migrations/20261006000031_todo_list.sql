-- To Do List: the business's jobs, filed under categories the admins add and remove.
-- Everyone on the team (admins and employees) can see, add, tick off and rearrange jobs;
-- only admins change the categories. No priorities: the categories are the grouping.

create table public.todo_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  hint        text check (hint is null or char_length(hint) <= 80),
  colour      text not null default '#8A7E76' check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  sort        double precision not null default 0,
  created_at  timestamptz not null default now()
);
create unique index todo_categories_name_key on public.todo_categories (lower(btrim(name)));

create table public.todos (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 1 and 500),
  -- Removing a category keeps its jobs; they show under "No category" until refiled.
  category_id  uuid references public.todo_categories on delete set null,
  -- An optional sub-heading inside a category, e.g. the Square jobs under "Square".
  section      text check (section is null or char_length(section) <= 100),
  assignee_id  uuid references public.profiles on delete set null,
  done         boolean not null default false,
  done_at      timestamptz,
  starred      boolean not null default false,
  pinned       boolean not null default false,
  -- Shared manual order. Fractional, so a dragged job takes one update.
  position     double precision not null default 0,
  created_by   uuid references auth.users on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index todos_category_idx on public.todos (category_id);

create or replace function public.todo_touch() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.section := nullif(btrim(new.section), '');
  if new.done and (tg_op = 'INSERT' or not old.done) then new.done_at := now(); end if;
  if not new.done then new.done_at := null; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger todos_touch before insert or update on public.todos
  for each row execute function public.todo_touch();

alter table public.todo_categories enable row level security;
alter table public.todos enable row level security;
revoke all on public.todo_categories, public.todos from anon;

create policy todo_categories_read on public.todo_categories for select to authenticated
  using ((select public.is_staff()));
create policy todo_categories_admin on public.todo_categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy todos_team on public.todos for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- Starting categories (admins rename, add and remove them on the page).
insert into public.todo_categories (name, hint, colour, sort) values
  ('Legal & money',    'Contracts, licences, insurance, bills', '#2F4C73', 1),
  ('People',           'Roles, reviews, standards, hiring, pay', '#21907F', 2),
  ('Shop',             'The space: fit-out, repairs, cleaning',  '#D46A2E', 3),
  ('Buying',           'Stock, packaging, equipment',            '#C2961C', 4),
  ('Food & drink',     'Menu, recipes, ingredients, prep',       '#4F8A3F', 5),
  ('Tech & till',      'Till, wifi, TV, website',                '#4B4FB0', 6),
  ('Design',           'Menus, signage, branding, print',        '#7C52AE', 7),
  ('Social & content', 'Photos, videos, posts',                  '#2479A8', 8),
  ('Marketing',        'Events, collabs, outreach',              '#B23C78', 9),
  ('Future ideas',     'New business ideas for later',           '#6E7D1A', 10);
