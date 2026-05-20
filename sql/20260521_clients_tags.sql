-- Add client tags used by the client create/edit and bulk tag UI.
alter table public.clients
add column if not exists tags text[] default '{}'::text[];

update public.clients
set tags = '{}'::text[]
where tags is null;
