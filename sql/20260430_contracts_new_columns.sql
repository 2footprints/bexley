-- Add new columns to contracts table
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS auto_renewal boolean DEFAULT false;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS renewal_alert_days integer DEFAULT 60;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS billing_contact_name text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS billing_contact_email text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS counterparty_contact_name text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS counterparty_contact_email text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deliverables text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS previous_contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL;
