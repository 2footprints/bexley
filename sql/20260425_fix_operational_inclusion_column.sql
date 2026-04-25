alter table if exists public.members
  add column if not exists include_in_operational_dashboards boolean not null default true;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;
