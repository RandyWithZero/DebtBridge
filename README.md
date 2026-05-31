# DebtBridge

DebtBridge MVP is a credit-card overdue negotiation matching platform. The current backend implementation is a dependency-light Node.js API that covers public intake, partner onboarding, admin review, manual matching, progress tracking, document metadata binding, and audit logs.

## Backend API

Run tests:

```bash
npm test
```

Validate the Prisma schema:

```bash
npm run db:validate
```

Run the local MVP app and API:

```bash
npm start
```

Open `http://localhost:3000` for the public site, debtor application, partner onboarding, and operations back office.

Default admin users for local MVP verification:

| Email | Password | Role |
| --- | --- | --- |
| `admin@example.com` | `password` | `manager` |
| `operator@example.com` | `password` | `operator` |

Implemented endpoint groups:

- Public config: `GET /api/public/config`
- Public document metadata upload: `POST /api/documents/public-upload`
- Debtor intake: `POST /api/debtor-applications`
- Partner onboarding: `POST /api/partner-applications`
- Admin auth: `POST /api/admin/auth/login`, `GET /api/admin/auth/me`, `POST /api/admin/auth/logout`
- Admin debtor review: `GET /api/admin/debtor-applications`, `GET /api/admin/debtor-applications/:id`, `POST /api/admin/debtor-applications/:id/review`
- Admin partner review: `GET /api/admin/partner-organizations`, `GET /api/admin/partner-organizations/:id`, `POST /api/admin/partner-organizations/:id/review`
- Admin matching: `POST /api/admin/match-cases`, `GET /api/admin/match-cases`, `GET /api/admin/match-cases/:id`, `POST /api/admin/match-cases/:id/transition`
- Case follow-up: `POST /api/admin/match-cases/:id/notes`, `POST /api/admin/match-cases/:id/documents`
- Audit: `GET /api/admin/audit-logs`

The runtime MVP still stores data in memory while the API contract is being stabilized. PostgreSQL persistence is now modeled under `prisma/` so the backend can switch from the in-memory repository to Prisma without changing the public workflow shape.

## PostgreSQL schema and migrations

DebtBridge uses Prisma for the PostgreSQL schema because the planned backend is Node.js/TypeScript-oriented and the project needs typed models plus repeatable migrations. The initial migration also contains hand-written PostgreSQL DDL for check constraints, GIN indexes, partial unique indexes, and `updated_at` triggers that are important for data integrity and query performance.

Configure a local database:

```bash
cp .env.example .env
# Edit DATABASE_URL if your local user, password, host, port, or database name differs.
```

Install dependencies and initialize an empty PostgreSQL database:

```bash
npm install
createdb debtbridge
npm run db:migrate
```

For non-interactive deploys, run:

```bash
npm run db:deploy
```

The initial model covers:

- `admin_users` for platform operator and manager accounts.
- `debtor_applications` for debtor intake, repayment capacity, hardship tags, consent timestamps, review status, and search fields.
- `partner_organizations` and `partner_contacts` for onboarding, qualification scope, service cities, banks, capabilities, contact people, and future institution account login.
- `match_cases` and `match_case_notes` for manual matching, proposed plans, progress tracking, and internal follow-up.
- `documents` for controlled file references only. Business tables do not store uploaded file binaries or public storage URLs.
- `audit_logs` for review, status transition, matching, file, and account-management traceability.

Backend integration should use transactions for application submission plus document binding, partner onboarding plus document binding, match creation plus application status update, and every review or case transition plus audit-log insert.
