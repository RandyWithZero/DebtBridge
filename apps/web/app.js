const labels = {
  overdueRanges: {
    not_overdue: "未逾期",
    "1_3_months": "1-3个月",
    "3_6_months": "3-6个月",
    over_6_months: "6个月以上"
  },
  expectedSolutions: {
    installment: "分期还款",
    interest_penalty_reduction: "减免利息/违约金",
    stop_collection: "停止催收",
    mediation: "调解协商"
  },
  hardshipReasons: {
    income_drop: "失业/收入下降",
    illness: "生病/意外",
    family_change: "家庭变故",
    business_failure: "生意失败",
    other: "其他"
  },
  status: {
    submitted: "待审核",
    under_review: "审核中",
    need_more_info: "需补充",
    qualified: "已通过",
    matched: "已匹配",
    rejected: "已拒绝",
    pending_review: "待审核",
    active: "已通过",
    suspended: "已暂停",
    contacted: "已联系",
    negotiating: "沟通中",
    agreement_pending: "待上传协议",
    agreement_signed: "已达成",
    in_repayment: "还款中",
    success: "已完成",
    failed: "失败",
    cancelled: "已取消",
    archived: "已归档"
  }
};

const state = {
  config: null,
  path: location.pathname,
  debtorSession: readJson("debtbridgeDebtor"),
  partnerSession: readJson("debtbridgePartner"),
  debtorToken: localStorage.getItem("debtbridgeDebtorToken") || "",
  partnerToken: localStorage.getItem("debtbridgePartnerToken") || "",
  adminToken: localStorage.getItem("debtbridgeToken") || "",
  adminUser: null,
  adminTab: "overview",
  leads: [],
  partners: [],
  cases: [],
  debtorApplications: [],
  debtorCases: [],
  partnerOrganization: null,
  partnerCases: [],
  selectedLeadId: "",
  selectedPartnerId: ""
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

init();

async function init() {
  state.config = await api("/api/public/config");
  bindShell();
  await render();
}

function bindShell() {
  document.body.addEventListener("click", (event) => {
    const link = event.target.closest("[data-link]");
    if (!link) return;
    event.preventDefault();
    navigate(link.getAttribute("href"));
  });
  $(".mobile-menu").addEventListener("click", () => {
    const nav = $(".top-nav");
    nav.classList.toggle("open");
    $(".mobile-menu").setAttribute("aria-expanded", String(nav.classList.contains("open")));
  });
  window.addEventListener("popstate", () => render());
}

function navigate(path) {
  history.pushState({}, "", path);
  $(".top-nav").classList.remove("open");
  render();
}

async function render() {
  state.path = location.pathname;
  const route = normalizeRoute(state.path);
  setActiveNav(route);
  if (route.startsWith("/debtor") && route !== "/debtor/login" && !state.debtorToken) return navigate("/debtor/login");
  if (route.startsWith("/partner") && route !== "/partner/login" && !state.partnerToken) return navigate("/partner/login");
  if (route.startsWith("/debtor") && route !== "/debtor/login") await loadDebtorPortal();
  if (route.startsWith("/partner") && route !== "/partner/login") await loadPartnerPortal();
  if (route.startsWith("/admin") && state.adminToken) await loadAdminData();

  const app = $("#app");
  app.innerHTML = routes[route]?.() || routes["/"]();
  bindRoute(route);
  app.focus({ preventScroll: true });
}

function normalizeRoute(path) {
  if (path === "/debtor" || path === "/debtor/") return "/debtor/dashboard";
  if (path === "/partner" || path === "/partner/") return "/partner/dashboard";
  if (path === "/admin/") return "/admin";
  return routes[path] ? path : "/";
}

const routes = {
  "/": renderHome,
  "/service": renderService,
  "/debtor/login": renderDebtorLogin,
  "/debtor/dashboard": renderDebtorDashboard,
  "/debtor/apply": renderDebtorApply,
  "/partner/login": renderPartnerLogin,
  "/partner/dashboard": renderPartnerDashboard,
  "/partner/onboarding": renderPartnerOnboarding,
  "/admin": renderAdmin
};

function renderHome() {
  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">信用卡逾期协商信息撮合</p>
        <h1>以合规撮合连接持卡人与专业机构</h1>
        <p class="hero-text">DebtBridge 面向信用卡逾期协商场景，帮助持卡人提交必要信息，由平台人工初审后匹配已审核机构。</p>
        <div class="compliance-strip"><span>不放贷</span><span>不催收</span><span>不代收款</span><span>不承诺结果</span></div>
        <div class="hero-actions">
          <a class="button primary large" href="/debtor/login" data-link>债务人申请</a>
          <a class="button secondary large" href="/partner/login" data-link>机构合作入驻</a>
        </div>
      </div>
      <aside class="hero-panel">
        <h2>平台工作边界</h2>
        <ol class="signal-list">
          <li><strong>01</strong><span>用户主动提交协商需求</span></li>
          <li><strong>02</strong><span>平台人工初审材料</span></li>
          <li><strong>03</strong><span>仅向合规机构推荐必要信息</span></li>
          <li><strong>04</strong><span>记录进度与协议引用</span></li>
        </ol>
      </aside>
    </section>
    ${renderPublicBands()}`;
}

function renderService() {
  return `
    <section class="page-head">
      <p class="eyebrow">服务说明与合规边界</p>
      <h1>只做信息撮合、咨询对接和流程记录</h1>
      <p>平台不经手资金，不从事金融放贷、催收、代收款、征信修复等业务，不承诺协商一定成功。</p>
    </section>
    ${renderPublicBands()}
    <section class="section compliance-panel">
      <div><p class="eyebrow">红线要求</p><h2>所有角色都必须遵守的边界</h2></div>
      <ul class="check-list">
        <li>持卡人不得上传银行卡密码、短信验证码、完整卡号、通讯录等无关敏感信息。</li>
        <li>机构不得作出结果承诺，不得诱导高额预付，不得实施骚扰或催收行为。</li>
        <li>协商结果以银行或持牌机构审核为准，资金往来由用户与机构通过官方渠道处理。</li>
      </ul>
    </section>`;
}

function renderPublicBands() {
  return `
    <section class="section">
      <div class="section-heading"><p class="eyebrow">适合人群</p><h2>面向主动、合规处理信用卡逾期的持卡人</h2></div>
      <div class="card-grid four">
        <article class="info-card">信用卡逾期且暂时无法全额还款</article>
        <article class="info-card">希望主动沟通并配合正规协商</article>
        <article class="info-card">被高频催收影响生活但仍希望合法解决</article>
        <article class="info-card">担心诉讼风险并需要梳理还款方案</article>
      </div>
    </section>
    <section class="section flow-section">
      <div class="section-heading"><p class="eyebrow">服务流程</p><h2>从需求登记到协议留档，全程人工确认</h2></div>
      <div class="flow"><span>提交信息</span><span>人工初审</span><span>匹配机构</span><span>沟通方案</span><span>进度留档</span></div>
    </section>`;
}

function renderDebtorLogin() {
  return renderLoginPage({
    role: "debtor",
    title: "债务人身份认证",
    copy: "输入姓名和手机号建立本地 MVP 会话。提交后只能查看本人的申请入口、状态和补充资料操作。",
    phoneName: "phone",
    nameName: "name",
    action: "进入债务人端"
  });
}

function renderPartnerLogin() {
  return renderLoginPage({
    role: "partner",
    title: "机构登录与认证",
    copy: "输入机构名称和联系人手机号进入机构端。审核通过前仅展示入驻资料、机构状态和合规操作。",
    phoneName: "phone",
    nameName: "name",
    action: "进入机构端"
  });
}

function renderLoginPage({ role, title, copy, nameName, phoneName, action }) {
  return `
    <section class="auth-page">
      <form class="auth-card" data-login="${role}">
        <p class="eyebrow">${role === "debtor" ? "持卡人入口" : "合作机构入口"}</p>
        <h1>${title}</h1>
        <p>${copy}</p>
        <label>${role === "debtor" ? "姓名" : "机构名称"}<input name="${nameName}" required /></label>
        <label>手机号<input name="${phoneName}" inputmode="tel" required /></label>
        <div class="form-status" data-form-status></div>
        <button class="button primary large" type="submit">${action}</button>
      </form>
      <aside class="auth-note">
        <h2>身份视图隔离</h2>
        <p>债务人、机构、管理员使用不同入口。未登录访问角色页面会回到对应登录页，不展示其他身份的操作。</p>
      </aside>
    </section>`;
}

function renderDebtorDashboard() {
  const session = state.debtorSession;
  const application = state.debtorApplications[0];
  return `
    ${roleHeader("债务人工作台", `当前身份：${escapeHtml(session?.name || "持卡人")} / ${session?.phoneMasked || ""}`, "debtor")}
    <section class="dashboard-grid">
      <article class="workspace-card">
        <div class="card-title"><h2>申请状态</h2>${statusBadge(application?.status || "need_more_info")}</div>
        ${application ? facts([
          ["申请编号", application.id],
          ["提交时间", date(application.submittedAt)],
          ["当前说明", "平台将进行人工初审，审核通过后可能由合作机构联系您沟通方案。"]
        ]) : '<p class="empty">尚未提交申请。</p>'}
        <a class="button primary" href="/debtor/apply" data-link>${application ? "补充或重新提交资料" : "提交协商申请"}</a>
      </article>
      <article class="workspace-card">
        <h2>个人相关信息</h2>
        ${facts([["姓名", session?.name || "持卡人"], ["手机号", session?.phoneMasked || "-"], ["资料权限", "仅本人入口展示申请状态和补充资料操作"]])}
      </article>
      <article class="workspace-card wide-card">
        <div class="card-title"><h2>相关案件进度</h2><span class="badge">${state.debtorCases.length} 条</span></div>
        ${state.debtorCases.length ? miniRows(state.debtorCases.map((item) => [shortId(item.id), item.partnerOrganizationName, labels.status[item.status] || item.status, date(item.updatedAt)])) : '<p class="empty">审核匹配前暂无案件进度。</p>'}
      </article>
    </section>`;
}

function renderDebtorApply() {
  return `
    ${roleHeader("信用卡逾期协商申请", "请确认信息真实有效，并仅上传协商所需的必要证明材料。", "debtor")}
    <section class="form-layout">
      <aside class="form-intro">
        <p class="eyebrow">申请说明</p>
        <h2>提交后进入人工初审</h2>
        <p>本平台仅提供信息对接与方案咨询，不代办、不催收、不承诺结果。</p>
        <p class="privacy-note">申请提交后将写入本人账号视图，仅本人和授权运营可查看进度。</p>
      </aside>
      <form id="debtor-form" class="form-card" novalidate>${debtorFormFields()}</form>
    </section>`;
}

function renderPartnerDashboard() {
  const session = state.partnerSession;
  const organization = state.partnerOrganization;
  return `
    ${roleHeader("机构工作台", `当前机构：${escapeHtml(session?.name || organization?.organizationName || "合作机构")} / ${session?.phoneMasked || ""}`, "partner")}
    <section class="dashboard-grid">
      <article class="workspace-card">
        <div class="card-title"><h2>机构状态</h2>${statusBadge(organization?.status || "need_more_info")}</div>
        ${organization ? facts([["机构编号", organization.id], ["提交时间", date(organization.createdAt)], ["当前权限", "审核通过前不可查看或承接线索"]]) : '<p class="empty">尚未提交入驻资料。</p>'}
        <a class="button primary" href="/partner/onboarding" data-link>${organization ? "补充或重新提交资质" : "提交入驻资料"}</a>
      </article>
      <article class="workspace-card">
        <div class="card-title"><h2>可见合作案件</h2><span class="badge">${state.partnerCases.length} 条</span></div>
        ${state.partnerCases.length ? miniRows(state.partnerCases.map((item) => [shortId(item.id), item.debtor?.city || "-", labels.status[item.status] || item.status, date(item.updatedAt)])) : '<p class="empty">案件信息需管理员审核通过并人工匹配后才可开放。</p>'}
      </article>
    </section>`;
}

function renderPartnerOnboarding() {
  return `
    ${roleHeader("机构入驻 - 信用卡债务撮合合作", "仅接受具备合法资质并承诺合规服务的机构申请。", "partner")}
    <section class="form-layout">
      <aside class="form-intro">
        <p class="eyebrow">机构认证</p>
        <h2>审核通过前不可接案</h2>
        <p>机构必须提交营业执照、法人身份证明和相关业务资质，并接受人工资质审核。</p>
        <p class="privacy-note">机构不得虚假承诺，不得私下收取不透明费用，不得实施催收或骚扰行为。</p>
      </aside>
      <form id="partner-form" class="form-card" novalidate>${partnerFormFields()}</form>
    </section>`;
}

function renderAdmin() {
  if (!state.adminToken || !state.adminUser) {
    return `
      <section class="auth-page">
        <form id="admin-login-form" class="auth-card">
          <p class="eyebrow">管理员 / 平台入口</p>
          <h1>运营管理后台</h1>
          <p>用于总览统计、用户管理、机构审核、债务人申请审核、案件匹配、进度和审计日志。</p>
          <label>邮箱<input name="email" type="email" value="admin@example.com" required /></label>
          <label>密码<input name="password" type="password" value="password" required /></label>
          <div class="form-status" data-form-status></div>
          <button class="button primary large" type="submit">登录后台</button>
        </form>
      </section>`;
  }
  return `
    <section class="admin-shell">
      <aside class="sidebar">
        <div class="brand admin-brand"><span class="brand-mark">DB</span><span>运营后台</span></div>
        <nav class="side-nav" aria-label="后台导航">
          ${adminTabButton("overview", "总览统计")}
          ${adminTabButton("users", "用户管理")}
          ${adminTabButton("partners", "机构管理")}
          ${adminTabButton("leads", "申请审核")}
          ${adminTabButton("matching", "案件匹配")}
          ${adminTabButton("progress", "进度记录")}
          ${adminTabButton("audit", "审计日志")}
        </nav>
      </aside>
      <div class="admin-main">
        <div class="admin-topbar">
          <div><p class="eyebrow">${escapeHtml(state.adminUser.role)}</p><h1>${adminTitle()}</h1></div>
          <div class="admin-actions"><button class="button secondary" id="refresh-admin" type="button">刷新</button><button class="button ghost" id="admin-logout" type="button">退出</button></div>
        </div>
        <section class="admin-panel">${renderAdminPanel()}</section>
      </div>
    </section>`;
}

function debtorFormFields() {
  return `
    <div class="form-status" data-form-status></div>
    <fieldset><legend>个人信息</legend>
      <label>姓名<input name="name" value="${escapeAttr(state.debtorSession?.name || "")}" autocomplete="name" required readonly /></label>
      <label>手机号<input name="phone" value="${escapeAttr(state.debtorSession?.phone || "")}" inputmode="tel" autocomplete="tel" required readonly /></label>
      <label>所在城市<input name="city" required /></label>
    </fieldset>
    <fieldset><legend>信用卡债务信息</legend>
      <label>欠款银行<select name="bankName" required>${optionList(state.config.debtBanks)}</select></label>
      <label>总欠款金额（元）<input name="totalDebtAmount" type="number" min="0" required /></label>
      <label>逾期时长<select name="overdueRange" required>${optionList(state.config.overdueRanges, labels.overdueRanges)}</select></label>
      ${radio("isUnderCollection", "当前是否被催收")}
      ${radio("hasLegalNotice", "是否收到律师函/法院传票")}
    </fieldset>
    <fieldset><legend>还款能力</legend>
      <label>每月稳定收入（元）<input name="monthlyIncome" type="number" min="0" required /></label>
      <label>每月最多可还款金额（元）<input name="monthlyRepaymentCapacity" type="number" min="0" required /></label>
      ${checkboxes("expectedSolutions", "期望方案", state.config.expectedSolutions)}
    </fieldset>
    <fieldset><legend>困难情况</legend>
      ${checkboxes("hardshipReasons", "困难情况", state.config.hardshipReasons)}
      <label class="wide">说明补充<textarea name="hardshipDescription" rows="4" placeholder="请避免填写密码、验证码、完整卡号等高风险敏感信息"></textarea></label>
      <label class="wide">证明材料引用<input name="supportingDocumentName" placeholder="可填文件名生成受控引用，如 income-proof.pdf" /></label>
    </fieldset>
    <fieldset class="commitments"><legend>承诺与授权</legend>
      <label><input type="checkbox" name="truthfulnessAccepted" /> 本人承诺信息真实，愿意配合正规协商。</label>
      <label><input type="checkbox" name="serviceAgreementAccepted" /> 我已知悉平台不放贷、不催收、不代收款、不承诺结果。</label>
      <label><input type="checkbox" name="privacyAccepted" /> 同意平台为初审与匹配目的处理并向候选合作机构展示必要信息。</label>
    </fieldset>
    <button class="button primary large sticky-submit" type="submit">提交协商申请</button>`;
}

function partnerFormFields() {
  return `
    <div class="form-status" data-form-status></div>
    <fieldset><legend>机构信息</legend>
      <label>公司名称<input name="organizationName" value="${escapeAttr(state.partnerSession?.name || state.partnerOrganization?.organizationName || "")}" required /></label>
      <label>统一社会信用代码<input name="unifiedSocialCreditCode" maxlength="18" required /></label>
      <label>法人姓名<input name="legalRepresentativeName" required /></label>
      <label>联系人姓名<input name="contactName" required /></label>
      <label>联系电话<input name="contactPhone" value="${escapeAttr(state.partnerSession?.phone || "")}" inputmode="tel" required /></label>
      <label>业务城市<input name="serviceCities" placeholder="上海, 杭州" required /></label>
    </fieldset>
    <fieldset><legend>资质上传</legend>
      <label>营业执照文件名<input name="licenseDocument" placeholder="business-license.pdf" required /></label>
      <label>法人身份证文件名<input name="legalRepresentativeIdDocument" placeholder="legal-rep-id.pdf" required /></label>
      <label>相关业务资质文件名<input name="qualificationDocument" placeholder="qualification.pdf" required /></label>
    </fieldset>
    <fieldset><legend>业务能力</legend>
      <label>可承接银行<input name="acceptedBanks" placeholder="招商银行, 工商银行" required /></label>
      ${checkboxes("capabilities", "可做方案", state.config.expectedSolutions)}
      <label>最低可接受分期期数<input name="minInstallmentMonths" type="number" min="1" required /></label>
      <label>最高可接受分期期数<input name="maxInstallmentMonths" type="number" min="1" required /></label>
      <label>单案处理周期（天）<input name="averageProcessingDays" type="number" min="1" required /></label>
      <label>合作模式<input name="cooperationModes" placeholder="success_fee, membership" required /></label>
    </fieldset>
    <fieldset class="commitments"><legend>合规承诺</legend>
      <label><input type="checkbox" name="complianceAccepted" /> 机构承诺不暴力催收、不虚假承诺、不私下收取不透明费用，且材料真实有效。</label>
    </fieldset>
    <button class="button primary large sticky-submit" type="submit">提交入驻申请</button>`;
}

function bindRoute(route) {
  if (route === "/debtor/login") bindRoleLogin("debtor");
  if (route === "/partner/login") bindRoleLogin("partner");
  if (route === "/debtor/apply") $("#debtor-form").addEventListener("submit", submitDebtorForm);
  if (route === "/partner/onboarding") $("#partner-form").addEventListener("submit", submitPartnerForm);
  if (route === "/admin") bindAdmin();
  $$("[data-logout-role]").forEach((button) => button.addEventListener("click", () => logoutRole(button.dataset.logoutRole)));
}

function bindRoleLogin(role) {
  $(`[data-login="${role}"]`).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(event.currentTarget);
    const session = { name: text(data, "name"), phone: text(data, "phone") };
    const fields = { ...required(session, ["name", "phone"]), ...(!/^1[3-9]\d{9}$/.test(session.phone) ? { phone: "手机号格式不正确" } : {}) };
    clearErrors(form);
    if (Object.keys(fields).length) return showErrors(form, fields);
    try {
      setBusy(form, true);
      const result = await api("/api/auth/login", {
        method: "POST",
        body:
          role === "debtor"
            ? { role, name: session.name, phone: session.phone }
            : { role, organizationName: session.name, phone: session.phone }
      });
      if (role === "debtor") {
        state.debtorToken = result.token;
        state.debtorSession = { name: session.name, phone: session.phone, phoneMasked: result.user.phoneMasked };
        localStorage.setItem("debtbridgeDebtorToken", state.debtorToken);
        writeJson("debtbridgeDebtor", state.debtorSession);
        navigate("/debtor/dashboard");
      } else {
        state.partnerToken = result.token;
        state.partnerSession = { name: session.name, phone: session.phone, phoneMasked: result.user.phoneMasked };
        state.partnerOrganization = result.user.organization;
        localStorage.setItem("debtbridgePartnerToken", state.partnerToken);
        writeJson("debtbridgePartner", state.partnerSession);
        navigate("/partner/dashboard");
      }
    } catch (error) {
      showStatus(form, error.message || "登录失败，请稍后再试。", "error");
    } finally {
      setBusy(form, false);
    }
  });
}

async function submitDebtorForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearErrors(form);
  const data = new FormData(form);
  const payload = {
    name: text(data, "name"),
    phone: text(data, "phone"),
    city: text(data, "city"),
    bankName: text(data, "bankName"),
    totalDebtAmountCents: yuanToCents(data.get("totalDebtAmount")),
    overdueRange: text(data, "overdueRange"),
    isUnderCollection: bool(data.get("isUnderCollection")),
    hasLegalNotice: bool(data.get("hasLegalNotice")),
    monthlyIncomeCents: yuanToCents(data.get("monthlyIncome")),
    monthlyRepaymentCapacityCents: yuanToCents(data.get("monthlyRepaymentCapacity")),
    expectedSolutions: data.getAll("expectedSolutions"),
    hardshipReasons: data.getAll("hardshipReasons"),
    hardshipDescription: text(data, "hardshipDescription"),
    supportingDocumentIds: [],
    truthfulnessAccepted: data.get("truthfulnessAccepted") === "on",
    privacyAccepted: data.get("privacyAccepted") === "on",
    serviceAgreementAccepted: data.get("serviceAgreementAccepted") === "on"
  };
  const localErrors = {
    ...required(payload, ["name", "phone", "city", "bankName", "overdueRange"]),
    ...(!/^1[3-9]\d{9}$/.test(payload.phone) ? { phone: "手机号格式不正确" } : {}),
    ...(payload.isUnderCollection === null ? { isUnderCollection: "请选择催收状态" } : {}),
    ...(payload.hasLegalNotice === null ? { hasLegalNotice: "请选择律师函/传票状态" } : {}),
    ...(payload.expectedSolutions.length ? {} : { expectedSolutions: "请至少选择一个期望方案" }),
    ...(payload.hardshipReasons.length ? {} : { hardshipReasons: "请至少选择一个困难情况" }),
    ...accepted(payload, ["truthfulnessAccepted", "privacyAccepted", "serviceAgreementAccepted"])
  };
  if (Object.keys(localErrors).length) return showErrors(form, localErrors);
  try {
    setBusy(form, true);
    const filename = text(data, "supportingDocumentName");
    if (filename) payload.supportingDocumentIds = [(await uploadDocument(filename, "debtor_supporting_material")).id];
    const result = await api("/api/client/debtor/applications", { method: "POST", body: payload, token: state.debtorToken });
    await loadDebtorPortal();
    showStatus(form, `申请已提交，编号 ${result.id}。平台将进行人工初审。`, "success");
    setTimeout(() => navigate("/debtor/dashboard"), 500);
  } catch (error) {
    handleFormError(form, error);
  } finally {
    setBusy(form, false);
  }
}

async function submitPartnerForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearErrors(form);
  const data = new FormData(form);
  const payload = {
    organizationName: text(data, "organizationName"),
    unifiedSocialCreditCode: text(data, "unifiedSocialCreditCode").toUpperCase(),
    legalRepresentativeName: text(data, "legalRepresentativeName"),
    contactName: text(data, "contactName"),
    contactPhone: text(data, "contactPhone"),
    serviceCities: splitList(data.get("serviceCities")),
    acceptedBanks: splitList(data.get("acceptedBanks")),
    capabilities: data.getAll("capabilities"),
    minInstallmentMonths: numberOrNull(data.get("minInstallmentMonths")),
    maxInstallmentMonths: numberOrNull(data.get("maxInstallmentMonths")),
    averageProcessingDays: numberOrNull(data.get("averageProcessingDays")),
    cooperationModes: splitList(data.get("cooperationModes")),
    licenseDocumentIds: [],
    legalRepresentativeIdDocumentIds: [],
    qualificationDocumentIds: [],
    complianceAccepted: data.get("complianceAccepted") === "on"
  };
  const localErrors = {
    ...required(payload, ["organizationName", "unifiedSocialCreditCode", "legalRepresentativeName", "contactName", "contactPhone"]),
    ...(!/^1[3-9]\d{9}$/.test(payload.contactPhone) ? { contactPhone: "联系人手机号格式不正确" } : {}),
    ...(payload.serviceCities.length ? {} : { serviceCities: "请填写业务城市" }),
    ...(payload.acceptedBanks.length ? {} : { acceptedBanks: "请填写可承接银行" }),
    ...(payload.capabilities.length ? {} : { capabilities: "请至少选择一种能力" }),
    ...accepted(payload, ["complianceAccepted"])
  };
  ["licenseDocument", "legalRepresentativeIdDocument", "qualificationDocument"].forEach((name) => {
    if (!text(data, name)) localErrors[name] = "请填写文件名生成受控引用";
  });
  if (Object.keys(localErrors).length) return showErrors(form, localErrors);
  try {
    setBusy(form, true);
    payload.licenseDocumentIds = [(await uploadDocument(text(data, "licenseDocument"), "partner_business_license")).id];
    payload.legalRepresentativeIdDocumentIds = [(await uploadDocument(text(data, "legalRepresentativeIdDocument"), "partner_legal_representative_id")).id];
    payload.qualificationDocumentIds = [(await uploadDocument(text(data, "qualificationDocument"), "partner_qualification")).id];
    const result = await api("/api/client/partner/onboarding", { method: "POST", body: payload, token: state.partnerToken });
    await loadPartnerPortal();
    showStatus(form, `入驻资料已提交，编号 ${result.id}。审核通过前不可查看或承接线索。`, "success");
    setTimeout(() => navigate("/partner/dashboard"), 500);
  } catch (error) {
    handleFormError(form, error);
  } finally {
    setBusy(form, false);
  }
}

function bindAdmin() {
  $("#admin-login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    clearErrors(form);
    try {
      const result = await api("/api/admin/auth/login", { method: "POST", body: { email: text(data, "email"), password: text(data, "password") } });
      state.adminToken = result.token;
      state.adminUser = result.user;
      localStorage.setItem("debtbridgeToken", state.adminToken);
      await render();
    } catch (error) {
      showStatus(form, error.message, "error");
    }
  });
  $("#admin-logout")?.addEventListener("click", async () => {
    try {
      await api("/api/admin/auth/logout", { method: "POST", body: {} });
    } catch {}
    localStorage.removeItem("debtbridgeToken");
    state.adminToken = "";
    state.adminUser = null;
    render();
  });
  $("#refresh-admin")?.addEventListener("click", render);
  $$("[data-admin-tab]").forEach((button) => button.addEventListener("click", () => {
    state.adminTab = button.dataset.adminTab;
    render();
  }));
  $$("[data-lead-action]").forEach((button) => button.addEventListener("click", () => reviewLead(button.dataset.id, button.dataset.leadAction)));
  $$("[data-partner-action]").forEach((button) => button.addEventListener("click", () => reviewPartner(button.dataset.id, button.dataset.partnerAction)));
  $$("[data-select-partner]").forEach((button) => button.addEventListener("click", () => {
    state.selectedPartnerId = button.dataset.selectPartner;
    render();
  }));
  $("#match-lead")?.addEventListener("change", (event) => {
    state.selectedLeadId = event.target.value;
    render();
  });
  $("#create-match")?.addEventListener("click", () => createMatch());
  $$("[data-next-status]").forEach((button) => button.addEventListener("click", () => transitionCase(button.dataset.caseId, button.dataset.nextStatus)));
}

async function loadAdminData() {
  try {
    const [me, leads, partners, cases] = await Promise.all([
      api("/api/admin/auth/me"),
      api("/api/admin/debtor-applications?pageSize=100"),
      api("/api/admin/partner-organizations?pageSize=100"),
      api("/api/admin/match-cases?pageSize=100")
    ]);
    state.adminUser = me.user;
    state.leads = leads.items;
    state.partners = partners.items;
    state.cases = cases.items;
  } catch {
    localStorage.removeItem("debtbridgeToken");
    state.adminToken = "";
    state.adminUser = null;
  }
}

async function loadDebtorPortal() {
  try {
    const [me, applications, cases] = await Promise.all([
      api("/api/auth/me", { token: state.debtorToken }),
      api("/api/client/debtor/applications", { token: state.debtorToken }),
      api("/api/client/debtor/cases", { token: state.debtorToken })
    ]);
    state.debtorSession = {
      ...state.debtorSession,
      name: state.debtorSession?.name || me.user.name,
      phoneMasked: me.user.phoneMasked
    };
    state.debtorApplications = applications.items;
    state.debtorCases = cases.items;
    writeJson("debtbridgeDebtor", state.debtorSession);
  } catch {
    localStorage.removeItem("debtbridgeDebtorToken");
    state.debtorToken = "";
    state.debtorSession = null;
  }
}

async function loadPartnerPortal() {
  try {
    const [me, profile, cases] = await Promise.all([
      api("/api/auth/me", { token: state.partnerToken }),
      api("/api/client/partner/profile", { token: state.partnerToken }),
      api("/api/client/partner/cases", { token: state.partnerToken })
    ]);
    state.partnerSession = {
      ...state.partnerSession,
      name: state.partnerSession?.name || me.user.organizationName,
      phoneMasked: me.user.phoneMasked
    };
    state.partnerOrganization = profile.organization;
    state.partnerCases = cases.items;
    writeJson("debtbridgePartner", state.partnerSession);
  } catch {
    localStorage.removeItem("debtbridgePartnerToken");
    state.partnerToken = "";
    state.partnerSession = null;
    state.partnerOrganization = null;
  }
}

function renderAdminPanel() {
  const panels = {
    overview: renderAdminOverview,
    users: renderAdminUsers,
    partners: renderAdminPartners,
    leads: renderAdminLeads,
    matching: renderAdminMatching,
    progress: renderAdminProgress,
    audit: renderAdminAudit
  };
  return panels[state.adminTab]?.() || renderAdminOverview();
}

function renderAdminOverview() {
  const awaitingLeads = state.leads.filter((item) => ["submitted", "under_review", "need_more_info"].includes(item.status)).length;
  const awaitingPartners = state.partners.filter((item) => ["pending_review", "under_review", "need_more_info"].includes(item.status)).length;
  const matching = state.leads.filter((item) => item.status === "qualified").length;
  const activeCases = state.cases.filter((item) => !["success", "failed", "cancelled", "archived"].includes(item.status)).length;
  return `<div class="metrics">${metric("待审核线索", awaitingLeads)}${metric("待审核机构", awaitingPartners)}${metric("待匹配案件", matching)}${metric("进行中案件", activeCases)}${metric("待上传协议", state.cases.filter((item) => item.status === "agreement_pending").length)}</div>
    <article class="workspace-card"><h2>风险提醒</h2><ul class="check-list compact"><li>高敏材料需按最小权限查看。</li><li>有律师函/传票标记的线索需优先复核。</li><li>协议文件仅保存受控引用。</li></ul></article>`;
}

function renderAdminUsers() {
  return dataTable({
    title: "用户管理",
    headers: ["用户", "角色", "权限边界", "状态"],
    rows: [
      ["admin@example.com", "manager", "可审核、匹配、暂停机构、查看审计", statusBadge("active")],
      ["operator@example.com", "operator", "可审核、匹配、跟进、上传协议", statusBadge("active")]
    ]
  });
}

function renderAdminLeads() {
  return dataTable({
    title: "债务人申请审核",
    headers: ["Lead ID", "姓名 / 城市", "欠款银行", "金额", "状态", "提交时间", "操作"],
    rows: state.leads.map((lead) => [
      shortId(lead.id),
      `${lead.nameMasked} / ${lead.city}<br><span class="badge">${lead.phoneMasked}</span>`,
      lead.bankName,
      money(lead.totalDebtAmountCents),
      statusBadge(lead.status),
      date(lead.createdAt),
      actionButtons("lead", lead.id, [["under_review", "开始初审"], ["qualified", "通过"], ["need_more_info", "补充"], ["rejected", "拒绝"]])
    ])
  });
}

function renderAdminPartners() {
  return dataTable({
    title: "机构管理",
    headers: ["机构 ID", "公司名称", "城市", "可承接银行", "状态", "当前案件", "操作"],
    rows: state.partners.map((partner) => [
      shortId(partner.id),
      partner.organizationName,
      partner.serviceCities.join("、"),
      partner.acceptedBanks.join("、"),
      statusBadge(partner.status),
      state.cases.filter((item) => item.partnerOrganizationId === partner.id).length,
      actionButtons("partner", partner.id, [["under_review", "开始审核"], ["active", "通过"], ["need_more_info", "补充"], ["rejected", "拒绝"], ["suspended", "暂停"]])
    ])
  });
}

function renderAdminMatching() {
  const qualifiedLeads = state.leads.filter((lead) => lead.status === "qualified");
  const activePartners = state.partners.filter((partner) => partner.status === "active");
  const lead = qualifiedLeads.find((item) => item.id === state.selectedLeadId) || qualifiedLeads[0];
  const partner = activePartners.find((item) => item.id === state.selectedPartnerId) || activePartners[0];
  state.selectedLeadId = lead?.id || "";
  state.selectedPartnerId = partner?.id || "";
  return `<div class="split-panel">
    <article><h2>债务人案件</h2>${lead ? select("match-lead", qualifiedLeads, lead.id, (item) => `${shortId(item.id)} · ${item.city} · ${item.bankName}`) + facts([["姓名/城市", `${lead.nameMasked} / ${lead.city}`], ["欠款银行", lead.bankName], ["欠款金额", money(lead.totalDebtAmountCents)]]) : '<p class="empty">暂无已通过初审的线索。</p>'}</article>
    <article><h2>候选机构</h2>${activePartners.length ? dataMiniPartners(activePartners) : '<p class="empty">暂无已通过资质审核的机构。</p>'}</article>
    <article><h2>推荐动作</h2>${partner ? facts([["机构", partner.organizationName], ["城市", partner.serviceCities.join("、")], ["承接银行", partner.acceptedBanks.join("、")]]) : ""}<label>推荐理由<textarea id="match-reason" rows="4">该机构可承接对应城市和银行的信用卡协商需求，具备分期或减免沟通能力。</textarea></label><button class="button primary" id="create-match" ${lead && partner ? "" : "disabled"}>推荐机构并进入沟通</button></article>
  </div>`;
}

function renderAdminProgress() {
  return dataTable({
    title: "案件进度与协议记录",
    headers: ["Case ID", "债务人", "合作机构", "状态", "推荐理由", "最新时间", "状态操作"],
    rows: state.cases.map((item) => {
      const lead = state.leads.find((leadItem) => leadItem.id === item.debtorApplicationId);
      const partner = state.partners.find((partnerItem) => partnerItem.id === item.partnerOrganizationId);
      return [shortId(item.id), lead ? `${lead.nameMasked} / ${lead.city}` : shortId(item.debtorApplicationId), partner?.organizationName || shortId(item.partnerOrganizationId), statusBadge(item.status), escapeHtml(item.matchReason), date(item.updatedAt), nextStatuses(item.status).map((next) => `<button class="mini-button" data-case-id="${item.id}" data-next-status="${next}">${labels.status[next] || next}</button>`).join("")];
    })
  });
}

function renderAdminAudit() {
  return `<article class="workspace-card"><h2>审计日志</h2><p class="empty">当前前端已保留审计日志入口。后续可接入 <code>GET /api/admin/audit-logs</code> 的分页和筛选视图。</p></article>`;
}

async function reviewLead(id, decision) {
  await api(`/api/admin/debtor-applications/${id}/review`, { method: "POST", body: { decision, reason: reasonFor(decision) } });
  await render();
}

async function reviewPartner(id, decision) {
  await api(`/api/admin/partner-organizations/${id}/review`, { method: "POST", body: { decision, reason: reasonFor(decision) } });
  await render();
}

async function createMatch() {
  await api("/api/admin/match-cases", {
    method: "POST",
    body: {
      applicationId: state.selectedLeadId,
      partnerOrganizationId: state.selectedPartnerId,
      matchReason: $("#match-reason").value,
      proposedPlan: { type: "installment", installmentMonths: 48, notes: "以银行最终确认为准" }
    }
  });
  state.adminTab = "progress";
  await render();
}

async function transitionCase(id, nextStatus) {
  if (nextStatus === "agreement_signed") {
    const doc = await uploadDocument(`agreement-${shortId(id)}.pdf`, "agreement", true);
    await api(`/api/admin/match-cases/${id}/documents`, { method: "POST", body: { documentId: doc.id, documentType: "agreement" } });
  }
  await api(`/api/admin/match-cases/${id}/transition`, { method: "POST", body: { nextStatus, reason: `运营更新为${labels.status[nextStatus] || nextStatus}` } });
  await render();
}

function roleHeader(title, subtitle, role) {
  return `<section class="role-head"><div><p class="eyebrow">${role === "debtor" ? "债务人端" : "机构端"}</p><h1>${title}</h1><p>${subtitle}</p></div><div class="role-actions"><a class="button secondary" href="${role === "debtor" ? "/debtor/dashboard" : "/partner/dashboard"}" data-link>工作台</a><button class="button ghost" type="button" data-logout-role="${role}">退出</button></div></section>`;
}

function logoutRole(role) {
  if (role === "debtor") {
    localStorage.removeItem("debtbridgeDebtor");
    localStorage.removeItem("debtbridgeDebtorToken");
    state.debtorToken = "";
    state.debtorSession = null;
    state.debtorApplications = [];
    state.debtorCases = [];
    navigate("/debtor/login");
  } else {
    localStorage.removeItem("debtbridgePartner");
    localStorage.removeItem("debtbridgePartnerToken");
    state.partnerToken = "";
    state.partnerSession = null;
    state.partnerOrganization = null;
    state.partnerCases = [];
    navigate("/partner/login");
  }
}

function optionList(values, labelMap = {}) {
  return `<option value="">请选择</option>${values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(labelMap[value] || value)}</option>`).join("")}`;
}

function radio(name, title) {
  return `<div class="choice-row" data-radio="${name}">${title}<div class="options"><label class="option-label"><input type="radio" name="${name}" value="true" /> 是</label><label class="option-label"><input type="radio" name="${name}" value="false" /> 否</label></div></div>`;
}

function checkboxes(name, title, values) {
  return `<div class="choice-stack" data-checkboxes="${name}">${title}<div class="options">${values.map((value) => `<label class="option-label"><input type="checkbox" name="${name}" value="${escapeAttr(value)}" /> ${escapeHtml(labels[name]?.[value] || value)}</label>`).join("")}</div></div>`;
}

async function uploadDocument(filename, purpose, admin = false) {
  return api(admin ? "/api/admin/documents" : "/api/documents/public-upload", { method: "POST", body: { filename, mimeType: filename.toLowerCase().endsWith(".png") ? "image/png" : "application/pdf", sizeBytes: 2048, purpose } });
}

async function api(path, options = {}) {
  const token = options.token ?? (path.startsWith("/api/admin") ? state.adminToken : "");
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error?.message || "请求失败");
    error.fields = data.error?.fields || {};
    throw error;
  }
  return data;
}

