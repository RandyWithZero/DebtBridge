const API_BASE = localStorage.getItem("debtbridgeApiBase") || "http://localhost:3000";
const app = document.querySelector("#app");

const state = {
  route: location.pathname,
  debtorToken: localStorage.getItem("clientDebtorToken") || "",
  partnerToken: localStorage.getItem("clientPartnerToken") || "",
  debtorUser: readJson("clientDebtorUser"),
  partnerUser: readJson("clientPartnerUser"),
  debtorApplications: [],
  debtorCases: [],
  partnerOrganizations: [],
  partnerCases: []
};

const statusText = {
  submitted: "待审核",
  under_review: "审核中",
  need_more_info: "需补充",
  qualified: "已通过",
  matched: "已匹配",
  rejected: "已拒绝",
  active: "已通过",
  suspended: "已暂停",
  negotiating: "沟通中",
  success: "已完成"
};

document.body.addEventListener("click", (event) => {
  const link = event.target.closest("[data-link]");
  if (!link) return;
  event.preventDefault();
  history.pushState({}, "", link.getAttribute("href"));
  render();
});

window.addEventListener("popstate", render);
render();

async function render() {
  state.route = normalize(location.pathname);
  document.querySelectorAll("nav a").forEach((link) => {
    link.classList.toggle("active", normalize(link.getAttribute("href")) === state.route);
  });

  if (state.route.startsWith("/debtor") && state.debtorToken) await loadDebtor();
  if (state.route.startsWith("/partner") && state.partnerToken) await loadPartner();

  const screens = {
    "/": home,
    "/debtor": debtor,
    "/partner": partner
  };
  app.innerHTML = screens[state.route]?.() || home();
  bindForms();
  app.focus({ preventScroll: true });
}

function normalize(pathname) {
  if (pathname.startsWith("/debtor")) return "/debtor";
  if (pathname.startsWith("/partner")) return "/partner";
  return "/";
}

function home() {
  return `
    <section class="hero">
      <div>
        <p class="eyebrow">两个身份，一个独立 Client 前端</p>
        <h1>债务人和合作机构从这里登录，不再进入后台管理页面</h1>
        <p class="lede">Client 端只保留持卡人申请、进度查看、机构资料与案件协作入口。所有登录和数据读取均调用 API 服务。</p>
        <div class="actions">
          <a class="button primary" href="/debtor" data-link>进入债务人入口</a>
          <a class="button" href="/partner" data-link>进入机构入口</a>
        </div>
      </div>
      <aside class="panel">
        <p class="eyebrow">访问边界</p>
        <h2>当前连接</h2>
        <div class="facts">
          <span><strong>Client URL</strong><br />http://localhost:3001</span>
          <span><strong>API Base</strong><br />${escapeHtml(API_BASE)}</span>
          <span><strong>Admin 前端</strong><br />独立运行在 http://localhost:3002</span>
        </div>
      </aside>
    </section>
    <section class="page cards">
      <article class="card"><strong>债务人</strong>提交协商申请、补充资料、查看本人状态与匹配进度。</article>
      <article class="card"><strong>机构</strong>维护入驻资料、查看审核状态、处理已分配案件。</article>
      <article class="card"><strong>后端</strong>只提供 API 和健康检查，不承载产品页面。</article>
    </section>`;
}

