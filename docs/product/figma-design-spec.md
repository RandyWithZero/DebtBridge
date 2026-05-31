# DebtBridge 中文正式风格 UI 设计规范

Figma file: https://www.figma.com/design/dZ1oky8X3sZiBATs89CGrb

This document is the implementation handoff for the Chinese-only DebtBridge Web UI. It mirrors the Figma file and should be used with `docs/product/mvp-ux-flow.md` when implementing frontend screens.

## Product Direction

DebtBridge is a credit-card overdue negotiation matching platform. The Web UI must feel formal, trustworthy, restrained, and suitable for Chinese financial/legal service users.

Core positioning:

- Platform role: information matching, consultation routing, manual review, progress record keeping.
- Not platform role: lending, collection, payment collection, credit repair, debt elimination, guaranteed negotiation results.
- Tone: direct Chinese, compliance-first, no exaggerated sales language, no fear-based debt copy.
- Main visual impression: warm neutral background, white operational surfaces, deep teal actions, amber risk/compliance highlights, conservative semantic status colors.

Required compliance line:

> 本平台仅提供债务信息撮合、咨询与对接服务，不从事金融放贷、催收、代收款、征信修复等业务；不承诺协商一定成功，结果以银行或持牌机构审核为准；所有资金往来由用户与机构自行通过官方渠道结算，平台不触碰资金。

## Figma Pages

The Figma file contains these populated pages:

- `00 - Web UI Settings`: Web visual language, colors, typography, spacing, buttons, forms, tables, metrics, status tags.
- `01 - Customer & Partner Login`: customer-facing login for持卡人 and合作机构 only; it must not include后台运营.
- `02 - Public Web Pages`: public home, debtor entry, partner entry, compliance routing.
- `03 - Debtor Web Portal`: debtor dashboard, application form, status/supplement materials, personal information/authorization.
- `04 - Partner Web Portal`: partner dashboard, onboarding/qualification, visible case list, case detail/proposal workflow.
- `05 - Independent Operations Console`: standalone后台运营 page with a different internal-system style, independent login, expanded statistics panels, review workbench, matching, progress, and audit views.
- `06 - States & Handoff`: empty/loading/error/success/no-permission/need-more-info states and implementation guardrails.

This rebuild is Web-only. Mobile frames are intentionally not included in this Figma version.

## Foundations

### Color Tokens

| Token | Hex | Usage |
| --- | --- | --- |
| `Color/Primary/600` | `#0F5B5F` | Primary actions, active nav, key accents. |
| `Color/Primary/700` | `#0A474A` | Primary hover and pressed states. |
| `Color/Accent/600` | `#B7791F` | Compliance highlights, warning metadata, risk flags. |
| `Color/Background/Base` | `#F7F5F0` | Public page and app background. |
| `Color/Surface/Default` | `#FFFFFF` | Forms, cards, admin panels, drawers. |
| `Color/Surface/Soft` | `#FBFAF7` | Secondary panels and grouped content. |
| `Color/Text/Primary` | `#1F2933` | Main text and headings. |
| `Color/Text/Secondary` | `#52606D` | Helper text, metadata, muted nav. |
| `Color/Border/Default` | `#D9E2EC` | Inputs, card borders, table dividers. |
| `Color/Success/600` | `#2F855A` | Approved, completed, verified. |
| `Color/Warning/600` | `#B7791F` | Pending, risk, needs attention. |
| `Color/Error/600` | `#C53030` | Rejected, invalid, destructive action. |
| `Color/Info/600` | `#2563EB` | Matched, recommendation, informational status. |

### Typography

Use `Noto Sans SC` first, then `"Microsoft YaHei", system-ui, sans-serif`.

| Style | Size / Line | Weight | Usage |
| --- | --- | --- | --- |
| `Text/Display` | 44 / 56 | 700 | Public home hero only. |
| `Text/H1` | 32 / 42 | 700 | Page titles. |
| `Text/H2` | 24 / 34 | 700 | Major sections and panels. |
| `Text/H3` | 18 / 28 | 600 | Form groups, cards, drawer sections. |
| `Text/Body` | 16 / 26 | 400 | Body copy and form text. |
| `Text/Body Small` | 14 / 22 | 400 | Helper text, table cells. |
| `Text/Caption` | 12 / 18 | 500 | Badges, labels, metadata. |

