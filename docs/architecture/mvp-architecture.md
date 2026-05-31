# DebtBridge MVP 技术架构

## 1. 背景和目标

DebtBridge MVP 是一个信用卡逾期协商信息撮合平台。平台只做信息收集、资质审核、人工撮合、进度跟踪和协议留档，不做放贷、不做催收、不代收款、不承诺协商结果、不提供征信修复。

当前仓库只有占位 README，因此本文定义第一版可落地架构，供后端、前端、数据库和 DevOps 子任务并行实现。

MVP 目标：

- 欠款人提交信用卡逾期协商申请。
- 机构提交入驻申请和资质材料。
- 后台运营人工审核申请、审核机构、创建匹配案件、记录跟进状态和协议文件。
- 支持后续通过 docker-compose 部署到单机或小型云服务器。

非目标：

- 自动匹配算法。
- 债务双方在线聊天。
- 在线支付、代收款、资金清结算。
- 催收任务管理、外呼系统、短信群发。
- 征信修复、贷款推荐、资金垫付。

## 2. 技术栈决策

建议采用单仓库、三服务的轻量架构：

| 层 | 建议技术 | 原因 |
| --- | --- | --- |
| Web 前端 | Next.js + TypeScript | 同时承载官网、公开表单和后台管理页面，便于后续 SEO 和部署 |
| 后端 API | NestJS 或 Fastify + TypeScript | 与前端共享类型生态，适合快速实现表单、后台工作流和权限边界 |
| 数据库 | PostgreSQL | 关系模型清晰，适合审核、匹配、状态流转和审计日志 |
| ORM/迁移 | Prisma | 快速生成类型、迁移和基础 CRUD，降低 MVP 复杂度 |
| 文件存储 | 本地卷起步，抽象为 storage service | docker-compose 可直接运行，后续可替换 S3/OSS |
| 认证 | 后台账号密码 + JWT/httpOnly Cookie | MVP 只需要后台运营登录，公开端不要求注册 |
| 部署 | docker-compose + Nginx/Caddy 反向代理 | 符合任务要求，单机即可交付 |

关键取舍：

- 采用模块化单体，而不是微服务。MVP 业务边界清楚但规模小，拆服务会增加部署和事务复杂度。
- 公开端不做用户登录。欠款人提交后由后台人工联系，减少个人账号、密码和找回流程的合规与研发负担。
- 文件只保存受控引用，不把证件和证明材料嵌入业务表的大字段。
- 所有状态变更写审计日志，后台操作可追溯。

## 3. 建议目录结构

```text
DebtBridge/
  apps/
    web/                  # Next.js：官网、公开表单、后台界面
    api/                  # NestJS/Fastify：REST API、后台工作流
  packages/
    shared/               # 共享枚举、DTO 类型、校验 schema
  prisma/
    schema.prisma
    migrations/
  docs/
    architecture/
    compliance/
    deployment/
    product/
  docker-compose.yml
  .env.example
```

如果项目初期要进一步压缩复杂度，可以先放在一个 Next.js 应用内，用 API routes 实现后端；但仍应按 `modules/*` 保持领域边界，避免页面代码直接操作数据库。

## 4. 模块边界

### Public Site

责任：

- 展示平台定位、适合人群、服务流程、合规声明。
- 提供欠款人申请入口和机构入驻入口。

边界：

- 不展示具体机构报价。
- 不承诺成功率。
- 不收集支付信息。

### Application Intake

责任：

- 接收欠款人信用卡逾期协商申请。
- 校验金额、逾期时长、还款能力、联系方式、困难说明和承诺勾选。
- 生成待审核申请。

核心字段：

- 姓名、手机号、城市。
- 欠款银行、总欠款金额、逾期时长、是否被催收、是否收到律师函/法院传票。
- 月收入、月最大还款能力、期望方案、困难原因。
- 信息真实承诺、隐私授权、服务协议确认。

### Partner Onboarding

责任：

- 接收资管机构、律所或其他合作方入驻申请。
- 管理营业执照、法人身份证、执业证/资管资质等文件引用。
- 支持后台审核通过、驳回和暂停合作。

边界：

- 未审核通过机构不能查看线索。
- 资质文件仅后台可见。

### Admin Operations

责任：

- 审核欠款人申请。
- 审核机构资质。
- 人工创建匹配案件。
- 记录报价方案、跟进进度、协议/合同文件。
- 导出或查看审计日志。

边界：

- 后台角色才能访问。
- 状态流转必须通过受控 API，不能由前端直接写任意状态。

### Match Case

责任：

- 连接一个欠款人申请和一个已审核机构。
- 记录人工匹配理由、推荐方案、进度状态、运营备注。
- 记录合同/协议文件引用。

MVP 中匹配由运营人员人工完成，系统只提供筛选、创建和跟踪能力。

