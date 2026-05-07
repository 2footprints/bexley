-- Add priority column to project_issues
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium';
