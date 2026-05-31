# DebtBridge MVP 数据模型与迁移设计

本文定义 DebtBridge MVP 的 PostgreSQL 数据模型、索引、约束和隐私边界。仓库已包含 `prisma/schema.prisma` 与首个 SQL 迁移，本文作为后端接入 Prisma repository、维护状态机和扩展后续迁移的设计依据。

## 0. 落地文件与命令

当前落地选择 Prisma，原因是后端处于 Node.js 生态，后续可以通过 Prisma Client 获得类型化模型、事务 API 和可重复迁移；首个迁移仍保留手写 SQL，以覆盖 Prisma schema 难以完整表达的 PostgreSQL 能力：CHECK 约束、GIN 索引、partial unique index 和 `updated_at` trigger。

落地文件：

- `prisma/schema.prisma`：业务模型、枚举、外键和普通索引。
- `prisma/migrations/20260531000000_initial_postgresql_model/migration.sql`：初始化 PostgreSQL DDL、完整约束、GIN/partial 索引和触发器。
- `prisma.config.ts`：Prisma 读取 `DATABASE_URL` 的配置。
- `.env.example`：本地 PostgreSQL 连接串模板。

本地初始化：

```bash
npm install
cp .env.example .env
createdb debtbridge
npm run db:migrate
```

验证：

```bash
npm run db:validate
npm test
```

## 1. 设计原则

- 数据库以 PostgreSQL 为目标，业务主键使用 UUID，外部 API 可在响应层加 `app_`、`org_`、`case_` 等前缀。
- 公开端只创建记录，不支持匿名查询敏感详情。
- 证明材料、资质文件、协议文件只在 `documents` 保存受控引用，业务表不保存文件二进制或真实存储路径的公开 URL。
- 状态字段由后端 action API 驱动，不允许前端直接写任意状态。
- 所有后台审核、状态流转、匹配创建、文件下载和敏感字段查看都写入 `audit_logs`。
- 初筛阶段不保存银行卡号、验证码、账号密码、完整通讯录、精确定位、短信内容等高风险信息。

## 2. 枚举

建议在 Prisma 中使用 enum，在 PostgreSQL 中可使用 native enum 或 text + CHECK。MVP 需要先保证状态机可校验，未来如需要零停机扩展状态，text + CHECK 更容易滚动发布。

### 2.1 申请状态 `debtor_application_status`

| 值 | 说明 |
| --- | --- |
| `submitted` | 已提交，未审核 |
| `under_review` | 后台审核中 |
| `need_more_info` | 需要补充信息 |
| `qualified` | 初筛通过，可匹配 |
| `matched` | 已创建匹配案件 |
| `rejected` | 不符合平台服务范围 |
| `withdrawn` | 申请人撤回 |
| `archived` | 归档 |

### 2.2 机构状态 `partner_organization_status`

| 值 | 说明 |
| --- | --- |
| `pending_review` | 已提交，待审核 |
| `under_review` | 资质审核中 |
| `need_more_info` | 需要补充资质 |
| `active` | 审核通过，可匹配 |
| `suspended` | 暂停合作 |
| `rejected` | 审核不通过 |

### 2.3 匹配案件状态 `match_case_status`

| 值 | 说明 |
| --- | --- |
| `matched` | 已人工匹配 |
| `contacted` | 已对接双方 |
| `negotiating` | 方案沟通中 |
| `agreement_pending` | 待签署或确认协议 |
| `agreement_signed` | 协议已签署 |
| `in_repayment` | 按方案履行中 |
| `success` | 成功结案 |
| `failed` | 失败结案 |
| `cancelled` | 取消匹配 |
| `archived` | 归档 |

### 2.4 其他枚举

