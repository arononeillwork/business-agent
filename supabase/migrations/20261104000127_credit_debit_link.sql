-- Credit & debit: each item can keep a link to a web page about it (the listing of something for
-- sale, a loan's agreement), opened from the Credit & debit page. A web address (http or https) of up
-- to 500 characters, as isMoneyLink() in shared/creditDebit.ts checks; the page and the AI tools
-- already read every column, so nothing else changes for them.

alter table public.credit_debit_items
  add column link text check (link is null or (link ~* '^https?://[^[:space:]]+$' and char_length(link) <= 500));

-- Easy Beans (business 1): the coffee machine it's selling links to its Done Deal España listing. The
-- one item whose name says coffee or espresso machine (cafetera), something to sell first, then money
-- coming in, then one not settled; with none, or one with a link already, nothing changes.
update public.credit_debit_items
   set link = 'https://donedealespana.vercel.app/#/item/207afb06-86e1-406a-9db3-9b60ac5ccd36'
 where id = (select i.id from public.credit_debit_items i
              where i.business_id = 1 and i.name ~* '(coffee|espresso)\s+machine|cafetera|m[aá]quina\s+de\s+caf[eé]'
              order by (i.kind = 'sale') desc, (i.direction = 'credit') desc, i.done, i.created_at
              limit 1)
   and link is null;
