import { createHash } from "node:crypto";
import http from "node:http";
import { clearSessionCookie, getSessionToken, sessionCookie, verifyPassword } from "./auth.js";
import { PUBLIC_CONFIG, stripInternalDocumentFields } from "./domain.js";
import { ApiError, forbidden, notFound, validationError } from "./errors.js";
import { createPostgresPersistence } from "./postgres-store.js";
import { createDebtBridgeService } from "./service.js";
import { createStore } from "./store.js";

const API_DESCRIPTION = "DebtBridge backend API";
const CORS_METHODS = "GET,POST,OPTIONS";
const CORS_HEADERS = "Content-Type,Authorization";

export function createApp() {
  const persistence =
    process.env.STORAGE_DRIVER === "memory" ? null : createPostgresPersistence(process.env.DATABASE_URL);
  const repository = createStore({ persistence });
  const service = createDebtBridgeService(repository);

  async function handler(request, response) {
    try {
      if (request.method === "OPTIONS") {
        writePreflight(request, response);
        return;
      }

      await repository.ready;
      const url = new URL(request.url, "http://localhost");
      const route = matchRoute(request.method, url.pathname);
      if (!route) throw notFound("接口不存在");

      const actor = route.roles ? requireActor(request, repository, route.roles) : null;
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

      writeJson(request, response, result.status ?? 200, result.body, result.headers);
    } catch (error) {
      writeError(request, response, error);
    }
  }

  return { handler, repository, service };
}

export function createHttpServer() {
  return http.createServer(createApp().handler);
}

