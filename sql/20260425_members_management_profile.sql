alter table if exists public.members
  add column if not exists is_active boolean not null default true;

alter table if exists public.members
  add column if not exists team text null;

alter table if exists public.members
  add column if not exists rank text null;

alter table if exists public.members
  add column if not exists include_in_operational_dashboards boolean not null default true;

alter table if exists public.members
  add column if not exists note text null;

update public.members
set
  team = coalesce(nullif(team,''),'System'),
  rank = coalesce(nullif(rank,''),'N/A'),
  include_in_operational_dashboards = false,
  note = coalesce(nullif(note,''),'시스템/테스트 계정')
where lower(coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(auth_user_id,'')) ~ '(projectschedule|system|test)';