| 枚举 | 值 |
| --- | --- |
| `admin_role` | `operator`, `manager` |
| `document_purpose` | `debtor_supporting_material`, `partner_business_license`, `partner_legal_representative_id`, `partner_qualification`, `agreement`, `admin_supplement` |
| `document_status` | `uploaded`, `bound`, `quarantined`, `deleted` |
| `document_access_scope` | `admin_only`, `assigned_partner`, `debtor_visible` |
| `document_owner_type` | `debtor_application`, `partner_organization`, `match_case`, `unbound` |
| `note_visibility` | `internal` |
| `audit_entity_type` | `debtor_application`, `partner_organization`, `match_case`, `document`, `admin_user` |

## 3. 核心表

### 3.1 `admin_users`

后台账号表。公开端用户不注册，因此 MVP 不需要 debtor user account。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 后台用户 ID |
| `email` | text | NOT NULL, UNIQUE | 登录邮箱，保存小写规范化值 |
| `password_hash` | text | NOT NULL | bcrypt/argon2 哈希，禁止保存明文 |
| `role` | admin_role | NOT NULL | `operator` 或 `manager` |
| `display_name` | text | NOT NULL | 后台显示名 |
| `status` | text | NOT NULL DEFAULT `active` | `active`, `disabled` |
| `last_login_at` | timestamptz | NULL | 最近登录 |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | 更新时间 |

索引与约束：

- `UNIQUE (email)`
- `CHECK (status IN ('active', 'disabled'))`

敏感性：

- `password_hash` 为高敏字段，只允许认证模块写入，不进入审计 `after` 明细。

### 3.2 `debtor_applications`

欠款人申请主表，覆盖申请、还款能力、困难情况和承诺状态。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 申请 ID |
| `name` | text | NOT NULL | 姓名，列表默认脱敏 |
| `phone` | text | NOT NULL | 手机号，详情按权限展示 |
| `phone_normalized` | text | NOT NULL | 仅数字规范化手机号，用于搜索和去重 |
| `city` | text | NOT NULL | 所在城市，不保存精确定位 |
| `bank_name` | text | NOT NULL | 欠款银行；如后续支持多银行，拆到子表 |
| `total_debt_amount_cents` | bigint | NOT NULL | 欠款金额，单位分 |
| `overdue_range` | text | NOT NULL | `not_overdue`, `1_3_months`, `3_6_months`, `over_6_months` |
| `is_under_collection` | boolean | NOT NULL | 当前是否被催收 |
| `has_legal_notice` | boolean | NOT NULL | 是否收到律师函/法院传票 |
| `monthly_income_cents` | bigint | NOT NULL | 月收入，单位分 |
| `monthly_repayment_capacity_cents` | bigint | NOT NULL | 月最大还款能力，单位分 |
| `expected_solutions` | text[] | NOT NULL | 期望方案 |
| `hardship_reasons` | text[] | NOT NULL | 困难原因 |
| `hardship_description` | text | NULL | 困难说明，提示用户避免无关敏感信息 |
| `status` | debtor_application_status | NOT NULL DEFAULT `submitted` | 申请状态 |
| `review_reason` | text | NULL | 最近一次审核原因 |
| `reviewed_by_id` | uuid | FK admin_users(id), NULL | 最近审核人 |
| `reviewed_at` | timestamptz | NULL | 最近审核时间 |
| `truthfulness_accepted_at` | timestamptz | NOT NULL | 真实性承诺时间 |
| `privacy_accepted_at` | timestamptz | NOT NULL | 隐私授权时间 |
| `service_agreement_accepted_at` | timestamptz | NOT NULL | 服务协议确认时间 |
| `agreement_version` | text | NOT NULL | 用户提交时的协议版本 |
| `consent_ip_hash` | text | NULL | IP 哈希；避免直接保存完整 IP |
| `consent_user_agent` | text | NULL | User-Agent，可截断保存 |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | 更新时间 |
| `archived_at` | timestamptz | NULL | 归档时间 |

索引与约束：

