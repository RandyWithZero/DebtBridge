import pg from "pg";

export function createPostgresPersistence(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) return null;
  const pool = new pg.Pool({ connectionString: databaseUrl });
  let queue = Promise.resolve();

  return {
    async initialize() {
      await pool.query("select 1");
    },

    async loadAll() {
      const [
        users,
        documents,
        debtorApplications,
        partnerOrganizations,
        matchCases,
        matchCaseNotes,
        auditLogs
      ] = await Promise.all([
        pool.query("select * from admin_users"),
        pool.query("select * from documents order by created_at asc"),
        pool.query("select * from debtor_applications order by created_at asc"),
        pool.query("select * from partner_organizations order by created_at asc"),
        pool.query("select * from match_cases order by created_at asc"),
        pool.query("select * from match_case_notes order by created_at asc"),
        pool.query("select * from audit_logs order by created_at asc")
      ]);

      return {
        users: users.rows.map(fromAdminUserRow),
        sessions: [],
        documents: documents.rows.map(fromDocumentRow),
        debtorApplications: debtorApplications.rows.map(fromDebtorApplicationRow),
        partnerOrganizations: partnerOrganizations.rows.map(fromPartnerOrganizationRow),
        matchCases: matchCases.rows.map(fromMatchCaseRow),
        matchCaseNotes: matchCaseNotes.rows.map(fromMatchCaseNoteRow),
        auditLogs: auditLogs.rows.map(fromAuditLogRow)
      };
    },

    async saveRecord(collection, id, data) {
      queue = queue.then(async () => {
        if (collection === "users") return saveUser(pool, data);
        if (collection === "documents") return saveDocument(pool, data);
        if (collection === "debtorApplications") return saveDebtorApplication(pool, data);
        if (collection === "partnerOrganizations") return savePartnerOrganization(pool, data);
        if (collection === "matchCases") return saveMatchCase(pool, data);
        if (collection === "matchCaseNotes") return saveMatchCaseNote(pool, data);
        if (collection === "auditLogs") return saveAuditLog(pool, data);
        return undefined;
      });
      return queue;
    },

    async deleteRecord(collection, id) {
      queue = queue.then(async () => {
        if (collection === "debtorApplications") {
          await pool.query("delete from debtor_applications where id = $1", [dbId(id)]);
        }
        if (collection === "partnerOrganizations") {
          await pool.query("delete from partner_organizations where id = $1", [dbId(id)]);
        }
        if (collection === "documents") {
          await pool.query("delete from documents where id = $1", [dbId(id)]);
        }
      });
      return queue;
    },

    async close() {
      await pool.end();
    }
  };
}

async function saveUser(pool, user) {
  if (!isUuid(user.id) || !["manager", "operator"].includes(user.role)) return;
  await pool.query(
    `
      insert into admin_users (id, email, password_hash, role, display_name, status, last_login_at)
      values ($1, $2, $3, $4::admin_role, $5, $6, $7)
      on conflict (id) do update set
        email = excluded.email,
        password_hash = excluded.password_hash,
        role = excluded.role,
        display_name = excluded.display_name,
        status = excluded.status,
        last_login_at = excluded.last_login_at,
        updated_at = now()
    `,
    [
      user.id,
      user.email,
      user.passwordHash,
      user.role,
      user.displayName,
      user.status ?? "active",
      user.lastLoginAt ?? null
    ]
  );
}

async function saveDocument(pool, document) {
  await pool.query(
    `
      insert into documents (
        id, owner_type, owner_id, purpose, status, access_scope, original_filename,
        storage_key, mime_type, size_bytes, sha256_hash, uploaded_by_admin_id, bound_at, created_at
      )
      values ($1, $2::document_owner_type, $3, $4::document_purpose, $5::document_status,
        $6::document_access_scope, $7, $8, $9, $10, $11, $12, $13, $14)
      on conflict (id) do update set
        owner_type = excluded.owner_type,
        owner_id = excluded.owner_id,
        purpose = excluded.purpose,
        status = excluded.status,
        access_scope = excluded.access_scope,
        original_filename = excluded.original_filename,
        storage_key = excluded.storage_key,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        sha256_hash = excluded.sha256_hash,
        uploaded_by_admin_id = excluded.uploaded_by_admin_id,
        bound_at = excluded.bound_at
    `,
    [
      dbId(document.id),
      document.ownerType,
      document.ownerId ? dbId(document.ownerId) : null,
      document.purpose,
      document.status,
      document.accessScope,
      document.originalFilename ?? document.filename,
      document.storageKey,
      document.mimeType,
      document.sizeBytes,
      document.sha256Hash,
      isUuid(document.uploadedByAdminId) ? document.uploadedByAdminId : null,
      document.boundAt,
      document.createdAt
    ]
  );
}

