# DebtBridge MVP UX Flow

## 1. Product Positioning

DebtBridge is a credit-card overdue debt negotiation matching platform. The MVP should stay narrow: it supports credit-card overdue negotiation only, connects debtors with qualified asset-management firms or law firms, and gives operators a controlled back office for review, manual matching, progress tracking, and agreement records.

The product tone should be professional, restrained, and compliance-first. It should not imply guaranteed approval, debt elimination, credit repair, lending, collection, or platform-controlled payment.

Primary compliance statement used across the MVP:

> 本平台仅提供债务信息撮合、咨询与对接服务，不从事金融放贷、催收、代收款、征信修复等业务；不承诺协商一定成功，结果以银行或持牌机构审核为准；所有资金往来由用户与机构自行通过官方渠道结算，平台不触碰资金。

GOO-4 is still in progress at the time of this document. When the compliance scope document is completed, its disclaimer and red-line wording should override this baseline copy.

## 2. Core Personas

### Debtor

- Has overdue credit-card debt and cannot repay in full.
- Wants to explore legal negotiation options such as personalized installment repayment, interest/penalty reduction, or collection-pressure relief.
- Needs a low-pressure application flow with clear privacy and non-guarantee language.

### Partner Organization

- Qualified asset-management firm, law firm, or related service provider.
- Wants to receive reviewed, relevant leads and submit feasible handling proposals.
- Must prove legitimacy before accessing cases.

### Operations Admin

- Reviews debtor applications and partner qualifications.
- Manually matches eligible debtor cases to suitable partners.
- Tracks negotiation progress and stores agreement/contract references.

## 3. MVP Information Architecture

```text
Public Site
  Home
    Debtor CTA -> Credit Card Overdue Negotiation Application
    Partner CTA -> Partner Organization Onboarding
    Compliance / Service Scope

Debtor Application
  Personal information
  Credit-card debt information
  Repayment ability
  Hardship context
  Truthfulness and compliant-negotiation commitment
  Submission confirmation

Partner Onboarding
  Organization information
  Qualification upload
  Business capacity
  Cooperation model
  Compliance commitment
  Submission confirmation

Operations Back Office
  Lead list
  Partner organization list
  Manual matching workspace
  Case progress tracking
  Contract / agreement records
```

## 4. Public Home Page

### Purpose

Explain DebtBridge's role, qualify the right users, and route visitors to debtor or partner entry points without overpromising.

### Sections

1. Header
   - Brand: DebtBridge
   - Navigation: 服务流程, 适合人群, 合规边界, 机构合作
   - Primary action: 债务人申请
   - Secondary action: 机构入驻

2. Hero
   - Headline: 信用卡逾期协商信息撮合
   - Supporting copy: 帮助持卡人与合规机构对接，探索个性化分期、罚息减免等依法协商方案。
   - Compliance microcopy: 不放贷 · 不催收 · 不代收款 · 不承诺结果
   - CTAs: 提交协商申请, 机构合作入驻

3. Suitable Users
   - 信用卡逾期且暂时无法全额还款
   - 希望主动沟通并配合正规协商
   - 被高频催收影响生活但仍希望合法解决
   - 担心诉讼风险并需要梳理还款方案

4. Service Flow
   - 提交信息
   - 平台人工初审
   - 匹配合规机构
   - 机构沟通方案
   - 进度跟踪与协议留档

5. Partner Value
   - Reviewed leads
   - Clear case fields
   - Manual matching before exposure
   - Progress and agreement tracking

6. Compliance Boundary
   - 本平台只做信息撮合、咨询、调解对接。
   - 不碰资金、不做催收、不代办贷款、不做征信修复。
   - 不承诺 100% 成功，协商结果以银行或持牌机构审核为准。
   - 机构必须提交资质并通过人工审核后才能接案。

7. Footer
   - 服务协议入口
   - 隐私提示入口
   - 联系方式
   - Risk disclaimer repeated in concise form

### Key States

- Default: both CTA routes visible above the fold.
- Mobile: CTAs stack, compliance microcopy remains visible before forms.
- Error / unavailable: if submission service is down, show "当前提交通道维护中，请稍后再试" and keep contact fallback.

## 5. Debtor Application Page

### Form Title

信用卡逾期协商申请

### Intro Copy

本平台为债务信息撮合服务，仅提供信息对接与方案咨询，不代办、不催收、不承诺结果。请确认信息真实有效，并仅上传协商所需的必要证明材料。

### Fields

Personal information:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| 姓名 | Text | Yes | Use real name notice. |
| 手机号 | Tel | Yes | Validate mainland China mobile format when applicable. |
| 所在城市 | Text / City picker | Yes | Used for partner matching. |

Credit-card debt information:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| 欠款银行 | Text / Multi-select | Yes | Allow multiple banks if implementation supports it. |
| 总欠款金额（本金+利息+罚息） | Number | Yes | Currency input; reject negative values. |
| 逾期时长 | Radio | Yes | 未逾期, 1-3个月, 3-6个月, 6个月以上. |
| 当前是否被催收 | Radio | Yes | 是, 否. |
| 是否收到律师函/法院传票 | Radio | Yes | 是, 否. |

