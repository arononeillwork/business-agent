-- Staff kitty: what goes in each month is now a share of what the café takes above its breakeven, day by
-- day (the cost of running it that day: the running costs on Finances spread over the open days, plus the
-- team on the rota), rather than a share of the month's profit. 10% to start: Easy Beans' 5% becomes 10%,
-- and a new business starts at 10%. A month's share is still one kitty entry (kind 'profit', its month
-- and percent), so nothing else changes; the app works the figure out (shared/dailyCost.ts).
alter table public.kitty_settings alter column profit_percent set default 10;
update public.kitty_settings set profit_percent = 10 where business_id = 1 and profit_percent = 5;
comment on column public.kitty_settings.profit_percent is
  'The share (%) of each day''s takings above its breakeven that goes in the staff kitty, put in month by month.';
