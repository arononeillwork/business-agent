-- Easy Beans' opening hours (business 1), as the owner gave them: 9:00 to 15:00, Monday to Saturday,
-- closed on Sunday (the app had 8:00–18:00 on weekdays and Sunday 9:00–16:00). The calendar's theme days
-- and the cost of running the café each day follow them (no theme and no running costs on a closed day).
-- The peak (11:00–15:00) is inside them, so it stays.
update public.business
   set opening_hours = '{"mon": {"open": "09:00", "close": "15:00"}, "tue": {"open": "09:00", "close": "15:00"},
                        "wed": {"open": "09:00", "close": "15:00"}, "thu": {"open": "09:00", "close": "15:00"},
                        "fri": {"open": "09:00", "close": "15:00"}, "sat": {"open": "09:00", "close": "15:00"},
                        "sun": null}'::jsonb
 where id = 1
   and exists (select 1 from public.profiles where business_id = 1 and lower(email) = 'easybeanscafe@gmail.com');
