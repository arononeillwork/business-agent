-- Contacts: Easy Beans' lawyer, Eduardo Torquino, now with his email, as the owners gave it
-- (shared/contacts.ts has the same). Only when he's still there without one: an email an owner
-- typed in meanwhile stays.
update public.business_contacts
   set email = 'torquino71@gmail.com'
 where business_id = 1 and name = 'Eduardo Torquino' and email is null;