function debtor() {
  if (!state.debtorToken) return login("debtor", "债务人登录", "debtor@example.com", "进入债务人工作台");
  const application = state.debtorApplications[0];
  return `
    <section class="page">
      <div class="page-head">
        <div><p class="eyebrow">债务人工作台</p><h1>${escapeHtml(state.debtorUser?.displayName || "持卡人")}</h1><p>仅展示当前账号的申请、资料补充和案件进度。</p></div>
        <button class="button" data-logout="debtor">退出</button>
      </div>
      <div class="portal-grid">
        <article class="workspace"><h2>申请状态</h2>${application ? item(application.id, application.bankName, statusText[application.status] || application.status) : "<p>暂无申请。</p>"}</article>
        <article class="workspace"><h2>本人资料</h2><p>${escapeHtml(state.debtorUser?.email || "")}</p><span class="badge">债务人权限</span></article>
        <article class="workspace"><h2>匹配进度</h2>${rows(state.debtorCases, "matchReason")}</article>
      </div>
      <form class="workspace form-grid" data-apply>
        <h2>提交或补充申请</h2>
        <label>姓名<input name="name" value="张三" required /></label>
        <label>手机号<input name="phone" value="13800000000" required /></label>
        <label>城市<input name="city" value="上海" required /></label>
        <label>发卡银行<input name="bankName" value="招商银行" required /></label>
        <label>债务金额（元）<input name="amount" type="number" value="100000" required /></label>
        <label>月还款能力（元）<input name="repayment" type="number" value="3000" required /></label>
        <label>困难说明<textarea name="hardshipDescription">收入下降，暂时无法全额偿还。</textarea></label>
        <button class="button primary block" type="submit">提交到后端 API</button>
        <div class="status" data-status></div>
      </form>
    </section>`;
}

function partner() {
  if (!state.partnerToken) return login("partner", "机构登录", "partner@example.com", "进入机构工作台");
  const org = state.partnerOrganizations[0];
  return `
    <section class="page">
      <div class="page-head">
        <div><p class="eyebrow">机构工作台</p><h1>${escapeHtml(state.partnerUser?.displayName || "合作机构")}</h1><p>只展示当前机构账号可见的入驻资料和案件。</p></div>
        <button class="button" data-logout="partner">退出</button>
      </div>
      <div class="portal-grid">
        <article class="workspace"><h2>机构状态</h2>${org ? item(org.id, org.organizationName, statusText[org.status] || org.status) : "<p>暂无机构资料。</p>"}</article>
        <article class="workspace"><h2>账号权限</h2><p>${escapeHtml(state.partnerUser?.email || "")}</p><span class="badge">机构权限</span></article>
        <article class="workspace"><h2>可见案件</h2>${rows(state.partnerCases, "matchReason")}</article>
      </div>
      <form class="workspace form-grid" data-partner-apply>
        <h2>提交机构入驻资料</h2>
        <label>机构名称<input name="organizationName" value="某某法律咨询有限公司" required /></label>
        <label>统一社会信用代码<input name="code" value="91310000123456789X" required /></label>
        <label>联系人<input name="contactName" value="王五" required /></label>
        <label>联系电话<input name="contactPhone" value="13900000000" required /></label>
        <label>服务城市<input name="cities" value="上海,杭州" required /></label>
        <label>受理银行<input name="banks" value="招商银行,工商银行" required /></label>
        <button class="button primary block" type="submit">提交机构资料</button>
        <div class="status" data-status></div>
      </form>
    </section>`;
}

function login(role, title, email, action) {
  return `
    <section class="page auth-layout">
      <form class="auth-card" data-login="${role}">
        <p class="eyebrow">${role === "debtor" ? "债务人入口" : "机构入口"}</p>
        <h1>${title}</h1>
        <p>登录成功后只进入 ${role === "debtor" ? "债务人" : "机构"} 视图，不会看到后台管理功能。</p>
        <label>邮箱<input name="email" type="email" value="${email}" required /></label>
        <label>密码<input name="password" type="password" value="password" required /></label>
        <button class="button primary block" type="submit">${action}</button>
        <div class="status" data-status></div>
      </form>
      <aside class="panel"><h2>认证说明</h2><p>Client 前端使用 <code>/api/auth/login</code> 获取令牌，并通过 Authorization Header 调用本人或本机构接口。</p></aside>
    </section>`;
}

