-- Add status lifecycle fields for weekly review snapshots.
-- Safe to re-run: columns are guarded with IF NOT EXISTS.

alter table public.weekly_review_snapshots
add column if not exists status text default 'draft';

update public.weekly_review_snapshots
set status = 'draft'
where status is null;

alter table public.weekly_review_snapshots
add column if not exists finalized_at timestamptz;

alter table public.weekly_review_snapshots
add column if not exists finalized_by uuid;

alter table public.weekly_review_snapshots
add column if not exists discarded_at timestamptz;

alter table public.weekly_review_snapshots
add column if not exists discarded_by uuid;

create index if not exists idx_weekly_review_snapshots_status
  on public.weekly_review_snapshots(status);

select pg_notify('pgrst', 'reload schema');
