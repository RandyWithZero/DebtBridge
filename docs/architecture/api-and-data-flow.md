# DebtBridge MVP API 与数据流

## 1. API 设计原则

- REST API 优先，使用 JSON 请求和响应。
- 公开端只允许创建申请或入驻记录，不允许匿名查询敏感数据。
- 后台接口统一以 `/api/admin/*` 命名，必须认证。
- 文件上传先进入受控 `documents` 记录，业务表只保存文件引用。
- 状态流转通过专用 action API，避免前端直接 PATCH 任意状态。
- API 错误返回统一结构，便于前端展示字段级错误和全局错误。

统一错误结构：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求字段不符合要求",
    "fields": {
      "phone": "手机号格式不正确"
    }
  }
}
```

## 2. 权限边界

| API 分组 | 认证 | 说明 |
| --- | --- | --- |
| `GET /api/public/config` | 否 | 返回公开枚举、上传限制、协议版本 |
| `POST /api/debtor-applications` | 否 | 欠款人提交申请 |
| `POST /api/partner-applications` | 否 | 机构提交入驻 |
| `POST /api/documents/public-upload` | 否或一次性上传 token | 公开表单附件上传 |
| `POST /api/admin/auth/login` | 否 | 后台登录 |
| `/api/admin/*` | 是 | 后台审核、匹配、文件、审计 |

后台角色：

- `operator`：审核、匹配、跟进、上传协议。
- `manager`：包含 operator 权限，额外管理后台账号、暂停机构、查看审计日志。

## 3. 公开端 API 清单

### 获取公开配置

`GET /api/public/config`

返回：

```json
{
  "debtBanks": ["工商银行", "建设银行", "招商银行", "其他"],
  "overdueRanges": ["not_overdue", "1_3_months", "3_6_months", "over_6_months"],
  "expectedSolutions": ["installment", "interest_penalty_reduction", "stop_collection", "mediation"],
  "hardshipReasons": ["income_drop", "illness", "family_change", "business_failure", "other"],
  "maxUploadMb": 10,
  "serviceAgreementVersion": "2026-05-01"
}
```

### 提交欠款人申请

`POST /api/debtor-applications`

请求：

```json
{
  "name": "张三",
  "phone": "13800000000",
  "city": "上海",
  "bankName": "招商银行",
  "totalDebtAmountCents": 10000000,
  "overdueRange": "3_6_months",
  "isUnderCollection": true,
  "hasLegalNotice": false,
  "monthlyIncomeCents": 800000,
  "monthlyRepaymentCapacityCents": 300000,
  "expectedSolutions": ["installment", "interest_penalty_reduction"],
  "hardshipReasons": ["income_drop"],
  "hardshipDescription": "收入下降，暂时无法全额偿还",
  "supportingDocumentIds": ["doc_123"],
  "truthfulnessAccepted": true,
  "privacyAccepted": true,
  "serviceAgreementAccepted": true
}
```

响应：

```json
{
  "id": "app_123",
  "status": "submitted",
  "submittedAt": "2026-05-31T10:00:00Z"
}
```

校验：

- 手机号必填并格式合法。
- 欠款金额、月收入、月还款能力必须为非负整数，单位为分。
- `monthlyRepaymentCapacityCents` 不应大于 `monthlyIncomeCents`，如大于需后台复核标记。
- 三个确认项必须为 true。
- 不收集银行卡号、验证码、账号密码。

### 提交机构入驻

`POST /api/partner-applications`

请求：

```json
{
  "organizationName": "某某法律咨询有限公司",
  "unifiedSocialCreditCode": "91310000XXXXXXXXXX",
  "legalRepresentativeName": "李四",
  "contactName": "王五",
  "contactPhone": "13900000000",
  "serviceCities": ["上海", "杭州"],
  "acceptedBanks": ["招商银行", "工商银行"],
  "capabilities": ["installment", "interest_penalty_reduction", "mediation"],
  "minInstallmentMonths": 12,
  "maxInstallmentMonths": 60,
  "averageProcessingDays": 15,
  "cooperationModes": ["success_fee", "membership"],
  "licenseDocumentIds": ["doc_lic"],
  "legalRepresentativeIdDocumentIds": ["doc_id_front", "doc_id_back"],
  "qualificationDocumentIds": ["doc_qual"],
  "complianceAccepted": true
}
```

响应：

```json
{
  "id": "org_123",
  "status": "pending_review",
  "submittedAt": "2026-05-31T10:05:00Z"
}
```

校验：

- 机构名称、统一社会信用代码、联系人、手机号必填。
- 营业执照必填。
- 合规承诺必须为 true。
- 未审核前不生成机构后台账号。

### 公开附件上传

`POST /api/documents/public-upload`

表单：

- `file`: 单个文件。
- `purpose`: `debtor_supporting_material` 或 `partner_qualification`。

响应：

```json
{
  "id": "doc_123",
  "filename": "income-proof.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 245120,
  "purpose": "debtor_supporting_material"
}
```

要求：

- 限制 MIME 类型和大小。
- 文件落盘后使用随机对象名。
- 上传后只有通过业务提交绑定，才进入可审核状态；未绑定文件定期清理。

## 4. 后台认证 API

### 登录

`POST /api/admin/auth/login`

请求：

```json
{
  "email": "admin@example.com",
  "password": "password"
}
```

响应：

```json
{
  "user": {
    "id": "admin_1",
    "email": "admin@example.com",
    "role": "manager"
  }
}
```

建议使用 httpOnly Cookie 保存会话或 JWT，避免前端脚本读取 token。

### 当前用户

`GET /api/admin/auth/me`

### 登出

`POST /api/admin/auth/logout`

## 5. 后台欠款人申请 API

### 列表

`GET /api/admin/debtor-applications?status=submitted&page=1&pageSize=20&keyword=138`

响应：

```json
{
  "items": [
    {
      "id": "app_123",
      "name": "张三",
      "phoneMasked": "138****0000",
      "city": "上海",
      "bankName": "招商银行",
      "totalDebtAmountCents": 10000000,
      "overdueRange": "3_6_months",
      "status": "submitted",
      "createdAt": "2026-05-31T10:00:00Z"
    }
  ],
  "total": 1
}
```

### 详情

`GET /api/admin/debtor-applications/{id}`

返回完整申请信息、附件列表、备注和审计摘要。

### 审核动作

`POST /api/admin/debtor-applications/{id}/review`

请求：

```json
{
  "decision": "qualified",
  "reason": "符合信用卡逾期协商初筛范围"
}
```

`decision` 可选：

- `under_review`
- `need_more_info`
- `qualified`
- `rejected`
- `archived`

规则：

- `qualified` 只能从 `under_review` 或 `need_more_info` 进入。
- `rejected` 必须填写原因。
- 写入 `audit_logs`。

## 6. 后台机构 API

### 列表

`GET /api/admin/partner-organizations?status=pending_review&page=1&pageSize=20`

### 详情

`GET /api/admin/partner-organizations/{id}`

### 资质审核

`POST /api/admin/partner-organizations/{id}/review`

请求：

```json
{
  "decision": "active",
  "reason": "营业执照和业务资质通过人工核验"
}
```

`decision` 可选：

- `under_review`
- `need_more_info`
- `active`
- `rejected`
- `suspended`

规则：

- `active` 必须已上传营业执照和至少一种业务资质。
- `suspended` 只允许 manager 操作。
- 每次审核写入 `audit_logs`。

## 7. 后台匹配案件 API

### 创建匹配

`POST /api/admin/match-cases`

请求：

```json
{
  "applicationId": "app_123",
  "partnerOrganizationId": "org_123",
  "matchReason": "该机构可承接招商银行信用卡分期协商",
  "proposedPlan": {
    "type": "installment",
    "installmentMonths": 48,
    "estimatedMonthlyPaymentCents": 220000,
    "notes": "以银行最终确认为准"
  }
}
```

响应：

```json
{
  "id": "case_123",
  "status": "matched"
}
```

规则：

- 申请必须是 `qualified`。
- 机构必须是 `active`。
- 创建后申请状态更新为 `matched`。
- 写入申请和案件审计日志。

### 案件列表

`GET /api/admin/match-cases?status=negotiating&page=1&pageSize=20`

### 案件详情

`GET /api/admin/match-cases/{id}`

### 更新案件状态

`POST /api/admin/match-cases/{id}/transition`

请求：

```json
{
  "nextStatus": "agreement_pending",
  "reason": "双方已确认初步分期方案"
}
```

规则：

- 必须符合状态机。
- `failed`、`cancelled` 必须填写原因。
- `agreement_signed` 应至少关联一份协议文件。

### 添加跟进备注

`POST /api/admin/match-cases/{id}/notes`

请求：

```json
{
  "content": "已电话确认用户愿意按 48 期方案继续推进",
  "visibility": "internal"
}
```

MVP 只支持 `internal`，后续如开放机构后台再扩展可见范围。

### 绑定协议文件

`POST /api/admin/match-cases/{id}/documents`

请求：

```json
{
  "documentId": "doc_agreement",
  "documentType": "agreement"
}
```

## 8. 后台文件 API

### 后台上传文件

`POST /api/admin/documents`

用途：

- 协议文件。
- 运营补充证明。
- 机构复核材料。

### 下载文件

`GET /api/admin/documents/{id}/download`

规则：

- 后端鉴权后流式返回。
- 记录下载审计，至少记录操作人、文件 ID、业务实体。

## 9. 审计日志 API

### 实体审计日志

`GET /api/admin/audit-logs?entityType=match_case&entityId=case_123`

响应：

```json
{
  "items": [
    {
      "id": "log_123",
      "actorId": "admin_1",
      "action": "MATCH_CASE_TRANSITION",
      "entityType": "match_case",
      "entityId": "case_123",
      "before": { "status": "negotiating" },
      "after": { "status": "agreement_pending" },
      "reason": "双方已确认初步分期方案",
      "createdAt": "2026-05-31T11:00:00Z"
    }
  ]
}
```

## 10. 数据流详解

### 欠款人提交到审核

```text
Web form
  -> POST /api/documents/public-upload (可选证明)
  -> POST /api/debtor-applications
  -> debtor_applications.status=submitted
  -> documents 绑定 application_id
  -> admin list 显示待审核
  -> POST /api/admin/debtor-applications/{id}/review
  -> audit_logs 记录审核动作
```

失败处理：

- 字段校验失败：返回 400 和字段错误。
- 附件上传成功但表单未提交：文件保持 unbound，定期清理。
- 重复提交：MVP 不强行阻止，可在后台按手机号和创建时间识别。

### 机构入驻到可匹配

```text
Partner form
  -> POST /api/documents/public-upload (营业执照/资质)
  -> POST /api/partner-applications
  -> partner_organizations.status=pending_review
  -> admin review
  -> partner_organizations.status=active
  -> 可进入人工匹配候选
```

失败处理：

- 统一社会信用代码重复：提示已提交或转后台人工处理。
- 资质缺失：返回字段错误或后台标记 need_more_info。

### 人工匹配到结案

```text
Admin selects qualified application
  -> query active partner organizations by bank/city/capability
  -> POST /api/admin/match-cases
  -> match_cases.status=matched
  -> application.status=matched
  -> POST /api/admin/match-cases/{id}/transition
  -> POST /api/admin/match-cases/{id}/notes
  -> upload agreement
  -> transition to success/failed
```

状态流转校验：

- `qualified application + active partner` 是创建案件的硬性前置条件。
- 案件终态 `success/failed/cancelled/archived` 不允许再回退，除非 manager 通过专门纠错流程。

## 11. 建议响应模型

分页响应：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

后台详情响应应包含：

- 主实体字段。
- 附件列表。
- 最近备注。
- 最近审计日志。
- 允许的下一步动作 `allowedActions`，前端据此禁用不合法按钮。

## 12. 主要枚举

```text
DebtorApplicationStatus:
submitted, under_review, need_more_info, qualified, matched, rejected, withdrawn, archived

PartnerOrganizationStatus:
pending_review, under_review, need_more_info, active, suspended, rejected

MatchCaseStatus:
matched, contacted, negotiating, agreement_pending, agreement_signed, in_repayment, success, failed, cancelled, archived

ExpectedSolution:
installment, interest_penalty_reduction, stop_collection, mediation

DocumentPurpose:
debtor_supporting_material, partner_license, partner_legal_representative_id, partner_qualification, agreement, internal
```

## 13. 数据保护和日志要求

- 业务日志不能打印姓名、完整手机号、身份证号、文件路径、协议内容。
- 后台列表默认展示脱敏手机号。
- 文件名展示可用原始文件名，但存储路径必须随机化。
- 审计日志保留状态和原因，不记录大段敏感材料正文。
- 数据导出能力不进入 MVP；如确需导出，应只允许 manager 并记录审计。

## 14. 下游依赖顺序

1. 合规文档确认字段、免责声明和禁止能力。
2. 架构和 API 契约确认后，数据库任务实现 schema 和迁移。
3. 后端按 API 契约实现公开提交、后台认证、审核和匹配。
4. 前端可先根据本文件 mock API，实现表单和后台页面。
5. DevOps 在后端/前端有基础启动命令后补齐 docker-compose。
6. 端到端验收用本文状态机和 API 清单检查主流程。
