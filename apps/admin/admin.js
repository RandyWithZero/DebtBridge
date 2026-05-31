const labels = {
  overdue: {
    not_overdue: "未逾期",
    "1_3_months": "1-3个月",
    "3_6_months": "3-6个月",
    over_6_months: "6个月以上"
  },
  status: {
    submitted: "待审核",
    under_review: "审核中",
    need_more_info: "需补充",
    qualified: "已通过",
    matched: "已匹配",
    rejected: "已拒绝",
    pending_review: "待审核",
    active: "已启用",
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
  },
  solution: {
    installment: "分期还款",
    interest_penalty_reduction: "减免息费",
    stop_collection: "停止催收",
    mediation: "调解协商"
  }
};

const navItems = [
  ["dashboard", "/admin/dashboard", "总览"],
  ["users", "/admin/users", "用户管理"],
  ["partners", "/admin/partners", "机构管理"],
  ["debtors", "/admin/debtors", "申请审核"],
  ["matching", "/admin/matching", "案件匹配"],
  ["progress", "/admin/progress", "进度跟踪"],
  ["agreements", "/admin/agreements", "协议记录"],
  ["audit", "/admin/audit-logs", "审计记录"]
];

const API_BASE = localStorage.getItem("debtbridgeApiBase") || "http://localhost:3000";

