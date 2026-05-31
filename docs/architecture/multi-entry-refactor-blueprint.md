# DebtBridge 多端重构实施蓝图

本文基于当前 DebtBridge 仓库、既有 MVP 架构文档，以及 GOO-12 对双前端入口、身份认证、PostgreSQL、后台管理和 PR/MR 流程的要求，定义后续实现的技术蓝图。目标是让后端、数据库、前端、DevOps 任务围绕同一套目录、边界、API 合约和验收顺序推进，避免各自发散。

## 1. 当前基线

当前仓库是轻量 Node.js API 与静态 Web 的模块化 MVP：

- `apps/api/src/server.js` 直接挂载静态页面并暴露 REST API。
- `apps/api/src/store.js` 使用内存 Map 保存会话、申请、机构、案件、附件元数据和审计日志。
- `apps/web/index.html`、`apps/web/app.js`、`apps/web/styles.css` 承载公开首页、债务人申请、机构入驻和后台管理的单页体验。
- `docs/architecture/mvp-architecture.md`、`docs/architecture/data-model.md`、`docs/architecture/api-and-data-flow.md` 已定义 MVP 的领域模型、状态机、API 原则、审计和合规边界。
- `docs/release/mvp-acceptance-checklist.md` 明确当前仍存在 Docker Compose、PostgreSQL 持久化、真实认证和文件存储等生产化缺口。

因此本次重构应采用“先分边界、再换存储、最后扩页面”的方式，不建议一次性改写为大型框架项目。所有新能力应保持现有 API 合约和状态机兼容，只有在下游实现已准备好时再切换运行入口。

## 2. 目标架构

### 2.1 前端入口

重构后保留一个代码仓库，但前端分为两个清晰入口：

```text
client 端
  /login                    # 统一登录页，支持债务人和机构身份进入
  /debtor                   # 债务人工作台
  /debtor/applications      # 债务人申请列表和详情
  /debtor/applications/new  # 信用卡逾期协商申请
  /debtor/cases             # 债务人可见的匹配案件和进度
  /partner                  # 机构工作台
  /partner/onboarding       # 机构入驻和资质补充
  /partner/cases            # 机构被授权案件列表
  /partner/cases/:id        # 机构案件详情和方案反馈

admin 端
  /admin/login              # 平台管理员登录
  /admin/dashboard          # 统计面板
  /admin/debtors            # 债务人申请审核
  /admin/partners           # 机构管理和资质审核
  /admin/cases              # 人工匹配、案件进度、协议留档
  /admin/users              # 后台用户管理，仅 manager
  /admin/audit-logs         # 审计日志，仅 manager 或授权角色
```

`client` 端服务债务人和机构，登录后通过身份选择或默认身份进入对应工作台；`admin` 端只服务平台运营与管理员。两个入口可以先由同一个 Web 应用按路由分区承载，待部署复杂度上升后再拆成 `apps/client-web` 和 `apps/admin-web`。

### 2.2 后端与数据库

后端应从当前内存存储演进为 PostgreSQL 持久化服务：

```text
apps/
  api/                      # REST API、认证、领域服务、PostgreSQL adapter
  web/                      # 过渡期静态页面；后续可改为 client/admin 构建产物
packages/
  shared/                   # 枚举、DTO、校验 schema、状态机定义
prisma/
  schema.prisma
  migrations/
docs/
  architecture/
  deployment/
```

第一阶段可以继续使用当前 Node API，不强制立即引入 NestJS 或 Next.js。实现时必须先把 `store.js` 背后的接口稳定为 repository，再新增 `PostgresRepository`，避免 API handler、service 与数据库驱动直接耦合。

## 3. 推荐目录结构

短期改造目录：

```text
apps/api/src/
  server.js                 # HTTP 路由与中间件
  service.js                # 领域动作：审核、匹配、状态流转
  repositories/
    memory-repository.js    # 从现有 store.js 迁移而来，用于测试和回退
    postgres-repository.js  # Prisma/PostgreSQL 实现
  auth/
    session-service.js
    password-service.js
    authorization.js
  modules/
    users/
    debtor-applications/
    partner-organizations/
    match-cases/
    documents/
    audit-logs/
  validation.js
  domain.js

apps/web/
  client/
    login.html
    debtor/
    partner/
  admin/
    login.html
    dashboard.html
    debtors.html
    partners.html
    cases.html
    users.html
  shared/
    api-client.js
    auth.js
    components.js
    formatters.js
```