- `INDEX debtor_applications_status_created_idx (status, created_at DESC)`
- `INDEX debtor_applications_phone_created_idx (phone_normalized, created_at DESC)`
- `INDEX debtor_applications_city_status_idx (city, status)`
- `INDEX debtor_applications_bank_status_idx (bank_name, status)`
- `CHECK (total_debt_amount_cents >= 0)`
- `CHECK (monthly_income_cents >= 0)`
- `CHECK (monthly_repayment_capacity_cents >= 0)`
- `CHECK (overdue_range IN ('not_overdue', '1_3_months', '3_6_months', 'over_6_months'))`
- `CHECK (cardinality(expected_solutions) > 0)`
- `CHECK (cardinality(hardship_reasons) > 0)`

业务校验：

- `monthly_repayment_capacity_cents > monthly_income_cents` 不建议数据库拒绝，应在后端标记复核，避免用户真实收入波动导致无法提交。
- `qualified`、`rejected`、`need_more_info` 等审核动作必须由后台 API 写入并同步创建 `audit_logs`。
- `matched` 只能由创建 `match_cases` 的事务设置。

敏感性与可见范围：

- `name`、`phone`、金额、困难描述为个人/金融相关信息；后台列表只返回脱敏姓名和手机号。
- 不保存身份证号、银行卡号、验证码、完整账单内容；相关材料仅通过 `documents` 引用。

### 3.3 `partner_organizations`

机构入驻和准入审核主表。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 机构 ID |
| `organization_name` | text | NOT NULL | 机构法定名称 |
| `unified_social_credit_code` | text | NOT NULL | 统一社会信用代码 |
| `legal_representative_name` | text | NOT NULL | 法定代表人姓名，后台敏感展示 |
| `contact_name` | text | NOT NULL | 对接人 |
| `contact_phone` | text | NOT NULL | 对接手机号 |
| `contact_phone_normalized` | text | NOT NULL | 规范化手机号 |
| `service_cities` | text[] | NOT NULL | 可服务城市 |
| `accepted_banks` | text[] | NOT NULL | 可承接银行 |
| `capabilities` | text[] | NOT NULL | 可承接方案 |
| `min_installment_months` | int | NULL | 最低分期期数 |
| `max_installment_months` | int | NULL | 最高分期期数 |
| `average_processing_days` | int | NULL | 平均处理周期 |
| `cooperation_modes` | text[] | NOT NULL | 合作模式 |
| `status` | partner_organization_status | NOT NULL DEFAULT `pending_review` | 机构状态 |
| `review_reason` | text | NULL | 最近审核原因 |
| `reviewed_by_id` | uuid | FK admin_users(id), NULL | 最近审核人 |
| `reviewed_at` | timestamptz | NULL | 最近审核时间 |
| `compliance_accepted_at` | timestamptz | NOT NULL | 合规承诺时间 |
| `agreement_version` | text | NOT NULL | 机构提交时协议版本 |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | 更新时间 |
| `suspended_at` | timestamptz | NULL | 暂停时间 |

索引与约束：

- `UNIQUE (unified_social_credit_code)`
- `INDEX partner_orgs_status_created_idx (status, created_at DESC)`
- `INDEX partner_orgs_contact_phone_idx (contact_phone_normalized)`
- `GIN INDEX partner_orgs_service_cities_gin (service_cities)`
- `GIN INDEX partner_orgs_accepted_banks_gin (accepted_banks)`
- `GIN INDEX partner_orgs_capabilities_gin (capabilities)`
- `CHECK (cardinality(service_cities) > 0)`
- `CHECK (cardinality(accepted_banks) > 0)`
- `CHECK (cardinality(capabilities) > 0)`
- `CHECK (average_processing_days IS NULL OR average_processing_days > 0)`
- `CHECK (min_installment_months IS NULL OR min_installment_months > 0)`
- `CHECK (max_installment_months IS NULL OR max_installment_months >= min_installment_months)`

业务校验：

- 进入 `active` 前必须至少绑定一份 `partner_business_license` 文件和一份 `partner_qualification` 文件。
- 法定代表人身份证文件使用 `partner_legal_representative_id`，只允许后台审核可见，不得进入公开机构资料。
- `suspended` 只允许 `manager` 操作。
- `rejected` 后不允许被匹配。

