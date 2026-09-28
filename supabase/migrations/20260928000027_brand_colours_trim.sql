-- The brand keeps its main colours only: Rose Wash and Cream are no longer listed.
update public.brand
   set colours = coalesce((select jsonb_agg(c) from jsonb_array_elements(colours) c where c ->> 'name' not in ('Rose Wash', 'Cream')), '[]'::jsonb)
 where id = 1;
