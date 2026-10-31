-- Suppliers: where their invoices come from by email. A supplier's invoices often come from an address
-- that isn't its contact email (G&M Cash & Carry's from Transgourmet's no-reply@transgourmet.es), so a
-- supplier can list the addresses or domains its invoices are sent from; Invoices → From email then
-- matches those emails to it and searches the mailbox for them. Up to 10, each an email address or a
-- domain, kept lower case.
alter table public.suppliers add column invoice_from text[] not null default '{}'
  check (cardinality(invoice_from) <= 10
         and array_to_string(invoice_from, ' ') ~ '^(([^@\s]+@)?[a-z0-9-]+(\.[a-z0-9-]+)+( |$))*$');

-- Easy Beans (business 1): the suppliers no longer bought from go to the catalogue (archived, kept on
-- file): By Eric, Leo Foods, Lifestyle Customization, Pan Bendito Bakehouse, Santa Roaster and Yomilook.
update public.suppliers set active = false
 where business_id = 1 and active
   and lower(btrim(name)) in ('by eric', 'leo foods', 'lifestyle customization', 'pan bendito bakehouse', 'santa roaster', 'yomilook', 'tomilook');

-- And where the active ones' invoices are emailed from, as found in the café's mailbox (October 2026):
-- G&M Cash & Carry's "FACTURA GM CASH …" from Transgourmet, Complementos del Café's from its accounts.
update public.suppliers set invoice_from = array['no-reply@transgourmet.es', 'transgourmet.es']
 where business_id = 1 and name ~* '^\s*g\s*&?\s*m\s+cash' and invoice_from = '{}';
update public.suppliers set invoice_from = array['complementosdelcafe.com']
 where business_id = 1 and name ~* '^\s*complementos\s*del\s*cafe' and invoice_from = '{}';
update public.suppliers set invoice_from = array['moberryacai.com']
 where business_id = 1 and name ~* '^\s*moberry' and invoice_from = '{}';
