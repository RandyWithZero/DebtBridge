import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_USERS, PUBLIC_CONFIG, maskPhone, normalizePhone, stripInternalDocumentFields } from "./domain.js";
import { ApiError, forbidden, notFound, validationError } from "./errors.js";
import { createDebtBridgeService } from "./service.js";
import { createStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "../../web");

export function createApp() {
  const repository = createStore();
  const service = createDebtBridgeService(repository);

  async function handler(request, response) {
    try {
      const url = new URL(request.url, "http://localhost");
      if (!url.pathname.startsWith("/api/")) {
        const served = await serveStatic(request, response, url);
        if (served) return;
      }
      const route = matchRoute(request.method, url.pathname);
      if (!route) throw notFound("接口不存在");

      const actor = route.admin ? requireAdmin(request, repository) : route.client ? requireClient(request, repository, route.client) : null;
      const body = await readJsonBody(request);
      const result = await route.handle({
        request,
        url,
        body,
        params: route.params,
        actor,
        repository,
        service
      });

      writeJson(response, result.status ?? 200, result.body);
    } catch (error) {
      writeError(response, error);
    }
  }

  return { handler, repository, service };
}

async function serveStatic(request, response, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const requestedPath = path.resolve(WEB_ROOT, relativePath);
  const filePath = requestedPath.startsWith(WEB_ROOT) ? requestedPath : path.join(WEB_ROOT, "index.html");
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return streamFile(path.join(WEB_ROOT, "index.html"), response);
    return streamFile(filePath, response);
  } catch {
    return streamFile(path.join(WEB_ROOT, "index.html"), response);
  }
}

function streamFile(filePath, response) {
  response.writeHead(200, { "content-type": contentType(filePath) });
  createReadStream(filePath).pipe(response);
  return true;
}

function contentType(filePath) {
  const extension = path.extname(filePath);
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    }[extension] ?? "application/octet-stream"
  );
}

export function createHttpServer() {
  return http.createServer(createApp().handler);
}

