-- Add new columns to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS representative_name text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_number text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS fiscal_year_end_month integer;