const routes = [
  route("GET", "/", null, ({}) => ({
    body: {
      service: API_DESCRIPTION,
      status: "ok",
      baseUrl: "/api",
      health: "/api/health",
      docs: "docs/api/rest-api.md"
    }
  })),
  route("GET", "/api/health", null, ({ repository }) => ({
    body: {
      status: "ok",
      service: "debtbridge-api",
      storage: repository.storageDriver
    }
  })),
  route("GET", "/api/public/config", null, ({}) => ({ body: PUBLIC_CONFIG })),
  route("POST", "/api/documents/public-upload", null, ({ body, service }) => ({
    status: 201,
    body: service.uploadPublicDocument(body)
  })),
  route("POST", "/api/debtor-applications", null, ({ body, request, service }) => ({
    status: 201,
    body: service.createDebtorApplication(body, requestMetadata(request))
  })),
  route("POST", "/api/partner-applications", null, ({ body, service }) => ({
    status: 201,
    body: service.createPartnerApplication(body)
  })),
  route("POST", "/api/auth/login", null, loginRoute()),
  route("GET", "/api/auth/me", ["manager", "operator", "debtor", "partner"], ({ actor }) => ({
    body: { user: publicUser(actor) }
  })),
  route("POST", "/api/auth/logout", ["manager", "operator", "debtor", "partner"], logoutRoute()),
  route("POST", "/api/admin/auth/login", null, loginRoute(["manager", "operator"])),
  route("GET", "/api/admin/auth/me", ["manager", "operator"], ({ actor }) => ({ body: { user: publicUser(actor) } })),
  route("POST", "/api/admin/auth/logout", ["manager", "operator"], logoutRoute()),
  route("GET", "/api/admin/users", ["manager"], ({ url, repository }) => ({
    body: repository.listAdminUsers(Object.fromEntries(url.searchParams))
  })),
  route("POST", "/api/debtor/me/applications", ["debtor"], ({ body, request, actor, service }) => ({
    status: 201,
    body: service.createDebtorApplication(body, requestMetadata(request), actor)
  })),
  route("GET", "/api/debtor/me/applications", ["debtor"], ({ url, actor, repository }) => ({
    body: repository.listDebtorApplicationsForUser(actor.id, Object.fromEntries(url.searchParams))
  })),
  route("GET", /^\/api\/debtor\/applications\/([^/]+)$/, ["debtor"], ({ params, actor, repository }) => {
    const application = repository.store.debtorApplications.get(params[0]);
    if (!application || application.debtorUserId !== actor.id) throw notFound("欠款人申请不存在");
    return {
      body: {
        ...application,
        documents: repository.listDocuments("debtor_application", application.id),
        matchCases: repository.listMatchCasesForDebtor(actor.id, { pageSize: 100 }).items.filter(
          (matchCase) => matchCase.debtorApplicationId === application.id
        )
      }
    };
  }),
  route("GET", "/api/debtor/me/match-cases", ["debtor"], ({ url, actor, repository }) => ({
    body: repository.listMatchCasesForDebtor(actor.id, Object.fromEntries(url.searchParams))
  })),
  route("POST", "/api/partner/me/application", ["partner"], ({ body, actor, service }) => ({
    status: 201,
    body: service.createPartnerApplication(body, actor)
  })),
  route("GET", "/api/partner/me/organizations", ["partner"], ({ url, actor, repository }) => ({
    body: repository.listPartnerOrganizationsForUser(actor.id, Object.fromEntries(url.searchParams))
  })),
  route("GET", "/api/partner/me/match-cases", ["partner"], ({ url, actor, repository }) => {
    const organization = [...repository.store.partnerOrganizations.values()].find(
      (item) => item.partnerUserId === actor.id && item.status === "active"
    );
    if (!organization) return { body: { items: [], total: 0, page: 1, pageSize: 20 } };
    return { body: repository.listMatchCasesForPartner(organization.id, Object.fromEntries(url.searchParams)) };
  }),
  route("GET", /^\/api\/partner\/match-cases\/([^/]+)$/, ["partner"], ({ params, actor, repository }) => {
    const matchCase = repository.store.matchCases.get(params[0]);
    const organization = matchCase ? repository.store.partnerOrganizations.get(matchCase.partnerOrganizationId) : null;
    if (!matchCase || organization?.partnerUserId !== actor.id) throw notFound("匹配案件不存在");
    const application = repository.store.debtorApplications.get(matchCase.debtorApplicationId);
    return {
      body: {
        ...matchCase,
        debtorApplication: application
          ? {
              id: application.id,
              nameMasked: application.name ? `${application.name[0]}**` : "",
              city: application.city,
              bankName: application.bankName,
              overdueRange: application.overdueRange,
              expectedSolutions: application.expectedSolutions,
              status: application.status
            }
          : null
      }
    };
  }),
  route("POST", "/api/admin/documents", ["manager", "operator"], ({ body, actor, service }) => ({
    status: 201,
    body: service.uploadAdminDocument(body, actor)
  })),
  route("GET", "/api/admin/debtor-applications", ["manager", "operator"], ({ url, repository }) => ({
    body: repository.listDebtorApplications(Object.fromEntries(url.searchParams))
  })),
  route("GET", /^\/api\/admin\/debtor-applications\/([^/]+)$/, ["manager", "operator"], ({ params, repository }) => {
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
  route("POST", /^\/api\/admin\/debtor-applications\/([^/]+)\/review$/, ["manager", "operator"], ({ params, body, actor, service }) => ({
    body: service.reviewDebtorApplication(params[0], body, actor)
  })),
  route("GET", "/api/admin/partner-organizations", ["manager", "operator"], ({ url, repository }) => ({
    body: repository.listPartnerOrganizations(Object.fromEntries(url.searchParams))
  })),
  route("GET", /^\/api\/admin\/partner-organizations\/([^/]+)$/, ["manager", "operator"], ({ params, repository }) => {
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
  route("POST", /^\/api\/admin\/partner-organizations\/([^/]+)\/review$/, ["manager", "operator"], ({ params, body, actor, service }) => ({
    body: service.reviewPartnerOrganization(params[0], body, actor)
  })),
  route("POST", "/api/admin/match-cases", ["manager", "operator"], ({ body, actor, service }) => ({
    status: 201,
    body: service.createMatchCase(body, actor)
  })),
  route("GET", "/api/admin/match-cases", ["manager", "operator"], ({ url, repository }) => ({
    body: repository.listMatchCases(Object.fromEntries(url.searchParams))
  })),
  route("GET", /^\/api\/admin\/match-cases\/([^/]+)$/, ["manager", "operator"], ({ params, repository }) => {
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
  route("POST", /^\/api\/admin\/match-cases\/([^/]+)\/transition$/, ["manager", "operator"], ({ params, body, actor, service }) => ({
    body: service.transitionMatchCase(params[0], body, actor)
  })),
  route("POST", /^\/api\/admin\/match-cases\/([^/]+)\/notes$/, ["manager", "operator"], ({ params, body, actor, service }) => ({
    status: 201,
    body: service.addMatchCaseNote(params[0], body, actor)
  })),
  route("POST", /^\/api\/admin\/match-cases\/([^/]+)\/documents$/, ["manager", "operator"], ({ params, body, actor, service }) => ({
    body: stripInternalDocumentFields(service.bindMatchCaseDocument(params[0], body, actor))
  })),
  route("GET", "/api/admin/audit-logs", ["manager"], ({ url, repository }) => ({
    body: {
      items: repository.listAuditLogs(url.searchParams.get("entityType"), url.searchParams.get("entityId"))
    }
  }))
];

function route(method, path, roles, handle) {
  return { method, path, roles, handle };
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

function requireActor(request, repository, roles) {
  const token = getSessionToken(request);
  const user = repository.getSessionUser(token);
  if (!user || !roles.includes(user.role)) throw forbidden("接口需要对应身份登录");
  return user;
}

function loginRoute(roles = ["manager", "operator", "debtor", "partner"]) {
  return ({ body, repository }) => {
    if (!body?.email || !body?.password) throw validationError({ email: "邮箱必填", password: "密码必填" });
    const user = repository.findUserByEmail(body.email);
    if (!user || !roles.includes(user.role) || !verifyPassword(body.password, user.passwordHash)) {
      throw forbidden("邮箱或密码不正确");
    }
    repository.touchUserLogin(user.id);
    const token = repository.createSession(user);
    return {
      headers: { "set-cookie": sessionCookie(token) },
      body: {
        token,
        user: publicUser(user)
      }
    };
  };
}

function logoutRoute() {
  return ({ request, repository }) => {
    repository.deleteSession(getSessionToken(request));
    return { headers: { "set-cookie": clearSessionCookie() }, body: { ok: true } };
  };
}

function writeJson(request, response, status, body, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(request),
    ...headers
  });
  response.end(JSON.stringify(body ?? {}));
}

function writeError(request, response, error) {
  if (error instanceof ApiError) {
    writeJson(request, response, error.status, {
      error: {
        code: error.code,
        message: error.message,
        fields: error.fields
      }
    });
    return;
  }
  writeJson(request, response, 500, {
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "服务器内部错误"
    }
  });
}

function writePreflight(request, response) {
  const headers = corsHeaders(request);
  if (request.headers.origin && !headers["access-control-allow-origin"]) {
    writeJson(request, response, 403, {
      error: {
        code: "CORS_ORIGIN_FORBIDDEN",
        message: "当前前端来源未被允许访问 API"
      }
    });
    return;
  }

  response.writeHead(204, headers);
  response.end();
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  const headers = {
    vary: "Origin",
    "access-control-allow-methods": CORS_METHODS,
    "access-control-allow-headers": CORS_HEADERS,
    "access-control-max-age": "600"
  };

  if (origin && (allowedOrigins.has(origin) || isExposedFrontendOrigin(origin))) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-credentials"] = "true";
  }

  return headers;
}

function getAllowedOrigins() {
  const rawOrigins = [
    process.env.CLIENT_ORIGIN,
    process.env.ADMIN_ORIGIN,
    process.env.ALLOWED_ORIGINS,
    process.env.CORS_ORIGINS
  ].filter(Boolean);

  return new Set(
    rawOrigins
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function isExposedFrontendOrigin(origin) {
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && ["3001", "3002"].includes(url.port);
  } catch {
    return false;
  }
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  createHttpServer().listen(port, () => {
    console.log(`DebtBridge API listening on http://localhost:${port}`);
  });
}