const routes = [
  route("GET", "/api/public/config", false, ({}) => ({ body: PUBLIC_CONFIG })),
  route("POST", "/api/documents/public-upload", false, ({ body, service }) => ({
    status: 201,
    body: service.uploadPublicDocument(body)
  })),
  route("POST", "/api/debtor-applications", false, ({ body, request, service }) => ({
    status: 201,
    body: service.createDebtorApplication(body, requestMetadata(request))
  })),
  route("POST", "/api/partner-applications", false, ({ body, service }) => ({
    status: 201,
    body: service.createPartnerApplication(body)
  })),
  route("POST", "/api/auth/login", false, ({ body, repository }) => {
    if (body?.role === "admin") return loginAdmin(body, repository);
    if (body?.role === "debtor") {
      if (!body?.name || !body?.phone) throw validationError({ name: "姓名必填", phone: "手机号必填" });
      const identity = {
        role: "debtor",
        name: String(body.name).trim(),
        phone: normalizePhone(body.phone)
      };
      const token = repository.createClientSession(identity);
      return { body: { token, user: publicClientIdentity(identity, repository) } };
    }
    if (body?.role === "partner") {
      if (!body?.organizationName || !body?.phone) {
        throw validationError({ organizationName: "机构名称必填", phone: "手机号必填" });
      }
      const organization = repository.findPartnerOrganizationByPhone(body.phone);
      const identity = {
        role: "partner",
        organizationName: String(body.organizationName).trim(),
        phone: normalizePhone(body.phone),
        organizationId: organization?.id ?? null
      };
      const token = repository.createClientSession(identity);
      return { body: { token, user: publicClientIdentity(identity, repository) } };
    }
    throw validationError({ role: "登录身份不支持" });
  }),
  route("GET", "/api/auth/me", "any", ({ actor, repository }) => ({
    body: { user: publicClientIdentity(actor, repository) }
  })),
  route("POST", "/api/auth/logout", "any", ({ request, repository }) => {
    repository.deleteSession(getBearerToken(request));
    return { body: { ok: true } };
  }),
  route("POST", "/api/client/debtor/applications", "debtor", ({ body, request, service, actor }) => ({
    status: 201,
    body: service.createDebtorApplication(
      {
        ...body,
        name: actor.name,
        phone: actor.phone
      },
      requestMetadata(request)
    )
  })),
  route("GET", "/api/client/debtor/applications", "debtor", ({ actor, repository }) => ({
    body: {
      items: repository.findDebtorApplicationsByPhone(actor.phone).map(toDebtorPortalApplication),
      total: repository.findDebtorApplicationsByPhone(actor.phone).length
    }
  })),
  route("GET", /^\/api\/client\/debtor\/applications\/([^/]+)$/, "debtor", ({ params, actor, repository }) => {
    const application = getOwnedDebtorApplication(params[0], actor, repository);
    return { body: { ...toDebtorPortalApplication(application), documents: repository.listDocuments("debtor_application", application.id) } };
  }),
  route("POST", /^\/api\/client\/debtor\/applications\/([^/]+)\/supplements$/, "debtor", ({ params, body, actor, service }) => ({
    body: toDebtorPortalApplication(service.supplementDebtorApplication(params[0], body, actor))
  })),
  route("GET", "/api/client/debtor/cases", "debtor", ({ actor, repository }) => ({
    body: { items: repository.findMatchCasesByDebtorPhone(actor.phone).map((item) => toDebtorPortalCase(item, repository)) }
  })),
  route("GET", "/api/client/partner/profile", "partner", ({ actor, repository }) => ({
    body: { organization: actor.organizationId ? toPartnerPortalOrganization(repository.store.partnerOrganizations.get(actor.organizationId), repository) : null }
  })),
  route("POST", "/api/client/partner/onboarding", "partner", ({ body, service, actor, repository }) => {
    const result = service.createPartnerApplication(body);
    const organization = repository.store.partnerOrganizations.get(result.id);
    actor.organizationId = organization.id;
    actor.organizationName = organization.organizationName;
    return { status: 201, body: result };
  }),
  route("POST", "/api/client/partner/organization/supplements", "partner", ({ body, actor, service }) => ({
    body: toPartnerPortalOrganization(service.supplementPartnerOrganization(body, actor), { listDocuments: () => [] })
  })),
  route("GET", "/api/client/partner/cases", "partner", ({ actor, repository }) => ({
    body: { items: actor.organizationId ? repository.findMatchCasesByPartnerOrganization(actor.organizationId).map((item) => toPartnerPortalCase(item, repository)) : [] }
  })),
  route("POST", "/api/admin/auth/login", false, ({ body, repository }) => {
    return loginAdmin(body, repository);
  }),
  route("GET", "/api/admin/auth/me", true, ({ actor }) => ({ body: { user: publicUser(actor) } })),
  route("POST", "/api/admin/auth/logout", true, ({ request, repository }) => {
    repository.deleteSession(getBearerToken(request));
    return { body: { ok: true } };
  }),
  route("POST", "/api/admin/documents", true, ({ body, actor, service }) => ({
    status: 201,
    body: service.uploadAdminDocument(body, actor)
  })),
  route("GET", "/api/admin/debtor-applications", true, ({ url, repository }) => ({
    body: repository.listDebtorApplications(Object.fromEntries(url.searchParams))
  })),
  route("GET", /^\/api\/admin\/debtor-applications\/([^/]+)$/, true, ({ params, repository }) => {
    const application = repository.store.debtorApplications.get(params[0]);
    if (!application) throw notFound("欠款人申请不存在");
    return {
      body: {
        ...application,
        documents: repository.listDocuments("debtor_application", application.id),
        auditLogs: repository.listAuditLogs("debtor_application", application.id)
      }
    };
  }),
  route("POST", /^\/api\/admin\/debtor-applications\/([^/]+)\/review$/, true, ({ params, body, actor, service }) => ({
    body: service.reviewDebtorApplication(params[0], body, actor)
  })),
  route("GET", "/api/admin/partner-organizations", true, ({ url, repository }) => ({
    body: repository.listPartnerOrganizations(Object.fromEntries(url.searchParams))
  })),
  route("GET", /^\/api\/admin\/partner-organizations\/([^/]+)$/, true, ({ params, repository }) => {
    const organization = repository.store.partnerOrganizations.get(params[0]);
    if (!organization) throw notFound("机构不存在");
    return {
      body: {
        ...organization,
        documents: repository.listDocuments("partner_organization", organization.id),
        auditLogs: repository.listAuditLogs("partner_organization", organization.id)
      }
    };
  }),
  route("POST", /^\/api\/admin\/partner-organizations\/([^/]+)\/review$/, true, ({ params, body, actor, service }) => ({
    body: service.reviewPartnerOrganization(params[0], body, actor)
  })),
  route("POST", "/api/admin/match-cases", true, ({ body, actor, service }) => ({
    status: 201,
    body: service.createMatchCase(body, actor)
  })),
  route("GET", "/api/admin/match-cases", true, ({ url, repository }) => ({
    body: repository.listMatchCases(Object.fromEntries(url.searchParams))
  })),
  route("GET", /^\/api\/admin\/match-cases\/([^/]+)$/, true, ({ params, repository }) => {
    const matchCase = repository.store.matchCases.get(params[0]);
    if (!matchCase) throw notFound("匹配案件不存在");
    return {
      body: {
        ...matchCase,
        notes: [...repository.store.matchCaseNotes.values()].filter((note) => note.matchCaseId === matchCase.id),
        documents: repository.listDocuments("match_case", matchCase.id),
        auditLogs: repository.listAuditLogs("match_case", matchCase.id)
      }
    };
  }),
  route("POST", /^\/api\/admin\/match-cases\/([^/]+)\/transition$/, true, ({ params, body, actor, service }) => ({
    body: service.transitionMatchCase(params[0], body, actor)
  })),
  route("POST", /^\/api\/admin\/match-cases\/([^/]+)\/notes$/, true, ({ params, body, actor, service }) => ({
    status: 201,
    body: service.addMatchCaseNote(params[0], body, actor)
  })),
  route("POST", /^\/api\/admin\/match-cases\/([^/]+)\/documents$/, true, ({ params, body, actor, service }) => ({
    body: stripInternalDocumentFields(service.bindMatchCaseDocument(params[0], body, actor))
  })),
  route("GET", "/api/admin/audit-logs", true, ({ url, repository }) => ({
    body: {
      items: repository.listAuditLogs(url.searchParams.get("entityType"), url.searchParams.get("entityId"))
    }
  }))
];