中期如引入前端框架，可迁移为：

```text
apps/
  client-web/               # 债务人和机构入口
  admin-web/                # 平台后台入口
  api/
packages/
  shared/
```

目录变化应通过 PR 分阶段完成。第一批 PR 只做文件组织、共享枚举和 repository 抽象；不要同时改 UI、认证、数据库和部署。

## 4. 身份、认证与授权边界

### 4.1 身份类型

| 身份 | 登录入口 | 账号来源 | 可见数据 | 可执行操作 |
| --- | --- | --- | --- | --- |
| 债务人 | `/login` 或 `/debtor/login` | 债务人注册、手机号验证码或管理员代建后激活 | 自己提交的申请、授权后关联的案件进度、自己上传的材料摘要 | 新建/补充申请、查看状态、补充材料、确认授权 |
| 机构用户 | `/login` 或 `/partner/login` | 机构入驻审核通过后由平台创建机构账号 | 本机构资料、本机构被分配或授权的案件、必要范围内的债务人信息 | 补充资质、查看授权案件、提交方案反馈、上传协议相关文件 |
| 平台 operator | `/admin/login` | manager 创建 | 所有申请、机构、案件的运营视图，敏感字段按规则展示 | 审核、匹配、记录跟进、上传协议、查看有限审计 |
| 平台 manager | `/admin/login` | 初始 bootstrap 或既有 manager 创建 | 全量后台运营与审计视图 | 用户管理、暂停机构、审计查询、数据导出审批、纠错流程 |

### 4.2 认证策略

MVP 过渡期建议采用服务端会话或短期 JWT + httpOnly Cookie，不再把后台 token 放在 `localStorage`。认证模块必须支持：

- 统一用户表 `users`：保存邮箱/手机号、密码哈希、状态、最近登录时间。
- 身份关系表：`debtor_profiles`、`partner_memberships`、`admin_profiles`，一个登录用户可拥有一个或多个身份。
- 登录后返回 `activeIdentity` 和 `availableIdentities`，前端根据身份跳转。
- `operator` 与 `manager` 继续作为平台后台角色；机构侧角色可先只设 `partner_member`，后续扩展 `partner_admin`。
- 所有写操作使用服务层授权函数判断角色、归属和状态机，不在前端隐藏按钮后假定安全。

### 4.3 授权规则

| 资源 | 债务人 | 机构用户 | operator | manager |
| --- | --- | --- | --- | --- |
| 债务人申请 | 仅本人 | 默认不可见；被匹配且授权后仅必要字段可见 | 可见并审核 | 可见并审核 |
| 机构资料 | 不可见后台资质 | 仅本机构 | 可见并审核 | 可见、暂停、恢复 |
| 匹配案件 | 仅本人案件进度 | 仅本机构案件 | 可创建和流转 | 可创建、流转、纠错 |
| 文件 | 仅本人上传摘要和允许下载的文件 | 仅授权案件文件 | 后台详情按权限查看 | 全量审计查看 |
| 审计日志 | 不可见 | 不可见 | 实体摘要 | 全量查询 |
| 用户管理 | 不可见 | 不可见 | 不可见 | 可管理 |

敏感字段默认在列表中脱敏。完整手机号、困难说明、证照文件、协议文件下载均需记录审计日志。

## 5. API 合约分层

现有公开和后台 API 可继续保留，同时新增面向登录用户的 client API。建议分层如下：

```text
/api/public/*                         # 无需登录的配置、协议版本、公开枚举
/api/auth/*                           # 统一登录、登出、当前用户、身份切换
/api/client/debtor/*                  # 债务人自助申请和案件
/api/client/partner/*                 # 机构自助资料和授权案件
/api/admin/*                          # 平台后台运营和管理
```

### 5.1 认证 API

| API | 说明 |
| --- | --- |
| `POST /api/auth/login` | 统一登录，返回当前用户和可用身份；后台也可复用但应校验 admin 身份 |
| `POST /api/auth/logout` | 清理会话 |
| `GET /api/auth/me` | 返回用户、身份、权限、当前会话 |
| `POST /api/auth/switch-identity` | 多身份用户切换 `debtor`、`partner` 或 `admin` |

`/api/admin/auth/login` 可在兼容期保留为 wrapper，内部调用统一认证服务。

### 5.2 债务人 client API