敏感性与可见范围：

- 机构主体名称可在审核通过后对欠款人展示。
- 法定代表人、证照文件、资质详情只允许后台可见，不向公开端或未授权机构开放。

### 3.4 `partner_contacts`

机构联系人和未来机构账号表。MVP 当前不开放机构自助后台，但数据库预留账号字段，避免把多个联系人和登录能力塞进机构主表。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 联系人 ID |
| `partner_organization_id` | uuid | FK partner_organizations(id), NOT NULL | 所属机构 |
| `name` | text | NOT NULL | 联系人姓名 |
| `phone` | text | NOT NULL | 联系手机号 |
| `phone_normalized` | text | NOT NULL | 规范化手机号 |
| `email` | text | NULL | 未来机构账号邮箱；保存小写规范化值 |
| `password_hash` | text | NULL | 未来机构登录哈希；未启用账号时为空 |
| `role` | text | NOT NULL DEFAULT `contact` | `owner`, `contact`, `viewer` |
| `status` | text | NOT NULL DEFAULT `active` | `invited`, `active`, `disabled` |
| `is_primary` | boolean | NOT NULL DEFAULT false | 是否主联系人 |
| `last_login_at` | timestamptz | NULL | 未来机构后台最近登录 |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | 更新时间 |

索引与约束：

- `INDEX partner_contacts_org_status_idx (partner_organization_id, status)`
- `INDEX partner_contacts_phone_idx (phone_normalized)`
- `UNIQUE (partner_organization_id, email) WHERE email IS NOT NULL`
- `UNIQUE (partner_organization_id) WHERE is_primary = true`
- `CHECK (role IN ('owner', 'contact', 'viewer'))`
- `CHECK (status IN ('invited', 'active', 'disabled'))`

敏感性：

- `password_hash` 只允许认证模块写入，禁止出现在 API 响应和审计 `after` 明细中。
- 当前机构主表仍保留提交时的联系人快照；后端接入数据库时可在同一事务中创建一条 `is_primary=true` 的 `partner_contacts`。

### 3.5 `match_cases`

人工匹配案件表，连接一条已通过初筛的申请和一个已激活机构。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 案件 ID |
| `debtor_application_id` | uuid | FK debtor_applications(id), NOT NULL | 欠款人申请 |
| `partner_organization_id` | uuid | FK partner_organizations(id), NOT NULL | 承接机构 |
| `status` | match_case_status | NOT NULL DEFAULT `matched` | 案件状态 |
| `match_reason` | text | NOT NULL | 人工匹配理由 |
| `proposed_plan` | jsonb | NOT NULL DEFAULT `{}` | 推荐方案快照 |
| `failure_reason` | text | NULL | 失败/取消原因 |
| `created_by_id` | uuid | FK admin_users(id), NOT NULL | 创建人 |
| `last_transition_by_id` | uuid | FK admin_users(id), NULL | 最近状态操作人 |
| `last_transition_reason` | text | NULL | 最近状态原因 |
| `last_transition_at` | timestamptz | NULL | 最近状态时间 |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | 更新时间 |
| `archived_at` | timestamptz | NULL | 归档时间 |

索引与约束：

- `INDEX match_cases_status_created_idx (status, created_at DESC)`
- `INDEX match_cases_application_idx (debtor_application_id)`
- `INDEX match_cases_partner_status_idx (partner_organization_id, status)`
- `UNIQUE (debtor_application_id) WHERE status NOT IN ('failed', 'cancelled', 'archived')`
- `CHECK (jsonb_typeof(proposed_plan) = 'object')`
- `CHECK ((status NOT IN ('failed', 'cancelled')) OR failure_reason IS NOT NULL)`

事务边界：

1. 后端在同一事务中锁定 `debtor_applications` 和 `partner_organizations`。
2. 校验申请状态为 `qualified`，机构状态为 `active`。
3. 插入 `match_cases(status='matched')`。
4. 更新 `debtor_applications.status='matched'`。
5. 插入申请和案件的 `audit_logs`。