function route(method, path, access, handle) {
  return { method, path, admin: access === true, client: typeof access === "string" ? access : null, handle };
}

function matchRoute(method, pathname) {
  for (const candidate of routes) {
    if (candidate.method !== method) continue;
    if (typeof candidate.path === "string" && candidate.path === pathname) {
      return { ...candidate, params: [] };
    }
    if (candidate.path instanceof RegExp) {
      const match = pathname.match(candidate.path);
      if (match) return { ...candidate, params: match.slice(1).map(decodeURIComponent) };
    }
  }
  return null;
}

async function readJsonBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw validationError({ body: "请求体必须是有效 JSON" });
  }
}

function requireAdmin(request, repository) {
  const token = getBearerToken(request);
  const user = repository.getSessionUser(token);
  if (!user) throw forbidden("后台接口需要登录");
  return user;
}

function requireClient(request, repository, role) {
  const identity = repository.getClientSession(getBearerToken(request));
  if (!identity) throw forbidden("客户端接口需要登录");
  if (role !== "any" && identity.role !== role) throw forbidden("当前身份无权访问该接口");
  return identity;
}

function getBearerToken(request) {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body ?? {}));
}

function writeError(response, error) {
  if (error instanceof ApiError) {
    writeJson(response, error.status, {
      error: {
        code: error.code,
        message: error.message,
        fields: error.fields
      }
    });
    return;
  }
  writeJson(response, 500, {
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "服务器内部错误"
    }
  });
}

