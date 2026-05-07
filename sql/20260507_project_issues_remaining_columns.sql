-- Add remaining missing columns to project_issues
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS task_id uuid;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