敏感性与可见范围：

- `match_reason`、`proposed_plan` 可能包含金融和服务判断，仅后台可见。
- 未来开放机构后台时，机构只能看到本机构案件及授权范围内字段。

### 3.6 `match_case_notes`

案件跟进备注。MVP 仅内部可见。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 备注 ID |
| `match_case_id` | uuid | FK match_cases(id), NOT NULL | 案件 |
| `author_id` | uuid | FK admin_users(id), NOT NULL | 备注人 |
| `content` | text | NOT NULL | 备注内容 |
| `visibility` | note_visibility | NOT NULL DEFAULT `internal` | 可见范围 |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | 创建时间 |

索引与约束：

- `INDEX match_case_notes_case_created_idx (match_case_id, created_at DESC)`
- `CHECK (length(trim(content)) > 0)`

合规注意：

- 后端应过滤或提醒不要在备注中记录银行卡密码、验证码、完整卡号、与服务无关的病历细节等高风险信息。

### 3.7 `documents`

文件元数据表。对象存储或本地卷中的真实文件由 `storage_key` 引用，下载必须经过后端鉴权。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 文件 ID |
| `owner_type` | document_owner_type | NOT NULL DEFAULT `unbound` | 归属实体类型 |
| `owner_id` | uuid | NULL | 归属实体 ID；unbound 时为空 |
| `purpose` | document_purpose | NOT NULL | 文件用途 |
| `status` | document_status | NOT NULL DEFAULT `uploaded` | 文件状态 |
| `access_scope` | document_access_scope | NOT NULL DEFAULT `admin_only` | 访问范围 |
| `original_filename` | text | NOT NULL | 原始文件名，展示前转义 |
| `storage_key` | text | NOT NULL | 随机对象名或受控路径，不直接返回前端 |
| `mime_type` | text | NOT NULL | MIME 类型 |
| `size_bytes` | bigint | NOT NULL | 文件大小 |
| `sha256_hash` | text | NOT NULL | 文件内容哈希，用于去重和审计 |
| `uploaded_by_admin_id` | uuid | FK admin_users(id), NULL | 后台上传人 |
| `public_upload_token_hash` | text | NULL | 公开上传一次性 token 哈希 |
| `bound_at` | timestamptz | NULL | 绑定业务实体时间 |
| `deleted_at` | timestamptz | NULL | 软删除时间 |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | 上传时间 |

索引与约束：

- `UNIQUE (storage_key)`
- `INDEX documents_owner_idx (owner_type, owner_id, created_at DESC)`
- `INDEX documents_status_created_idx (status, created_at)`
- `INDEX documents_hash_idx (sha256_hash)`
- `CHECK (size_bytes > 0)`
- `CHECK (owner_type = 'unbound' AND owner_id IS NULL OR owner_type <> 'unbound' AND owner_id IS NOT NULL)`

业务校验：

- 公开上传后先为 `owner_type='unbound'`、`status='uploaded'`。
- 表单提交成功后在同一事务中把文件绑定到申请或机构，并设置 `status='bound'`。
- 未绑定文件由定时任务按保留策略清理，例如 24 小时后删除对象并标记 `deleted`。
- `agreement_signed` 状态前，案件应至少绑定一份 `purpose='agreement'` 的文件。

文件用途要求：

| 业务入口 | `purpose` | 必填 | 默认访问范围 |
| --- | --- | --- | --- |
| 欠款人证明材料 | `debtor_supporting_material` | 否 | `admin_only` |
| 机构营业执照 | `partner_business_license` | 是 | `admin_only` |
| 机构法人身份证 | `partner_legal_representative_id` | 是 | `admin_only` |
| 机构业务资质 | `partner_qualification` | 是 | `admin_only` |
| 匹配协议/合同 | `agreement` | 案件签署前是 | `admin_only` |
| 后台补充材料 | `admin_supplement` | 否 | `admin_only` |