| API | 说明 |
| --- | --- |
| `POST /api/client/debtor/applications` | 登录债务人提交申请；兼容现有公开提交字段 |
| `GET /api/client/debtor/applications` | 仅返回本人申请列表 |
| `GET /api/client/debtor/applications/:id` | 返回本人申请详情、附件摘要、允许补充的信息 |
| `POST /api/client/debtor/applications/:id/supplements` | 补充材料或说明，需状态允许 |
| `GET /api/client/debtor/cases` | 本人匹配案件进度 |
| `GET /api/client/debtor/cases/:id` | 本人案件详情和时间线 |

公开 `POST /api/debtor-applications` 可继续存在，用于未登录访客提交。提交成功后应提示创建账号或通过一次性链接绑定申请，具体实现可放到后续 PR。

### 5.3 机构 client API

| API | 说明 |
| --- | --- |
| `GET /api/client/partner/profile` | 本机构主体、资质状态、服务范围 |
| `POST /api/client/partner/onboarding` | 登录机构用户提交或补充入驻信息 |
| `GET /api/client/partner/cases` | 仅返回本机构被匹配或授权案件 |
| `GET /api/client/partner/cases/:id` | 案件必要字段、进度、附件摘要 |
| `POST /api/client/partner/cases/:id/proposals` | 机构提交方案反馈 |
| `POST /api/client/partner/cases/:id/documents` | 上传或绑定授权范围内文件 |

机构端不能自行拉取未分配线索，也不能看到债务人完整联系方式，除非案件已由平台管理员创建匹配并显式授权。

### 5.4 后台 admin API

现有 `/api/admin/debtor-applications`、`/api/admin/partner-organizations`、`/api/admin/match-cases`、`/api/admin/audit-logs` 保持为后台主接口，并补充：

| API | 说明 |
| --- | --- |
| `GET /api/admin/dashboard/metrics` | 待审核线索、待审核机构、进行中案件、待上传协议、成功/失败统计 |
| `GET /api/admin/users` | 用户列表，仅 manager |
| `POST /api/admin/users` | 创建后台用户或机构初始账号，仅 manager |
| `POST /api/admin/users/:id/disable` | 禁用账号，仅 manager |
| `POST /api/admin/match-cases/:id/authorize-partner-fields` | 明确机构可见字段，默认最小化 |

## 6. PostgreSQL 迁移顺序

数据库任务应在 `docs/architecture/data-model.md` 的实体基础上补充登录用户与机构成员关系。推荐迁移顺序：

1. 创建 `users`、`user_sessions`、`admin_profiles`。
2. 创建 `debtor_profiles`、`partner_memberships`，先允许为空关系，支持历史公开申请后绑定。
3. 创建或迁移 `debtor_applications`、`partner_organizations`、`match_cases`、`documents`、`match_case_notes`、`audit_logs`。
4. 为 `debtor_applications` 增加 `debtor_profile_id` 可空 FK，为 `partner_organizations` 增加创建人和审核字段。
5. 为 `match_cases` 增加机构可见字段策略，例如 `partner_visibility_policy` JSONB 或独立授权表。
6. 迁移默认后台用户：用环境变量 bootstrap manager，密码必须哈希保存。
7. 增加索引、唯一约束、partial unique index、状态 CHECK 或 enum。
8. 将服务层从 `MemoryRepository` 切换到 `PostgresRepository`，测试通过后再移除或降级内存模式为测试专用。

首个 PostgreSQL PR 不应改动 UI。它只交付 schema、迁移、repository adapter、测试数据 seed 和必要的 API 集成测试。

## 7. 从静态 Web 和内存 store 的迁移策略

### 阶段 A：稳定边界

- 把当前 `store.js` 改名或包装为 `MemoryRepository`，公开清晰的 repository 方法。
- 将状态机、枚举、脱敏、ID 前缀、错误结构移动到 `packages/shared` 或 `apps/api/src/domain` 的稳定模块。
- API handler 只依赖 service，service 只依赖 repository interface。
- 保持 `npm test` 全部通过。

### 阶段 B：拆页面但不换数据库

- 先在 `apps/web` 内按 `client/`、`admin/` 拆出页面与共享 JS。
- 保留现有 API，新增 `/api/auth/me` 和身份判断的前端路由守卫。
- 用内存 repository 支撑多页面跳转和身份可见性测试。
- 所有页面统一中文正式风格，不再把公开申请、机构入驻和后台操作挤在单页。

### 阶段 C：接入 PostgreSQL

