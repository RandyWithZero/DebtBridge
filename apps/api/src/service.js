import {
  DEBTOR_REVIEW_TRANSITIONS,
  MATCH_CASE_TRANSITIONS,
  PARTNER_REVIEW_TRANSITIONS
} from "./domain.js";
import { conflict, forbidden, invalidTransition, notFound, validationError } from "./errors.js";
import {
  validateDebtorApplication,
  validateDocumentBinding,
  validateMatchCreate,
  validateNote,
  validatePartnerApplication,
  validatePublicDocumentUpload,
  validateReasonedDecision
} from "./validation.js";

export function createDebtBridgeService(repository) {
  return {
    uploadPublicDocument(input) {
      validatePublicDocumentUpload(input);
      return repository.createDocument(input);
    },

    uploadAdminDocument(input, actor) {
      validatePublicDocumentUpload(input, true);
      const document = repository.createDocument(input, actor.id);
      repository.addAuditLog({
        actor,
        action: "DOCUMENT_UPLOAD",
        entityType: "document",
        entityId: document.id,
        after: { purpose: document.purpose, status: document.status }
      });
      return document;
    },

    createDebtorApplication(input, metadata) {
      validateDebtorApplication(input);
      const application = repository.createDebtorApplication(input, metadata);
      const binding = repository.bindDocuments(
        input.supportingDocumentIds ?? [],
        "debtor_application",
        application.id,
        "debtor_supporting_material"
      );
      if (!binding.ok) {
        repository.store.debtorApplications.delete(application.id);
        throw validationError({ supportingDocumentIds: `${binding.documentId}: ${binding.reason}` });
      }
      return {
        id: application.id,
        status: application.status,
        submittedAt: application.createdAt
      };
    },

    supplementDebtorApplication(id, input, actor) {
      const application = getOrThrow(repository.store.debtorApplications, id, "欠款人申请不存在");
      if (application.phoneNormalized !== actor.phone) throw forbidden("只能补充本人申请");
      const documentIds = input.supportingDocumentIds ?? [];
      if (!Array.isArray(documentIds)) throw validationError({ supportingDocumentIds: "附件引用必须是字符串数组" });
      const binding = repository.bindDocuments(documentIds, "debtor_application", application.id, "debtor_supporting_material");
      if (!binding.ok) throw validationError({ supportingDocumentIds: `${binding.documentId}: ${binding.reason}` });
      const before = { status: application.status };
      if (application.status === "need_more_info") application.status = "under_review";
      application.hardshipDescription = input.note?.trim() || application.hardshipDescription;
      application.updatedAt = new Date().toISOString();
      repository.addAuditLog({
        actor,
        action: "DEBTOR_APPLICATION_SUPPLEMENT",
        entityType: "debtor_application",
        entityId: application.id,
        before,
        after: { status: application.status, documentCount: documentIds.length },
        reason: input.note ?? null
      });
      return application;
    },

    createPartnerApplication(input) {
      validatePartnerApplication(input);
      if (
        [...repository.store.partnerOrganizations.values()].some(
          (organization) =>
            organization.unifiedSocialCreditCode === input.unifiedSocialCreditCode.trim().toUpperCase()
        )
      ) {
        throw conflict("该统一社会信用代码已提交，请联系平台人工处理", {
          unifiedSocialCreditCode: "已存在"
        });
      }

      const organization = repository.createPartnerOrganization(input);
      const bindings = [
        [input.licenseDocumentIds, "partner_business_license"],
        [input.legalRepresentativeIdDocumentIds, "partner_legal_representative_id"],
        [input.qualificationDocumentIds, "partner_qualification"]
      ];
      for (const [documentIds, purpose] of bindings) {
        const binding = repository.bindDocuments(documentIds, "partner_organization", organization.id, purpose);
        if (!binding.ok) {
          repository.store.partnerOrganizations.delete(organization.id);
          throw validationError({ [purpose]: `${binding.documentId}: ${binding.reason}` });
        }
      }
      return {
        id: organization.id,
        status: organization.status,
        submittedAt: organization.createdAt
      };
    },

    supplementPartnerOrganization(input, actor) {
      const organization = getOrThrow(repository.store.partnerOrganizations, actor.organizationId, "机构不存在");
      const bindings = [
        [input.licenseDocumentIds ?? [], "partner_business_license"],
        [input.legalRepresentativeIdDocumentIds ?? [], "partner_legal_representative_id"],
        [input.qualificationDocumentIds ?? [], "partner_qualification"]
      ];
      for (const [documentIds, purpose] of bindings) {
        if (!Array.isArray(documentIds)) throw validationError({ [purpose]: "附件引用必须是字符串数组" });
        const binding = repository.bindDocuments(documentIds, "partner_organization", organization.id, purpose);
        if (!binding.ok) throw validationError({ [purpose]: `${binding.documentId}: ${binding.reason}` });
      }
      const before = { status: organization.status };
      if (organization.status === "need_more_info") organization.status = "under_review";
      organization.updatedAt = new Date().toISOString();
      repository.addAuditLog({
        actor,
        action: "PARTNER_ORGANIZATION_SUPPLEMENT",
        entityType: "partner_organization",
        entityId: organization.id,
        before,
        after: { status: organization.status },
        reason: input.note ?? null
      });
      return organization;
    },

    reviewDebtorApplication(id, input, actor) {
      validateReasonedDecision(input.decision, input.reason, [
        "under_review",
        "need_more_info",
        "qualified",
        "rejected",
        "archived"
      ]);
      const application = getOrThrow(repository.store.debtorApplications, id, "欠款人申请不存在");
      ensureTransition(DEBTOR_REVIEW_TRANSITIONS, application.status, input.decision);
      const before = { status: application.status };
      application.status = input.decision;
      application.reviewReason = input.reason ?? null;
      application.reviewedById = actor.id;
      application.reviewedAt = new Date().toISOString();
      application.updatedAt = application.reviewedAt;
      if (input.decision === "archived") application.archivedAt = application.reviewedAt;
      repository.addAuditLog({
        actor,
        action: "DEBTOR_APPLICATION_REVIEW",
        entityType: "debtor_application",
        entityId: application.id,
        before,
        after: { status: application.status },
        reason: input.reason ?? null
      });
      return application;
    },

    reviewPartnerOrganization(id, input, actor) {
      validateReasonedDecision(input.decision, input.reason, [
        "under_review",
        "need_more_info",
        "active",
        "rejected",
        "suspended"
      ]);
      if (input.decision === "suspended" && actor.role !== "manager") {
        throw forbidden("只有 manager 可以暂停机构");
      }
      const organization = getOrThrow(repository.store.partnerOrganizations, id, "机构不存在");
      ensureTransition(PARTNER_REVIEW_TRANSITIONS, organization.status, input.decision);
      if (input.decision === "active") {
        const documents = repository.listDocuments("partner_organization", organization.id);
        const hasLicense = documents.some((document) => document.purpose === "partner_business_license");
        const hasQualification = documents.some((document) => document.purpose === "partner_qualification");
        if (!hasLicense || !hasQualification) {
          throw validationError({ documents: "激活机构前必须绑定营业执照和业务资质" });
        }
      }
      const before = { status: organization.status };
      organization.status = input.decision;
      organization.reviewReason = input.reason ?? null;
      organization.reviewedById = actor.id;
      organization.reviewedAt = new Date().toISOString();
      organization.updatedAt = organization.reviewedAt;
      organization.suspendedAt = input.decision === "suspended" ? organization.reviewedAt : null;
      repository.addAuditLog({
        actor,
        action: "PARTNER_ORGANIZATION_REVIEW",
        entityType: "partner_organization",
        entityId: organization.id,
        before,
        after: { status: organization.status },
        reason: input.reason ?? null
      });
      return organization;
    },

    createMatchCase(input, actor) {
      validateMatchCreate(input);
      const application = getOrThrow(
        repository.store.debtorApplications,
        input.applicationId,
        "欠款人申请不存在"
      );
      const organization = getOrThrow(
        repository.store.partnerOrganizations,
        input.partnerOrganizationId,
        "机构不存在"
      );
      if (application.status !== "qualified") throw invalidTransition("申请必须先初筛通过才能匹配");
      if (organization.status !== "active") throw invalidTransition("机构必须审核通过且处于 active 才能匹配");
      if (!organization.serviceCities.includes(application.city)) {
        throw validationError({ partnerOrganizationId: "机构服务城市不覆盖该申请" });
      }
      if (!organization.acceptedBanks.includes(application.bankName)) {
        throw validationError({ partnerOrganizationId: "机构承接银行不覆盖该申请" });
      }
      if (!application.expectedSolutions.some((solution) => organization.capabilities.includes(solution))) {
        throw validationError({ partnerOrganizationId: "机构能力不覆盖申请诉求" });
      }
      const hasOpenCase = [...repository.store.matchCases.values()].some(
        (matchCase) =>
          matchCase.debtorApplicationId === application.id &&
          !["failed", "cancelled", "archived"].includes(matchCase.status)
      );
      if (hasOpenCase) throw conflict("该申请已有进行中的匹配案件");

      const matchCase = repository.createMatchCase(input, actor);
      const before = { status: application.status };
      application.status = "matched";
      application.updatedAt = new Date().toISOString();
      repository.addAuditLog({
        actor,
        action: "MATCH_CASE_CREATE",
        entityType: "match_case",
        entityId: matchCase.id,
        after: { status: matchCase.status },
        reason: input.matchReason
      });
      repository.addAuditLog({
        actor,
        action: "DEBTOR_APPLICATION_MATCHED",
        entityType: "debtor_application",
        entityId: application.id,
        before,
        after: { status: application.status, matchCaseId: matchCase.id },
        reason: input.matchReason
      });
      return { id: matchCase.id, status: matchCase.status };
    },

    transitionMatchCase(id, input, actor) {
      validateReasonedDecision(input.nextStatus, input.reason, Object.keys(MATCH_CASE_TRANSITIONS), "nextStatus");
      const matchCase = getOrThrow(repository.store.matchCases, id, "匹配案件不存在");
      ensureTransition(MATCH_CASE_TRANSITIONS, matchCase.status, input.nextStatus);
      if (input.nextStatus === "agreement_signed") {
        const documents = repository.listDocuments("match_case", id);
        if (!documents.some((document) => document.purpose === "agreement")) {
          throw validationError({ documents: "协议签署前必须绑定 agreement 文件" });
        }
      }
      const before = { status: matchCase.status };
      matchCase.status = input.nextStatus;
      matchCase.lastTransitionById = actor.id;
      matchCase.lastTransitionReason = input.reason ?? null;
      matchCase.lastTransitionAt = new Date().toISOString();
      matchCase.updatedAt = matchCase.lastTransitionAt;
      matchCase.failureReason = ["failed", "cancelled"].includes(input.nextStatus) ? input.reason : null;
      if (input.nextStatus === "archived") matchCase.archivedAt = matchCase.lastTransitionAt;
      repository.addAuditLog({
        actor,
        action: "MATCH_CASE_TRANSITION",
        entityType: "match_case",
        entityId: matchCase.id,
        before,
        after: { status: matchCase.status },
        reason: input.reason ?? null
      });
      return matchCase;
    },

    addMatchCaseNote(id, input, actor) {
      validateNote(input);
      getOrThrow(repository.store.matchCases, id, "匹配案件不存在");
      const note = repository.createNote(id, actor, input);
      repository.addAuditLog({
        actor,
        action: "MATCH_CASE_NOTE_CREATE",
        entityType: "match_case",
        entityId: id,
        after: { noteId: note.id },
        reason: "internal note"
      });
      return note;
    },

    bindMatchCaseDocument(id, input, actor) {
      validateDocumentBinding(input, "agreement");
      getOrThrow(repository.store.matchCases, id, "匹配案件不存在");
      const binding = repository.bindDocuments([input.documentId], "match_case", id, "agreement");
      if (!binding.ok) throw validationError({ documentId: binding.reason });
      repository.addAuditLog({
        actor,
        action: "MATCH_CASE_DOCUMENT_BIND",
        entityType: "match_case",
        entityId: id,
        after: { documentId: input.documentId, purpose: "agreement" }
      });
      return repository.getDocument(input.documentId);
    }
  };
}

function getOrThrow(map, id, message) {
  const value = map.get(id);
  if (!value) throw notFound(message);
  return value;
}

function ensureTransition(transitions, from, to) {
  if (!transitions[from]?.has(to)) {
    throw invalidTransition(`不允许从 ${from} 流转到 ${to}`);
  }
}