function dataTable({ title, headers, rows }) {
  return `<article class="data-card"><div class="card-title"><h2>${title}</h2><span class="badge">${rows.length} 条</span></div><div class="filter-bar"><input placeholder="按关键字筛选（本地 MVP 展示）" /><select><option>全部状态</option></select></div><div class="table-wrap">${rows.length ? `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>` : '<p class="empty">暂无数据。</p>'}</div></article>`;
}

function miniRows(rows) {
  return `<div class="mini-rows">${rows
    .map((row) => `<div>${row.map((cell) => `<span>${escapeHtml(cell)}</span>`).join("")}</div>`)
    .join("")}</div>`;
}

function dataMiniPartners(partners) {
  return `<div class="table-wrap"><table><thead><tr><th>机构</th><th>城市</th><th>能力</th><th>操作</th></tr></thead><tbody>${partners.map((partner) => `<tr><td>${partner.organizationName}</td><td>${partner.serviceCities.join("、")}</td><td>${partner.capabilities.map((item) => labels.expectedSolutions[item] || item).join("、")}</td><td><button class="mini-button" data-select-partner="${partner.id}">选择</button></td></tr>`).join("")}</tbody></table></div>`;
}

function actionButtons(type, id, actions) {
  return `<div class="row-actions">${actions.map(([action, label]) => `<button class="mini-button ${action === "rejected" ? "danger" : action === "need_more_info" || action === "suspended" ? "warn" : ""}" data-${type}-action="${action}" data-id="${id}">${label}</button>`).join("")}</div>`;
}