function bindForms() {
  document.querySelector("[data-login]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const role = form.dataset.login;
    const status = form.querySelector("[data-status]");
    try {
      const result = await api("/api/auth/login", {
        method: "POST",
        body: formData(form)
      });
      localStorage.setItem(role === "debtor" ? "clientDebtorToken" : "clientPartnerToken", result.token);
      localStorage.setItem(role === "debtor" ? "clientDebtorUser" : "clientPartnerUser", JSON.stringify(result.user));
      location.href = role === "debtor" ? "/debtor" : "/partner";
    } catch (error) {
      status.textContent = error.message;
    }
  });

  document.querySelector("[data-logout]")?.addEventListener("click", (event) => {
    const role = event.currentTarget.dataset.logout;
    localStorage.removeItem(role === "debtor" ? "clientDebtorToken" : "clientPartnerToken");
    localStorage.removeItem(role === "debtor" ? "clientDebtorUser" : "clientPartnerUser");
    location.href = `/${role}`;
  });

  document.querySelector("[data-apply]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = formData(form);
    await submitWithStatus(form, "/api/debtor/me/applications", state.debtorToken, {
      name: body.name,
      phone: body.phone,
      city: body.city,
      bankName: body.bankName,
      totalDebtAmountCents: Number(body.amount) * 100,
      overdueRange: "3_6_months",
      isUnderCollection: true,
      hasLegalNotice: false,
      monthlyIncomeCents: 800000,
      monthlyRepaymentCapacityCents: Number(body.repayment) * 100,
      expectedSolutions: ["installment", "interest_penalty_reduction"],
      hardshipReasons: ["income_drop"],
      hardshipDescription: body.hardshipDescription,
      supportingDocumentIds: [],
      truthfulnessAccepted: true,
      privacyAccepted: true,
      serviceAgreementAccepted: true
    });
  });

  document.querySelector("[data-partner-apply]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = formData(form);
    await submitWithStatus(form, "/api/partner/me/application", state.partnerToken, {
      organizationName: body.organizationName,
      unifiedSocialCreditCode: body.code,
      legalRepresentativeName: "李四",
      contactName: body.contactName,
      contactPhone: body.contactPhone,
      serviceCities: body.cities.split(",").map((value) => value.trim()).filter(Boolean),
      acceptedBanks: body.banks.split(",").map((value) => value.trim()).filter(Boolean),
      capabilities: ["installment", "interest_penalty_reduction"],
      minInstallmentMonths: 12,
      maxInstallmentMonths: 60,
      averageProcessingDays: 15,
      cooperationModes: ["success_fee"],
      licenseDocumentIds: [],
      legalRepresentativeIdDocumentIds: [],
      qualificationDocumentIds: [],
      complianceAccepted: true
    });
  });
}

async function submitWithStatus(form, path, token, body) {
  const status = form.querySelector("[data-status]");
  try {
    const result = await api(path, { method: "POST", body, token });
    status.textContent = `已提交：${result.id}`;
    await render();
  } catch (error) {
    status.textContent = error.message;
  }
}

async function loadDebtor() {
  state.debtorApplications = (await api("/api/debtor/me/applications", { token: state.debtorToken })).items || [];
  state.debtorCases = (await api("/api/debtor/me/match-cases", { token: state.debtorToken })).items || [];
}

async function loadPartner() {
  state.partnerOrganizations = (await api("/api/partner/me/organizations", { token: state.partnerToken })).items || [];
  state.partnerCases = (await api("/api/partner/me/match-cases", { token: state.partnerToken })).items || [];
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "请求失败");
  return payload;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function rows(items, labelKey) {
  if (!items.length) return "<p>暂无数据。</p>";
  return items.slice(0, 4).map((item) => `<div class="row"><span>${escapeHtml(shortId(item.id))}</span><strong>${escapeHtml(item[labelKey] || item.organizationName || item.bankName || "记录")}</strong><span>${escapeHtml(statusText[item.status] || item.status || "-")}</span></div>`).join("");
}

function item(id, label, status) {
  return `<div class="row"><span>${escapeHtml(shortId(id))}</span><strong>${escapeHtml(label || "记录")}</strong><span>${escapeHtml(status || "-")}</span></div>`;
}

function shortId(id = "") {
  return id.length > 12 ? `${id.slice(0, 10)}...` : id;
}

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