Rules:

- Letter spacing is `0`.
- Do not use viewport-scaled font sizes inside dense admin surfaces.
- Hero-scale type is only for public home first screen.

### Layout And Shape

- Base spacing unit: `4px`.
- Desktop page max content: `1248px` to `1312px`.
- Desktop public section padding: `80px` vertical, `96px` horizontal.
- Admin shell: fixed left sidebar, content area with dense panels.
- Form group gap: `24px`.
- Input minimum height: `44px`.
- Button heights: `40px` default, `48px` large.
- Radius: `8px` max for cards, forms, inputs, buttons; `999px` for badges only.
- Cards are for repeated items, forms, tables, drawers, and status panels; avoid nested cards.

## Components

### Buttons

Variants:

- Primary: submission and main workflow actions.
- Secondary: non-destructive alternative actions.
- Ghost: low-emphasis navigation or toolbar actions.
- Destructive: reject, suspend, remove.

States:

- Default, hover, focus, active, disabled, loading.

Usage:

- Use primary sparingly: one clear primary action per panel.
- Use destructive only with confirmation or explicit review context.
- Loading state keeps width stable and changes label to `提交中...`, `保存中...`, or `处理中...`.

### Form Fields

Types:

- Text, phone, currency, textarea, select, multi-select, checkbox group, radio group, file reference upload.

States:

- Default, focus, filled, error, disabled, help text, loading options.

Validation:

- Required errors appear inline after blur and on submit.
- Phone uses mainland China mobile validation where applicable.
- Currency shows RMB unit and rejects negative values.
- File upload UI should show file name/reference only, allowed types, max size, and privacy notice.
- Never ask for SMS codes, bank card passwords, full card numbers, contact lists, or unrelated sensitive materials.

### Status Badges

Use badge text in Chinese:

- `待审核`
- `审核中`
- `需补充`
- `已通过`
- `已拒绝`
- `待匹配`
- `已推荐`
- `沟通中`
- `待上传协议`
- `已达成`
- `还款中`
- `已完成`
- `失败`
- `已取消`
- `已归档`

Color mapping:

- Pending and review: warning.
- Need more info: accent.
- Approved, reached, completed: success.
- Rejected, failed, cancelled: error.
- Matching, recommended, communicating: primary or info.

### Data Tables

Required table elements:

- Sticky filter bar.
- Search input.
- Status filter.
- Date or latest follow-up filter.
- Column header with sort affordance where useful.
- Row checkbox for batch admin operations.
- Row action menu.
- Empty state.
- Loading skeleton.

Minimum admin table columns should not expose unnecessary sensitive data. Mask debtor identity in list rows: `王* / 上海`, `138****1234`.

### Detail Drawer

Use a right-side drawer for lead, partner, and case detail.

Required anatomy:

- Summary header with masked identifier, status badge, and key metadata.
- Key facts grid.
- Risk flags.
- Evidence or qualification file references.
- Review / action area.
- Internal note field.
- Audit timeline.

The drawer must not show full identity documents in default view. Show controlled file references and access labels.

### Timeline

Events include:

- Status change.
- Admin note.
- Material requested.
- Material supplemented.
- Partner recommended.
- Proposal submitted.
- Agreement uploaded.
- Verification completed.
- Case completed, failed, cancelled, or archived.

Each event shows actor, timestamp, event type, and note.

## Role Information Architecture

### Debtor

Primary flow:

1. 登录 / 手机号认证.
2. 阅读服务边界 and privacy note.
3. Submit credit-card overdue negotiation application.
4. View review status.
5. Supplement materials if requested.
6. View matching / communication progress.
7. View agreement file references and latest case status.

Debtor navigation:

- `首页`
- `提交申请`
- `申请状态`
- `补充资料`
- `个人信息`

### Partner Organization