async function saveDebtorApplication(pool, application) {
  await pool.query(
    `
      insert into debtor_applications (
        id, name, phone, phone_normalized, city, bank_name, total_debt_amount_cents,
        overdue_range, is_under_collection, has_legal_notice, monthly_income_cents,
        monthly_repayment_capacity_cents, expected_solutions, hardship_reasons,
        hardship_description, status, review_reason, reviewed_by_id, reviewed_at,
        truthfulness_accepted_at, privacy_accepted_at, service_agreement_accepted_at,
        agreement_version, consent_ip_hash, consent_user_agent, created_at, updated_at, archived_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16::debtor_application_status, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, $26, $27, $28)
      on conflict (id) do update set
        name = excluded.name,
        phone = excluded.phone,
        phone_normalized = excluded.phone_normalized,
        city = excluded.city,
        bank_name = excluded.bank_name,
        total_debt_amount_cents = excluded.total_debt_amount_cents,
        overdue_range = excluded.overdue_range,
        is_under_collection = excluded.is_under_collection,
        has_legal_notice = excluded.has_legal_notice,
        monthly_income_cents = excluded.monthly_income_cents,
        monthly_repayment_capacity_cents = excluded.monthly_repayment_capacity_cents,
        expected_solutions = excluded.expected_solutions,
        hardship_reasons = excluded.hardship_reasons,
        hardship_description = excluded.hardship_description,
        status = excluded.status,
        review_reason = excluded.review_reason,
        reviewed_by_id = excluded.reviewed_by_id,
        reviewed_at = excluded.reviewed_at,
        updated_at = excluded.updated_at,
        archived_at = excluded.archived_at
    `,
    [
      dbId(application.id),
      application.name,
      application.phone,
      application.phoneNormalized,
      application.city,
      application.bankName,
      application.totalDebtAmountCents,
      application.overdueRange,
      application.isUnderCollection,
      application.hasLegalNotice,
      application.monthlyIncomeCents,
      application.monthlyRepaymentCapacityCents,
      application.expectedSolutions,
      application.hardshipReasons,
      application.hardshipDescription,
      application.status,
      application.reviewReason,
      isUuid(application.reviewedById) ? application.reviewedById : null,
      application.reviewedAt,
      application.truthfulnessAcceptedAt,
      application.privacyAcceptedAt,
      application.serviceAgreementAcceptedAt,
      application.agreementVersion,
      application.consentIpHash,
      application.consentUserAgent,
      application.createdAt,
      application.updatedAt,
      application.archivedAt
    ]
  );
}

async function savePartnerOrganization(pool, organization) {
  await pool.query(
    `
      insert into partner_organizations (
        id, organization_name, unified_social_credit_code, legal_representative_name,
        contact_name, contact_phone, contact_phone_normalized, service_cities,
        accepted_banks, capabilities, min_installment_months, max_installment_months,
        average_processing_days, cooperation_modes, status, review_reason, reviewed_by_id,
        reviewed_at, compliance_accepted_at, agreement_version, created_at, updated_at, suspended_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15::partner_organization_status, $16, $17, $18, $19, $20, $21, $22, $23)
      on conflict (id) do update set
        organization_name = excluded.organization_name,
        unified_social_credit_code = excluded.unified_social_credit_code,
        legal_representative_name = excluded.legal_representative_name,
        contact_name = excluded.contact_name,
        contact_phone = excluded.contact_phone,
        contact_phone_normalized = excluded.contact_phone_normalized,
        service_cities = excluded.service_cities,
        accepted_banks = excluded.accepted_banks,
        capabilities = excluded.capabilities,
        min_installment_months = excluded.min_installment_months,
        max_installment_months = excluded.max_installment_months,
        average_processing_days = excluded.average_processing_days,
        cooperation_modes = excluded.cooperation_modes,
        status = excluded.status,
        review_reason = excluded.review_reason,
        reviewed_by_id = excluded.reviewed_by_id,
        reviewed_at = excluded.reviewed_at,
        updated_at = excluded.updated_at,
        suspended_at = excluded.suspended_at
    `,
    [
      dbId(organization.id),
      organization.organizationName,
      organization.unifiedSocialCreditCode,
      organization.legalRepresentativeName,
      organization.contactName,
      organization.contactPhone,
      organization.contactPhoneNormalized,
      organization.serviceCities,
      organization.acceptedBanks,
      organization.capabilities,
      organization.minInstallmentMonths,
      organization.maxInstallmentMonths,
      organization.averageProcessingDays,
      organization.cooperationModes,
      organization.status,
      organization.reviewReason,
      isUuid(organization.reviewedById) ? organization.reviewedById : null,
      organization.reviewedAt,
      organization.complianceAcceptedAt,
      organization.agreementVersion,
      organization.createdAt,
      organization.updatedAt,
      organization.suspendedAt
    ]
  );
}

