-- Add category column to project_issues
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS category text;