Primary flow:

1. 登录 / 认证.
2. Submit onboarding application.
3. Supplement qualification materials.
4. After approval, view visible cooperation/case information.
5. Submit communication proposal.
6. Update progress.
7. Upload agreement reference.

Partner navigation:

- `入驻申请`
- `资质资料`
- `合作案件`
- `方案与进度`
- `机构信息`

### Platform Admin

Primary flow:

1. Admin login.
2. Dashboard summary.
3. User and application review.
4. Partner qualification review.
5. Manual case matching.
6. Progress tracking.
7. Agreement record verification.
8. Audit log review.

Admin navigation:

- `总览`
- `用户管理`
- `机构管理`
- `申请审核`
- `案件匹配`
- `进度跟踪`
- `协议记录`
- `审计记录`

## Key Screens

### Customer And Partner Login

Frame: `客户与机构登录页 / 不含后台运营`

This page is customer-facing and must only include持卡人 and合作机构. Do not place后台运营入口, 运营后台登录, or internal admin role cards on this page.

Use a split Web layout:

- Left side: deep teal service panel named `信用卡逾期协商信息撮合入口`.
- Right side: customer/partner login form.
- Visual concept: `客户/机构入口 + 服务路径 + 合规边界提示`.

Required login elements:

- Brand: `DebtBridge`.
- Main headline: `信用卡逾期协商信息撮合入口`.
- Role cards:
  - `持卡人`: 查询申请.
  - `合作机构`: 管理案件.
- Fields:
  - `账号 / 手机号`
  - `密码 / 验证码`
- Supporting actions:
  - `记住登录状态`
  - `忘记密码 / 联系管理员`
- Primary action should change by role:
  - `进入申请中心`
  - `进入机构工作台`
- Compliance text remains visible below the primary action.
- Add a muted note: `运营后台为独立内部系统，不在客户/机构入口展示。`

Required login states:

- Default.
- Wrong account, password, or code.
- Second-factor verification: `请输入 6 位短信验证码`.
- Temporary lockout after repeated failures.
- No-permission state when a customer or partner user lacks access to the selected customer-facing entry.

The left brand panel should contain three service path nodes:

1. `持卡人提交申请与补充资料`.
2. `机构提交入驻与资质补充`.
3. `双方在审核后查看可见进度`.

### Independent Operations Console

Frame page: `05 - Independent Operations Console`

后台运营 is a standalone internal Web page, not part of the public home,持卡人入口,机构入口, or customer/partner login page.

Visual style must differ from customer-facing pages:

- Customer-facing pages: warm neutral background, deep teal brand blocks, calmer service cards.
- Operations pages: cool grey workspace, dark slate sidebar, compact metric cards, denser tables, blue/cyan action accents.
- Avoid public marketing copy in operations. Use task-oriented labels, SLA, queue, risk, audit, and owner language.

Required standalone operations login:

- Brand: `DebtBridge 运营控制台`.
- Headline: `审核、匹配、跟踪、审计一体化运营中枢`.
- Fields: 管理员账号, 密码, 二次验证码.
- Action: `进入后台运营控制台`.
- Security note: all view, export, review, match, and status-change actions enter audit records.

Required statistics panels:

- Core KPI cards:
  - `待审核线索`
  - `待审核机构`
  - `待匹配案件`
  - `进行中案件`
  - `待上传协议`
- Trend panel:
  - 今日新增.
  - 7日新增.
  - 高风险标记.
  - 资料完整率.
- Risk distribution panel:
  - 律师函/传票.
  - 高频催收.
  - 材料缺失.
  - 超时未跟进.
- Institution quality panel:
  - 已通过机构.
  - 暂停合作.
  - 平均响应.
  - 协议核验通过率.
  - 案件失败率.
- Queue/SLA table:
  - 申请审核.
  - 机构资质.
  - 人工匹配.
  - 协议核验.

Required operations workbench screens:

- `Admin Metrics Dashboard - Web`
- `Admin Review Workbench - Web`
- `Admin Matching & Progress - Web`

### Public Home

