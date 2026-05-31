import {
  DOCUMENT_PURPOSES,
  PUBLIC_CONFIG,
  PUBLIC_DOCUMENT_PURPOSES,
  normalizePhone
} from "./domain.js";
import { validationError } from "./errors.js";

const MAINLAND_PHONE = /^1[3-9]\d{9}$/;
const CREDIT_CODE = /^[0-9A-Z]{15,18}$/;
const FORBIDDEN_SENSITIVE_TERMS = [
  "验证码",
  "密码",
  "支付密码",
  "银行卡密码",
  "网银登录",
  "完整卡号",
  "cvv",
  "cvc"
];

export function assertObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError({ body: "请求体必须是 JSON 对象" });
  }
}

export function validatePublicDocumentUpload(input, isAdmin = false) {
  assertObject(input);
  const fields = {};
  const purposeSet = isAdmin ? DOCUMENT_PURPOSES : PUBLIC_DOCUMENT_PURPOSES;

  if (!purposeSet.has(input.purpose)) fields.purpose = "文件用途不支持";
  if (!input.filename || typeof input.filename !== "string") fields.filename = "文件名必填";
  if (!input.mimeType || typeof input.mimeType !== "string") fields.mimeType = "MIME 类型必填";
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    fields.sizeBytes = "文件大小必须为正整数";
  } else if (input.sizeBytes > PUBLIC_CONFIG.maxUploadMb * 1024 * 1024) {
    fields.sizeBytes = `文件大小不能超过 ${PUBLIC_CONFIG.maxUploadMb}MB`;
  }

  if (Object.keys(fields).length) throw validationError(fields);
}

export function validateDebtorApplication(input) {
  assertObject(input);
  const fields = {};
  const phone = normalizePhone(input.phone);

  requireText(input.name, "name", fields);
  if (!MAINLAND_PHONE.test(phone)) fields.phone = "手机号格式不正确";
  requireText(input.city, "city", fields);
  requireText(input.bankName, "bankName", fields);
  requireNonNegativeInteger(input.totalDebtAmountCents, "totalDebtAmountCents", fields);
  if (!PUBLIC_CONFIG.overdueRanges.includes(input.overdueRange)) fields.overdueRange = "逾期时长不支持";
  requireBoolean(input.isUnderCollection, "isUnderCollection", fields);
  requireBoolean(input.hasLegalNotice, "hasLegalNotice", fields);
  requireNonNegativeInteger(input.monthlyIncomeCents, "monthlyIncomeCents", fields);
  requireNonNegativeInteger(input.monthlyRepaymentCapacityCents, "monthlyRepaymentCapacityCents", fields);
  requireEnumArray(input.expectedSolutions, "expectedSolutions", PUBLIC_CONFIG.expectedSolutions, fields);
  requireEnumArray(input.hardshipReasons, "hardshipReasons", PUBLIC_CONFIG.hardshipReasons, fields);
  requireAccepted(input.truthfulnessAccepted, "truthfulnessAccepted", fields);
  requireAccepted(input.privacyAccepted, "privacyAccepted", fields);
  requireAccepted(input.serviceAgreementAccepted, "serviceAgreementAccepted", fields);
  if (input.supportingDocumentIds && !isStringArray(input.supportingDocumentIds)) {
    fields.supportingDocumentIds = "附件引用必须是字符串数组";
  }
  if (containsForbiddenTerms(input.hardshipDescription)) {
    fields.hardshipDescription = "请勿填写银行卡密码、验证码、完整卡号等高风险敏感信息";
  }

  if (Object.keys(fields).length) throw validationError(fields);
}

