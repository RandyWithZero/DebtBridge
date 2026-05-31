BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE admin_role AS ENUM ('operator', 'manager');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE debtor_application_status AS ENUM (
    'submitted',
    'under_review',
    'need_more_info',
    'qualified',
    'matched',
    'rejected',
    'withdrawn',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE partner_organization_status AS ENUM (
    'pending_review',
    'under_review',
    'need_more_info',
    'active',
    'suspended',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE match_case_status AS ENUM (
    'matched',
    'contacted',
    'negotiating',
    'agreement_pending',
    'agreement_signed',
    'in_repayment',
    'success',
    'failed',
    'cancelled',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE document_purpose AS ENUM (
    'debtor_supporting_material',
    'partner_business_license',
    'partner_legal_representative_id',
    'partner_qualification',
    'agreement',
    'admin_supplement'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE document_status AS ENUM ('uploaded', 'bound', 'quarantined', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE document_owner_type AS ENUM (
    'debtor_application',
    'partner_organization',
    'match_case',
    'unbound'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE document_access_scope AS ENUM ('admin_only', 'assigned_partner', 'debtor_visible');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE note_visibility AS ENUM ('internal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE audit_entity_type AS ENUM (
    'debtor_application',
    'partner_organization',
    'match_case',
    'document',
    'admin_user'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role admin_role NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT admin_users_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS debtor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  phone_normalized text NOT NULL,
  city text NOT NULL,
  bank_name text NOT NULL,
  total_debt_amount_cents bigint NOT NULL CHECK (total_debt_amount_cents >= 0),
  overdue_range text NOT NULL CHECK (overdue_range IN ('not_overdue', '1_3_months', '3_6_months', 'over_6_months')),
  is_under_collection boolean NOT NULL,
  has_legal_notice boolean NOT NULL,
  monthly_income_cents bigint NOT NULL CHECK (monthly_income_cents >= 0),
  monthly_repayment_capacity_cents bigint NOT NULL CHECK (monthly_repayment_capacity_cents >= 0),
  expected_solutions text[] NOT NULL CHECK (cardinality(expected_solutions) > 0),
  hardship_reasons text[] NOT NULL CHECK (cardinality(hardship_reasons) > 0),
  hardship_description text,
  status debtor_application_status NOT NULL DEFAULT 'submitted',
  review_reason text,
  reviewed_by_id uuid REFERENCES admin_users(id),
  reviewed_at timestamptz,
  truthfulness_accepted_at timestamptz NOT NULL,
  privacy_accepted_at timestamptz NOT NULL,
  service_agreement_accepted_at timestamptz NOT NULL,
  agreement_version text NOT NULL,
  consent_ip_hash text,
  consent_user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS partner_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name text NOT NULL,
  unified_social_credit_code text NOT NULL UNIQUE,
  legal_representative_name text NOT NULL,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  contact_phone_normalized text NOT NULL,
  service_cities text[] NOT NULL CHECK (cardinality(service_cities) > 0),
  accepted_banks text[] NOT NULL CHECK (cardinality(accepted_banks) > 0),
  capabilities text[] NOT NULL CHECK (cardinality(capabilities) > 0),
  min_installment_months integer CHECK (min_installment_months IS NULL OR min_installment_months > 0),
  max_installment_months integer,
  average_processing_days integer CHECK (average_processing_days IS NULL OR average_processing_days > 0),
  cooperation_modes text[] NOT NULL CHECK (cardinality(cooperation_modes) > 0),
  status partner_organization_status NOT NULL DEFAULT 'pending_review',
  review_reason text,
  reviewed_by_id uuid REFERENCES admin_users(id),
  reviewed_at timestamptz,
  compliance_accepted_at timestamptz NOT NULL,
  agreement_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  suspended_at timestamptz,
  CONSTRAINT partner_installment_range_check CHECK (
    max_installment_months IS NULL
    OR (max_installment_months > 0 AND (min_installment_months IS NULL OR max_installment_months >= min_installment_months))
  )
);

CREATE TABLE IF NOT EXISTS match_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_application_id uuid NOT NULL REFERENCES debtor_applications(id),
  partner_organization_id uuid NOT NULL REFERENCES partner_organizations(id),
  status match_case_status NOT NULL DEFAULT 'matched',
  match_reason text NOT NULL,
  proposed_plan jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(proposed_plan) = 'object'),
  failure_reason text,
  created_by_id uuid NOT NULL REFERENCES admin_users(id),
  last_transition_by_id uuid REFERENCES admin_users(id),
  last_transition_reason text,
  last_transition_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT match_cases_failure_reason_check CHECK (
    status NOT IN ('failed', 'cancelled') OR failure_reason IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type document_owner_type NOT NULL DEFAULT 'unbound',
  owner_id uuid,
  purpose document_purpose NOT NULL,
  status document_status NOT NULL DEFAULT 'uploaded',
  access_scope document_access_scope NOT NULL DEFAULT 'admin_only',
  original_filename text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256_hash text NOT NULL,
  uploaded_by_admin_id uuid REFERENCES admin_users(id),
  bound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_owner_check CHECK (
    (owner_type = 'unbound' AND owner_id IS NULL)
    OR (owner_type <> 'unbound' AND owner_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS match_case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_case_id uuid NOT NULL REFERENCES match_cases(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES admin_users(id),
  content text NOT NULL,
  visibility note_visibility NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES admin_users(id),
  actor_role admin_role,
  action text NOT NULL,
  entity_type audit_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  before jsonb NOT NULL DEFAULT '{}'::jsonb,
  after jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS debtor_applications_status_created_idx ON debtor_applications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS debtor_applications_phone_created_idx ON debtor_applications (phone_normalized, created_at DESC);
CREATE INDEX IF NOT EXISTS debtor_applications_city_status_idx ON debtor_applications (city, status);
CREATE INDEX IF NOT EXISTS debtor_applications_bank_status_idx ON debtor_applications (bank_name, status);

CREATE INDEX IF NOT EXISTS partner_orgs_status_created_idx ON partner_organizations (status, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_orgs_contact_phone_idx ON partner_organizations (contact_phone_normalized);
CREATE INDEX IF NOT EXISTS partner_orgs_service_cities_gin ON partner_organizations USING gin (service_cities);
CREATE INDEX IF NOT EXISTS partner_orgs_accepted_banks_gin ON partner_organizations USING gin (accepted_banks);
CREATE INDEX IF NOT EXISTS partner_orgs_capabilities_gin ON partner_organizations USING gin (capabilities);

CREATE INDEX IF NOT EXISTS match_cases_status_created_idx ON match_cases (status, created_at DESC);
CREATE INDEX IF NOT EXISTS match_cases_application_idx ON match_cases (debtor_application_id);
CREATE INDEX IF NOT EXISTS match_cases_partner_status_idx ON match_cases (partner_organization_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS match_cases_one_open_case_per_application_idx
  ON match_cases (debtor_application_id)
  WHERE status NOT IN ('failed', 'cancelled', 'archived');

CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS audit_logs_entity_created_idx ON audit_logs (entity_type, entity_id, created_at DESC);

COMMIT;