Repayment ability:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| 每月稳定收入 | Number | Yes | Currency input. |
| 每月最多可还款金额 | Number | Yes | Currency input; should not exceed a reasonable multiple of income without warning. |
| 期望方案 | Checkbox group | Yes | 停息挂账, 分期还款（12-60期）, 减免利息/违约金, 停止催收. |

Hardship context:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| 困难情况 | Checkbox group | Yes | 失业/收入下降, 生病/意外, 家庭变故, 生意失败, 其他. |
| 说明补充 | Textarea | No | Prompt users to avoid unrelated sensitive information. |
| 证明材料 | File upload | No | Store references only; restrict access in admin. |

Commitment:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| 真实性承诺 | Checkbox | Yes | 本人承诺信息真实，愿意配合正规协商。 |
| 服务边界确认 | Checkbox | Yes | 我已知悉平台不放贷、不催收、不代收款、不承诺结果。 |
| 隐私授权 | Checkbox | Yes | 同意平台为初审与匹配目的处理并向候选合作机构展示必要信息。 |

### Validation and Feedback

- Required fields show inline errors after blur and on submit.
- Currency fields use RMB formatting and explicit unit labels.
- File uploads show allowed file types, max size, and privacy notice.
- Submission success message: 申请已提交，平台将进行人工初审。审核通过后，可能由合作机构联系您沟通方案。协商结果以银行或相关机构审核为准。
- Submission rejected or not eligible: use neutral wording, e.g. "当前信息暂不符合撮合条件，可补充材料后重新提交。"

## 6. Partner Onboarding Page

### Form Title

机构入驻 - 信用卡债务撮合合作

### Intro Copy

仅接受具备合法资质并承诺合规服务的机构申请。平台会进行人工资质审核，审核通过前不可查看或承接线索。

### Fields

Organization information:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| 公司名称 | Text | Yes | Legal entity name. |
| 统一社会信用代码 | Text | Yes | Validate length and format where possible. |
| 法人姓名 | Text | Yes | Sensitive, admin-only visibility. |
| 联系电话 | Tel | Yes | Main operations contact. |
| 业务城市 | Text / Multi-select | Yes | Used for matching. |

Qualification upload:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| 营业执照 | File upload | Yes | Admin-only. |
| 法人身份证 | File upload | Yes | High sensitivity; store reference only. |
| 相关业务资质 | File upload | Yes | 律所执业证/资管资质等. |

Business capacity:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| 可承接银行 | Multi-select / Text | Yes | Matching criterion. |
| 可做方案 | Checkbox group | Yes | 停息分期, 减免罚息, 停催, 撤诉/调解. |
| 最低可接受分期期数 | Number / Select | Yes | Clarify unit as periods. |
| 单案处理周期 | Select / Text | Yes | e.g. 7-15 days, 15-30 days. |
| 合作模式 | Radio / Checkbox | Yes | 按成功付费, 会员制/线索费. |

Commitment:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| 合规承诺 | Checkbox | Yes | 机构承诺不暴力催收、不虚假承诺、不私下收取不透明费用。 |
| 资质真实性 | Checkbox | Yes | 机构承诺材料真实有效。 |

### Key States

- Pending: 入驻资料已提交，等待人工审核。
- Approved: 审核通过，可进入合作沟通。
- Rejected: 审核未通过，显示原因 and resubmission path.
- Need more info: 资料需补充, show missing items.

## 7. Operations Back Office

The MVP back office should optimize for controlled human workflow rather than automated matching.

### 7.1 Dashboard Summary

Metrics:

- 待审核线索
- 待审核机构
- 待匹配案件
- 进行中案件
- 待上传协议

Alerts:

- 高敏材料待处理
- 即将超时的跟进
- 有诉讼/传票标记的高优先线索

### 7.2 Lead List

Primary columns:

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

Filters:

- 审核状态: 待审, 需补充, 通过, 拒绝
- 匹配状态: 未匹配, 已推荐, 沟通中, 已达成, 失败
- 逾期时长
- 银行
- 城市
- 高风险标记

Row actions:

- 查看详情
- 通过初审
- 要求补充
- 拒绝
- 进入匹配

### 7.3 Lead Detail

Panels:

- Applicant summary
- Debt information
- Repayment ability
- Hardship evidence references
- Compliance confirmations
- Review log
- Match history

Required admin actions:

- Approve review
- Reject with reason
- Request more information
- Add internal note
- Mask or restrict sensitive files by role

### 7.4 Partner Organization List

Primary columns:

- Organization ID
- 公司名称
- 业务城市
- 可承接银行
- 可做方案
- 资质状态
- 当前案件数
- 成功/失败统计
- 最新审核时间

Filters:

- 资质状态: 待审, 需补充, 通过, 拒绝, 暂停
- 城市
- 可承接银行
- 可做方案

