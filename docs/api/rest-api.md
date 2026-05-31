# DebtBridge REST API

Base URL: `/api`

All endpoints accept and return JSON. Authenticated endpoints accept either the httpOnly `db_session` cookie set by login or `Authorization: Bearer <token>`.

Error shape:

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

## Auth

### POST `/auth/login`

Logs in a debtor, partner, operator, or manager seed account.

Request:

```json
{
  "email": "debtor@example.com",
  "password": "password"
}
```

Response:

```json
{
  "token": "session_xxx",
  "user": {
    "id": "debtor_1",
    "email": "debtor@example.com",
    "role": "debtor",
    "displayName": "Default Debtor"
  }
}
```

### GET `/auth/me`

Roles: `debtor`, `partner`, `operator`, `manager`

Returns the current session user.

### POST `/auth/logout`

Roles: `debtor`, `partner`, `operator`, `manager`

Deletes the current session and clears the session cookie.

### POST `/admin/auth/login`

Admin-only login. Same request as `/auth/login`, but only `operator` and `manager` roles are accepted.

### GET `/admin/auth/me`

Roles: `operator`, `manager`

### POST `/admin/auth/logout`

Roles: `operator`, `manager`

## Public

### GET `/public/config`

Returns banks, supported overdue ranges, expected solution values, hardship reason values, upload limit, and service agreement version.

### POST `/documents/public-upload`

Creates controlled upload metadata. This does not persist binary file contents.

Request:

```json
{
  "filename": "income-proof.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 2048,
  "purpose": "debtor_supporting_material"
}
```

Response: document metadata without `storageKey` or `sha256Hash`.

Allowed public purposes:

- `debtor_supporting_material`
- `partner_business_license`
- `partner_legal_representative_id`
- `partner_qualification`

### POST `/debtor-applications`

Creates a public debtor application. Anonymous callers cannot read it back.

Required request fields:

- `name`
- `phone`
- `city`
- `bankName`
- `totalDebtAmountCents`
- `overdueRange`
- `isUnderCollection`
- `hasLegalNotice`
- `monthlyIncomeCents`
- `monthlyRepaymentCapacityCents`
- `expectedSolutions`
- `hardshipReasons`
- `truthfulnessAccepted`
- `privacyAccepted`
- `serviceAgreementAccepted`

Optional fields:

- `hardshipDescription`
- `supportingDocumentIds`

Response:

```json
{
  "id": "app_xxx",
  "status": "submitted",
  "submittedAt": "2026-05-31T00:00:00.000Z"
}
```

### POST `/partner-applications`

Creates a public partner onboarding application. Anonymous callers cannot read it back.

Required request fields:

- `organizationName`
- `unifiedSocialCreditCode`
- `legalRepresentativeName`
- `contactName`
- `contactPhone`
- `serviceCities`
- `acceptedBanks`
- `capabilities`
- `cooperationModes`
- `licenseDocumentIds`
- `legalRepresentativeIdDocumentIds`
- `qualificationDocumentIds`
- `complianceAccepted`

Optional fields:

- `minInstallmentMonths`
- `maxInstallmentMonths`
- `averageProcessingDays`

Response:

```json
{
  "id": "org_xxx",
  "status": "pending_review",
  "submittedAt": "2026-05-31T00:00:00.000Z"
}
```

## Debtor Portal

Roles: `debtor`

### POST `/debtor/me/applications`

Creates a debtor application bound to the current debtor account. Request and response match public debtor creation.

### GET `/debtor/me/applications`

Lists only applications owned by the current debtor session.

Query parameters:

- `page`
- `pageSize`

### GET `/debtor/applications/{id}`

Reads one owned debtor application with document metadata and related match case summaries.

### GET `/debtor/me/match-cases`

Lists cases connected to the current debtor's applications.

## Partner Portal

Roles: `partner`

### POST `/partner/me/application`

Creates a partner onboarding application bound to the current partner account. Request and response match public partner creation.

### GET `/partner/me/organizations`

Lists only organizations submitted by the current partner account.

### GET `/partner/me/match-cases`

Lists cases for the current partner account's active organization.

### GET `/partner/match-cases/{id}`

Reads a partner-owned case. Debtor fields are minimized and masked.

## Admin

Roles: `operator`, `manager` unless noted.

### POST `/admin/documents`

Creates admin-uploaded document metadata. Supports all document purposes.

### GET `/admin/debtor-applications`

Lists debtor applications.

Query parameters:

- `status`
- `keyword`
- `page`
- `pageSize`

### GET `/admin/debtor-applications/{id}`

Returns full debtor application details, document metadata, and audit logs.

### POST `/admin/debtor-applications/{id}/review`

Transitions a debtor application through the review state machine.

Request:

```json
{
  "decision": "qualified",
  "reason": "符合信用卡协商初筛范围"
}
```

Allowed decisions:

- `under_review`
- `need_more_info`
- `qualified`
- `rejected`
- `archived`

### GET `/admin/partner-organizations`

Lists partner organizations.

Query parameters:

- `status`
- `page`
- `pageSize`

### GET `/admin/partner-organizations/{id}`

Returns full partner organization details, document metadata, and audit logs.

### POST `/admin/partner-organizations/{id}/review`

Transitions a partner organization through review.

Allowed decisions:

- `under_review`
- `need_more_info`
- `active`
- `rejected`
- `suspended`

Only `manager` may suspend an organization.

### POST `/admin/match-cases`

Creates a manual match between a `qualified` debtor application and an `active` partner organization.

Request:

```json
{
  "applicationId": "app_xxx",
  "partnerOrganizationId": "org_xxx",
  "matchReason": "机构服务城市、银行和方案能力匹配",
  "proposedPlan": {
    "type": "installment",
    "installmentMonths": 48
  }
}
```

### GET `/admin/match-cases`

Lists match cases.

Query parameters:

- `status`
- `page`
- `pageSize`

### GET `/admin/match-cases/{id}`

Returns match case details, notes, document metadata, and audit logs.

### POST `/admin/match-cases/{id}/transition`

Transitions a match case.

Request:

```json
{
  "nextStatus": "contacted",
  "reason": "已完成双方对接"
}
```

Allowed statuses follow the state machine in `docs/architecture/data-model.md`.

### POST `/admin/match-cases/{id}/notes`

Creates an internal note.

Request:

```json
{
  "content": "已联系用户确认继续推进",
  "visibility": "internal"
}
```

### POST `/admin/match-cases/{id}/documents`

Binds an agreement document to a match case.

Request:

```json
{
  "documentId": "doc_xxx",
  "documentType": "agreement"
}
```

### GET `/admin/audit-logs`

Roles: `manager`

Lists audit logs.

Query parameters:

- `entityType`
- `entityId`
