-- A pet's photo, zoomed in: how far (1 to 3 times) and on which point (across and down, 0 to 100%), set
-- in the pet's dialog (People, My account) and kept beside the photo, which stays as it was. Easy Beans'
-- Cooper and Yoda (business 1), whose dogs are small in their photos, start zoomed in on the middle.

alter table public.pets
  add column photo_zoom numeric(3, 2) not null default 1 check (photo_zoom between 1 and 3),
  add column photo_x smallint not null default 50 check (photo_x between 0 and 100),
  add column photo_y smallint not null default 50 check (photo_y between 0 and 100);

update public.pets set photo_zoom = 1.6
 where business_id = 1 and name in ('Cooper', 'Yoda') and photo is not null and photo_zoom = 1;
