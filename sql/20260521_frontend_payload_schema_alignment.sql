-- Align Supabase tables with fields currently sent by the frontend.
-- Safe to re-run: every column is guarded with IF NOT EXISTS.

create extension if not exists pgcrypto;

alter table if exists public.clients
  add column if not exists industry text,
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists memo text,
  add column if not exists portal_email text,
  add column if not exists portal_password text,
  add column if not exists onedrive_url text,
  add column if not exists address text,
  add column if not exists representative_name text,
  add column if not exists business_number text,
  add column if not exists fiscal_year_end_month integer,
  add column if not exists assigned_team text,
  add column if not exists tags text[] default '{}'::text[],
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.projects
  add column if not exists type text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists status text,
  add column if not exists estimated_hours numeric,
  add column if not exists actual_hours numeric,
  add column if not exists priority text default 'medium',
  add column if not exists client_id uuid,
  add column if not exists contract_id uuid,
  add column if not exists is_billable boolean default true,
  add column if not exists billing_status text,
  add column if not exists billing_amount numeric,
  add column if not exists billing_note text,
  add column if not exists billing_status_changed_at timestamptz,
  add column if not exists memo text,
  add column if not exists project_code text,
  add column if not exists actual_end_date date,
  add column if not exists result_summary text,
  add column if not exists work_summary text,
  add column if not exists issue_note text,
  add column if not exists follow_up_needed boolean default false,
  add column if not exists follow_up_note text,
  add column if not exists customer_satisfaction integer,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.project_tasks
  add column if not exists description text,
  add column if not exists status text default '예정',
  add column if not exists priority text,
  add column if not exists owner_member_id uuid,
  add column if not exists assignee_member_id uuid,
  add column if not exists start_date date,
  add column if not exists due_date date,
  add column if not exists actual_done_at timestamptz,
  add column if not exists progress_percent integer default 0,
  add column if not exists sort_order integer default 0,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.project_issues
  add column if not exists project_id uuid,
  add column if not exists task_id uuid,
  add column if not exists title text,
  add column if not exists content text,
  add column if not exists status text default 'open',
  add column if not exists priority text default 'medium',
  add column if not exists category text,
  add column if not exists owner_member_id uuid,
  add column if not exists owner_name text,
  add column if not exists assignee_member_id uuid,
  add column if not exists assignee_name text,
  add column if not exists estimated_hours numeric,
  add column if not exists due_date date,
  add column if not exists waiting_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text,
  add column if not exists is_pinned boolean default false,
  add column if not exists author_name text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.project_outputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.project_tasks(id) on delete set null,
  title text,
  onedrive_url text,
  memo text,
  share_in_weekly_review boolean default true,
  week_start date,
  author_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists public.project_outputs
  add column if not exists project_id uuid,
  add column if not exists task_id uuid,
  add column if not exists title text,
  add column if not exists onedrive_url text,
  add column if not exists memo text,
  add column if not exists share_in_weekly_review boolean default true,
  add column if not exists week_start date,
  add column if not exists author_id uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_project_outputs_week_start
  on public.project_outputs(week_start, created_at desc);

create index if not exists idx_project_outputs_project_id
  on public.project_outputs(project_id);

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  week_start date,
  member_id uuid,
  member_name text,
  content text,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists public.weekly_reviews
  add column if not exists week_start date,
  add column if not exists member_id uuid,
  add column if not exists member_name text,
  add column if not exists content text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_weekly_reviews_week_start
  on public.weekly_reviews(week_start, created_at desc);

create index if not exists idx_clients_assigned_team
  on public.clients(assigned_team);

select pg_notify('pgrst', 'reload schema');