敏感性与可见范围：

- `storage_key` 是受控路径，禁止在公开 API 返回。
- 身份证、医疗、收入、诉讼材料等属于高度敏感材料，应在文件服务层加水印、清理 EXIF，并记录查看/下载审计。

### 3.8 `audit_logs`

审计日志表。用于追踪后台审核、状态变更、匹配、文件查看/下载和账号管理。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | 日志 ID |
| `actor_id` | uuid | FK admin_users(id), NULL | 操作人；系统任务可为空 |
| `actor_role` | admin_role | NULL | 操作时角色快照 |
| `action` | text | NOT NULL | 动作名，如 `DEBTOR_APPLICATION_REVIEW` |
| `entity_type` | audit_entity_type | NOT NULL | 实体类型 |
| `entity_id` | uuid | NOT NULL | 实体 ID |
| `before` | jsonb | NOT NULL DEFAULT `{}` | 变更前摘要 |
| `after` | jsonb | NOT NULL DEFAULT `{}` | 变更后摘要 |
| `reason` | text | NULL | 操作原因 |
| `request_id` | text | NULL | 请求链路 ID |
| `ip_hash` | text | NULL | 操作 IP 哈希 |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | 操作时间 |

索引与约束：

- `INDEX audit_logs_entity_created_idx (entity_type, entity_id, created_at DESC)`
- `INDEX audit_logs_actor_created_idx (actor_id, created_at DESC)`
- `INDEX audit_logs_action_created_idx (action, created_at DESC)`
- `CHECK (jsonb_typeof(before) = 'object')`
- `CHECK (jsonb_typeof(after) = 'object')`

敏感性：

- `before`、`after` 只保存状态、审核结论、文件 ID 等摘要，不保存完整手机号、困难说明全文、文件路径、证件号码、密码哈希。
- 文件下载日志必须包含 `document` 实体、下载人、原因或业务上下文。

## 4. 关联关系

```text
admin_users 1 -> N debtor_applications.reviewed_by
admin_users 1 -> N partner_organizations.reviewed_by
admin_users 1 -> N match_cases.created_by
admin_users 1 -> N match_case_notes.author

partner_organizations 1 -> N partner_contacts
debtor_applications 1 -> N documents(owner_type='debtor_application')
partner_organizations 1 -> N documents(owner_type='partner_organization')
match_cases 1 -> N documents(owner_type='match_case')

debtor_applications 1 -> N match_cases
partner_organizations 1 -> N match_cases
match_cases 1 -> N match_case_notes
```

`documents.owner_id` 是多态关联，数据库无法直接声明单一 FK。后端必须按 `owner_type` 校验归属实体存在；如后续文件权限复杂度上升，可拆为 `debtor_application_documents`、`partner_organization_documents`、`match_case_documents` 三张连接表。

## 5. 状态流转约束

数据库负责保存当前状态和基础约束，完整状态机由服务层实现，并通过 `audit_logs` 留痕。

### 5.1 欠款人申请

- `submitted -> under_review, withdrawn`
- `under_review -> need_more_info, qualified, rejected`
- `need_more_info -> under_review, withdrawn`
- `qualified -> matched, archived`
- `matched -> archived`
- `rejected -> archived`
- `withdrawn -> archived`
- `archived` 为终态

### 5.2 机构

- `pending_review -> under_review, rejected`
- `under_review -> active, rejected, need_more_info`
- `need_more_info -> under_review, rejected`
- `active -> suspended`
- `suspended -> active, rejected`
- `rejected` 为终态

### 5.3 匹配案件

- `matched -> contacted, cancelled`
- `contacted -> negotiating, failed`
- `negotiating -> agreement_pending, failed`
- `agreement_pending -> agreement_signed, failed`
- `agreement_signed -> in_repayment, success, failed`
- `in_repayment -> success, failed`
- `success -> archived`
- `failed -> archived`
- `cancelled -> archived`
- `archived` 为终态