function requestMetadata(request) {
  const ip = request.socket.remoteAddress ?? "";
  return {
    ipHash: createHash("sha256").update(ip).digest("hex"),
    userAgent: String(request.headers["user-agent"] ?? "").slice(0, 300)
  };
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName
  };
}

function loginAdmin(body, repository) {
  if (!body?.email || !body?.password) throw validationError({ email: "邮箱必填", password: "密码必填" });
  const user = ADMIN_USERS.find(
    (candidate) =>
      candidate.email === String(body.email).trim().toLowerCase() && candidate.password === body.password
  );
  if (!user) throw forbidden("邮箱或密码不正确");
  const token = repository.createSession(user);
  return {
    body: {
      token,
      user: publicUser(user)
    }
  };
}

function publicClientIdentity(identity, repository) {
  if (identity.role === "debtor") {
    const applications = repository.findDebtorApplicationsByPhone(identity.phone);
    return {
      role: "debtor",
      name: identity.name,
      phoneMasked: maskPhone(identity.phone),
      applicationCount: applications.length,
      latestApplication: applications[0] ? toDebtorPortalApplication(applications[0]) : null
    };
  }
  const organization = identity.organizationId ? repository.store.partnerOrganizations.get(identity.organizationId) : repository.findPartnerOrganizationByPhone(identity.phone);
  if (organization && !identity.organizationId) identity.organizationId = organization.id;
  return {
    role: "partner",
    organizationName: identity.organizationName,
    phoneMasked: maskPhone(identity.phone),
    organization: organization ? toPartnerPortalOrganization(organization, repository) : null
  };
}

function getOwnedDebtorApplication(id, actor, repository) {
  const application = repository.store.debtorApplications.get(id);
  if (!application) throw notFound("欠款人申请不存在");
  if (application.phoneNormalized !== actor.phone) throw forbidden("只能查看本人申请");
  return application;
}

function toDebtorPortalApplication(application) {
  return {
    id: application.id,
    nameMasked: application.name.length > 1 ? `${application.name[0]}*` : "*",
    phoneMasked: maskPhone(application.phone),
    city: application.city,
    bankName: application.bankName,
    totalDebtAmountCents: application.totalDebtAmountCents,
    overdueRange: application.overdueRange,
    status: application.status,
    reviewReason: application.reviewReason,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    submittedAt: application.createdAt
  };
}

function toPartnerPortalOrganization(organization, repository) {
  return {
    id: organization.id,
    organizationName: organization.organizationName,
    contactPhoneMasked: maskPhone(organization.contactPhone),
    serviceCities: organization.serviceCities,
    acceptedBanks: organization.acceptedBanks,
    capabilities: organization.capabilities,
    status: organization.status,
    reviewReason: organization.reviewReason,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
    documents: repository.listDocuments("partner_organization", organization.id)
  };
}

function toDebtorPortalCase(matchCase, repository) {
  const partner = repository.store.partnerOrganizations.get(matchCase.partnerOrganizationId);
  return {
    id: matchCase.id,
    partnerOrganizationName: partner?.organizationName ?? "合作机构",
    status: matchCase.status,
    matchReason: matchCase.matchReason,
    updatedAt: matchCase.updatedAt
  };
}

function toPartnerPortalCase(matchCase, repository) {
  const application = repository.store.debtorApplications.get(matchCase.debtorApplicationId);
  return {
    id: matchCase.id,
    debtor: application
      ? {
          nameMasked: application.name.length > 1 ? `${application.name[0]}*` : "*",
          city: application.city,
          bankName: application.bankName,
          totalDebtAmountCents: application.totalDebtAmountCents,
          overdueRange: application.overdueRange,
          expectedSolutions: application.expectedSolutions
        }
      : null,
    status: matchCase.status,
    matchReason: matchCase.matchReason,
    updatedAt: matchCase.updatedAt
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  createHttpServer().listen(port, () => {
    console.log(`DebtBridge API listening on http://localhost:${port}`);
  });
}
