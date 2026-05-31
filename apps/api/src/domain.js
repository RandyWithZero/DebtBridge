import { randomUUID } from "node:crypto";

export const SERVICE_AGREEMENT_VERSION = "2026-05-01";
export const MAX_UPLOAD_MB = 10;

export const PUBLIC_CONFIG = {
  debtBanks: ["工商银行", "建设银行", "招商银行", "其他"],
  overdueRanges: ["not_overdue", "1_3_months", "3_6_months", "over_6_months"],
  expectedSolutions: ["installment", "interest_penalty_reduction", "stop_collection", "mediation"],
  hardshipReasons: ["income_drop", "illness", "family_change", "business_failure", "other"],
  maxUploadMb: MAX_UPLOAD_MB,
  serviceAgreementVersion: SERVICE_AGREEMENT_VERSION
};

export const DOCUMENT_PURPOSES = new Set([
  "debtor_supporting_material",
  "partner_business_license",
  "partner_legal_representative_id",
  "partner_qualification",
  "agreement",
  "admin_supplement"
]);

export const PUBLIC_DOCUMENT_PURPOSES = new Set([
  "debtor_supporting_material",
  "partner_business_license",
  "partner_legal_representative_id",
  "partner_qualification"
]);

export const DEBTOR_REVIEW_TRANSITIONS = {
  submitted: new Set(["under_review"]),
  under_review: new Set(["need_more_info", "qualified", "rejected"]),
  need_more_info: new Set(["under_review", "qualified", "rejected"]),
  qualified: new Set(["archived"]),
  matched: new Set(["archived"]),
  rejected: new Set(["archived"]),
  withdrawn: new Set(["archived"]),
  archived: new Set()
};

export const PARTNER_REVIEW_TRANSITIONS = {
  pending_review: new Set(["under_review", "rejected"]),
  under_review: new Set(["active", "rejected", "need_more_info"]),
  need_more_info: new Set(["under_review", "rejected"]),
  active: new Set(["suspended"]),
  suspended: new Set(["active", "rejected"]),
  rejected: new Set()
};

export const MATCH_CASE_TRANSITIONS = {
  matched: new Set(["contacted", "cancelled"]),
  contacted: new Set(["negotiating", "failed"]),
  negotiating: new Set(["agreement_pending", "failed"]),
  agreement_pending: new Set(["agreement_signed", "failed"]),
  agreement_signed: new Set(["in_repayment", "success", "failed"]),
  in_repayment: new Set(["success", "failed"]),
  success: new Set(["archived"]),
  failed: new Set(["archived"]),
  cancelled: new Set(["archived"]),
  archived: new Set()
};

export const ADMIN_USERS = [
  {
    id: "admin_1",
    email: "admin@example.com",
    password: "password",
    role: "manager",
    displayName: "Default Manager"
  },
  {
    id: "admin_2",
    email: "operator@example.com",
    password: "password",
    role: "operator",
    displayName: "Default Operator"
  }
];

export function prefixedId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizePhone(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

export function maskPhone(phone) {
  const normalized = normalizePhone(phone);
  if (normalized.length < 7) return normalized;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

export function stripInternalDocumentFields(document) {
  const { storageKey, sha256Hash, ...publicFields } = document;
  return publicFields;
}
