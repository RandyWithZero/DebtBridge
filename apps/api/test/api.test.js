import assert from "node:assert/strict";
import { describe, it } from "node:test";
import http from "node:http";
import { createApp } from "../src/server.js";

describe("DebtBridge MVP API", () => {
  it("accepts debtor applications and rejects missing commitments", async () => {
    const client = await startClient();
    try {
      const invalid = await client.post("/api/debtor-applications", {
        ...debtorPayload(),
        privacyAccepted: false
      });

      assert.equal(invalid.status, 400);
      assert.equal(invalid.body.error.fields.privacyAccepted, "必须勾选确认");

      const document = await client.post("/api/documents/public-upload", {
        filename: "income-proof.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        purpose: "debtor_supporting_material"
      });
      assert.equal(document.status, 201);

      const created = await client.post("/api/debtor-applications", {
        ...debtorPayload(),
        supportingDocumentIds: [document.body.id]
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.status, "submitted");
      assert.match(created.body.id, /^app_/);
    } finally {
      await client.close();
    }
  });

  it("guards admin workflow transitions and creates audited match cases", async () => {
    const client = await startClient();
    try {
      const token = await login(client);
      const app = await createQualifiedApplication(client, token);
      const org = await createActivePartner(client, token);

      const skippedMatch = await client.post(
        `/api/admin/debtor-applications/${app.id}/review`,
        { decision: "matched", reason: "skip" },
        token
      );
      assert.equal(skippedMatch.status, 400);

      const match = await client.post(
        "/api/admin/match-cases",
        {
          applicationId: app.id,
          partnerOrganizationId: org.id,
          matchReason: "该机构可承接招商银行分期协商",
          proposedPlan: {
            type: "installment",
            installmentMonths: 48,
            notes: "以银行最终确认为准"
          }
        },
        token
      );
      assert.equal(match.status, 201);
      assert.equal(match.body.status, "matched");

      const invalidTransition = await client.post(
        `/api/admin/match-cases/${match.body.id}/transition`,
        { nextStatus: "agreement_signed", reason: "missing file" },
        token
      );
      assert.equal(invalidTransition.status, 409);

      const note = await client.post(
        `/api/admin/match-cases/${match.body.id}/notes`,
        { content: "已联系用户确认继续推进", visibility: "internal" },
        token
      );
      assert.equal(note.status, 201);

      const audit = await client.get(
        `/api/admin/audit-logs?entityType=match_case&entityId=${match.body.id}`,
        token
      );
      assert.equal(audit.status, 200);
      assert.ok(audit.body.items.some((item) => item.action === "MATCH_CASE_CREATE"));
      assert.ok(audit.body.items.some((item) => item.action === "MATCH_CASE_NOTE_CREATE"));
    } finally {
      await client.close();
    }
  });

  it("requires active partners to pass review and blocks operator suspension", async () => {
    const client = await startClient();
    try {
      const managerToken = await login(client);
      const operatorToken = await login(client, "operator@example.com");
      const org = await createActivePartner(client, managerToken);

      const blocked = await client.post(
        `/api/admin/partner-organizations/${org.id}/review`,
        { decision: "suspended", reason: "quarterly risk hold" },
        operatorToken
      );
      assert.equal(blocked.status, 403);

      const suspended = await client.post(
        `/api/admin/partner-organizations/${org.id}/review`,
        { decision: "suspended", reason: "quarterly risk hold" },
        managerToken
      );
      assert.equal(suspended.status, 200);
      assert.equal(suspended.body.status, "suspended");
    } finally {
      await client.close();
    }
  });

  it("isolates debtor, partner, and admin identity APIs", async () => {
    const client = await startClient();
    try {
      const managerToken = await login(client);
      const debtorToken = await login(client, "debtor@example.com");
      const partnerToken = await login(client, "partner@example.com");

      const adminBlockedFromDebtorArea = await client.get("/api/debtor/me/applications", managerToken);
      assert.equal(adminBlockedFromDebtorArea.status, 403);

      const debtorApplication = await client.post(
        "/api/debtor/me/applications",
        debtorPayload(),
        debtorToken
      );
      assert.equal(debtorApplication.status, 201);

      const debtorList = await client.get("/api/debtor/me/applications", debtorToken);
      assert.equal(debtorList.status, 200);
      assert.deepEqual(
        debtorList.body.items.map((item) => item.id),
        [debtorApplication.body.id]
      );

      const partnerOrg = await createActivePartner(client, managerToken, partnerToken);
      const qualified = await qualifyApplication(client, managerToken, debtorApplication.body.id);

      const match = await client.post(
        "/api/admin/match-cases",
        {
          applicationId: qualified.id,
          partnerOrganizationId: partnerOrg.id,
          matchReason: "机构服务范围匹配",
          proposedPlan: { type: "installment" }
        },
        managerToken
      );
      assert.equal(match.status, 201);

      const partnerCases = await client.get("/api/partner/me/match-cases", partnerToken);
      assert.equal(partnerCases.status, 200);
      assert.deepEqual(
        partnerCases.body.items.map((item) => item.id),
        [match.body.id]
      );

      const debtorBlockedFromPartnerCase = await client.get(
        `/api/partner/match-cases/${match.body.id}`,
        debtorToken
      );
      assert.equal(debtorBlockedFromPartnerCase.status, 403);

      const operatorToken = await login(client, "operator@example.com");
      const auditBlocked = await client.get("/api/admin/audit-logs", operatorToken);
      assert.equal(auditBlocked.status, 403);
    } finally {
      await client.close();
    }
  });
});

async function createQualifiedApplication(client, token) {
  const created = await client.post("/api/debtor-applications", debtorPayload());
  assert.equal(created.status, 201);
  return qualifyApplication(client, token, created.body.id);
}

async function qualifyApplication(client, token, applicationId) {
  const underReview = await client.post(
    `/api/admin/debtor-applications/${applicationId}/review`,
    { decision: "under_review", reason: "开始人工初审" },
    token
  );
  assert.equal(underReview.status, 200);

  const qualified = await client.post(
    `/api/admin/debtor-applications/${applicationId}/review`,
    { decision: "qualified", reason: "符合信用卡协商初筛范围" },
    token
  );
  assert.equal(qualified.status, 200);
  return qualified.body;
}

async function createActivePartner(client, token, partnerToken) {
  const license = await uploadDocument(client, "partner_business_license");
  const idDoc = await uploadDocument(client, "partner_legal_representative_id");
  const qualification = await uploadDocument(client, "partner_qualification");
  const created = await client.post(
    partnerToken ? "/api/partner/me/application" : "/api/partner-applications",
    partnerPayload(license.id, idDoc.id, qualification.id),
    partnerToken
  );
  assert.equal(created.status, 201);

  const underReview = await client.post(
    `/api/admin/partner-organizations/${created.body.id}/review`,
    { decision: "under_review", reason: "开始资质审核" },
    token
  );
  assert.equal(underReview.status, 200);

  const active = await client.post(
    `/api/admin/partner-organizations/${created.body.id}/review`,
    { decision: "active", reason: "营业执照和业务资质通过人工核验" },
    token
  );
  assert.equal(active.status, 200);
  return active.body;
}

function partnerPayload(licenseId, idDocumentId, qualificationId) {
  return {
    organizationName: "某某法律咨询有限公司",
    unifiedSocialCreditCode: `91310000${Math.random().toString(36).slice(2, 12).toUpperCase()}`.slice(0, 18),
    legalRepresentativeName: "李四",
    contactName: "王五",
    contactPhone: "13900000000",
    serviceCities: ["上海", "杭州"],
    acceptedBanks: ["招商银行", "工商银行"],
    capabilities: ["installment", "interest_penalty_reduction"],
    minInstallmentMonths: 12,
    maxInstallmentMonths: 60,
    averageProcessingDays: 15,
    cooperationModes: ["success_fee"],
    licenseDocumentIds: [licenseId],
    legalRepresentativeIdDocumentIds: [idDocumentId],
    qualificationDocumentIds: [qualificationId],
    complianceAccepted: true
  };
}

async function uploadDocument(client, purpose) {
  const response = await client.post("/api/documents/public-upload", {
    filename: `${purpose}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 2048,
    purpose
  });
  assert.equal(response.status, 201);
  return response.body;
}

async function login(client, email = "admin@example.com") {
  const endpoint = ["admin@example.com", "operator@example.com"].includes(email)
    ? "/api/admin/auth/login"
    : "/api/auth/login";
  const response = await client.post(endpoint, { email, password: "password" });
  assert.equal(response.status, 200);
  return response.body.token;
}

function debtorPayload() {
  return {
    name: "张三",
    phone: "13800000000",
    city: "上海",
    bankName: "招商银行",
    totalDebtAmountCents: 10000000,
    overdueRange: "3_6_months",
    isUnderCollection: true,
    hasLegalNotice: false,
    monthlyIncomeCents: 800000,
    monthlyRepaymentCapacityCents: 300000,
    expectedSolutions: ["installment", "interest_penalty_reduction"],
    hardshipReasons: ["income_drop"],
    hardshipDescription: "收入下降，暂时无法全额偿还",
    supportingDocumentIds: [],
    truthfulnessAccepted: true,
    privacyAccepted: true,
    serviceAgreementAccepted: true
  };
}

async function startClient() {
  const { handler } = createApp();
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    async get(path, token) {
      return request(port, "GET", path, undefined, token);
    },
    async post(path, body, token) {
      return request(port, "POST", path, body, token);
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

async function request(port, method, path, body, token) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
}