export function validatePartnerApplication(input) {
  assertObject(input);
  const fields = {};
  const phone = normalizePhone(input.contactPhone);

  requireText(input.organizationName, "organizationName", fields);
  if (!CREDIT_CODE.test(String(input.unifiedSocialCreditCode ?? ""))) {
    fields.unifiedSocialCreditCode = "统一社会信用代码格式不正确";
  }
  requireText(input.legalRepresentativeName, "legalRepresentativeName", fields);
  requireText(input.contactName, "contactName", fields);
  if (!MAINLAND_PHONE.test(phone)) fields.contactPhone = "联系人手机号格式不正确";
  requireNonEmptyStringArray(input.serviceCities, "serviceCities", fields);
  requireNonEmptyStringArray(input.acceptedBanks, "acceptedBanks", fields);
  requireEnumArray(input.capabilities, "capabilities", PUBLIC_CONFIG.expectedSolutions, fields);
  requireNonEmptyStringArray(input.cooperationModes, "cooperationModes", fields);
  requireNonEmptyStringArray(input.licenseDocumentIds, "licenseDocumentIds", fields);
  requireNonEmptyStringArray(input.legalRepresentativeIdDocumentIds, "legalRepresentativeIdDocumentIds", fields);
  requireNonEmptyStringArray(input.qualificationDocumentIds, "qualificationDocumentIds", fields);
  requireAccepted(input.complianceAccepted, "complianceAccepted", fields);
  optionalPositiveInteger(input.minInstallmentMonths, "minInstallmentMonths", fields);
  optionalPositiveInteger(input.maxInstallmentMonths, "maxInstallmentMonths", fields);
  optionalPositiveInteger(input.averageProcessingDays, "averageProcessingDays", fields);
  if (
    Number.isInteger(input.minInstallmentMonths) &&
    Number.isInteger(input.maxInstallmentMonths) &&
    input.maxInstallmentMonths < input.minInstallmentMonths
  ) {
    fields.maxInstallmentMonths = "最高分期期数不能小于最低分期期数";
  }

  if (Object.keys(fields).length) throw validationError(fields);
}

export function validateReasonedDecision(decision, reason, allowed, field = "decision") {
  const fields = {};
  if (!allowed.includes(decision)) fields[field] = "状态动作不支持";
  if (["rejected", "failed", "cancelled", "suspended"].includes(decision) && !isNonBlankString(reason)) {
    fields.reason = "该动作必须填写原因";
  }
  if (Object.keys(fields).length) throw validationError(fields);
}

export function validateMatchCreate(input) {
  assertObject(input);
  const fields = {};
  requireText(input.applicationId, "applicationId", fields);
  requireText(input.partnerOrganizationId, "partnerOrganizationId", fields);
  requireText(input.matchReason, "matchReason", fields);
  if (input.proposedPlan && (typeof input.proposedPlan !== "object" || Array.isArray(input.proposedPlan))) {
    fields.proposedPlan = "推荐方案必须是对象";
  }
  if (containsForbiddenTerms(input.matchReason) || containsForbiddenTerms(JSON.stringify(input.proposedPlan ?? {}))) {
    fields.proposedPlan = "推荐方案不得包含密码、验证码、完整卡号等高风险敏感信息";
  }
  if (Object.keys(fields).length) throw validationError(fields);
}

export function validateNote(input) {
  assertObject(input);
  const fields = {};
  requireText(input.content, "content", fields);
  if (input.visibility && input.visibility !== "internal") fields.visibility = "MVP 仅支持 internal";
  if (containsForbiddenTerms(input.content)) fields.content = "备注不得记录密码、验证码、完整卡号等高风险敏感信息";
  if (Object.keys(fields).length) throw validationError(fields);
}

export function validateDocumentBinding(input, requiredPurpose = "agreement") {
  assertObject(input);
  const fields = {};
  requireText(input.documentId, "documentId", fields);
  if (input.documentType !== requiredPurpose) fields.documentType = `documentType 必须为 ${requiredPurpose}`;
  if (Object.keys(fields).length) throw validationError(fields);
}

function requireText(value, name, fields) {
  if (!isNonBlankString(value)) fields[name] = "必填";
}

function requireBoolean(value, name, fields) {
  if (typeof value !== "boolean") fields[name] = "必须为布尔值";
}

function requireAccepted(value, name, fields) {
  if (value !== true) fields[name] = "必须勾选确认";
}

function requireNonNegativeInteger(value, name, fields) {
  if (!Number.isInteger(value) || value < 0) fields[name] = "必须为非负整数，单位为分";
}

function optionalPositiveInteger(value, name, fields) {
  if (value !== undefined && value !== null && (!Number.isInteger(value) || value <= 0)) {
    fields[name] = "必须为正整数";
  }
}

function requireEnumArray(value, name, allowed, fields) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !allowed.includes(item))) {
    fields[name] = "必须至少选择一个有效选项";
  }
}

function requireNonEmptyStringArray(value, name, fields) {
  if (!isStringArray(value) || value.length === 0 || value.some((item) => !isNonBlankString(item))) {
    fields[name] = "必须至少填写一项";
  }
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function containsForbiddenTerms(value) {
  if (!value) return false;
  const lower = String(value).toLowerCase();
  return FORBIDDEN_SENSITIVE_TERMS.some((term) => lower.includes(term.toLowerCase()));
}
