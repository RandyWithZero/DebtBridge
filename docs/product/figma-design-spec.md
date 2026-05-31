# DebtBridge Figma Design Specification

This specification is the build plan for the `DebtBridge` Figma file. The current runtime does not expose a Figma write tool, so this document records the exact frames, sections, components, and copy needed to recreate the MVP design in Figma without losing product decisions.

## File Setup

File / project name: `DebtBridge`

Recommended pages:

- `00 - Foundations`
- `01 - Public Home`
- `02 - Debtor Application`
- `03 - Partner Onboarding`
- `04 - Operations Back Office`
- `05 - Components`

Canvas width targets:

- Desktop marketing/forms: 1440px
- Desktop admin: 1440px
- Mobile: 390px

Visual style:

- Professional, restrained, compliance-first.
- Use warm neutral backgrounds, deep teal primary actions, amber for warnings, and conservative status colors.
- Do not use debt-erasure claims, success-guarantee language, exaggerated hero visuals, or aggressive sales modules.

## Foundations

### Color Styles

| Name | Hex | Usage |
| --- | --- | --- |
| `Color/Primary/600` | `#0F5B5F` | Primary buttons, active nav, key accents. |
| `Color/Primary/700` | `#0A474A` | Hover / pressed primary. |
| `Color/Accent/600` | `#B7791F` | Warnings, compliance highlights, risk badges. |
| `Color/Background/Base` | `#F7F5F0` | Public page background. |
| `Color/Surface/Default` | `#FFFFFF` | Forms, admin panels, cards. |
| `Color/Text/Primary` | `#1F2933` | Main text. |
| `Color/Text/Secondary` | `#52606D` | Supporting text. |
| `Color/Border/Default` | `#D9E2EC` | Inputs, table dividers. |
| `Color/Success/600` | `#2F855A` | Approved / completed. |
| `Color/Warning/600` | `#B7791F` | Needs more info / pending risk. |
| `Color/Error/600` | `#C53030` | Rejected / validation errors. |

### Typography Styles

| Style | Size / Line | Weight | Usage |
| --- | --- | --- | --- |
| `Text/Display` | 44 / 56 | 700 | Home hero only. |
| `Text/H1` | 32 / 42 | 700 | Page titles. |
| `Text/H2` | 24 / 34 | 700 | Section titles. |
| `Text/H3` | 18 / 28 | 600 | Form group and panel titles. |
| `Text/Body` | 16 / 26 | 400 | Public copy and form content. |
| `Text/Body Small` | 14 / 22 | 400 | Helper text, table cells. |
| `Text/Caption` | 12 / 18 | 500 | Badges, labels, metadata. |

### Spacing and Shape

- 4px base spacing scale.
- Section padding desktop: 80px top/bottom, 96px horizontal.
- Form group gap: 24px.
- Input height: 44px.
- Button height: 40px default, 48px large.
- Radius: 8px max for cards and inputs; 999px for badges only.

## Components

### Button

Variants:

- Primary
- Secondary
- Ghost
- Destructive

States:

- Default
- Hover
- Focus
- Disabled
- Loading

Rules:

- Primary is reserved for submission or main navigation actions.
- Use icon+text only where the action benefits from recognition, such as filter, upload, export, approve, reject.

### Form Input

Types:

- Text
- Phone
- Currency
- Textarea
- Select
- Multi-select
- Checkbox group
- Radio group
- File upload

States:

- Default
- Focus
- Filled
- Error
- Disabled
- Help text

### Status Badge

Statuses:

- 待审核
- 需补充
- 已通过
- 已拒绝
- 待匹配
- 已推荐
- 沟通中
- 已达成
- 失败
- 已完成

### Data Table

Required elements:

- Column header
- Sort affordance
- Row checkbox
- Row action menu
- Sticky filter bar
- Empty state
- Loading skeleton

### Detail Drawer

Use for lead details and organization details. Include:

- Summary header
- Status badge
- Key facts
- Evidence / qualification file references
- Review actions
- Internal note field
- Audit timeline

### Timeline

Events:

- Status change
- Admin note
- Partner recommendation
- Proposal submitted
- Agreement uploaded
- Case completed / failed

Each event shows actor, timestamp, event type, and note.

## Screen Specs

### 01 - Public Home / Desktop

Frame: `Home - Desktop`

Sections:

1. Header
   - Brand `DebtBridge`
   - Nav: 服务流程, 适合人群, 合规边界, 机构合作
   - Buttons: 债务人申请, 机构入驻

2. Hero
   - Headline: 信用卡逾期协商信息撮合
   - Copy: 帮助持卡人与合规机构对接，探索个性化分期、罚息减免等依法协商方案。
   - Compliance strip: 不放贷 · 不催收 · 不代收款 · 不承诺结果
   - CTAs: 提交协商申请, 机构合作入驻

3. Suitable users
   - Four compact cards:
     - 信用卡逾期且暂时无法全额还款
     - 希望主动沟通并配合正规协商
     - 被高频催收影响生活但仍希望合法解决
     - 担心诉讼风险并需要梳理还款方案

4. Service flow
   - Five-step horizontal flow:
     - 提交信息
     - 平台人工初审
     - 匹配合规机构
     - 机构沟通方案
     - 进度跟踪与协议留档

