CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "admin_role" AS ENUM ('operator', 'manager');
CREATE TYPE "debtor_application_status" AS ENUM ('submitted', 'under_review', 'need_more_info', 'qualified', 'matched', 'rejected', 'withdrawn', 'archived');
CREATE TYPE "partner_organization_status" AS ENUM ('pending_review', 'under_review', 'need_more_info', 'active', 'suspended', 'rejected');
CREATE TYPE "match_case_status" AS ENUM ('matched', 'contacted', 'negotiating', 'agreement_pending', 'agreement_signed', 'in_repayment', 'success', 'failed', 'cancelled', 'archived');
CREATE TYPE "document_purpose" AS ENUM ('debtor_supporting_material', 'partner_business_license', 'partner_legal_representative_id', 'partner_qualification', 'agreement', 'admin_supplement');
CREATE TYPE "document_status" AS ENUM ('uploaded', 'bound', 'quarantined', 'deleted');
CREATE TYPE "document_access_scope" AS ENUM ('admin_only', 'assigned_partner', 'debtor_visible');
CREATE TYPE "document_owner_type" AS ENUM ('debtor_application', 'partner_organization', 'match_case', 'unbound');
CREATE TYPE "note_visibility" AS ENUM ('internal');
CREATE TYPE "audit_entity_type" AS ENUM ('debtor_application', 'partner_organization', 'match_case', 'document', 'admin_user');

CREATE TABLE "admin_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" "admin_role" NOT NULL,
  "display_name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "last_login_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "admin_users_email_key" UNIQUE ("email"),
  CONSTRAINT "admin_users_status_check" CHECK ("status" IN ('active', 'disabled')),
  CONSTRAINT "admin_users_email_normalized_check" CHECK ("email" = lower(trim("email")))
);

CREATE TABLE "debtor_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "phone" text NOT NULL,
  "phone_normalized" text NOT NULL,
  "city" text NOT NULL,
  "bank_name" text NOT NULL,
  "total_debt_amount_cents" bigint NOT NULL,
  "overdue_range" text NOT NULL,
  "is_under_collection" boolean NOT NULL,
  "has_legal_notice" boolean NOT NULL,
  "monthly_income_cents" bigint NOT NULL,
  "monthly_repayment_capacity_cents" bigint NOT NULL,
  "repayment_capacity_needs_review" boolean NOT NULL DEFAULT false,
  "expected_solutions" text[] NOT NULL,
  "hardship_reasons" text[] NOT NULL,
  "hardship_description" text,
  "status" "debtor_application_status" NOT NULL DEFAULT 'submitted',
  "review_reason" text,
  "reviewed_by_id" uuid,
  "reviewed_at" timestamptz,
  "truthfulness_accepted_at" timestamptz NOT NULL,
  "privacy_accepted_at" timestamptz NOT NULL,
  "service_agreement_accepted_at" timestamptz NOT NULL,
  "agreement_version" text NOT NULL,
  "consent_ip_hash" text,
  "consent_user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz,
  CONSTRAINT "debtor_applications_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "debtor_applications_total_debt_amount_check" CHECK ("total_debt_amount_cents" >= 0),
  CONSTRAINT "debtor_applications_monthly_income_check" CHECK ("monthly_income_cents" >= 0),
  CONSTRAINT "debtor_applications_repayment_capacity_check" CHECK ("monthly_repayment_capacity_cents" >= 0),
  CONSTRAINT "debtor_applications_overdue_range_check" CHECK ("overdue_range" IN ('not_overdue', '1_3_months', '3_6_months', 'over_6_months')),
  CONSTRAINT "debtor_applications_expected_solutions_check" CHECK (cardinality("expected_solutions") > 0),
  CONSTRAINT "debtor_applications_hardship_reasons_check" CHECK (cardinality("hardship_reasons") > 0)
);