### Documents

责任：

- 管理证明材料、资质文件、协议文件的元数据。
- 保存文件用途、归属实体、存储路径、上传人、访问范围。

边界：

- 不公开暴露原始文件路径。
- 文件下载必须经过后端鉴权。
- 本地存储目录挂载为 Docker volume，后续可替换对象存储。

### Audit Logs

责任：

- 记录后台审核、状态更新、匹配创建、文件上传、备注追加等关键操作。
- 支持按实体追溯操作人、操作时间、前后状态和原因。

## 5. 主要数据流

### 欠款人申请

```text
欠款人浏览官网
  -> 填写信用卡逾期协商申请
  -> API 校验字段和承诺勾选
  -> 保存 debtor_application(status=submitted)
  -> 后台出现待审核任务
  -> 运营审核为 qualified/rejected/need_more_info
```

### 机构入驻

```text
机构填写入驻表单并上传资质
  -> API 校验机构字段和附件引用
  -> 保存 partner_organization(status=pending_review)
  -> 后台审核资质
  -> 审核通过后机构进入 active，可被匹配
```

### 人工匹配和跟进

```text
运营筛选 qualified 申请
  -> 查看 active 机构承接范围
  -> 创建 match_case(status=matched)
  -> 记录推荐方案和机构反馈
  -> 进入 negotiating/agreement_pending/agreement_signed/success/failed
  -> 上传协议文件或失败原因
```

## 6. 后台工作流状态机

### 欠款人申请状态

| 状态 | 含义 | 允许下一步 |
| --- | --- | --- |
| submitted | 已提交，未审核 | under_review, withdrawn |
| under_review | 后台审核中 | need_more_info, qualified, rejected |
| need_more_info | 需要补充信息 | under_review, withdrawn |
| qualified | 初筛通过，可匹配 | matched, archived |
| matched | 已创建匹配案件 | in_progress, archived |
| rejected | 不符合平台服务范围 | archived |
| withdrawn | 申请人撤回 | archived |
| archived | 归档 | 无 |

### 机构状态

| 状态 | 含义 | 允许下一步 |
| --- | --- | --- |
| pending_review | 已提交，待审核 | under_review, rejected |
| under_review | 资质审核中 | active, rejected, need_more_info |
| need_more_info | 需要补充资质 | under_review, rejected |
| active | 审核通过，可匹配 | suspended |
| suspended | 暂停合作 | active, rejected |
| rejected | 审核不通过 | 无 |

### 匹配案件状态

| 状态 | 含义 | 允许下一步 |
| --- | --- | --- |
| matched | 已人工匹配 | contacted, cancelled |
| contacted | 已对接双方 | negotiating, failed |
| negotiating | 方案沟通中 | agreement_pending, failed |
| agreement_pending | 待签署或确认协议 | agreement_signed, failed |
| agreement_signed | 协议已签署 | in_repayment, success, failed |
| in_repayment | 按方案履行中 | success, failed |
| success | 成功结案 | archived |
| failed | 失败结案 | archived |
| cancelled | 取消匹配 | archived |
| archived | 归档 | 无 |

状态机规则：

- 只有后台用户能改变状态。
- 每次状态变更必须记录原因和审计日志。
- 不能从未审核申请直接创建匹配案件。
- 不能把未通过审核的机构加入匹配案件。

## 7. 权限边界

| 角色 | 能力 |
| --- | --- |
| Anonymous | 查看官网、提交欠款人申请、提交机构入驻 |
| Admin Operator | 查看和审核申请/机构、创建匹配、更新进度、上传协议、写备注 |
| Admin Manager | 管理后台账号、暂停机构、查看审计日志、导出运营数据 |

MVP 不开放机构自助后台。机构侧先通过线下或后台运营对接，避免过早实现多租户权限。

权限要求：

- 公开接口只能创建记录，不能查询敏感详情。
- 后台接口必须认证。
- 后台列表应默认脱敏手机号，详情页按权限查看完整信息。
- 附件下载必须校验后台权限和文件归属。

## 8. 数据模型概要

建议数据库子任务以以下实体为中心：

- `debtor_applications`：欠款人申请、还款能力、困难情况、承诺状态。
- `partner_organizations`：机构入驻、资质、业务范围、审核状态。
- `match_cases`：人工匹配记录、推荐方案、进度状态。
- `documents`：证明材料、资质文件、协议文件的受控引用。
- `case_notes`：运营跟进备注。
- `audit_logs`：审核和状态变更记录。
- `admin_users`：后台账号和角色。

索引建议：

- `debtor_applications(status, created_at)`
- `debtor_applications(phone)`
- `partner_organizations(status, created_at)`
- `partner_organizations(unified_social_credit_code)` 唯一或条件唯一
- `match_cases(status, created_at)`
- `match_cases(application_id)`
- `match_cases(partner_organization_id)`
- `audit_logs(entity_type, entity_id, created_at)`