async function saveMatchCase(pool, matchCase) {
  await pool.query(
    `
      insert into match_cases (
        id, debtor_application_id, partner_organization_id, status, match_reason,
        proposed_plan, failure_reason, created_by_id, last_transition_by_id,
        last_transition_reason, last_transition_at, created_at, updated_at, archived_at
      )
      values ($1, $2, $3, $4::match_case_status, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14)
      on conflict (id) do update set
        debtor_application_id = excluded.debtor_application_id,
        partner_organization_id = excluded.partner_organization_id,
        status = excluded.status,
        match_reason = excluded.match_reason,
        proposed_plan = excluded.proposed_plan,
        failure_reason = excluded.failure_reason,
        last_transition_by_id = excluded.last_transition_by_id,
        last_transition_reason = excluded.last_transition_reason,
        last_transition_at = excluded.last_transition_at,
        updated_at = excluded.updated_at,
        archived_at = excluded.archived_at
    `,
    [
      dbId(matchCase.id),
      dbId(matchCase.debtorApplicationId),
      dbId(matchCase.partnerOrganizationId),
      matchCase.status,
      matchCase.matchReason,
      JSON.stringify(matchCase.proposedPlan ?? {}),
      matchCase.failureReason,
      matchCase.createdById,
      isUuid(matchCase.lastTransitionById) ? matchCase.lastTransitionById : null,
      matchCase.lastTransitionReason,
      matchCase.lastTransitionAt,
      matchCase.createdAt,
      matchCase.updatedAt,
      matchCase.archivedAt
    ]
  );
}

async function saveMatchCaseNote(pool, note) {
  await pool.query(
    `
      insert into match_case_notes (id, match_case_id, author_id, content, visibility, created_at)
      values ($1, $2, $3, $4, $5::note_visibility, $6)
      on conflict (id) do update set content = excluded.content, visibility = excluded.visibility
    `,
    [dbId(note.id), dbId(note.matchCaseId), note.authorId, note.content, note.visibility, note.createdAt]
  );
}

async function saveAuditLog(pool, log) {
  await pool.query(
    `
      insert into audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, before, after, reason, created_at)
      values ($1, $2, $3::admin_role, $4, $5::audit_entity_type, $6, $7::jsonb, $8::jsonb, $9, $10)
      on conflict (id) do nothing
    `,
    [
      dbId(log.id),
      isUuid(log.actorId) ? log.actorId : null,
      ["manager", "operator"].includes(log.actorRole) ? log.actorRole : null,
      log.action,
      log.entityType,
      dbId(log.entityId),
      JSON.stringify(log.before ?? {}),
      JSON.stringify(log.after ?? {}),
      log.reason,
      log.createdAt
    ]
  );
}

function fromAdminUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    displayName: row.display_name,
    status: row.status,
    lastLoginAt: iso(row.last_login_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function fromDocumentRow(row) {
  return {
    id: apiId("doc", row.id),
    ownerType: row.owner_type,
    ownerId: row.owner_id ? apiId(ownerPrefix(row.owner_type), row.owner_id) : null,
    purpose: row.purpose,
    status: row.status,
    accessScope: row.access_scope,
    originalFilename: row.original_filename,
    filename: row.original_filename,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256Hash: row.sha256_hash,
    uploadedByAdminId: row.uploaded_by_admin_id,
    boundAt: iso(row.bound_at),
    createdAt: iso(row.created_at)
  };
}

function fromDebtorApplicationRow(row) {
  const monthlyIncomeCents = Number(row.monthly_income_cents);
  const monthlyRepaymentCapacityCents = Number(row.monthly_repayment_capacity_cents);
  return {
    id: apiId("app", row.id),
    name: row.name,
    phone: row.phone,
    phoneNormalized: row.phone_normalized,
    city: row.city,
    bankName: row.bank_name,
    totalDebtAmountCents: Number(row.total_debt_amount_cents),
    overdueRange: row.overdue_range,
    isUnderCollection: row.is_under_collection,
    hasLegalNotice: row.has_legal_notice,
    monthlyIncomeCents,
    monthlyRepaymentCapacityCents,
    repaymentCapacityNeedsReview: monthlyRepaymentCapacityCents > monthlyIncomeCents,
    expectedSolutions: row.expected_solutions,
    hardshipReasons: row.hardship_reasons,
    hardshipDescription: row.hardship_description,
    status: row.status,
    reviewReason: row.review_reason,
    reviewedById: row.reviewed_by_id,
    reviewedAt: iso(row.reviewed_at),
    truthfulnessAcceptedAt: iso(row.truthfulness_accepted_at),
    privacyAcceptedAt: iso(row.privacy_accepted_at),
    serviceAgreementAcceptedAt: iso(row.service_agreement_accepted_at),
    agreementVersion: row.agreement_version,
    consentIpHash: row.consent_ip_hash,
    consentUserAgent: row.consent_user_agent,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    archivedAt: iso(row.archived_at)
  };
}

function fromPartnerOrganizationRow(row) {
  return {
    id: apiId("org", row.id),
    organizationName: row.organization_name,
    unifiedSocialCreditCode: row.unified_social_credit_code,
    legalRepresentativeName: row.legal_representative_name,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactPhoneNormalized: row.contact_phone_normalized,
    serviceCities: row.service_cities,
    acceptedBanks: row.accepted_banks,
    capabilities: row.capabilities,
    minInstallmentMonths: row.min_installment_months,
    maxInstallmentMonths: row.max_installment_months,
    averageProcessingDays: row.average_processing_days,
    cooperationModes: row.cooperation_modes,
    status: row.status,
    reviewReason: row.review_reason,
    reviewedById: row.reviewed_by_id,
    reviewedAt: iso(row.reviewed_at),
    complianceAcceptedAt: iso(row.compliance_accepted_at),
    agreementVersion: row.agreement_version,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    suspendedAt: iso(row.suspended_at)
  };
}

function fromMatchCaseRow(row) {
  return {
    id: apiId("case", row.id),
    debtorApplicationId: apiId("app", row.debtor_application_id),
    partnerOrganizationId: apiId("org", row.partner_organization_id),
    status: row.status,
    matchReason: row.match_reason,
    proposedPlan: row.proposed_plan ?? {},
    failureReason: row.failure_reason,
    createdById: row.created_by_id,
    lastTransitionById: row.last_transition_by_id,
    lastTransitionReason: row.last_transition_reason,
    lastTransitionAt: iso(row.last_transition_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    archivedAt: iso(row.archived_at)
  };
}

function fromMatchCaseNoteRow(row) {
  return {
    id: apiId("note", row.id),
    matchCaseId: apiId("case", row.match_case_id),
    authorId: row.author_id,
    content: row.content,
    visibility: row.visibility,
    createdAt: iso(row.created_at)
  };
}

function fromAuditLogRow(row) {
  return {
    id: apiId("log", row.id),
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: apiId(ownerPrefix(row.entity_type), row.entity_id),
    before: row.before ?? {},
    after: row.after ?? {},
    reason: row.reason,
    createdAt: iso(row.created_at)
  };
}

function dbId(id) {
  const value = String(id ?? "");
  return value.includes("_") ? value.slice(value.indexOf("_") + 1) : value;
}

function apiId(prefix, id) {
  if (!prefix || String(id).startsWith(`${prefix}_`)) return String(id);
  return `${prefix}_${id}`;
}

function ownerPrefix(ownerType) {
  return {
    debtor_application: "app",
    partner_organization: "org",
    match_case: "case",
    document: "doc",
    admin_user: ""
  }[ownerType];
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}
