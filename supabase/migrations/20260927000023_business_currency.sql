-- business.currency (from the start, EUR) is now chosen on the Business page: keep it a real ISO 4217 code.
alter table public.business add constraint business_currency_iso check (currency ~ '^[A-Z]{3}$');
