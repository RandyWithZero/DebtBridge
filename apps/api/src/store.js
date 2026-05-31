import { createHash } from "node:crypto";
import {
  ADMIN_USERS,
  SERVICE_AGREEMENT_VERSION,
  maskPhone,
  normalizePhone,
  nowIso,
  prefixedId,
  stripInternalDocumentFields
} from "./domain.js";

export function createStore() {
  const store = {
    sessions: new Map(),
    clientSessions: new Map(),
    documents: new Map(),
    debtorApplications: new Map(),
    partnerOrganizations: new Map(),
    matchCases: new Map(),
    matchCaseNotes: new Map(),
    auditLogs: []
  };

  return {
    store,

    createSession(user) {
      const token = prefixedId("session");
      store.sessions.set(token, { token, userId: user.id, createdAt: nowIso() });
      return token;
    },

    createClientSession(identity) {
      const token = prefixedId("client_session");
      store.clientSessions.set(token, { token, identity, createdAt: nowIso() });
      return token;
    },

    deleteSession(token) {
      store.sessions.delete(token);
      store.clientSessions.delete(token);
    },

    getSessionUser(token) {
      const session = store.sessions.get(token);
      if (!session) return undefined;
      return ADMIN_USERS.find((user) => user.id === session.userId);
    },

    getClientSession(token) {
      return store.clientSessions.get(token)?.identity;
    },

    createDocument(input, uploadedByAdminId = null) {
      const id = prefixedId("doc");
      const now = nowIso();
      const document = {
        id,
        ownerType: "unbound",
        ownerId: null,
        purpose: input.purpose,
        status: "uploaded",
        accessScope: "admin_only",
        originalFilename: input.filename,
        filename: input.filename,
        storageKey: `${id}-${sanitizeFilename(input.filename)}`,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256Hash: createHash("sha256")
          .update(`${input.filename}:${input.mimeType}:${input.sizeBytes}:${now}`)
          .digest("hex"),
        uploadedByAdminId,
        boundAt: null,
        createdAt: now
      };
      store.documents.set(id, document);
      return stripInternalDocumentFields(document);
    },

    bindDocuments(documentIds, ownerType, ownerId, expectedPurpose) {
      for (const documentId of documentIds) {
        const document = store.documents.get(documentId);
        if (!document || document.ownerType !== "unbound" || document.status !== "uploaded") {
          return { ok: false, documentId, reason: "附件不存在或已绑定" };
        }
        if (expectedPurpose && document.purpose !== expectedPurpose) {
          return { ok: false, documentId, reason: "附件用途不匹配" };
        }
      }

      for (const documentId of documentIds) {
        const document = store.documents.get(documentId);
        document.ownerType = ownerType;
        document.ownerId = ownerId;
        document.status = "bound";
        document.boundAt = nowIso();
      }

      return { ok: true };
    },

    listDocuments(ownerType, ownerId) {
      return [...store.documents.values()]
        .filter((document) => document.ownerType === ownerType && document.ownerId === ownerId)
        .map(stripInternalDocumentFields);
    },

    getDocument(id) {
      return store.documents.get(id);
    },

    createDebtorApplication(input, metadata = {}) {
      const id = prefixedId("app");
      const now = nowIso();
      const application = {
        id,
        name: input.name.trim(),
        phone: normalizePhone(input.phone),
        phoneNormalized: normalizePhone(input.phone),
        city: input.city.trim(),
        bankName: input.bankName.trim(),
        totalDebtAmountCents: input.totalDebtAmountCents,
        overdueRange: input.overdueRange,
        isUnderCollection: input.isUnderCollection,
        hasLegalNotice: input.hasLegalNotice,
        monthlyIncomeCents: input.monthlyIncomeCents,
        monthlyRepaymentCapacityCents: input.monthlyRepaymentCapacityCents,
        repaymentCapacityNeedsReview:
          input.monthlyRepaymentCapacityCents > input.monthlyIncomeCents,
        expectedSolutions: [...input.expectedSolutions],
        hardshipReasons: [...input.hardshipReasons],
        hardshipDescription: input.hardshipDescription?.trim() || null,
        status: "submitted",
        reviewReason: null,
        reviewedById: null,
        reviewedAt: null,
        truthfulnessAcceptedAt: now,
        privacyAcceptedAt: now,
        serviceAgreementAcceptedAt: now,
        agreementVersion: SERVICE_AGREEMENT_VERSION,
        consentIpHash: metadata.ipHash ?? null,
        consentUserAgent: metadata.userAgent ?? null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null
      };
      store.debtorApplications.set(id, application);
      return application;
    },

    createPartnerOrganization(input) {
      const id = prefixedId("org");
      const now = nowIso();
      const organization = {
        id,
        organizationName: input.organizationName.trim(),
        unifiedSocialCreditCode: input.unifiedSocialCreditCode.trim().toUpperCase(),
        legalRepresentativeName: input.legalRepresentativeName.trim(),
        contactName: input.contactName.trim(),
        contactPhone: normalizePhone(input.contactPhone),
        contactPhoneNormalized: normalizePhone(input.contactPhone),
        serviceCities: [...input.serviceCities],
        acceptedBanks: [...input.acceptedBanks],
        capabilities: [...input.capabilities],
        minInstallmentMonths: input.minInstallmentMonths ?? null,
        maxInstallmentMonths: input.maxInstallmentMonths ?? null,
        averageProcessingDays: input.averageProcessingDays ?? null,
        cooperationModes: [...input.cooperationModes],
        status: "pending_review",
        reviewReason: null,
        reviewedById: null,
        reviewedAt: null,
        complianceAcceptedAt: now,
        agreementVersion: SERVICE_AGREEMENT_VERSION,
        createdAt: now,
        updatedAt: now,
        suspendedAt: null
      };
      store.partnerOrganizations.set(id, organization);
      return organization;
    },

    createMatchCase(input, actor) {
      const id = prefixedId("case");
      const now = nowIso();
      const matchCase = {
        id,
        debtorApplicationId: input.applicationId,
        partnerOrganizationId: input.partnerOrganizationId,
        status: "matched",
        matchReason: input.matchReason.trim(),
        proposedPlan: input.proposedPlan ?? {},
        failureReason: null,
        createdById: actor.id,
        lastTransitionById: actor.id,
        lastTransitionReason: input.matchReason.trim(),
        lastTransitionAt: now,
        createdAt: now,
        updatedAt: now,
        archivedAt: null
      };
      store.matchCases.set(id, matchCase);
      return matchCase;
    },

    createNote(matchCaseId, actor, input) {
      const id = prefixedId("note");
      const note = {
        id,
        matchCaseId,
        authorId: actor.id,
        content: input.content.trim(),
        visibility: "internal",
        createdAt: nowIso()
      };
      store.matchCaseNotes.set(id, note);
      return note;
    },

    addAuditLog({ actor, action, entityType, entityId, before = {}, after = {}, reason = null }) {
      const log = {
        id: prefixedId("log"),
        actorId: actor?.id ?? null,
        actorRole: actor?.role ?? null,
        action,
        entityType,
        entityId,
        before,
        after,
        reason,
        createdAt: nowIso()
      };
      store.auditLogs.push(log);
      return log;
    },

    listAuditLogs(entityType, entityId) {
      return store.auditLogs
        .filter((log) => (!entityType || log.entityType === entityType) && (!entityId || log.entityId === entityId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    listDebtorApplications(query = {}) {
      return paginate(
        [...store.debtorApplications.values()].filter((item) => {
          if (query.status && item.status !== query.status) return false;
          if (query.keyword) {
            const keyword = String(query.keyword).trim();
            return item.name.includes(keyword) || item.phoneNormalized.includes(keyword);
          }
          return true;
        }),
        query,
        toDebtorListItem
      );
    },

    listPartnerOrganizations(query = {}) {
      return paginate(
        [...store.partnerOrganizations.values()].filter((item) => !query.status || item.status === query.status),
        query,
        toPartnerListItem
      );
    },

    listMatchCases(query = {}) {
      return paginate(
        [...store.matchCases.values()].filter((item) => !query.status || item.status === query.status),
        query,
        (item) => item
      );
    },

    findDebtorApplicationsByPhone(phone) {
      const normalized = normalizePhone(phone);
      return [...store.debtorApplications.values()]
        .filter((item) => item.phoneNormalized === normalized)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    findPartnerOrganizationByPhone(phone) {
      const normalized = normalizePhone(phone);
      return [...store.partnerOrganizations.values()]
        .filter((item) => item.contactPhoneNormalized === normalized)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    },

    findMatchCasesByDebtorPhone(phone) {
      const applicationIds = new Set(this.findDebtorApplicationsByPhone(phone).map((item) => item.id));
      return [...store.matchCases.values()]
        .filter((item) => applicationIds.has(item.debtorApplicationId))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    findMatchCasesByPartnerOrganization(id) {
      return [...store.matchCases.values()]
        .filter((item) => item.partnerOrganizationId === id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
  };
}

export function toDebtorListItem(application) {
  return {
    id: application.id,
    nameMasked: maskName(application.name),
    phoneMasked: maskPhone(application.phone),
    city: application.city,
    bankName: application.bankName,
    totalDebtAmountCents: application.totalDebtAmountCents,
    overdueRange: application.overdueRange,
    status: application.status,
    createdAt: application.createdAt
  };
}

export function toPartnerListItem(organization) {
  return {
    id: organization.id,
    organizationName: organization.organizationName,
    contactPhoneMasked: maskPhone(organization.contactPhone),
    serviceCities: organization.serviceCities,
    acceptedBanks: organization.acceptedBanks,
    capabilities: organization.capabilities,
    status: organization.status,
    createdAt: organization.createdAt
  };
}

function paginate(items, query, mapper) {
  const page = positiveInt(query.page, 1);
  const pageSize = Math.min(positiveInt(query.pageSize, 20), 100);
  const sorted = items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    items: sorted.slice((page - 1) * pageSize, page * pageSize).map(mapper),
    total: sorted.length,
    page,
    pageSize
  };
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function sanitizeFilename(filename) {
  return String(filename).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160);
}

function maskName(name) {
  if (!name) return "";
  if (name.length <= 1) return "*";
  return `${name[0]}${"*".repeat(Math.min(name.length - 1, 2))}`;
}