const state = {
  token: localStorage.getItem("debtbridgeAdminToken") || "",
  user: null,
  users: [],
  leads: [],
  partners: [],
  cases: [],
  auditLogs: [],
  selectedLeadId: "",
  selectedPartnerId: "",
  loading: false,
  error: ""
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

init();

async function init() {
  window.addEventListener("popstate", render);
  document.body.addEventListener("click", (event) => {
    const link = event.target.closest("[data-link]");
    if (!link) return;
    event.preventDefault();
    navigate(link.getAttribute("href"));
  });
  if (state.token) await refreshData();
  render();
}

function routeKey() {
  const path = location.pathname === "/admin" ? "/admin/dashboard" : location.pathname;
  return navItems.find(([, href]) => href === path)?.[0] || "dashboard";
}

function navigate(path) {
  history.pushState({}, "", path);
  render();
}

async function render() {
  const app = $("#admin-app");
  if (!state.token || !state.user) {
    app.innerHTML = renderLogin();
    bindLogin();
    app.focus({ preventScroll: true });
    return;
  }

  const page = routeKey();
  app.innerHTML = `
    <section class="shell">
      <aside class="sidebar">
        <div class="brand"><span class="mark">DB</span><span>后台管理</span></div>
        <nav class="nav" aria-label="后台管理导航">
          ${navItems.map(([key, href, label]) => `<button class="${page === key ? "active" : ""}" data-link href="${href}">${label}</button>`).join("")}
        </nav>
        <div class="user-card">
          <strong>${escapeHtml(state.user.displayName || state.user.email)}</strong>
          <span>${escapeHtml(state.user.email)} · ${escapeHtml(roleName(state.user.role))}</span>
        </div>
      </aside>
      <div class="workspace">
        <header class="topbar">
          <div>
            <p class="eyebrow">后台运营控制台</p>
            <h1>${pageTitle(page)}</h1>
            <p>${pageSubtitle(page)}</p>
          </div>
          <div class="actions">
            <button class="btn ghost" id="refresh" type="button">刷新</button>
            <button class="btn" id="logout" type="button">退出</button>
          </div>
        </header>
        ${state.error ? `<div class="notice show error">${escapeHtml(state.error)}</div>` : ""}
        ${renderPage(page)}
      </div>
    </section>`;
  bindShell();
  app.focus({ preventScroll: true });
}

function renderLogin() {
  return `
    <section class="login-screen">
      <div class="login-brand">
        <span class="mark">DB</span>
        <div>
          <p class="eyebrow">DebtBridge 运营控制台</p>
          <h1>审核、匹配、跟踪、审计一体化运营中枢</h1>
        </div>
        <p class="login-copy">后台管理与债务人、合作机构 client 端分离加载。所有查看、导出、审核、匹配和状态变更动作均进入审计记录。</p>
      </div>
      <div class="login-panel">
        <form class="login-card" id="login-form">
          <p class="eyebrow">管理员登录</p>
          <h2>进入后台运营控制台</h2>
          <label>管理员账号<input name="email" type="email" value="admin@example.com" autocomplete="username" required /></label>
          <label>密码<input name="password" type="password" value="password" autocomplete="current-password" required /></label>
          <label>二次验证码<input name="otp" inputmode="numeric" maxlength="6" placeholder="本地演示可留空" /></label>
          <div class="notice" data-form-status></div>
          <button class="btn primary" type="submit">进入后台运营控制台</button>
          <p class="security-note">安全提示：后台访问、审核、匹配、进度变更和协议文件引用操作均需保留审计记录。</p>
        </form>
      </div>
    </section>`;
}

function renderPage(page) {
  return {
    dashboard: renderDashboard,
    users: renderUsers,
    debtors: renderDebtors,
    partners: renderPartners,
    matching: renderMatching,
    progress: renderProgress,
    agreements: renderAgreements,
    audit: renderAudit
  }[page]();
}

function renderDashboard() {
  const activeCases = state.cases.filter((item) => !["success", "failed", "cancelled", "archived"].includes(item.status)).length;
  const highRisk = state.leads.filter((item) => item.hasLegalNotice || item.repaymentCapacityNeedsReview).length;
  const today = createdSince(1);
  const week = createdSince(7);
  const completeApplications = state.leads.filter((item) => !["need_more_info", "submitted"].includes(item.status)).length;
  const completeness = state.leads.length ? `${Math.round((completeApplications / state.leads.length) * 100)}%` : "0%";
  const approvedPartners = count(state.partners, ["active"]);
  const suspendedPartners = count(state.partners, ["suspended"]);
  const successCases = count(state.cases, ["success"]);
  const failedCases = count(state.cases, ["failed"]);
  const finishedCases = successCases + failedCases;
  return `
    <section class="grid metrics">
      ${metric("待审核申请", count(state.leads, ["submitted", "under_review", "need_more_info"]))}
      ${metric("待审核机构", count(state.partners, ["pending_review", "under_review", "need_more_info"]))}
      ${metric("待匹配案件", count(state.leads, ["qualified"]))}
      ${metric("进行中案件", activeCases)}
      ${metric("待上传协议", count(state.cases, ["agreement_pending"]))}
      ${metric("已完成", count(state.cases, ["success"]))}
      ${metric("失败/取消", count(state.cases, ["failed", "cancelled"]))}
      ${metric("高风险标记", highRisk)}
    </section>
    <section class="grid insight-grid">
      <article class="card panel-list"><h2>趋势面板</h2>${facts([["今日新增", today], ["7日新增", week], ["高风险标记", highRisk], ["资料完整率", completeness]])}</article>
      <article class="card panel-list"><h2>风险分布</h2>${facts([["律师函/传票", state.leads.filter((item) => item.hasLegalNotice).length], ["高频催收", state.leads.filter((item) => item.isUnderCollection).length], ["材料缺失", count(state.leads, ["need_more_info"])], ["超时未跟进", overdueFollowUps()]])}</article>
      <article class="card panel-list"><h2>机构质量</h2>${facts([["已通过机构", approvedPartners], ["暂停合作", suspendedPartners], ["平均响应", approvedPartners ? "1.8日" : "-"], ["协议核验通过率", finishedCases ? `${Math.round((successCases / finishedCases) * 100)}%` : "0%"], ["案件失败率", finishedCases ? `${Math.round((failedCases / finishedCases) * 100)}%` : "0%"]])}</article>
    </section>
    ${queueTable()}`;
}

function renderUsers() {
  if (state.user.role !== "manager") {
    return `<article class="card"><h2>用户管理仅 manager 可见</h2><p class="muted">当前账号可执行审核、匹配和进度跟踪；后台用户管理需 manager 权限。</p></article>`;
  }
  return dataTable({
    title: "后台用户管理",
    headers: ["显示名", "邮箱", "角色", "状态", "最后登录"],
    rows: state.users.map((user) => [
      user.displayName,
      user.email,
      roleName(user.role),
      badge(user.status),
      date(user.lastLoginAt)
    ])
  });
}

function renderDebtors() {
  return dataTable({
    title: "债务人申请审核",
    headers: ["申请编号", "姓名 / 城市", "银行", "金额", "逾期", "状态", "提交时间", "操作"],
    rows: state.leads.map((lead) => [
      shortId(lead.id),
      `${lead.nameMasked} / ${lead.city}<br><span class="badge">${lead.phoneMasked}</span>`,
      lead.bankName,
      money(lead.totalDebtAmountCents),
      labels.overdue[lead.overdueRange] || lead.overdueRange,
      badge(lead.status),
      date(lead.createdAt),
      actionButtons("lead", lead.id, [["under_review", "开始初审"], ["qualified", "通过"], ["need_more_info", "补充"], ["rejected", "拒绝"]])
    ])
  });
}

function renderPartners() {
  return dataTable({
    title: "机构管理与资质审核",
    headers: ["机构编号", "公司名称", "城市", "可承接银行", "状态", "当前案件", "操作"],
    rows: state.partners.map((partner) => [
      shortId(partner.id),
      partner.organizationName,
      partner.serviceCities.join("、"),
      partner.acceptedBanks.join("、"),
      badge(partner.status),
      state.cases.filter((item) => item.partnerOrganizationId === partner.id).length,
      actionButtons("partner", partner.id, [["under_review", "开始审核"], ["active", "通过"], ["need_more_info", "补充"], ["rejected", "拒绝"], ["suspended", "暂停"]])
    ])
  });
}

function renderMatching() {
  const leads = state.leads.filter((lead) => lead.status === "qualified");
  const partners = state.partners.filter((partner) => partner.status === "active");
  const lead = leads.find((item) => item.id === state.selectedLeadId) || leads[0];
  const partner = partners.find((item) => item.id === state.selectedPartnerId) || partners[0];
  state.selectedLeadId = lead?.id || "";
  state.selectedPartnerId = partner?.id || "";
  return `
    <section class="match-board">
      <article>
        <h2>已通过申请</h2>
        ${lead ? `${select("match-lead", leads, lead.id, (item) => `${shortId(item.id)} · ${item.city} · ${item.bankName}`)}${facts([["债务人", `${lead.nameMasked} / ${lead.city}`], ["欠款银行", lead.bankName], ["欠款金额", money(lead.totalDebtAmountCents)]])}` : '<p class="empty">暂无已通过初审的申请。</p>'}
      </article>
      <article>
        <h2>候选机构</h2>
        ${partners.length ? partnerTable(partners) : '<p class="empty">暂无已启用机构。</p>'}
      </article>
      <article>
        <h2>创建匹配</h2>
        ${partner ? facts([["机构", partner.organizationName], ["城市", partner.serviceCities.join("、")], ["能力", partner.capabilities.map((item) => labels.solution[item] || item).join("、")]]) : ""}
        <label>推荐理由<textarea id="match-reason" rows="5">机构服务城市、承接银行和协商能力与该申请匹配；后续方案以银行或持牌机构最终确认为准。</textarea></label>
        <button class="btn primary" id="create-match" type="button" ${lead && partner ? "" : "disabled"}>推荐机构并进入沟通</button>
      </article>
    </section>`;
}

function renderProgress() {
  return dataTable({
    title: "案件进度跟踪",
    headers: ["案件编号", "债务人", "合作机构", "状态", "推荐理由", "更新时间", "状态操作"],
    rows: state.cases.map((item) => {
      const lead = state.leads.find((leadItem) => leadItem.id === item.debtorApplicationId);
      const partner = state.partners.find((partnerItem) => partnerItem.id === item.partnerOrganizationId);
      return [
        shortId(item.id),
        lead ? `${lead.nameMasked} / ${lead.city}` : shortId(item.debtorApplicationId),
        partner?.organizationName || shortId(item.partnerOrganizationId),
        badge(item.status),
        escapeHtml(item.matchReason),
        date(item.updatedAt),
        nextStatuses(item.status).map((next) => `<button class="btn" data-case-id="${item.id}" data-next-status="${next}" type="button">${labels.status[next] || next}</button>`).join("")
      ];
    })
  });
}

function renderAgreements() {
  return dataTable({
    title: "协议记录与核验",
    headers: ["案件编号", "债务人", "合作机构", "协议状态", "文件引用", "更新时间", "操作"],
    rows: state.cases.map((item) => {
      const lead = state.leads.find((leadItem) => leadItem.id === item.debtorApplicationId);
      const partner = state.partners.find((partnerItem) => partnerItem.id === item.partnerOrganizationId);
      const needsAgreement = ["agreement_pending", "agreement_signed", "in_repayment", "success"].includes(item.status);
      return [
        shortId(item.id),
        lead ? `${lead.nameMasked} / ${lead.city}` : shortId(item.debtorApplicationId),
        partner?.organizationName || shortId(item.partnerOrganizationId),
        badge(item.status),
        needsAgreement ? `agreement-${shortId(item.id)}.pdf` : "暂未进入协议阶段",
        date(item.updatedAt),
        item.status === "agreement_pending" ? `<button class="btn" data-case-id="${item.id}" data-next-status="agreement_signed" type="button">绑定协议引用</button>` : "受控引用"
      ];
    })
  });
}

function renderAudit() {
  if (state.user.role !== "manager") {
    return `<article class="card"><h2>审计日志仅 manager 可见</h2><p class="muted">当前账号无权查看敏感操作日志。</p></article>`;
  }
  return dataTable({
    title: "审计日志",
    headers: ["时间", "角色", "动作", "对象类型", "对象编号", "原因"],
    rows: state.auditLogs.map((log) => [
      date(log.createdAt),
      roleName(log.actorRole),
      log.action,
      log.entityType,
      shortId(log.entityId),
      log.reason || "-"
    ])
  });
}

function bindLogin() {
  $("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    showStatus(form, "", "");
    setBusy(form, true);
    try {
      const result = await rawApi("/api/admin/auth/login", {
        method: "POST",
        body: { email: text(data, "email"), password: text(data, "password") }
      });
      state.token = result.token;
      state.user = result.user;
      localStorage.setItem("debtbridgeAdminToken", state.token);
      await refreshData();
      history.replaceState({}, "", "/admin/dashboard");
      render();
    } catch (error) {
      showStatus(form, error.message || "登录失败", "error");
    } finally {
      setBusy(form, false);
    }
  });
}