function metric(label, value) {
  return `<div class="metric-card"><span>${label}</span><strong>${value}</strong></div>`;
}

function statusBadge(status) {
  const className = ["qualified", "active", "success", "agreement_signed"].includes(status) ? "success" : ["rejected", "failed", "cancelled", "suspended"].includes(status) ? "error" : "warning";
  return `<span class="badge ${className}">${labels.status[status] || status}</span>`;
}

function select(id, items, selected, labeler) {
  return `<select id="${id}">${items.map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(labeler(item))}</option>`).join("")}</select>`;
}

function facts(rows) {
  return `<div class="facts">${rows.map(([key, value]) => `<div><span>${key}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("")}</div>`;
}

function nextStatuses(status) {
  return { matched: ["contacted", "cancelled"], contacted: ["negotiating", "failed"], negotiating: ["agreement_pending", "failed"], agreement_pending: ["agreement_signed", "failed"], agreement_signed: ["in_repayment", "success", "failed"], in_repayment: ["success", "failed"], success: ["archived"], failed: ["archived"], cancelled: ["archived"] }[status] || [];
}

function reasonFor(decision) {
  return { under_review: "开始人工审核", need_more_info: "资料需补充后继续审核", qualified: "符合信用卡逾期协商初筛范围", active: "营业执照和业务资质通过人工核验", rejected: "暂不符合平台撮合条件", suspended: "季度风控复核暂停合作" }[decision] || "运营审核动作";
}

function adminTabButton(tab, textValue) {
  return `<button data-admin-tab="${tab}" class="${state.adminTab === tab ? "active" : ""}">${textValue}</button>`;
}

function adminTitle() {
  return { overview: "总览统计", users: "用户管理", partners: "机构管理", leads: "债务人申请审核", matching: "案件匹配", progress: "进度记录", audit: "审计日志" }[state.adminTab] || "总览统计";
}

function setActiveNav(route) {
  $$(".top-nav a").forEach((link) => {
    const href = link.getAttribute("href");
    link.classList.toggle("active", route === href || (href !== "/" && route.startsWith(href.split("/")[1] ? `/${href.split("/")[1]}` : href)));
  });
}

function required(payload, names) {
  return Object.fromEntries(names.filter((name) => !payload[name]).map((name) => [name, "必填"]));
}

function accepted(payload, names) {
  return Object.fromEntries(names.filter((name) => payload[name] !== true).map((name) => [name, "必须勾选确认"]));
}

function clearErrors(form) {
  $$(".field-error", form).forEach((node) => node.remove());
  $$(".has-error", form).forEach((node) => node.classList.remove("has-error"));
  showStatus(form, "", "");
}

function showErrors(form, fields) {
  Object.entries(fields).forEach(([name, message]) => {
    const control = $(`[name="${name}"]`, form);
    const wrapper = control?.closest("label") || $(`[data-checkboxes="${name}"]`, form) || $(`[data-radio="${name}"]`, form);
    if (!wrapper) return;
    wrapper.classList.add("has-error");
    wrapper.insertAdjacentHTML("beforeend", `<span class="field-error">${escapeHtml(message)}</span>`);
  });
  showStatus(form, "请修正标记字段后再提交。", "error");
}

function handleFormError(form, error) {
  if (error.fields && Object.keys(error.fields).length) showErrors(form, error.fields);
  showStatus(form, error.message || "提交失败，请稍后再试。", "error");
}

function showStatus(form, message, type) {
  const node = $("[data-form-status]", form);
  if (!node) return;
  node.textContent = message;
  node.className = `form-status ${message ? "visible" : ""} ${type}`;
}

function setBusy(form, busy) {
  $$("button", form).forEach((button) => (button.disabled = busy));
}

function text(data, name) {
  return String(data.get(name) || "").trim();
}

function yuanToCents(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : -1;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function bool(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function splitList(value) {
  return String(value || "").split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean);
}

function money(cents) {
  return `¥${(Number(cents || 0) / 100).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

function date(value) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}

function shortId(id = "") {
  return id.includes("_") ? `${id.split("_")[0]}_${id.split("_")[1].slice(0, 6)}` : id.slice(0, 10);
}

function maskPhone(phone = "") {
  const normalized = phone.replace(/\D/g, "");
  return normalized.length < 7 ? normalized : `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}
