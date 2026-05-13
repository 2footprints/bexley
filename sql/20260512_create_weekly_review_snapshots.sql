create extension if not exists pgcrypto;

create table if not exists public.weekly_review_snapshots (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  snapshot_json jsonb not null,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  snapshot_version integer not null default 1,
  base_date date null,
  note text null
);

create unique index if not exists weekly_review_snapshots_week_start_key
  on public.weekly_review_snapshots(week_start);

create index if not exists idx_weekly_review_snapshots_created_at
  on public.weekly_review_snapshots(created_at desc);

create or replace function public.set_weekly_review_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_weekly_review_snapshots_updated_at
  on public.weekly_review_snapshots;

create trigger trg_weekly_review_snapshots_updated_at
before update on public.weekly_review_snapshots
for each row
execute function public.set_weekly_review_snapshots_updated_at();

alter table public.weekly_review_snapshots enable row level security;

grant select, insert, update on public.weekly_review_snapshots to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_review_snapshots'
      and policyname = 'weekly_review_snapshots_authenticated_select'
  ) then
    execute 'create policy weekly_review_snapshots_authenticated_select
      on public.weekly_review_snapshots
      for select
      to authenticated
      using (true)';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_review_snapshots'
      and policyname = 'weekly_review_snapshots_authenticated_insert'
  ) then
    execute 'create policy weekly_review_snapshots_authenticated_insert
      on public.weekly_review_snapshots
      for insert
      to authenticated
      with check (true)';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_review_snapshots'
      and policyname = 'weekly_review_snapshots_authenticated_update'
  ) then
    execute 'create policy weekly_review_snapshots_authenticated_update
      on public.weekly_review_snapshots
      for update
      to authenticated
      using (true)
      with check (true)';
  end if;
end $$;