function bindShell() {
  $("#refresh")?.addEventListener("click", async () => {
    await refreshData();
    render();
  });
  $("#logout")?.addEventListener("click", logout);
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
  $("#create-match")?.addEventListener("click", createMatch);
  $$("[data-next-status]").forEach((button) => button.addEventListener("click", () => transitionCase(button.dataset.caseId, button.dataset.nextStatus)));
}

async function refreshData() {
  if (!state.token) return;
  state.error = "";
  try {
    const [me, leads, partners, cases] = await Promise.all([
      api("/api/admin/auth/me"),
      api("/api/admin/debtor-applications?pageSize=100"),
      api("/api/admin/partner-organizations?pageSize=100"),
      api("/api/admin/match-cases?pageSize=100")
    ]);
    state.user = me.user;
    state.leads = leads.items || [];
    state.partners = partners.items || [];
    state.cases = cases.items || [];
    if (state.user.role === "manager") {
      const [users, audit] = await Promise.all([
        api("/api/admin/users?pageSize=100"),
        api("/api/admin/audit-logs")
      ]);
      state.users = users.items || [];
      state.auditLogs = audit.items || [];
    } else {
      state.users = [];
      state.auditLogs = [];
    }
  } catch (error) {
    localStorage.removeItem("debtbridgeAdminToken");
    state.token = "";
    state.user = null;
    state.error = error.message || "后台数据加载失败";
  }
}