- 添加 Prisma schema、迁移和 `.env.example`。
- 引入 `DATABASE_URL`，默认本地开发可用 PostgreSQL；测试可继续使用内存 repository 或测试数据库。
- 将登录、用户、机构成员、申请、案件和审计写入 PostgreSQL。
- 后端每个写操作保持事务和审计同提交。

### 阶段 D：双入口部署

- 引入 docker-compose：`api`、`postgres`、`web`、`reverse-proxy`、可选 `migration`。
- 路由层将 `/`、`/login`、`/debtor/*`、`/partner/*` 指向 client 端，将 `/admin/*` 指向后台端。
- PR 流程要求每个实现任务提供测试结果、截图或本地验证说明。

## 8. 前后端集成顺序

1. 冻结共享枚举和状态机：申请状态、机构状态、案件状态、身份类型、后台角色、文件用途。
2. 后端补齐统一认证和 `/api/auth/me`，前端先接登录态和路由守卫。
3. 前端拆出 `/debtor`、`/partner`、`/admin` 页面骨架，使用现有 API mock 或内存 API。
4. 数据库实现 PostgreSQL schema 和 repository，后端接口不改响应结构。
5. 债务人端接入本人申请和案件 API。
6. 机构端接入本机构资料、资质补充和授权案件 API。
7. 后台接入 dashboard metrics、用户管理、机构管理、人工匹配和审计日志。
8. DevOps 接入 docker-compose、迁移命令、健康检查和 CI。
9. 端到端验收：债务人提交、机构入驻、manager 创建机构账号、operator 审核、人工匹配、机构查看授权案件、案件流转、审计可查。

## 9. 页面归属与数据操作清单

### 9.1 债务人页面

| 页面 | 数据来源 | 允许操作 |
| --- | --- | --- |
| 登录/注册 | `/api/auth/*` | 登录、退出、绑定身份 |
| 债务人首页 | `/api/client/debtor/applications`、`/api/client/debtor/cases` | 查看本人状态摘要 |
| 新建申请 | `/api/client/debtor/applications` 或公开提交 API | 提交申请、上传证明材料引用、确认合规授权 |
| 申请详情 | `/api/client/debtor/applications/:id` | 查看本人申请、按状态补充材料 |
| 案件进度 | `/api/client/debtor/cases/:id` | 查看时间线、协议摘要、平台提示 |

债务人不能查看机构候选池、后台审核备注、完整审计日志或其他债务人的任何数据。

### 9.2 机构页面

| 页面 | 数据来源 | 允许操作 |
| --- | --- | --- |
| 机构工作台 | `/api/client/partner/profile`、`/api/client/partner/cases` | 查看资质状态和被授权案件摘要 |
| 入驻/资质补充 | `/api/client/partner/onboarding` | 提交主体信息、资质文件、合规承诺 |
| 授权案件列表 | `/api/client/partner/cases` | 查看本机构案件，不可主动搜索全量线索 |
| 案件详情 | `/api/client/partner/cases/:id` | 查看必要字段、提交方案反馈、上传协议相关材料 |

机构不能看到未匹配线索、其他机构案件、债务人完整敏感信息、后台内部备注和平台审计日志。

### 9.3 平台后台页面

| 页面 | 数据来源 | 允许操作 |
| --- | --- | --- |
| Dashboard | `/api/admin/dashboard/metrics` | 查看统计面板、待办与风险提醒 |
| 债务人审核 | `/api/admin/debtor-applications` | 审核、要求补充、拒绝、进入匹配 |
| 机构管理 | `/api/admin/partner-organizations` | 审核资质、暂停/恢复机构、查看材料 |
| 人工匹配 | `/api/admin/match-cases` | 创建匹配、记录方案、授权机构字段 |
| 案件进度 | `/api/admin/match-cases/:id` | 状态流转、备注、协议文件绑定 |
| 用户管理 | `/api/admin/users` | manager 创建、禁用、重置账号 |
| 审计日志 | `/api/admin/audit-logs` | manager 查询实体审计和敏感操作 |

后台所有写操作必须经过认证、授权、状态机校验和审计写入。

## 10. 统计面板范围

`/admin/dashboard` 首期应包含：

- 待审核债务人申请数。
- 待审核机构数。
- 已通过但未匹配申请数。
- 进行中案件数。
- 待上传协议案件数。
- 本周新增申请、机构、案件。
- 成功、失败、取消案件数。
- 高风险标记：有律师函/传票、还款能力异常、资质缺失、长期未跟进。

