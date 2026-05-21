-- Checklist templates MVP for repeatable project work.
-- Safe to re-run: tables, columns, indexes, and policies are guarded.

create extension if not exists pgcrypto;

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_type text,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.checklist_templates(id) on delete cascade,
  section text,
  title text not null,
  description text,
  sort_order integer default 0,
  is_required boolean default false,
  weight numeric default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.project_checklists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  template_id uuid references public.checklist_templates(id) on delete set null,
  status text default 'active',
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.project_checklist_items (
  id uuid primary key default gen_random_uuid(),
  project_checklist_id uuid references public.project_checklists(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  template_item_id uuid references public.checklist_template_items(id) on delete set null,
  section text,
  title text not null,
  status text default 'not_started',
  assignee_member_id uuid,
  completed_at timestamptz,
  completed_by uuid,
  memo text,
  sort_order integer default 0,
  is_required boolean default false,
  weight numeric default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_checklist_templates_service_type
  on public.checklist_templates(service_type, is_active);

create index if not exists idx_checklist_template_items_template_id
  on public.checklist_template_items(template_id, sort_order);

create index if not exists idx_project_checklists_project_id
  on public.project_checklists(project_id, status);

create index if not exists idx_project_checklist_items_project_id
  on public.project_checklist_items(project_id, sort_order);

create index if not exists idx_project_checklist_items_checklist_id
  on public.project_checklist_items(project_checklist_id, sort_order);

alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;
alter table public.project_checklists enable row level security;
alter table public.project_checklist_items enable row level security;

grant select, insert, update on public.checklist_templates to authenticated;
grant select, insert, update on public.checklist_template_items to authenticated;
grant select, insert, update on public.project_checklists to authenticated;
grant select, insert, update on public.project_checklist_items to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'checklist_templates'
      and policyname = 'checklist_templates_authenticated_select'
  ) then
    create policy checklist_templates_authenticated_select
      on public.checklist_templates for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'checklist_templates'
      and policyname = 'checklist_templates_authenticated_insert'
  ) then
    create policy checklist_templates_authenticated_insert
      on public.checklist_templates for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'checklist_templates'
      and policyname = 'checklist_templates_authenticated_update'
  ) then
    create policy checklist_templates_authenticated_update
      on public.checklist_templates for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'checklist_template_items'
      and policyname = 'checklist_template_items_authenticated_select'
  ) then
    create policy checklist_template_items_authenticated_select
      on public.checklist_template_items for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'checklist_template_items'
      and policyname = 'checklist_template_items_authenticated_insert'
  ) then
    create policy checklist_template_items_authenticated_insert
      on public.checklist_template_items for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'checklist_template_items'
      and policyname = 'checklist_template_items_authenticated_update'
  ) then
    create policy checklist_template_items_authenticated_update
      on public.checklist_template_items for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_checklists'
      and policyname = 'project_checklists_authenticated_select'
  ) then
    create policy project_checklists_authenticated_select
      on public.project_checklists for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_checklists'
      and policyname = 'project_checklists_authenticated_insert'
  ) then
    create policy project_checklists_authenticated_insert
      on public.project_checklists for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_checklists'
      and policyname = 'project_checklists_authenticated_update'
  ) then
    create policy project_checklists_authenticated_update
      on public.project_checklists for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_checklist_items'
      and policyname = 'project_checklist_items_authenticated_select'
  ) then
    create policy project_checklist_items_authenticated_select
      on public.project_checklist_items for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_checklist_items'
      and policyname = 'project_checklist_items_authenticated_insert'
  ) then
    create policy project_checklist_items_authenticated_insert
      on public.project_checklist_items for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_checklist_items'
      and policyname = 'project_checklist_items_authenticated_update'
  ) then
    create policy project_checklist_items_authenticated_update
      on public.project_checklist_items for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