Purpose: explain DebtBridge's role, qualify users, and route visitors without overpromising.

Required sections:

1. Header
   - Brand: `DebtBridge`
   - Nav: `服务流程`, `适合人群`, `合规边界`, `机构合作`
   - Actions: `债务人申请`, `机构入驻`
   - Do not include后台运营 in the public header.

2. Hero
   - H1: `信用卡逾期协商信息撮合`
   - Copy: `帮助持卡人与合规机构对接，探索个性化分期、罚息减免等依法协商方案。`
   - Compliance strip: `不放贷 · 不催收 · 不代收款 · 不承诺结果`
   - CTAs: `提交协商申请`, `机构合作入驻`

3. Suitable users
   - `信用卡逾期且暂时无法全额还款`
   - `希望主动沟通并配合正规协商`
   - `被高频催收影响生活但仍希望合法解决`
   - `担心诉讼风险并需要梳理还款方案`

4. Service flow
   - `提交信息`
   - `平台人工初审`
   - `匹配合规机构`
   - `机构沟通方案`
   - `进度跟踪与协议留档`

5. Compliance boundary
   - `只做信息撮合、咨询、调解对接`
   - `不碰资金、不做催收、不代收款`
   - `不承诺 100% 成功`
   - `机构必须提交资质并通过人工审核`

6. Final routing CTA
   - `我是持卡人`
   - `我是合作机构`

### Debtor Application

Desktop layout:

- Left column: service boundary, privacy note, risk reminder.
- Right column: multi-section form.

Form groups:

- `个人信息`: 姓名, 手机号, 所在城市.
- `信用卡债务信息`: 欠款银行, 总欠款金额, 逾期时长, 当前是否被催收, 是否收到律师函/法院传票.
- `还款能力`: 每月稳定收入, 每月最多可还款金额, 期望方案.
- `困难情况`: 困难情况, 说明补充, 证明材料.
- `承诺与授权`: 真实性承诺, 服务边界确认, 隐私授权.

States:

- Default.
- Errors: missing required fields and invalid phone.
- Success: `申请已提交，平台将进行人工初审。审核通过后，可能由合作机构联系您沟通方案。协商结果以银行或相关机构审核为准。`
- Need more info: clear material request and resubmit action.

### Partner Onboarding

Desktop layout:

- Left or right explanation panel with qualification and compliance boundaries.
- Form with organization, qualification, capacity, and commitment sections.

Form groups:

- `机构信息`: 公司名称, 统一社会信用代码, 法人姓名, 联系人姓名, 联系电话, 业务城市.
- `资质上传`: 营业执照, 法人身份证, 相关业务资质.
- `业务能力`: 可承接银行, 可做方案, 最低/最高可接受分期期数, 单案处理周期, 合作模式.
- `合规承诺`: 不暴力催收, 不虚假承诺, 不私下收取不透明费用, 资质材料真实有效.

States:

- Pending: `入驻资料已提交，等待人工审核。`
- Approved: `审核通过，可进入合作沟通。`
- Need more info: list missing documents.
- Rejected: show reason and resubmission path.

### Admin Dashboard

Purpose: prioritize controlled human workflow.

Summary metrics:

- `待审核线索`
- `待审核机构`
- `待匹配案件`
- `进行中案件`
- `待上传协议`

Alerts:

- `高敏材料待处理`
- `即将超时的跟进`
- `有诉讼/传票标记的高优先线索`

### Admin Lead List

Columns:

- Lead ID.
- 姓名 / 城市, masked.
- 欠款银行.
- 欠款金额.
- 逾期时长.
- 月还款能力.
- 催收状态.
- 律师函/传票.
- 审核状态.
- 匹配状态.
- 最新跟进时间.

Actions:

- 查看详情.
- 通过初审.
- 要求补充.
- 拒绝.
- 进入匹配.

### Admin Partner List

Columns:

- Organization ID.
- 公司名称.
- 业务城市.
- 可承接银行.
- 可做方案.
- 资质状态.
- 当前案件数.
- 成功 / 失败统计.
- 最新审核时间.

