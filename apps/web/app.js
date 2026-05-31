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
  },
  cooperationModes: {
    success_fee: "按成功付费",
    membership: "会员制",
    lead_fee: "线索费"
  }
};

const state = {
  config: null,
  token: localStorage.getItem("debtbridgeToken") || "",
  adminUser: null,
  activeTab: "overview",
  leads: [],
  partners: [],
  cases: [],
  selectedLeadId: "",
  selectedPartnerId: ""
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

init();

async function init() {
  state.config = await api("/api/public/config");
  hydrateFormOptions();
  bindPublicForms();
  bindAdmin();
  if (state.token) await loadAdmin();
}

function hydrateFormOptions() {
  const debtorBank = $('[name="bankName"]');
  debtorBank.innerHTML = optionList(state.config.debtBanks);
  $('[name="overdueRange"]').innerHTML = optionList(state.config.overdueRanges, labels.overdueRanges);
  renderRadio($('[data-radio="isUnderCollection"]'), "isUnderCollection");
  renderRadio($('[data-radio="hasLegalNotice"]'), "hasLegalNotice");
  renderCheckboxes($('[data-checkboxes="expectedSolutions"]'), "expectedSolutions", state.config.expectedSolutions);
  renderCheckboxes($('[data-checkboxes="hardshipReasons"]'), "hardshipReasons", state.config.hardshipReasons);
  renderCheckboxes($('[data-checkboxes="capabilities"]'), "capabilities", state.config.expectedSolutions);
}

function optionList(values, labelMap = {}) {
  return `<option value="">请选择</option>${values
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(labelMap[value] || value)}</option>`)
    .join("")}`;
}

function renderRadio(container, name) {
  container.insertAdjacentHTML(
    "beforeend",
    `<div class="options">
      <label class="option-label"><input type="radio" name="${name}" value="true" /> 是</label>
      <label class="option-label"><input type="radio" name="${name}" value="false" /> 否</label>
    </div>`
  );
}

function renderCheckboxes(container, name, values) {
  container.insertAdjacentHTML(
    "beforeend",
    `<div class="options">${values
      .map(
        (value) =>
          `<label class="option-label"><input type="checkbox" name="${name}" value="${escapeHtml(value)}" /> ${escapeHtml(
            labels[name]?.[value] || value
          )}</label>`
      )
      .join("")}</div>`
  );
}

function bindPublicForms() {
  $("#debtor-form").addEventListener("submit", submitDebtorForm);
  $("#partner-form").addEventListener("submit", submitPartnerForm);
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
    if (filename) {
      const document = await uploadDocument(filename, "debtor_supporting_material");
      payload.supportingDocumentIds = [document.id];
    }
    const result = await api("/api/debtor-applications", { method: "POST", body: payload });
    showStatus(form, `申请已提交，编号 ${result.id}。平台将进行人工初审，协商结果以银行或相关机构审核为准。`, "success");
    form.reset();
    if (state.token) await loadAdmin();
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
    const license = await uploadDocument(text(data, "licenseDocument"), "partner_business_license");
    const idDoc = await uploadDocument(text(data, "legalRepresentativeIdDocument"), "partner_legal_representative_id");
    const qualification = await uploadDocument(text(data, "qualificationDocument"), "partner_qualification");
    payload.licenseDocumentIds = [license.id];
    payload.legalRepresentativeIdDocumentIds = [idDoc.id];
    payload.qualificationDocumentIds = [qualification.id];
    const result = await api("/api/partner-applications", { method: "POST", body: payload });
    showStatus(form, `入驻资料已提交，编号 ${result.id}。审核通过前不可查看或承接线索。`, "success");
    form.reset();
    if (state.token) await loadAdmin();
  } catch (error) {
    handleFormError(form, error);
  } finally {
    setBusy(form, false);
  }
}

function bindAdmin() {
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await api("/api/admin/auth/login", {
        method: "POST",
        body: { email: text(data, "email"), password: text(data, "password") }
      });
      state.token = result.token;
      state.adminUser = result.user;
      localStorage.setItem("debtbridgeToken", state.token);
      await loadAdmin();
    } catch (error) {
      alert(error.message);
    }
  });

  $("#logout").addEventListener("click", async () => {
    try {
      await api("/api/admin/auth/logout", { method: "POST", body: {} });
    } catch {}
    localStorage.removeItem("debtbridgeToken");
    state.token = "";
    $("#login-panel").classList.remove("hidden");
    $("#admin-content").classList.add("hidden");
  });

  $("#refresh-admin").addEventListener("click", loadAdmin);
  $$(".side-nav button").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab, true));
  });
}

async function loadAdmin() {
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
    state.selectedLeadId ||= state.leads[0]?.id || "";
    state.selectedPartnerId ||= state.partners[0]?.id || "";
    $("#login-panel").classList.add("hidden");
    $("#admin-content").classList.remove("hidden");
    renderAdmin();
  } catch (error) {
    localStorage.removeItem("debtbridgeToken");
    state.token = "";
    $("#login-panel").classList.remove("hidden");
    $("#admin-content").classList.add("hidden");
  }
}

function switchTab(tab, shouldRender = false) {
  state.activeTab = tab;
  $$(".side-nav button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".admin-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab));
  $("#admin-title").textContent =
    { overview: "总览", leads: "线索审核", partners: "机构审核", matching: "人工匹配", progress: "进度跟踪", agreements: "协议记录" }[tab] || "总览";
  if (shouldRender) renderAdmin();
}

function renderAdmin() {
  renderOverview();
  renderLeads();
  renderPartners();
  renderMatching();
  renderProgress();
  renderAgreements();
  switchTab(state.activeTab);
}

function renderOverview() {
  const panel = $('[data-panel="overview"]');
  const awaitingLeads = state.leads.filter((item) => ["submitted", "under_review", "need_more_info"].includes(item.status)).length;
  const awaitingPartners = state.partners.filter((item) => ["pending_review", "under_review", "need_more_info"].includes(item.status)).length;
  const matching = state.leads.filter((item) => item.status === "qualified").length;
  const activeCases = state.cases.filter((item) => !["success", "failed", "cancelled", "archived"].includes(item.status)).length;
  const pendingAgreement = state.cases.filter((item) => item.status === "agreement_pending").length;
  panel.innerHTML = `
    <div class="metrics">
      ${metric("待审核线索", awaitingLeads)}
      ${metric("待审核机构", awaitingPartners)}
      ${metric("待匹配案件", matching)}
      ${metric("进行中案件", activeCases)}
      ${metric("待上传协议", pendingAgreement)}
    </div>
    <article class="data-card">
      <div class="card-title"><h3>风险提醒</h3><span class="badge warning">人工处理</span></div>
      <ul class="check-list timeline">
        <li>高敏材料待处理：${state.leads.length} 条线索需按最小权限查看。</li>
        <li>即将超时的跟进：${activeCases} 个案件需确认下一步状态。</li>
        <li>有律师函/传票标记的高优先线索需优先人工复核。</li>
      </ul>
    </article>`;
}

function renderLeads() {
  const panel = $('[data-panel="leads"]');
  panel.innerHTML = dataTable({
    title: "线索列表",
    headers: ["Lead ID", "姓名 / 城市", "欠款银行", "欠款金额", "逾期时长", "审核状态", "匹配状态", "最新跟进时间", "操作"],
    rows: state.leads.map((lead) => [
      shortId(lead.id),
      `${lead.nameMasked} / ${lead.city}<br><span class="badge">${lead.phoneMasked}</span>`,
      lead.bankName,
      money(lead.totalDebtAmountCents),
      labels.overdueRanges[lead.overdueRange] || lead.overdueRange,
      statusBadge(lead.status),
      lead.status === "matched" ? statusBadge("matched") : '<span class="badge">未匹配</span>',
      date(lead.createdAt),
      `<div class="row-actions">
        <button class="mini-button" data-lead-action="under_review" data-id="${lead.id}">开始初审</button>
        <button class="mini-button" data-lead-action="qualified" data-id="${lead.id}">通过</button>
        <button class="mini-button warn" data-lead-action="need_more_info" data-id="${lead.id}">补充</button>
        <button class="mini-button danger" data-lead-action="rejected" data-id="${lead.id}">拒绝</button>
      </div>`
    ])
  });
  $$("[data-lead-action]", panel).forEach((button) =>
    button.addEventListener("click", () => reviewLead(button.dataset.id, button.dataset.leadAction))
  );
}

function renderPartners() {
  const panel = $('[data-panel="partners"]');
  panel.innerHTML = dataTable({
    title: "机构列表",
    headers: ["Organization ID", "公司名称", "业务城市", "可承接银行", "可做方案", "资质状态", "当前案件数", "最新审核时间", "操作"],
    rows: state.partners.map((partner) => [
      shortId(partner.id),
      partner.organizationName,
      partner.serviceCities.join("、"),
      partner.acceptedBanks.join("、"),
      partner.capabilities.map((item) => labels.expectedSolutions[item] || item).join("、"),
      statusBadge(partner.status),
      state.cases.filter((item) => item.partnerOrganizationId === partner.id).length,
      date(partner.createdAt),
      `<div class="row-actions">
        <button class="mini-button" data-partner-action="under_review" data-id="${partner.id}">开始审核</button>
        <button class="mini-button" data-partner-action="active" data-id="${partner.id}">通过</button>
        <button class="mini-button warn" data-partner-action="need_more_info" data-id="${partner.id}">补充</button>
        <button class="mini-button danger" data-partner-action="rejected" data-id="${partner.id}">拒绝</button>
        <button class="mini-button warn" data-partner-action="suspended" data-id="${partner.id}">暂停</button>
      </div>`
    ])
  });
  $$("[data-partner-action]", panel).forEach((button) =>
    button.addEventListener("click", () => reviewPartner(button.dataset.id, button.dataset.partnerAction))
  );
}

function renderMatching() {
  const panel = $('[data-panel="matching"]');
  const qualifiedLeads = state.leads.filter((lead) => lead.status === "qualified");
  const activePartners = state.partners.filter((partner) => partner.status === "active");
  const lead = qualifiedLeads.find((item) => item.id === state.selectedLeadId) || qualifiedLeads[0];
  const partner = activePartners.find((item) => item.id === state.selectedPartnerId) || activePartners[0];
  panel.innerHTML = `
    <div class="split-panel">
      <article>
        <h3>债务人案件</h3>
        ${lead ? select("match-lead", qualifiedLeads, lead.id, (item) => `${shortId(item.id)} · ${item.city} · ${item.bankName}`) + facts([
          ["姓名/城市", `${lead.nameMasked} / ${lead.city}`],
          ["欠款银行", lead.bankName],
          ["逾期时长", labels.overdueRanges[lead.overdueRange] || lead.overdueRange],
          ["欠款金额", money(lead.totalDebtAmountCents)]
        ]) : '<p class="empty">暂无已通过初审的线索。</p>'}
      </article>
      <article>
        <h3>候选机构</h3>
        ${activePartners.length ? dataMiniPartners(activePartners) : '<p class="empty">暂无已通过资质审核的机构。</p>'}
      </article>
      <article>
        <h3>推荐动作</h3>
        ${partner ? facts([
          ["机构", partner.organizationName],
          ["城市", partner.serviceCities.join("、")],
          ["承接银行", partner.acceptedBanks.join("、")]
        ]) : ""}
        <label>推荐理由<textarea id="match-reason" rows="4">该机构可承接对应城市和银行的信用卡协商需求，具备分期或减免沟通能力。</textarea></label>
        <button class="button primary" id="create-match" ${lead && partner ? "" : "disabled"}>推荐机构并进入沟通</button>
      </article>
    </div>`;
  $("#match-lead")?.addEventListener("change", (event) => {
    state.selectedLeadId = event.target.value;
    renderMatching();
  });
  $$("[data-select-partner]", panel).forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedPartnerId = button.dataset.selectPartner;
      renderMatching();
    });
  });
  $("#create-match")?.addEventListener("click", () => createMatch(lead?.id, partner?.id));
}

function renderProgress() {
  const panel = $('[data-panel="progress"]');
  panel.innerHTML = dataTable({
    title: "进度跟踪",
    headers: ["Case ID", "债务人", "合作机构", "当前状态", "推荐理由", "最新时间", "状态操作"],
    rows: state.cases.map((item) => {
      const lead = state.leads.find((leadItem) => leadItem.id === item.debtorApplicationId);
      const partner = state.partners.find((partnerItem) => partnerItem.id === item.partnerOrganizationId);
      return [
        shortId(item.id),
        lead ? `${lead.nameMasked} / ${lead.city}` : shortId(item.debtorApplicationId),
        partner?.organizationName || shortId(item.partnerOrganizationId),
        statusBadge(item.status),
        escapeHtml(item.matchReason),
        date(item.updatedAt),
        `<div class="row-actions">${nextStatuses(item.status)
          .map((next) => `<button class="mini-button" data-case-id="${item.id}" data-next-status="${next}">${labels.status[next] || next}</button>`)
          .join("")}</div>`
      ];
    })
  });
  $$("[data-next-status]", panel).forEach((button) =>
    button.addEventListener("click", () => transitionCase(button.dataset.caseId, button.dataset.nextStatus))
  );
}

function renderAgreements() {
  const panel = $('[data-panel="agreements"]');
  const rows = state.cases
    .filter((item) => ["agreement_pending", "agreement_signed", "in_repayment", "success"].includes(item.status))
    .map((item) => {
      const lead = state.leads.find((leadItem) => leadItem.id === item.debtorApplicationId);
      const partner = state.partners.find((partnerItem) => partnerItem.id === item.partnerOrganizationId);
      return [
        shortId(item.id),
        lead ? `${lead.nameMasked} / ${lead.city}` : shortId(item.debtorApplicationId),
        partner?.organizationName || "-",
        "个性化分期/调解记录",
        date(item.updatedAt),
        '<span class="badge">controlled-ref</span>',
        labels.cooperationModes.success_fee,
        statusBadge(item.status === "agreement_signed" || item.status === "success" ? "qualified" : "need_more_info"),
        "协议文件仅保存受控引用，下载需后台权限"
      ];
    });
  panel.innerHTML = dataTable({
    title: "协议记录",
    headers: ["Case ID", "Debtor", "Partner", "协议类型", "协议日期", "文件引用", "费用模式", "核验状态", "备注"],
    rows
  });
}

async function reviewLead(id, decision) {
  try {
    await api(`/api/admin/debtor-applications/${id}/review`, {
      method: "POST",
      body: { decision, reason: reasonFor(decision) }
    });
    state.selectedLeadId = id;
    await loadAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function reviewPartner(id, decision) {
  try {
    await api(`/api/admin/partner-organizations/${id}/review`, {
      method: "POST",
      body: { decision, reason: reasonFor(decision) }
    });
    state.selectedPartnerId = id;
    await loadAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function createMatch(applicationId, partnerOrganizationId) {
  try {
    await api("/api/admin/match-cases", {
      method: "POST",
      body: {
        applicationId,
        partnerOrganizationId,
        matchReason: $("#match-reason").value,
        proposedPlan: { type: "installment", installmentMonths: 48, notes: "以银行最终确认为准" }
      }
    });
    await loadAdmin();
    switchTab("progress");
  } catch (error) {
    alert(error.message);
  }
}

async function transitionCase(id, nextStatus) {
  try {
    if (nextStatus === "agreement_signed") {
      const doc = await uploadDocument(`agreement-${shortId(id)}.pdf`, "agreement", true);
      await api(`/api/admin/match-cases/${id}/documents`, {
        method: "POST",
        body: { documentId: doc.id, documentType: "agreement" }
      });
    }
    await api(`/api/admin/match-cases/${id}/transition`, {
      method: "POST",
      body: { nextStatus, reason: `运营更新为${labels.status[nextStatus] || nextStatus}` }
    });
    await loadAdmin();
  } catch (error) {
    alert(error.message);
  }
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

async function uploadDocument(filename, purpose, admin = false) {
  return api(admin ? "/api/admin/documents" : "/api/documents/public-upload", {
    method: "POST",
    body: {
      filename,
      mimeType: filename.toLowerCase().endsWith(".png") ? "image/png" : "application/pdf",
      sizeBytes: 2048,
      purpose
    }
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {})
    },
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
  return `<article class="data-card">
    <div class="card-title"><h3>${title}</h3><span class="badge">${rows.length} 条</span></div>
    <div class="filter-bar"><input placeholder="按关键字筛选（本地 MVP 展示）" /><select><option>全部状态</option></select></div>
    <div class="table-wrap">${rows.length ? `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows
      .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>` : '<p class="empty">暂无数据。提交表单或完成审核后会出现在这里。</p>'}</div>
  </article>`;
}

function dataMiniPartners(partners) {
  return `<div class="table-wrap"><table><thead><tr><th>机构</th><th>城市</th><th>能力</th><th>操作</th></tr></thead><tbody>${partners
    .map(
      (partner) => `<tr>
        <td>${partner.organizationName}</td>
        <td>${partner.serviceCities.join("、")}</td>
        <td>${partner.capabilities.map((item) => labels.expectedSolutions[item] || item).join("、")}</td>
        <td><button class="mini-button" data-select-partner="${partner.id}">选择</button></td>
      </tr>`
    )
    .join("")}</tbody></table></div>`;
}

function metric(label, value) {
  return `<div class="metric-card"><span>${label}</span><strong>${value}</strong></div>`;
}

function statusBadge(status) {
  const className = ["qualified", "active", "success", "agreement_signed"].includes(status)
    ? "success"
    : ["rejected", "failed", "cancelled", "suspended"].includes(status)
      ? "error"
      : "warning";
  return `<span class="badge ${className}">${labels.status[status] || status}</span>`;
}

function select(id, items, selected, labeler) {
  return `<select id="${id}">${items
    .map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(labeler(item))}</option>`)
    .join("")}</select>`;
}

function facts(rows) {
  return `<div class="facts">${rows.map(([key, value]) => `<div><span>${key}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("")}</div>`;
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
  return String(value || "")
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
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