## 6. 迁移落地顺序

当后端脚手架落地后，建议首个 Prisma 迁移按以下顺序创建，避免循环依赖：

1. 创建枚举或 CHECK 约束辅助类型。
2. 创建 `admin_users`。
3. 创建 `debtor_applications` 和 `partner_organizations`。
4. 创建 `partner_contacts`。
5. 创建 `match_cases` 和 `match_case_notes`。
6. 创建 `documents`。
7. 创建 `audit_logs`。
8. 添加索引、唯一约束和 partial unique index。
9. 添加 `updated_at` 自动维护策略。Prisma 可用 `@updatedAt`；纯 SQL 可用 trigger。

首个迁移不涉及历史数据回填，数据丢失风险为无。后续若修改状态枚举或拆分字段，应先做兼容字段、双写、回填、读路径切换，再删除旧字段。

## 7. 后端对接方式

### 7.1 创建欠款人申请

- 在一个事务中创建 `debtor_applications`，绑定已上传的 `documents`。
- 校验公开上传文件的 `purpose='debtor_supporting_material'` 且 `owner_type='unbound'`。
- 保存三个同意项的时间、协议版本、IP 哈希和 User-Agent。
- 响应只返回 `id`、`status`、`submittedAt`。

### 7.2 创建机构入驻

- 在一个事务中创建 `partner_organizations`，绑定营业执照、法人身份证、资质文件。
- 同一事务中创建一条 `partner_contacts(is_primary=true)`，后续机构后台开放时再补齐 `email`、`password_hash` 和邀请状态。
- 校验统一社会信用代码唯一；重复时返回可人工处理的错误，不暴露既有记录详情。
- 未审核前不创建机构后台账号。

### 7.3 创建匹配案件

- 使用事务和行级锁读取申请与机构。
- 校验 `debtor_applications.status='qualified'`。
- 校验 `partner_organizations.status='active'`，且城市、银行、能力数组与申请匹配。
- 插入 `match_cases`，更新申请状态，写两条审计日志。

### 7.4 状态流转

- 所有 review/transition API 先读取当前状态，再根据状态机校验 `nextStatus`。
- 失败、拒绝、取消、暂停必须填写 `reason`。
- `agreement_signed` 前校验案件已绑定协议文件。
- 状态更新和审计日志必须在同一事务内提交。

## 8. 查询与索引场景

| 场景 | 查询条件 | 支撑索引 |
| --- | --- | --- |
| 后台待审核申请列表 | `status`, `created_at DESC` | `debtor_applications_status_created_idx` |
| 按手机号查重/搜索 | `phone_normalized`, `created_at DESC` | `debtor_applications_phone_created_idx` |
| 匹配候选申请 | `status='qualified'`, `city`, `bank_name` | `debtor_applications_city_status_idx`, `debtor_applications_bank_status_idx` |
| 待审核机构列表 | `status`, `created_at DESC` | `partner_orgs_status_created_idx` |
| 候选机构筛选 | `status='active'`, `service_cities @>`, `accepted_banks @>`, `capabilities @>` | GIN indexes |
| 案件看板 | `status`, `created_at DESC` | `match_cases_status_created_idx` |
| 机构案件列表 | `partner_organization_id`, `status` | `match_cases_partner_status_idx` |
| 实体附件 | `owner_type`, `owner_id` | `documents_owner_idx` |
| 实体审计 | `entity_type`, `entity_id`, `created_at DESC` | `audit_logs_entity_created_idx` |

后台列表默认分页，避免导出式查询走公开列表接口。批量导出应单独做 manager 权限、审批和审计。

## 9. 字段分级与 API 可见范围

