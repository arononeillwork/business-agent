-- Brand guidelines (Edition 01): positions use the brand palette; new people get the deep rose.
alter table public.profiles alter column colour set default '#A85A68';
alter table public.positions alter column colour set default '#C6C2BB';
update public.positions set colour = case name
  when 'Barista' then '#F79BA4' when 'Kitchen' then '#6B8E4E'
  when 'Cleaner' then '#C6C2BB' when 'Propietario' then '#B7A3D8' else colour end;
update public.profiles set colour = '#A85A68' where colour = '#8d6e63';