Actions:

- 查看资质.
- 通过资质.
- 要求补充.
- 拒绝.
- 暂停合作.

### Manual Matching

Three-panel layout:

- Left: debtor case summary, requested plan, risk flags.
- Center: candidate partner table.
- Right: selected partner details, recommendation action, internal note.

Candidate table fields:

- 机构名称.
- 业务城市.
- 可承接银行.
- 可做方案.
- 当前案件数.
- 历史完成率 or 历史结果统计.
- 资质状态.

Actions:

- 推荐机构.
- 记录建议方案.
- 标记机构拒绝.
- 标记债务人拒绝.
- 进入沟通中.

### Progress Tracking

Required content:

- Case header with masked debtor identifier, partner, and current status.
- Status stepper:
  - Submitted.
  - Under Review.
  - Approved.
  - Matching.
  - Recommended.
  - Communicating.
  - Proposal Submitted.
  - Agreement Reached.
  - Agreement Recorded.
  - Completed.
- Timeline.
- Add note / change status action.

### Agreement Records

Columns:

- Case ID.
- Debtor masked identifier.
- Partner organization.
- Agreement type.
- Agreement date.
- Agreement file reference.
- Fee model reference.
- Verification status.
- Notes.

Actions:

- 查看协议.
- 上传 / 替换协议.
- 标记已核验.
- 添加备注.

## Web Scope Coverage

This Figma reset covers Web desktop UI only. Do not use this file as a mobile handoff.

Required Web page coverage:

- Public:
  - 首页.
  - 债务人申请入口.
  - 机构入驻入口.
  - 合规边界说明.
- Login:
  - Customer/partner login only.
  - Error, lockout, second-factor, and no-permission states.
- Debtor:
  - 债务人首页.
  - 申请提交.
  - 申请状态.
  - 补充资料.
  - 个人信息与授权.
- Partner:
  - 机构工作台.
  - 入驻申请.
  - 资质补充.
  - 合作案件列表.
  - 案件详情与方案提交.
- Admin:
  - Independent operations login page.
  - 运营总览.
  - 统计面板.
  - 用户管理.
  - 机构管理.
  - 申请审核.
  - 案件匹配.
  - 进度跟踪.
  - 协议记录.
  - 审计记录.

Web layout rules:

- Desktop frame target: `1440px`.
- Admin console is a standalone internal page and uses fixed dark sidebar plus dense cool-grey workspace.
- Public and portal pages use a restrained card/grid composition.
- Customer/partner login can be more distinctive than regular customer pages, but must not include后台运营.
- Operations login and dashboard should look like an internal operating system, not a customer-facing product page.
- Masked identity and file-reference behavior apply across all Web lists and detail views.

## Accessibility

- Text contrast target: WCAG AA, 4.5:1 for body text.
- Focus indicators must be visible on buttons, inputs, tabs, and row action menus.
- Form errors must be programmatically associated with fields.
- Badges cannot rely on color alone; the Chinese status text is always visible.
- Tables need accessible labels for filters, checkboxes, and row actions.
- Do not hide compliance text behind hover-only interactions.

## Frontend Implementation Notes

- The current app already uses the correct core palette in `apps/web/styles.css`; preserve the restrained teal/neutral direction.
- Split routes and navigation so后台运营 is not reached from the same customer/partner entry page.
- Replace any English admin headings that leak into the UI, such as `Operations`, with Chinese labels.
- Give admin screens their own visual treatment: dark sidebar, cool workspace, compact tables, KPI cards, SLA queues, risk panels, and audit language.
- Keep manual matching explicit. Do not represent automatic matching, automated approval, lending, collection, or payment handling as live MVP capabilities.
- Use controlled document references in UI copy; do not imply binary file storage is production-ready unless backend storage is implemented.
- Use status names consistently with `apps/web/app.js` and backend status values.
- Add empty, loading, error, success, and need-more-info states for debtor, partner, and admin flows before expanding visual polish.
- This iteration intentionally excludes mobile UI; add a separate mobile design pass if responsive mobile views become a delivery requirement.