## 9. docker-compose 部署形态

MVP 部署建议：

```text
nginx/caddy
  -> web:3000
  -> api:3001
api
  -> postgres:5432
  -> uploads volume
```

服务：

- `web`：Next.js 页面。
- `api`：后端 REST API。
- `postgres`：业务数据库。
- `reverse-proxy`：TLS、静态转发、API 反向代理。
- `migration`：可选一次性迁移任务。

Docker volume：

- `postgres_data`
- `debtbridge_uploads`

环境变量草案：

| 变量 | 用途 |
| --- | --- |
| `NODE_ENV` | runtime 环境 |
| `DATABASE_URL` | API/Prisma 连接 PostgreSQL |
| `POSTGRES_DB` | 数据库名 |
| `POSTGRES_USER` | 数据库用户 |
| `POSTGRES_PASSWORD` | 数据库密码 |
| `JWT_SECRET` | 后台认证签名密钥 |
| `COOKIE_SECRET` | Cookie 签名密钥 |
| `ADMIN_BOOTSTRAP_EMAIL` | 初始后台管理员邮箱 |
| `ADMIN_BOOTSTRAP_PASSWORD` | 初始后台管理员密码，仅首次启动使用 |
| `UPLOAD_STORAGE_DRIVER` | `local` 起步，后续可扩展 `s3`/`oss` |
| `UPLOAD_DIR` | 容器内上传目录 |
| `MAX_UPLOAD_MB` | 单文件大小上限 |
| `PUBLIC_WEB_URL` | 官网访问地址 |
| `API_BASE_URL` | 前端调用 API 地址 |
| `CORS_ORIGINS` | 允许的前端源 |
| `LOG_LEVEL` | 日志级别 |

安全要求：

- `.env` 不提交仓库，提交 `.env.example`。
- 上传目录不由 Nginx 直接静态暴露。
- 生产环境必须配置 TLS。
- 初始管理员密码启动后必须修改或禁用 bootstrap。

## 10. 一期必须做和延后功能

一期必须做：

- 官网和合规声明。
- 欠款人申请表单。
- 机构入驻表单。
- 后台登录。
- 申请审核、机构审核。
- 人工匹配、进度状态、备注。
- 文件上传引用和后台下载。
- 审计日志。
- docker-compose 本地/服务器部署。

延后：

- 自动匹配和评分算法。
- 机构自助后台。
- 欠款人与机构在线聊天。
- 短信、电话、微信自动通知。
- 在线支付、佣金结算、发票。
- CRM 外呼、催收任务。
- 复杂 BI 和报表。
- 多城市、多债务类型扩展。

## 11. 下游实施建议

### 后端任务 GOO-7

- 先实现公开提交接口、后台认证、审核状态机，再实现匹配案件。
- 所有状态更新使用 service 层方法，集中校验状态流转。
- 使用 DTO/schema 做请求校验，金额用整数分或 Decimal，不用 float。
- 每个后台写操作必须生成 `audit_logs`。
- 测试覆盖：公开提交校验、未审核机构不能匹配、非法状态跳转被拒绝。

### 数据库任务 GOO-8

- 先交付 Prisma schema 和迁移。
- 状态字段使用枚举或受控字符串。
- 附件表只保存路径、用途、归属和 MIME 信息，不保存文件二进制到数据库。
- 敏感字段在文档中标注访问范围和保留期限。

### 前端任务 GOO-9

- 前端表单字段必须与 API DTO 对齐。
- 后台页面按工作流组织：待审核申请、机构审核、匹配案件、协议/文件。
- 所有合规确认使用显式 checkbox，未勾选不能提交。
- 管理端列表默认脱敏手机号和身份证相关信息。

### DevOps 任务 GOO-10

- 提供 `docker-compose.yml`、`.env.example` 和运行手册。
- 数据库迁移必须有明确命令。
- 上传目录必须挂载持久卷。
- 运行手册包含启动、停止、日志、备份、恢复和 TLS/反代建议。

### 验收任务 GOO-11

- 端到端验证从公开表单提交到后台审核、匹配、结案。
- 验证合规文案出现在官网、表单、协议确认和后台关键页面。
- 验证 docker-compose 空环境可启动并运行迁移。

## 12. 架构风险

- 合规风险高于技术风险。任何新功能默认先检查是否触碰放贷、催收、代收款、征信修复或成功承诺。
- 个人信息和资质文件属于敏感数据，不能公开访问，不能写入日志。
- 自动匹配、在线沟通和支付都会显著扩大合规与权限复杂度，应在 MVP 验证后再设计。
- 初期人工运营是正确约束，技术架构应服务于审核和追溯，而不是过早自动化。