| 数据 | 分级 | 公开提交响应 | 后台列表 | 后台详情 | 机构可见性 |
| --- | --- | --- | --- | --- | --- |
| 申请 ID、状态、提交时间 | 业务流程信息 | 可返回 | 可见 | 可见 | 仅被匹配且授权后可见 |
| 欠款人姓名 | 普通个人信息 | 不返回全文 | 脱敏 | 按权限可见 | 仅被匹配且授权后可见 |
| 欠款人手机号 | 普通个人信息 | 不返回全文 | 脱敏 | 按权限可见 | 仅被匹配且授权后可见 |
| 城市、银行、逾期区间 | 金融相关信息 | 不返回 | 可见 | 可见 | 仅被匹配且授权后可见 |
| 欠款金额、收入、还款能力 | 金融相关信息 | 不返回 | 金额可见或区间化 | 可见 | 仅在服务必要范围内可见 |
| 困难原因和说明 | 可能敏感 | 不返回 | 摘要或标签 | 可见 | 仅在服务必要范围内可见 |
| 证明材料文件 | 高度敏感 | 只返回文件 ID | 仅显示数量/类型 | 需审计查看 | 默认不可见，授权后按需开放 |
| 机构主体名称 | 机构信息 | 不返回既有机构详情 | 可见 | 可见 | 审核通过后可展示 |
| 法定代表人姓名/身份证 | 敏感个人信息 | 不返回 | 脱敏或不展示 | 审核权限可见 | 不可见 |
| 文件 `storage_key` | 系统敏感信息 | 不返回 | 不返回 | 不返回；仅文件服务内部使用 | 不可见 |
| 审计日志 before/after | 合规审计信息 | 不返回 | manager 可查摘要 | manager 可查 | 不可见 |

## 10. 数据保留与清理

- 未绑定公开上传文件：建议 24 小时后删除对象并标记 `documents.status='deleted'`。
- 未匹配且无争议申请：建议 90 天后归档或按隐私政策删除非必要材料。
- 已匹配案件：按服务履行、投诉处理和法定义务设定保留期；到期后先归档，再执行脱敏或删除。
- 审计日志：保留周期应长于业务数据争议处理周期；日志中避免保存敏感全文，降低长期留存风险。

## 11. 验证查询

迁移后可用以下查询做结构和数据质量检查。

```sql
-- 是否存在未绑定且超期的公开上传文件
SELECT id, created_at
FROM documents
WHERE owner_type = 'unbound'
  AND status = 'uploaded'
  AND created_at < now() - interval '24 hours';

-- 是否存在已签署但未绑定协议文件的案件
SELECT mc.id
FROM match_cases mc
WHERE mc.status IN ('agreement_signed', 'in_repayment', 'success')
  AND NOT EXISTS (
    SELECT 1
    FROM documents d
    WHERE d.owner_type = 'match_case'
      AND d.owner_id = mc.id
      AND d.purpose = 'agreement'
      AND d.status = 'bound'
  );

-- 是否存在 active 但缺少营业执照或资质文件的机构
SELECT po.id, po.organization_name
FROM partner_organizations po
WHERE po.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM documents d
    WHERE d.owner_type = 'partner_organization'
      AND d.owner_id = po.id
      AND d.purpose = 'partner_business_license'
      AND d.status = 'bound'
  );

SELECT po.id, po.organization_name
FROM partner_organizations po
WHERE po.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM documents d
    WHERE d.owner_type = 'partner_organization'
      AND d.owner_id = po.id
      AND d.purpose = 'partner_qualification'
      AND d.status = 'bound'
  );

-- 是否存在进行中重复匹配的申请
SELECT debtor_application_id, count(*)
FROM match_cases
WHERE status NOT IN ('failed', 'cancelled', 'archived')
GROUP BY debtor_application_id
HAVING count(*) > 1;
```

## 12. 暂不纳入 MVP 的表

- 机构自助后台账号、机构员工和多租户权限表。
- 欠款人登录账号、短信验证码和自助查询表。
- 在线支付、账单、发票、资金流水表。
- 自动匹配评分、推荐模型和消息通知表。
- 投诉工单可在后续版本加入；MVP 可先用 `match_case_notes` 和 `audit_logs` 记录投诉处理摘要。
