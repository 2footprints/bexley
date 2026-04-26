alter table if exists public.members
  add column if not exists is_active boolean;

alter table if exists public.members
  add column if not exists role text;

alter table if exists public.members
  add column if not exists team text;

alter table if exists public.members
  add column if not exists rank text;

alter table if exists public.members
  add column if not exists include_in_operational_dashboards boolean;

alter table if exists public.members
  add column if not exists note text;

alter table if exists public.members
  alter column is_active set default true;

alter table if exists public.members
  alter column role set default 'Member';

alter table if exists public.members
  alter column team set default 'Unassigned';

alter table if exists public.members
  alter column rank set default 'N/A';

alter table if exists public.members
  alter column include_in_operational_dashboards set default true;

update public.members as m
set
  is_active = coalesce(m.is_active, true),
  role = coalesce(nullif(m.role,''), initcap(coalesce(ur.role,'Member'))),
  team = coalesce(nullif(m.team,''), 'Unassigned'),
  rank = coalesce(nullif(m.rank,''), 'N/A'),
  include_in_operational_dashboards = coalesce(m.include_in_operational_dashboards, true),
  note = nullif(m.note,'')
from public.user_roles as ur
where ur.id = m.auth_user_id;

update public.members
set
  is_active = coalesce(is_active, true),
  role = coalesce(nullif(role,''), 'Member'),
  team = coalesce(nullif(team,''), 'Unassigned'),
  rank = coalesce(nullif(rank,''), 'N/A'),
  include_in_operational_dashboards = coalesce(include_in_operational_dashboards, true),
  note = nullif(note,'')
where true;

alter table if exists public.members
  alter column is_active set not null;

alter table if exists public.members
  alter column include_in_operational_dashboards set not null;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;
