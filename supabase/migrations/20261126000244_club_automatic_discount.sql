-- The coffee club's free coffee applied by Square itself (Sales → Coffee club → "Square applies the free coffee by
-- itself"). The Worker makes, in Square: a customer group of the members whose coffee is due this week, a discount of
-- its own (the whole drink, up to the club's most), the drinks it covers (a product set of the categories chosen, one
-- drink a sale) and a pricing rule tying them together, which Square applies by itself to a sale whose customer is in
-- the group. It keeps the group right: a member is in it while in good standing with a coffee left this week, taken
-- out once it's had, put back on Monday (worker/coffeeClub.ts). The club's own discount stays, for the team to apply
-- by hand. Off: the pricing rule goes; the group stays, no longer kept.

alter table public.coffee_club
  add column auto_discount boolean not null default false,
  -- Square categories (their ids) whose drinks the automatic discount covers.
  add column auto_category_ids text[] not null default '{}' check (cardinality(auto_category_ids) <= 50),
  add column square_group_id text check (char_length(square_group_id) <= 191),
  add column square_auto_discount_id text check (char_length(square_auto_discount_id) <= 191),
  add column square_product_set_id text check (char_length(square_product_set_id) <= 191),
  add column square_pricing_rule_id text check (char_length(square_pricing_rule_id) <= 191),
  add constraint coffee_club_auto_drinks check (not auto_discount or cardinality(auto_category_ids) > 0);

-- Whether the member's Square customer is in the group now, as the Worker last left it (so it's only changed when it
-- has to be).
alter table public.coffee_club_members
  add column in_square_group boolean not null default false;
