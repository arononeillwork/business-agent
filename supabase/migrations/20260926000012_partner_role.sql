-- Partners: people from outside businesses (accountant, supplier, franchise partner) who log in
-- to see part of Easy Beans. Kept in its own migration: a new enum value can't be used in the
-- transaction that adds it.
alter type public.app_role add value if not exists 'partner';
