import { createHash } from "node:crypto";
import http from "node:http";
import { ADMIN_USERS, PUBLIC_CONFIG, stripInternalDocumentFields } from "./domain.js";
import { ApiError, forbidden, notFound, validationError } from "./errors.js";
import { createDebtBridgeService } from "./service.js";
import { createStore } from "./store.js";

export function createApp() {
  const repository = createStore();
  const service = createDebtBridgeService(repository);

  async function handler(request, response) {
    try {
      const url = new URL(request.url, "http://localhost");
      const route = matchRoute(request.method, url.pathname);
      if (!route) throw notFound("接口不存在");

      const actor = route.admin ? requireAdmin(request, repository) : null;
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
  route("POST", "/api/admin/auth/login", false, ({ body, repository }) => {
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

function route(method, path, admin, handle) {
  return { method, path, admin, handle };
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  createHttpServer().listen(port, () => {
    console.log(`DebtBridge API listening on http://localhost:${port}`);
  });
}