Row actions:

- 查看资质
- 通过资质
- 要求补充
- 拒绝
- 暂停合作

### 7.5 Manual Matching Workspace

Layout:

- Left: selected debtor case summary and risk flags.
- Center: candidate partner table with capacity and fit score.
- Right: selected partner comparison and action panel.

Candidate matching criteria:

- City / service coverage
- Bank coverage
- Accepted plan types
- Case load
- Qualification status
- Historical performance

Actions:

- Recommend partner
- Record proposed plan
- Mark partner declined
- Mark debtor declined
- Move to communication

Important constraint:

- Do not expose full debtor personal data to a partner until the case is manually reviewed and a match is intentionally created.

### 7.6 Progress Tracking

Case statuses:

```text
Submitted -> Under Review -> Needs More Info -> Approved -> Matching
Matching -> Recommended -> Communicating -> Proposal Submitted
Proposal Submitted -> Agreement Reached -> Agreement Recorded -> Completed
Proposal Submitted -> Failed
Any active status -> Cancelled
```

Progress timeline entries:

- Status changed
- Admin note added
- Partner recommended
- Partner accepted / declined
- Proposal submitted
- Agreement uploaded
- Case completed / failed

Each entry should show actor, timestamp, status, note, and attachment references when applicable.

### 7.7 Contract / Agreement Records

Fields:

- Case ID
- Debtor masked identifier
- Partner organization
- Agreement type
- Agreement date
- Agreement file reference
- Fee model reference
- Verification status
- Notes

Compliance requirements:

- Store file references, not uncontrolled public URLs.
- Make records admin-only by default.
- Keep an audit trail for upload, replacement, and deletion.

## 8. Visual Design Direction

### Tone

Professional, restrained, trustworthy, and operational. Avoid exaggerated promises, flashy financial-growth imagery, debt-erasure language, or aggressive sales framing.

### Suggested Tokens

Colors:

- Primary: deep teal `#0F5B5F`
- Primary hover: `#0A474A`
- Accent: measured amber `#B7791F`
- Background: warm off-white `#F7F5F0`
- Surface: white `#FFFFFF`
- Text primary: near black `#1F2933`
- Text secondary: slate `#52606D`
- Border: `#D9E2EC`
- Success: `#2F855A`
- Warning: `#B7791F`
- Error: `#C53030`

Typography:

- Chinese UI: system sans stack or Noto Sans SC.
- Numeric fields: tabular numbers enabled where possible.
- Use compact dashboard typography; avoid marketing-scale type inside admin views.

Layout:

- Public pages: clear sections with visible compliance copy.
- Forms: single-column on mobile, two-column grouped sections on desktop.
- Admin: dense but readable tables, persistent filters, detail drawers or split panels.
- Radius: 6-8px for cards and inputs.

## 9. Accessibility and Privacy Expectations

- Minimum text contrast target: WCAG AA, 4.5:1 for body text.
- Every form input must have a visible label and programmatic label.
- Error text must be specific and placed near the field.
- Required fields should not rely on color alone.
- File upload controls must describe accepted types and privacy handling.
- Admin views should mask phone numbers and identity details in lists.
- Sensitive uploads should only be available in detail views to authorized admins.

## 10. Developer Implementation Notes

- Implement public submission pages without requiring login.
- Separate public submission endpoints from admin endpoints.
- Model debtor application, partner organization, match case, documents, and audit logs as separate entities.
- Use explicit status enums matching the workflows above.
- Do not build automatic partner matching into the MVP. Use sortable candidate recommendations and human confirmation.
- Do not implement payment collection, lending, collection, or credit-repair flows.
- Include compliance copy in home page, form intro, form commitment checkboxes, submission success, and service agreement.
- Keep all document uploads as controlled references with role-based access.

## 11. Figma Page Checklist

Create a Figma file/project named `DebtBridge` with these pages:

1. `00 - Foundations`
   - Color styles / variables
   - Typography styles
   - Spacing and radius notes

2. `01 - Public Home`
   - Desktop home
   - Mobile home

3. `02 - Debtor Application`
   - Desktop form
   - Mobile form
   - Validation errors
   - Submission success

4. `03 - Partner Onboarding`
   - Desktop form
   - Validation errors
   - Pending review success

5. `04 - Operations Back Office`
   - Dashboard
   - Lead list
   - Lead detail
   - Partner list
   - Manual matching workspace
   - Progress tracking
   - Agreement records

6. `05 - Components`
   - Buttons
   - Inputs
   - Selects
   - Checkboxes/radios
   - File upload
   - Status badges
   - Data table
   - Detail drawer
   - Timeline
   - Empty, loading, and error states

## 12. Open Dependencies

- Replace baseline compliance copy with the final GOO-4 document once available.
- Align API field names and status enums with GOO-6 architecture and GOO-8 data model when those documents are complete.
- Frontend implementation in GOO-9 should treat this document as the product source of truth unless later compliance or architecture documents supersede it.
