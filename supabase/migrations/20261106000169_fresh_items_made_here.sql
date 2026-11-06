-- Freshly made (Stock): the menu's perishables now show on Made here by themselves (its bakery, cakes,
-- chia puddings and parfaits, worked out from each item's name and section: shared/freshBatches.ts), so
-- one an admin takes off the list has to stay off. made_here false: on the menu, but not on the list;
-- the menu doesn't put it back, and Square's "Shelf life" only keeps its shelf life up to date (before,
-- an item of Square's taken off the list came back with the next read). Adding it again puts it back.
-- Who changes it: admins, as the rest of the row (the `fresh_items` migration's policies).

alter table public.fresh_items add column made_here boolean not null default true;