统计查询应从 PostgreSQL 聚合，避免前端拉全量列表计算。manager 可查看全量统计，operator 可查看运营必要统计。

## 11. PR/MR 与依赖关系

所有修改必须通过 PR/MR 进入主分支。推荐 PR 链：

1. `docs: add multi-entry refactor blueprint`：本蓝图和旧文档引用。
2. `refactor: introduce shared domain and repository interface`：不改变行为。
3. `feat(api): add unified auth and user identity model`：认证、会话、角色授权。
4. `feat(db): add prisma postgres schema and migrations`：PostgreSQL 持久化。
5. `feat(web): split client debtor and partner routes`：债务人端、机构端多页面。
6. `feat(web): split admin routes and dashboard`：后台管理、统计面板、用户管理。
7. `feat(devops): add compose, health checks and ci`：部署和 PR 校验。
8. `test(e2e): verify full debtor-partner-admin workflow`：端到端验收。

依赖规则：

- 前端页面可先 mock，但合并前必须对接真实 API 或明确标注 mock 范围。
- PostgreSQL PR 必须先于真实多身份数据读写 PR 合并。
- 认证 PR 必须先于机构端授权案件页面合并。
- DevOps PR 必须等待 API 和 Web 启动命令稳定。
- 每个 PR 评论中必须包含测试命令、结果、风险和未完成事项。

## 12. 分阶段验收清单

### 阶段 1：架构与边界

- [ ] 新蓝图合入仓库，并由后端、数据库、前端、DevOps 任务引用。
- [ ] 状态机、角色、身份、文件用途命名与既有文档不冲突。
- [ ] repository interface 明确，内存实现仍可运行现有测试。
- [ ] `npm test` 通过。

### 阶段 2：认证与用户管理

- [ ] 用户表和身份关系表存在。
- [ ] 密码使用哈希保存，默认 demo 密码不进入生产配置。
- [ ] `/api/auth/login`、`/api/auth/me`、`/api/auth/logout` 可用。
- [ ] admin、debtor、partner 身份能被后端区分。
- [ ] 未授权访问返回统一错误结构。

### 阶段 3：PostgreSQL 持久化

- [ ] Prisma schema 或等价迁移覆盖用户、申请、机构、案件、附件、备注、审计。
- [ ] 所有后台写操作在事务中完成业务变更和审计写入。
- [ ] 申请、机构、案件状态流转非法路径被测试拒绝。
- [ ] 服务重启后业务数据仍存在。
- [ ] `.env.example` 包含 `DATABASE_URL`、认证密钥和上传配置。

### 阶段 4：client 端

- [ ] `/login` 支持登录和身份跳转。
- [ ] 债务人端可提交申请、查看本人申请和案件进度。
- [ ] 机构端可提交/补充资质、查看本机构授权案件。
- [ ] 债务人和机构互相不能访问对方数据。
- [ ] 所有页面为中文正式风格，合规提示在关键动作前可见。

### 阶段 5：admin 端

- [ ] `/admin/dashboard` 展示统计面板。
- [ ] 后台可审核申请和机构。
- [ ] 后台可人工创建匹配、授权机构字段、流转案件状态。
- [ ] manager 可管理用户、暂停机构、查看审计日志。
- [ ] 列表默认脱敏，敏感文件下载写审计。

### 阶段 6：部署与 PR 流程

- [ ] `docker-compose.yml` 可启动 `api`、`web`、`postgres` 和反向代理。
- [ ] 迁移命令可在空数据库执行。
- [ ] CI 至少运行单元测试、API 集成测试和基础 lint 或格式检查。
- [ ] PR 模板要求填写测试结果、截图或接口验证、风险与回滚方式。
- [ ] 端到端流程从债务人提交到机构查看授权案件、后台结案可复现。

## 13. 风险与约束

- 合规边界优先级高于交互丰富度。不得新增放贷、催收、代收款、征信修复、成功承诺或资金流功能。
- 机构端开放后等同于多租户系统，必须先完成服务端授权，不能只靠前端过滤。
- 真实文件上传、下载、扫描、水印和保留策略不应被附件元数据接口误认为已经完成。
- PostgreSQL 切换前，内存模式只能用于本地测试和演示，不得用于任何真实业务数据。
- 后续如果改用 Next.js、NestJS 或 Fastify，应先提交迁移 ADR，说明收益、影响范围和回滚方式。