CREATE TABLE "partner_organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_name" text NOT NULL,
  "unified_social_credit_code" text NOT NULL,
  "legal_representative_name" text NOT NULL,
  "contact_name" text NOT NULL,
  "contact_phone" text NOT NULL,
  "contact_phone_normalized" text NOT NULL,
  "service_cities" text[] NOT NULL,
  "accepted_banks" text[] NOT NULL,
  "capabilities" text[] NOT NULL,
  "min_installment_months" integer,
  "max_installment_months" integer,
  "average_processing_days" integer,
  "cooperation_modes" text[] NOT NULL,
  "status" "partner_organization_status" NOT NULL DEFAULT 'pending_review',
  "review_reason" text,
  "reviewed_by_id" uuid,
  "reviewed_at" timestamptz,
  "compliance_accepted_at" timestamptz NOT NULL,
  "agreement_version" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "suspended_at" timestamptz,
  CONSTRAINT "partner_organizations_unified_social_credit_code_key" UNIQUE ("unified_social_credit_code"),
  CONSTRAINT "partner_organizations_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "partner_organizations_service_cities_check" CHECK (cardinality("service_cities") > 0),
  CONSTRAINT "partner_organizations_accepted_banks_check" CHECK (cardinality("accepted_banks") > 0),
  CONSTRAINT "partner_organizations_capabilities_check" CHECK (cardinality("capabilities") > 0),
  CONSTRAINT "partner_organizations_cooperation_modes_check" CHECK (cardinality("cooperation_modes") > 0),
  CONSTRAINT "partner_organizations_average_processing_days_check" CHECK ("average_processing_days" IS NULL OR "average_processing_days" > 0),
  CONSTRAINT "partner_organizations_min_installment_months_check" CHECK ("min_installment_months" IS NULL OR "min_installment_months" > 0),
  CONSTRAINT "partner_organizations_max_installment_months_check" CHECK ("max_installment_months" IS NULL OR "min_installment_months" IS NULL OR "max_installment_months" >= "min_installment_months")
);

CREATE TABLE "partner_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "partner_organization_id" uuid NOT NULL,
  "name" text NOT NULL,
  "phone" text NOT NULL,
  "phone_normalized" text NOT NULL,
  "email" text,
  "password_hash" text,
  "role" text NOT NULL DEFAULT 'contact',
  "status" text NOT NULL DEFAULT 'active',
  "is_primary" boolean NOT NULL DEFAULT false,
  "last_login_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "partner_contacts_partner_organization_id_fkey" FOREIGN KEY ("partner_organization_id") REFERENCES "partner_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "partner_contacts_role_check" CHECK ("role" IN ('owner', 'contact', 'viewer')),
  CONSTRAINT "partner_contacts_status_check" CHECK ("status" IN ('invited', 'active', 'disabled')),
  CONSTRAINT "partner_contacts_email_normalized_check" CHECK ("email" IS NULL OR "email" = lower(trim("email"))),
  CONSTRAINT "partner_contacts_password_for_active_account_check" CHECK ("email" IS NULL OR "status" = 'invited' OR "password_hash" IS NOT NULL)
);

CREATE TABLE "match_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "debtor_application_id" uuid NOT NULL,
  "partner_organization_id" uuid NOT NULL,
  "status" "match_case_status" NOT NULL DEFAULT 'matched',
  "match_reason" text NOT NULL,
  "proposed_plan" jsonb NOT NULL DEFAULT '{}',
  "failure_reason" text,
  "created_by_id" uuid NOT NULL,
  "last_transition_by_id" uuid,
  "last_transition_reason" text,
  "last_transition_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz,
  CONSTRAINT "match_cases_debtor_application_id_fkey" FOREIGN KEY ("debtor_application_id") REFERENCES "debtor_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_cases_partner_organization_id_fkey" FOREIGN KEY ("partner_organization_id") REFERENCES "partner_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_cases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_cases_last_transition_by_id_fkey" FOREIGN KEY ("last_transition_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "match_cases_proposed_plan_object_check" CHECK (jsonb_typeof("proposed_plan") = 'object'),
  CONSTRAINT "match_cases_failure_reason_check" CHECK (("status" NOT IN ('failed', 'cancelled')) OR "failure_reason" IS NOT NULL)
);

CREATE TABLE "match_case_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "match_case_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "content" text NOT NULL,
  "visibility" "note_visibility" NOT NULL DEFAULT 'internal',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "match_case_notes_match_case_id_fkey" FOREIGN KEY ("match_case_id") REFERENCES "match_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "match_case_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_case_notes_content_check" CHECK (length(trim("content")) > 0)
);

