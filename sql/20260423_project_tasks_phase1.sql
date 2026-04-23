create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text null,
  status text not null default '예정',
  priority text null,
  owner_member_id uuid null references public.members(id) on delete set null,
  assignee_member_id uuid null references public.members(id) on delete set null,
  start_date date null,
  due_date date null,
  actual_done_at timestamptz null,
  progress_percent integer null default 0,
  sort_order integer null default 0,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_tasks_status_check check (status in ('예정','진행중','대기','완료','보류')),
  constraint project_tasks_progress_check check (
    progress_percent is null or (progress_percent >= 0 and progress_percent <= 100)
  )
);

create index if not exists idx_project_tasks_project_id
  on public.project_tasks(project_id, sort_order, created_at);