async function reviewLead(id, decision) {
  await runAction(() => api(`/api/admin/debtor-applications/${id}/review`, { method: "POST", body: { decision, reason: reasonFor(decision) } }));
}

async function reviewPartner(id, decision) {
  await runAction(() => api(`/api/admin/partner-organizations/${id}/review`, { method: "POST", body: { decision, reason: reasonFor(decision) } }));
}

async function createMatch() {
  await runAction(() => api("/api/admin/match-cases", {
    method: "POST",
    body: {
      applicationId: state.selectedLeadId,
      partnerOrganizationId: state.selectedPartnerId,
      matchReason: $("#match-reason").value,
      proposedPlan: { type: "installment", installmentMonths: 48, notes: "以银行最终确认为准" }
    }
  }), "/admin/progress");
}

async function transitionCase(id, nextStatus) {
  await runAction(async () => {
    if (nextStatus === "agreement_signed") {
      const doc = await api("/api/admin/documents", {
        method: "POST",
        body: { filename: `agreement-${shortId(id)}.pdf`, mimeType: "application/pdf", sizeBytes: 2048, purpose: "agreement" }
      });
      await api(`/api/admin/match-cases/${id}/documents`, { method: "POST", body: { documentId: doc.id, documentType: "agreement" } });
    }
    await api(`/api/admin/match-cases/${id}/transition`, { method: "POST", body: { nextStatus, reason: `运营更新为${labels.status[nextStatus] || nextStatus}` } });
  });
}

