-- Square PINs (Leaderboard): each person's Square Point of Sale passcode, typed in by an owner as it is in
-- the Square Dashboard (Square's API can neither read nor set passcodes). Encrypted by the Worker with the
-- integration key before it gets here (worker/squarePins.ts). Nobody signed in reads or writes the table:
-- the Worker shows owners (admins with pay access) everyone's and anyone else on the team only their own,
-- and writes each look, change and removal to the audit log itself, without the PIN. No audit trigger, so
-- the encrypted PIN is never copied into the log.

create table public.square_pins (
  profile_id  uuid not null references public.profiles on delete cascade,
  -- { "pin": "1234" }, sealed with the Worker's integration key (worker/crypto.ts).
  ciphertext  text not null check (char_length(ciphertext) between 1 and 1000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null
);
select public.add_business_scope('public.square_pins');
alter table public.square_pins add primary key (business_id, profile_id);
create index square_pins_profile_id_idx on public.square_pins (profile_id);
create index square_pins_updated_by_idx on public.square_pins (updated_by);

alter table public.square_pins enable row level security;
revoke all on public.square_pins from anon, authenticated;