5. Compliance boundary
   - Prominent neutral panel:
     - 只做信息撮合、咨询、调解对接
     - 不碰资金、不做催收、不代收款
     - 不承诺 100% 成功
     - 机构必须提交资质并通过人工审核

6. Final CTA
   - Two side-by-side options:
     - 我是持卡人
     - 我是合作机构

### 02 - Debtor Application / Desktop

Frame: `Debtor Application - Desktop`

Layout:

- Left column: short service scope and privacy note.
- Right column: multi-section form.

Form groups:

1. 个人信息
   - 姓名
   - 手机号
   - 所在城市

2. 信用卡债务信息
   - 欠款银行
   - 总欠款金额（本金+利息+罚息）
   - 逾期时长
   - 当前是否被催收
   - 是否收到律师函/法院传票

3. 还款能力
   - 每月稳定收入
   - 每月最多可还款金额
   - 期望方案

4. 困难情况
   - 困难情况
   - 说明补充
   - 证明材料

5. 承诺与授权
   - 本人承诺信息真实，愿意配合正规协商
   - 我已知悉平台不放贷、不催收、不代收款、不承诺结果
   - 同意平台为初审与匹配目的处理并向候选合作机构展示必要信息

States to include:

- `Debtor Application - Errors`: missing required fields and invalid phone.
- `Debtor Application - Success`: submitted confirmation.

### 03 - Partner Onboarding / Desktop

Frame: `Partner Onboarding - Desktop`

Form groups:

1. 机构信息
   - 公司名称
   - 统一社会信用代码
   - 法人姓名
   - 联系电话
   - 业务城市

2. 资质上传
   - 营业执照
   - 法人身份证
   - 相关业务资质（律所执业证/资管资质等）

3. 业务能力
   - 可承接银行
   - 可做方案
   - 最低可接受分期期数
   - 单案处理周期
   - 合作模式

4. 合规承诺
   - 机构承诺不暴力催收、不虚假承诺、不私下收取不透明费用
   - 机构承诺材料真实有效

States to include:

- `Partner Onboarding - Errors`
- `Partner Onboarding - Pending Review`

### 04 - Operations / Dashboard

Frame: `Admin Dashboard - Desktop`

Required elements:

- Sidebar nav:
  - 总览
  - 线索审核
  - 机构审核
  - 人工匹配
  - 进度跟踪
  - 协议记录

- Summary metrics:
  - 待审核线索
  - 待审核机构
  - 待匹配案件
  - 进行中案件
  - 待上传协议

- Alert list:
  - 高敏材料待处理
  - 即将超时的跟进
  - 有律师函/传票标记的高优先线索

### 04 - Operations / Lead List

Frame: `Admin Lead List - Desktop`

Table columns:

- Lead ID
- 姓名 / 城市
- 欠款银行
- 欠款金额
- 逾期时长
- 月还款能力
- 催收状态
- 律师函/传票
- 审核状态
- 匹配状态
- 最新跟进时间

Actions:

- 查看详情
- 通过初审
- 要求补充
- 拒绝
- 进入匹配

### 04 - Operations / Partner List

Frame: `Admin Partner List - Desktop`

Table columns:

- Organization ID
- 公司名称
- 业务城市
- 可承接银行
- 可做方案
- 资质状态
- 当前案件数
- 成功/失败统计
- 最新审核时间

Actions:

- 查看资质
- 通过资质
- 要求补充
- 拒绝
- 暂停合作

### 04 - Operations / Manual Matching

Frame: `Admin Manual Matching - Desktop`

Three-panel layout:

- Left: debtor case summary, risk flags, requested plan.
- Center: candidate partner table.
- Right: selected partner details and recommendation action.

Candidate table fields:

- 机构名称
- 业务城市
- 可承接银行
- 可做方案
- 当前案件数
- 历史成功率
- 资质状态

Actions:

- 推荐机构
- 记录建议方案
- 标记机构拒绝
- 标记债务人拒绝
- 进入沟通中

### 04 - Operations / Progress Tracking

Frame: `Admin Progress Tracking - Desktop`

Content:

- Case header with debtor masked identifier, partner, current status.
- Status stepper:
  - Submitted
  - Under Review
  - Approved
  - Matching
  - Recommended
  - Communicating
  - Proposal Submitted
  - Agreement Reached
  - Agreement Recorded
  - Completed
- Timeline component.
- Add note / change status action.

### 04 - Operations / Agreement Records

Frame: `Admin Agreement Records - Desktop`

Table columns:

- Case ID
- Debtor masked identifier
- Partner organization
- Agreement type
- Agreement date
- Agreement file reference
- Fee model reference
- Verification status
- Notes

Actions:

- 查看协议
- 上传/替换协议
- 标记已核验
- 添加备注

## Mobile Frames

Required mobile frames:

- `Home - Mobile`
- `Debtor Application - Mobile`
- `Partner Onboarding - Mobile`

Mobile rules:

- Single-column forms.
- Sticky bottom submit button only after the user passes the compliance intro.
- Keep compliance boundary copy above the first submit action.
- Inputs must not shrink below 44px height.

## Handoff Notes

- Use this spec together with `docs/product/mvp-ux-flow.md`.
- Compliance copy must be replaced by GOO-4 final wording once available.
- Status names should be aligned with GOO-6 and GOO-8 before implementation.
- Automatic matching should not be represented as a live MVP feature; show "manual matching" as the operator-controlled workflow.