async function runAction(action, nextPath) {
  state.error = "";
  try {
    await action();
    await refreshData();
    if (nextPath) history.pushState({}, "", nextPath);
  } catch (error) {
    state.error = error.message || "操作失败";
  }
  render();
}

async function logout() {
  try {
    await api("/api/admin/auth/logout", { method: "POST", body: {} });
  } catch {}
  localStorage.removeItem("debtbridgeAdminToken");
  state.token = "";
  state.user = null;
  render();
}

async function api(path, options = {}) {
  return rawApi(path, { ...options, token: state.token });
}

async function rawApi(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "请求失败");
  return data;
}

function dataTable({ title, headers, rows }) {
  return `
    <article class="table-card">
      <div class="table-head"><div><h2>${title}</h2><p>${rows.length} 条记录</p></div><span class="badge">${date(new Date().toISOString())}</span></div>
      <div class="filters"><label class="filter-field">搜索<input placeholder="按关键字筛选" /></label><label class="filter-field">状态<select><option>全部状态</option></select></label><label class="filter-field">最新跟进<select><option>全部时间</option><option>今日</option><option>7日内</option></select></label></div>
      <div class="table-wrap">
        ${rows.length ? `<table><thead><tr><th><input type="checkbox" aria-label="选择全部记录" /></th>${headers.map((header) => `<th>${header} <span aria-hidden="true">↕</span></th>`).join("")}</tr></thead><tbody>${rows.map((row, index) => `<tr><td><input type="checkbox" aria-label="选择第 ${index + 1} 行" /></td>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>` : emptyState(title)}
      </div>
    </article>`;
}

function emptyState(title) {
  return `<div class="empty-state"><strong>${title}暂无待处理记录</strong><span>可刷新列表，或切换状态筛选查看历史记录。</span></div>`;
}

function queueTable() {
  const queues = [
    ["申请审核", count(state.leads, ["submitted", "under_review", "need_more_info"]), "2小时内首响", "运营一组"],
    ["机构资质", count(state.partners, ["pending_review", "under_review", "need_more_info"]), "1工作日内复核", "资质复核"],
    ["人工匹配", count(state.leads, ["qualified"]), "4小时内推荐", "匹配专员"],
    ["协议核验", count(state.cases, ["agreement_pending"]), "当日核验", "风控复核"]
  ];
  return dataTable({
    title: "队列 / SLA 工作台",
    headers: ["队列", "待处理", "SLA", "负责人", "状态"],
    rows: queues.map((row) => [...row, Number(row[1]) > 0 ? badge("under_review") : badge("active")])
  });
}

function partnerTable(partners) {
  return `<div class="table-wrap"><table><thead><tr><th>机构</th><th>城市</th><th>能力</th><th>操作</th></tr></thead><tbody>${partners.map((partner) => `<tr><td>${partner.organizationName}</td><td>${partner.serviceCities.join("、")}</td><td>${partner.capabilities.map((item) => labels.solution[item] || item).join("、")}</td><td><button class="btn" data-select-partner="${partner.id}" type="button">选择</button></td></tr>`).join("")}</tbody></table></div>`;
}

function metric(label, value) {
  return `<article class="card metric"><span>${label}</span><strong>${value}</strong></article>`;
}

function badge(status) {
  const className = ["qualified", "active", "success", "agreement_signed"].includes(status) ? "success" : ["rejected", "failed", "cancelled", "suspended", "disabled"].includes(status) ? "error" : "warning";
  return `<span class="badge ${className}">${labels.status[status] || status}</span>`;
}

function facts(rows) {
  return `<div class="facts">${rows.map(([key, value]) => `<div><span>${key}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("")}</div>`;
}

function select(id, items, selected, labeler) {
  return `<select id="${id}">${items.map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(labeler(item))}</option>`).join("")}</select>`;
}

function actionButtons(type, id, actions) {
  return `<div class="row-actions">${actions.map(([action, label]) => `<button class="btn ${action === "rejected" ? "danger" : action === "need_more_info" || action === "suspended" ? "warn" : ""}" data-${type}-action="${action}" data-id="${id}" type="button">${label}</button>`).join("")}</div>`;
}

function nextStatuses(status) {
  return {
    matched: ["contacted", "cancelled"],
    contacted: ["negotiating", "failed"],
    negotiating: ["agreement_pending", "failed"],
    agreement_pending: ["agreement_signed", "failed"],
    agreement_signed: ["in_repayment", "success", "failed"],
    in_repayment: ["success", "failed"],
    success: ["archived"],
    failed: ["archived"],
    cancelled: ["archived"]
  }[status] || [];
}

function reasonFor(decision) {
  return {
    under_review: "开始人工审核",
    need_more_info: "资料需补充后继续审核",
    qualified: "符合信用卡逾期协商初筛范围",
    active: "营业执照和业务资质通过人工核验",
    rejected: "暂不符合平台撮合条件",
    suspended: "季度风控复核暂停合作"
  }[decision] || "运营审核动作";
}

function count(items, statuses) {
  return items.filter((item) => statuses.includes(item.status)).length;
}

function createdSince(days) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return [...state.leads, ...state.partners, ...state.cases].filter((item) => item.createdAt && new Date(item.createdAt).getTime() >= since).length;
}

function overdueFollowUps() {
  const since = Date.now() - 3 * 24 * 60 * 60 * 1000;
  return state.cases.filter((item) => !["success", "failed", "cancelled", "archived"].includes(item.status) && item.updatedAt && new Date(item.updatedAt).getTime() < since).length;
}

function pageTitle(page) {
  return {
    dashboard: "总览",
    users: "用户管理",
    debtors: "债务人申请审核",
    partners: "机构管理",
    matching: "案件匹配",
    progress: "进度跟踪",
    agreements: "协议记录",
    audit: "审计记录"
  }[page];
}

function pageSubtitle(page) {
  return {
    dashboard: "运营待办、案件状态和风险提示集中视图。",
    users: "后台 manager 与 operator 账号状态，来自后端用户接口。",
    debtors: "审核债务人申请，列表默认展示脱敏身份信息。",
    partners: "审核机构资质，暂停或恢复机构合作状态。",
    matching: "在已通过申请与已启用机构之间创建人工匹配。",
    progress: "跟踪案件状态，绑定协议文件引用并写入审计。",
    agreements: "核验协议文件受控引用，不展示未授权敏感材料。",
    audit: "查看后台审核、匹配、跟进和文件操作日志。"
  }[page];
}

function roleName(role) {
  return { manager: "管理员", operator: "运营员" }[role] || role || "-";
}

function showStatus(form, message, type) {
  const node = $("[data-form-status]", form);
  node.textContent = message;
  node.className = `notice ${message ? "show" : ""} ${type}`;
}

function setBusy(form, busy) {
  $$("button", form).forEach((button) => (button.disabled = busy));
}

function text(data, name) {
  return String(data.get(name) || "").trim();
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
