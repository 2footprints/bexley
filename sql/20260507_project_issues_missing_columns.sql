-- Add missing columns to project_issues
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS estimated_hours numeric;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS waiting_reason text;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS resolved_by text;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS owner_member_id uuid;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS assignee_member_id uuid;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS assignee_name text;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS due_date date;