CREATE TABLE "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_type" "document_owner_type" NOT NULL DEFAULT 'unbound',
  "owner_id" uuid,
  "purpose" "document_purpose" NOT NULL,
  "status" "document_status" NOT NULL DEFAULT 'uploaded',
  "access_scope" "document_access_scope" NOT NULL DEFAULT 'admin_only',
  "original_filename" text NOT NULL,
  "storage_key" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "sha256_hash" text NOT NULL,
  "uploaded_by_admin_id" uuid,
  "public_upload_token_hash" text,
  "bound_at" timestamptz,
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "documents_storage_key_key" UNIQUE ("storage_key"),
  CONSTRAINT "documents_uploaded_by_admin_id_fkey" FOREIGN KEY ("uploaded_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "documents_size_bytes_check" CHECK ("size_bytes" > 0),
  CONSTRAINT "documents_owner_binding_check" CHECK (("owner_type" = 'unbound' AND "owner_id" IS NULL) OR ("owner_type" <> 'unbound' AND "owner_id" IS NOT NULL))
);

CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" uuid,
  "actor_role" "admin_role",
  "action" text NOT NULL,
  "entity_type" "audit_entity_type" NOT NULL,
  "entity_id" uuid NOT NULL,
  "before" jsonb NOT NULL DEFAULT '{}',
  "after" jsonb NOT NULL DEFAULT '{}',
  "reason" text,
  "request_id" text,
  "ip_hash" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "audit_logs_before_object_check" CHECK (jsonb_typeof("before") = 'object'),
  CONSTRAINT "audit_logs_after_object_check" CHECK (jsonb_typeof("after") = 'object')
);

CREATE INDEX "debtor_applications_status_created_idx" ON "debtor_applications" ("status", "created_at" DESC);
CREATE INDEX "debtor_applications_phone_created_idx" ON "debtor_applications" ("phone_normalized", "created_at" DESC);
CREATE INDEX "debtor_applications_city_status_idx" ON "debtor_applications" ("city", "status");
CREATE INDEX "debtor_applications_bank_status_idx" ON "debtor_applications" ("bank_name", "status");

CREATE INDEX "partner_orgs_status_created_idx" ON "partner_organizations" ("status", "created_at" DESC);
CREATE INDEX "partner_orgs_contact_phone_idx" ON "partner_organizations" ("contact_phone_normalized");
CREATE INDEX "partner_orgs_service_cities_gin" ON "partner_organizations" USING gin ("service_cities");
CREATE INDEX "partner_orgs_accepted_banks_gin" ON "partner_organizations" USING gin ("accepted_banks");
CREATE INDEX "partner_orgs_capabilities_gin" ON "partner_organizations" USING gin ("capabilities");

CREATE INDEX "partner_contacts_org_status_idx" ON "partner_contacts" ("partner_organization_id", "status");
CREATE INDEX "partner_contacts_phone_idx" ON "partner_contacts" ("phone_normalized");
CREATE UNIQUE INDEX "partner_contacts_org_email_unique_idx" ON "partner_contacts" ("partner_organization_id", "email") WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX "partner_contacts_primary_unique_idx" ON "partner_contacts" ("partner_organization_id") WHERE "is_primary" = true;

CREATE INDEX "match_cases_status_created_idx" ON "match_cases" ("status", "created_at" DESC);
CREATE INDEX "match_cases_application_idx" ON "match_cases" ("debtor_application_id");
CREATE INDEX "match_cases_partner_status_idx" ON "match_cases" ("partner_organization_id", "status");
CREATE UNIQUE INDEX "match_cases_open_application_unique_idx" ON "match_cases" ("debtor_application_id") WHERE "status" NOT IN ('failed', 'cancelled', 'archived');

CREATE INDEX "match_case_notes_case_created_idx" ON "match_case_notes" ("match_case_id", "created_at" DESC);

CREATE INDEX "documents_owner_idx" ON "documents" ("owner_type", "owner_id", "created_at" DESC);
CREATE INDEX "documents_status_created_idx" ON "documents" ("status", "created_at");
CREATE INDEX "documents_hash_idx" ON "documents" ("sha256_hash");

CREATE INDEX "audit_logs_entity_created_idx" ON "audit_logs" ("entity_type", "entity_id", "created_at" DESC);
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" ("actor_id", "created_at" DESC);
CREATE INDEX "audit_logs_action_created_idx" ON "audit_logs" ("action", "created_at" DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "admin_users_set_updated_at"
BEFORE UPDATE ON "admin_users"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER "debtor_applications_set_updated_at"
BEFORE UPDATE ON "debtor_applications"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER "partner_organizations_set_updated_at"
BEFORE UPDATE ON "partner_organizations"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER "partner_contacts_set_updated_at"
BEFORE UPDATE ON "partner_contacts"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER "match_cases_set_updated_at"
BEFORE UPDATE ON "match_cases"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
