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

const API_BASE = window.DEBTBRIDGE_API_BASE || `${location.protocol}//${location.hostname}:3000`;

const fallbackConfig = {
  debtBanks: ["工商银行", "建设银行", "招商银行", "交通银行", "浦发银行", "广发银行", "平安银行", "兴业银行", "其他"],
  overdueRanges: Object.keys(labels.overdueRanges),
  expectedSolutions: Object.keys(labels.expectedSolutions),
  hardshipReasons: Object.keys(labels.hardshipReasons)
};

const state = {
  config: null,
  path: location.pathname,
  debtorSession: readJson("debtbridgeDebtor"),
  partnerSession: readJson("debtbridgePartner"),
  debtorToken: localStorage.getItem("debtbridgeDebtorToken") || "",
  partnerToken: localStorage.getItem("debtbridgePartnerToken") || "",
  loginRole: "debtor",
  debtorApplications: [],
  debtorCases: [],
  partnerOrganization: null,
  partnerCases: []
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

init();

async function init() {
  state.config = await loadPublicConfig();
  bindShell();
  await render();
}

async function loadPublicConfig() {
  try {
    return await api("/api/public/config");
  } catch (error) {
    console.warn("Using fallback public config because the API config endpoint is unavailable.", error);
    return fallbackConfig;
  }
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
  $(".mobile-menu").setAttribute("aria-expanded", "false");
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
  if (route.startsWith("/debtor") && route !== "/debtor/login" && !state.debtorToken) return navigate("/debtor/login");
  if (route.startsWith("/partner") && route !== "/partner/login" && !state.partnerToken) return navigate("/partner/login");

  const app = $("#app");
  app.innerHTML = routes[route]?.() || routes["/"]();
  bindRoute(route);
  scrollToHashTarget();
  app.focus({ preventScroll: true });
}

function normalizeRoute(path) {
  if (path === "/debtor" || path === "/debtor/") return "/debtor/dashboard";
  if (path === "/partner" || path === "/partner/") return "/partner/dashboard";
  return routes[path] ? path : "/";
}

const routes = {
  "/": renderHome,
  "/service": renderService,
  "/login": () => renderLoginPage(state.loginRole),
  "/debtor/login": renderDebtorLogin,
  "/debtor/dashboard": renderDebtorDashboard,
  "/debtor/apply": renderDebtorApply,
  "/partner/login": renderPartnerLogin,
  "/partner/dashboard": renderPartnerDashboard,
  "/partner/onboarding": renderPartnerOnboarding
};

function renderHome() {
  return `
    <section class="hero">
      <div class="hero-copy">
        <h1>信用卡逾期协商信息撮合</h1>
        <p class="hero-text">帮助持卡人与合规机构对接，探索个性化分期、罚息减免等依法协商方案。</p>
        <div class="compliance-strip"><span>不放贷</span><span>不催收</span><span>不代收款</span><span>不承诺结果</span></div>
        <div class="hero-actions">
          <a class="button primary large" href="/debtor/login" data-link>提交协商申请</a>
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
    ${renderPublicBands()}
    <section class="section compliance-panel">
      <div><p class="eyebrow">合规边界</p><h2>所有流程只围绕信息撮合与进度记录</h2></div>
      <ul class="check-list">
        <li>只做信息撮合、咨询、调解对接。</li>
        <li>不碰资金、不做催收、不代收款。</li>
        <li>不承诺 100% 成功，协商结果以银行或持牌机构审核为准。</li>
        <li>机构必须提交资质并通过人工审核。</li>
      </ul>
    </section>`;
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
    <section class="section" id="audience">
      <div class="section-heading"><p class="eyebrow">适合人群</p><h2>面向主动、合规处理信用卡逾期的持卡人</h2></div>
      <div class="card-grid four">
        <article class="info-card">信用卡逾期且暂时无法全额还款</article>
        <article class="info-card">希望主动沟通并配合正规协商</article>
        <article class="info-card">被高频催收影响生活但仍希望合法解决</article>
        <article class="info-card">担心诉讼风险并需要梳理还款方案</article>
      </div>
    </section>
    <section class="section flow-section" id="flow">
      <div class="section-heading"><p class="eyebrow">服务流程</p><h2>从需求登记到协议留档，全程人工确认</h2></div>
      <div class="flow"><span>提交信息</span><span>平台人工初审</span><span>匹配合规机构</span><span>机构沟通方案</span><span>进度跟踪与协议留档</span></div>
    </section>`;
}

function renderDebtorLogin() {
  state.loginRole = "debtor";
  return renderLoginPage("debtor");
}

function renderPartnerLogin() {
  state.loginRole = "partner";
  return renderLoginPage("partner");
}

function renderLoginPage(role) {
  const roleConfig = {
    debtor: {
      eyebrow: "持卡人",
      summary: "查询申请",
      title: "进入申请中心",
      email: "debtor@example.com",
      action: "进入申请中心",
      copy: "登录后可提交信用卡逾期协商申请、查看审核状态、按要求补充材料。"
    },
    partner: {
      eyebrow: "合作机构",
      summary: "管理案件",
      title: "进入机构工作台",
      email: "partner@example.com",
      action: "进入机构工作台",
      copy: "登录后可提交入驻资料、补充资质，并在审核通过后查看授权合作案件。"
    }
  }[role];
  return `
    <section class="auth-page figma-auth">
      <aside class="auth-service-panel">
        <p class="eyebrow">客户 / 机构入口</p>
        <h1>信用卡逾期协商信息撮合入口</h1>
        <p>客户与机构在同一入口选择身份，后台运营为独立内部系统，不在客户/机构入口展示。</p>
        <div class="login-role-grid" role="tablist" aria-label="登录身份">
          ${loginRoleButton("debtor", role)}
          ${loginRoleButton("partner", role)}
        </div>
        <ol class="service-nodes">
          <li><span>01</span>持卡人提交申请与补充资料</li>
          <li><span>02</span>机构提交入驻与资质补充</li>
          <li><span>03</span>双方在审核后查看可见进度</li>
        </ol>
      </aside>
      <form class="auth-card" data-login="${role}">
        <p class="eyebrow">${roleConfig.eyebrow}</p>
        <h1>${roleConfig.title}</h1>
        <p>${roleConfig.copy}</p>
        <label>账号 / 手机号<input name="email" type="text" value="${roleConfig.email}" autocomplete="username" required /></label>
        <label>密码 / 验证码<input name="password" type="password" value="password" autocomplete="current-password" required /></label>
        <div class="auth-support-row">
          <label class="remember-field"><input type="checkbox" name="remember" checked /> 记住登录状态</label>
          <a href="/service" data-link>忘记密码 / 联系管理员</a>
        </div>
        <div class="form-status" data-form-status></div>
        <button class="button primary large" type="submit">${roleConfig.action}</button>
        <p class="compliance-note">本平台仅提供债务信息撮合、咨询与对接服务；不放贷、不催收、不代收款、不承诺协商结果。</p>
      </form>
    </section>`;
}

function loginRoleButton(value, activeRole) {
  const config = value === "debtor" ? ["持卡人", "查询申请"] : ["合作机构", "管理案件"];
  return `<button class="role-card ${value === activeRole ? "active" : ""}" type="button" data-login-role="${value}" role="tab" aria-selected="${value === activeRole}"><strong>${config[0]}</strong><span>${config[1]}</span></button>`;
}

function renderDebtorDashboard() {
  const session = state.debtorSession;
  const application = state.debtorApplications[0];
  return `
    ${roleHeader("债务人工作台", `当前身份：${escapeHtml(session?.displayName || "持卡人")} / ${session?.email || ""}`, "debtor")}
    <section class="dashboard-grid">
      <article class="workspace-card">
        <div class="card-title"><h2>申请状态</h2>${application ? statusBadge(application.status) : '<span class="badge">待提交</span>'}</div>
        ${application ? facts([
          ["申请编号", application.id],
          ["提交时间", date(application.submittedAt || application.createdAt)],
          ["当前说明", "平台将进行人工初审，审核通过后可能由合作机构联系您沟通方案。"]
        ]) : '<p class="empty">尚未提交申请。</p>'}
          <a class="button primary" href="/debtor/apply" data-link>${application ? "补充资料" : "提交协商申请"}</a>
      </article>
      <article class="workspace-card">
        <h2>个人相关信息</h2>
        ${facts([["账号", session?.displayName || "持卡人"], ["邮箱", session?.email || "-"], ["资料权限", "仅本人入口展示申请状态和补充资料操作"]])}
      </article>
      <article class="workspace-card wide-card">
        <div class="card-title"><h2>相关案件进度</h2><span class="badge">${state.debtorCases.length} 条</span></div>
        ${state.debtorCases.length ? miniRows(state.debtorCases.map((item) => [shortId(item.id), item.matchReason || "协商案件", labels.status[item.status] || item.status, date(item.updatedAt)])) : '<p class="empty">审核匹配前暂无案件进度。</p>'}
      </article>
      <article class="workspace-card wide-card">
        <div class="card-title"><h2>补充资料</h2><span class="badge warning">需按平台要求提交</span></div>
        <p class="empty">若审核状态变为“需补充”，请返回提交申请页补充说明或受控文件引用。平台不会要求短信验证码、银行卡密码、完整卡号或通讯录。</p>
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
    ${roleHeader("机构工作台", `当前机构：${escapeHtml(organization?.organizationName || session?.displayName || "合作机构")} / ${session?.email || ""}`, "partner")}
    <section class="dashboard-grid">
      <article class="workspace-card">
        <div class="card-title"><h2>机构状态</h2>${organization ? statusBadge(organization.status) : '<span class="badge">待提交</span>'}</div>
        ${organization ? facts([["机构编号", organization.id], ["提交时间", date(organization.createdAt)], ["当前权限", "审核通过前不可查看或承接线索"]]) : '<p class="empty">尚未提交入驻资料。</p>'}
        <a class="button primary" href="/partner/onboarding" data-link>${organization ? "补充或重新提交资质" : "提交入驻资料"}</a>
      </article>
      <article class="workspace-card">
        <div class="card-title"><h2>可见合作案件</h2><span class="badge">${state.partnerCases.length} 条</span></div>
        ${state.partnerCases.length ? miniRows(state.partnerCases.map((item) => [shortId(item.id), item.matchReason || "授权案件", labels.status[item.status] || item.status, date(item.updatedAt)])) : '<p class="empty">案件信息需管理员审核通过并人工匹配后才可开放。</p>'}
      </article>
      <article class="workspace-card wide-card">
        <div class="card-title"><h2>方案与进度</h2><span class="badge">审核后开放</span></div>
        <p class="empty">机构不可主动搜索全量线索。仅在平台审核资质并人工匹配后，查看必要字段、提交方案反馈和进度说明。</p>
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

function debtorFormFields() {
  return `
    <div class="form-status" data-form-status></div>
    <fieldset><legend>个人信息</legend>
      <label>姓名<input name="name" autocomplete="name" required /></label>
      <label>手机号<input name="phone" inputmode="tel" autocomplete="tel" required /></label>
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
      <label>公司名称<input name="organizationName" value="${escapeAttr(state.partnerOrganization?.organizationName || "")}" required /></label>
      <label>统一社会信用代码<input name="unifiedSocialCreditCode" maxlength="18" required /></label>
      <label>法人姓名<input name="legalRepresentativeName" required /></label>
      <label>联系人姓名<input name="contactName" required /></label>
      <label>联系电话<input name="contactPhone" inputmode="tel" required /></label>
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
      <label>合作模式<input name="cooperationModes" placeholder="成功服务费、会员制" required /></label>
    </fieldset>
    <fieldset class="commitments"><legend>合规承诺</legend>
      <label><input type="checkbox" name="complianceAccepted" /> 机构承诺不暴力催收、不虚假承诺、不私下收取不透明费用，且材料真实有效。</label>
    </fieldset>
    <button class="button primary large sticky-submit" type="submit">提交入驻申请</button>`;
}

function bindRoute(route) {
  if (route === "/login") bindRoleLogin(state.loginRole);
  if (route === "/debtor/login") bindRoleLogin("debtor");
  if (route === "/partner/login") bindRoleLogin("partner");
  if (route === "/debtor/apply") $("#debtor-form").addEventListener("submit", submitDebtorForm);
  if (route === "/partner/onboarding") $("#partner-form").addEventListener("submit", submitPartnerForm);
  $$("[data-logout-role]").forEach((button) => button.addEventListener("click", () => logoutRole(button.dataset.logoutRole)));
}

function bindRoleLogin(role) {
  $$("[data-login-role]").forEach((button) => {
    button.addEventListener("click", () => {
      state.loginRole = button.dataset.loginRole;
      navigate(state.loginRole === "debtor" ? "/debtor/login" : "/partner/login");
    });
  });
  $(`[data-login="${role}"]`).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(event.currentTarget);
    const credentials = { email: text(data, "email"), password: text(data, "password") };
    const fields = required(credentials, ["email", "password"]);
    clearErrors(form);
    if (Object.keys(fields).length) return showErrors(form, fields);
    try {
      setBusy(form, true);
      const result = await api("/api/auth/login", {
        method: "POST",
        body: credentials
      });
      if (result.user.role !== role) throw new Error("账号身份与当前入口不匹配");
      if (role === "debtor") {
        state.debtorToken = result.token;
        state.debtorSession = result.user;
        localStorage.setItem("debtbridgeDebtorToken", state.debtorToken);
        writeJson("debtbridgeDebtor", state.debtorSession);
        navigate("/debtor/dashboard");
      } else {
        state.partnerToken = result.token;
        state.partnerSession = result.user;
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
    const result = await api("/api/debtor/me/applications", { method: "POST", body: payload, token: state.debtorToken });
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
    ...(payload.capabilities.length ? {} : { capabilities: "请至少选择一种可做方案" }),
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
    const result = await api("/api/partner/me/application", { method: "POST", body: payload, token: state.partnerToken });
    await loadPartnerPortal();
    showStatus(form, `入驻资料已提交，编号 ${result.id}。审核通过前不可查看或承接线索。`, "success");
    setTimeout(() => navigate("/partner/dashboard"), 500);
  } catch (error) {
    handleFormError(form, error);
  } finally {
    setBusy(form, false);
  }
}

async function loadDebtorPortal() {
  try {
    const [me, applications, cases] = await Promise.all([
      api("/api/auth/me", { token: state.debtorToken }),
      api("/api/debtor/me/applications", { token: state.debtorToken }),
      api("/api/debtor/me/match-cases", { token: state.debtorToken })
    ]);
    state.debtorSession = me.user;
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
    const [me, organizations, cases] = await Promise.all([
      api("/api/auth/me", { token: state.partnerToken }),
      api("/api/partner/me/organizations", { token: state.partnerToken }),
      api("/api/partner/me/match-cases", { token: state.partnerToken })
    ]);
    state.partnerSession = me.user;
    state.partnerOrganization = organizations.items[0] || null;
    state.partnerCases = cases.items;
    writeJson("debtbridgePartner", state.partnerSession);
  } catch {
    localStorage.removeItem("debtbridgePartnerToken");
    state.partnerToken = "";
    state.partnerSession = null;
    state.partnerOrganization = null;
  }
}

function roleHeader(title, subtitle, role) {
  const links =
    role === "debtor"
      ? [
          ["/", "首页"],
          ["/debtor/apply", "提交申请"],
          ["/debtor/dashboard", "申请状态"],
          ["/debtor/apply", "补充资料"],
          ["/debtor/dashboard", "个人信息"]
        ]
      : [
          ["/partner/onboarding", "入驻申请"],
          ["/partner/onboarding", "资质资料"],
          ["/partner/dashboard", "合作案件"],
          ["/partner/dashboard", "方案与进度"],
          ["/partner/dashboard", "机构信息"]
        ];
  return `<section class="role-head"><div><p class="eyebrow">${role === "debtor" ? "债务人端" : "机构端"}</p><h1>${title}</h1><p>${subtitle}</p><nav class="role-nav" aria-label="${role === "debtor" ? "债务人导航" : "机构导航"}">${links.map(([href, label]) => `<a href="${href}" data-link>${label}</a>`).join("")}</nav></div><div class="role-actions"><button class="button ghost" type="button" data-logout-role="${role}">退出</button></div></section>`;
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
  const labelMap = labels[name] || (name === "capabilities" ? labels.expectedSolutions : {});
  return `<div class="choice-stack" data-checkboxes="${name}">${title}<div class="options">${values.map((value) => `<label class="option-label"><input type="checkbox" name="${name}" value="${escapeAttr(value)}" /> ${escapeHtml(labelMap[value] || value)}</label>`).join("")}</div></div>`;
}

async function uploadDocument(filename, purpose) {
  return api("/api/documents/public-upload", { method: "POST", body: { filename, mimeType: filename.toLowerCase().endsWith(".png") ? "image/png" : "application/pdf", sizeBytes: 2048, purpose } });
}

async function api(path, options = {}) {
  const token = options.token ?? "";
  const response = await fetch(`${API_BASE}${path}`, {
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

function miniRows(rows) {
  return `<div class="mini-rows">${rows
    .map((row) => `<div>${row.map((cell) => `<span>${escapeHtml(cell)}</span>`).join("")}</div>`)
    .join("")}</div>`;
}

function statusBadge(status) {
  const className = ["qualified", "active", "success", "agreement_signed"].includes(status) ? "success" : ["rejected", "failed", "cancelled", "suspended"].includes(status) ? "error" : "warning";
  return `<span class="badge ${className}">${labels.status[status] || status}</span>`;
}

function facts(rows) {
  return `<div class="facts">${rows.map(([key, value]) => `<div><span>${key}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("")}</div>`;
}

function setActiveNav(route) {
  $$(".top-nav a").forEach((link) => {
    const target = new URL(link.getAttribute("href"), location.origin);
    link.classList.toggle("active", route === target.pathname && location.hash === target.hash);
  });
}

function scrollToHashTarget() {
  if (!location.hash) {
    window.scrollTo(0, 0);
    return;
  }
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target) {
    target.scrollIntoView({ block: "start" });
    return;
  }
  window.scrollTo(0, 0);
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
