-- Customers who earn credit (Sales reps & rewards: a customer who posts about the café, or brings
-- people in with their card) have it on Square too, so the team finds them on the Square till with
-- their balance there: each gets a Square customer (theirs when they're linked to one already) with a
-- digital gift card on file, and every line of credit is on that card. The Worker does it every 15
-- minutes (worker/squareReps.ts):
--   * credit earned or used in the app goes onto the card, one gift card activity per ledger line
--     (square_pushed_at), so a line is never added or taken off twice;
--   * what's spent with the card at the Square till comes back as credit used (square_activity_id).
-- The ledger stays the one record of a rep's credit; the card follows it.

alter table public.sales_reps
  add column square_customer_id text check (char_length(square_customer_id) <= 191),
  add column square_gift_card_id text check (char_length(square_gift_card_id) <= 191),
  -- When the Worker last brought them up to date on Square, and what stopped it (null: nothing).
  add column square_synced_at timestamptz,
  add column square_error text check (char_length(square_error) <= 500);

alter table public.rep_rewards
  -- When this line's credit went onto the rep's Square gift card (or came off it).
  add column square_pushed_at timestamptz,
  -- Credit used at the Square till: the gift card activity it was, as Square named it.
  add column square_activity_id text check (char_length(square_activity_id) <= 191);
create unique index rep_rewards_square_activity_key on public.rep_rewards (business_id, square_activity_id);
create index rep_rewards_unpushed_idx on public.rep_rewards (business_id, rep_id, created_at) where square_pushed_at is null and status = 'approved';
