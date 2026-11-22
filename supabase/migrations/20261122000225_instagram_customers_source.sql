-- The customers Square holds for the people who post about the café on Instagram (made for their
-- gift-card credit by worker/squareReps.ts) came into Customers from Square's directory as from
-- "Square". They came from Instagram: from now on the Worker brings them in that way, with their
-- Instagram name (worker/squareCustomers.ts); this puts right the ones already here. Only those still
-- marked as from Square change: where someone was typed in as coming from stays as it is.
-- The code live before this keeps working: nothing it reads or writes changes shape.

-- Linked to the rep by Square's customer: the rep's own Instagram name.
update public.customers c
   set source = 'instagram',
       instagram = coalesce(c.instagram, r.instagram)
  from public.sales_reps r
 where r.business_id = c.business_id
   and r.square_customer_id = c.square_id
   and r.instagram is not null
   and c.source = 'square';

-- Any others, by the note Square's customer was made with: "Posts about the café on Instagram (@name)."
update public.customers c
   set source = 'instagram',
       instagram = coalesce(c.instagram, substring(c.notes from '^Posts about the café on Instagram \(@([A-Za-z0-9._]{1,30})\)'))
 where c.source = 'square'
   and c.notes ~ '^Posts about the café on Instagram \(@[A-Za-z0-9._]{1,30}\)';
