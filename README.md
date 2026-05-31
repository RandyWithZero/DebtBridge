# DebtBridge

DebtBridge MVP is a credit-card overdue negotiation matching platform. The current backend implementation is a dependency-light Node.js API that covers public intake, partner onboarding, admin review, manual matching, progress tracking, document metadata binding, and audit logs.

## Frontend boundaries

The browser client is a standalone static frontend under `apps/client`. It is for debtors and partner organizations only:

- Debtors log in through `/debtor/login`, then see only their own applications, supplement action, personal account summary, and related match cases.
- Partner organizations log in through `/partner/login`, then see only their own organization profile/status and authorized cooperation cases.
- The client talks to the API at `window.DEBTBRIDGE_API_BASE`, defaulting to `http://localhost:3000`.

The backend service is API-only and no longer serves browser pages. Admin UI work should live in a separate admin frontend, not in `apps/client` and not inside the API server.

## Backend API

Run tests:

```bash
npm test
```

Validate the Prisma schema:

```bash
npm run db:validate
```

Prepare local environment variables:

```bash
cp .env.example .env
```

Start PostgreSQL for local development:

```bash
docker compose up -d postgres
```

Apply the database schema and local seed data:

```bash
npm run db:migrate
npm run db:seed
```

If `psql` is not installed on your host, use the Postgres container instead:

```bash
npm run db:migrate:compose
npm run db:seed:compose
```

Run the local API service:

```bash
npm start
```

Open `http://localhost:3000/` for a JSON service descriptor, or `http://localhost:3000/api/health` for health checks. The backend does not serve the client product UI or admin UI; those are separate frontend apps that call this API.

For admin API-only local verification, the same server can be started with the explicit alias:

```bash
npm run dev:admin
```

Run the client frontend in another terminal:

```bash
npm run dev:client
```

Open `http://localhost:5173` for the client site, debtor login, debtor application, partner login, and partner onboarding. The API remains available at `http://localhost:3000/api/*`.

Run the app and PostgreSQL together with Docker Compose:

```bash
docker compose up --build
```

Default admin users for local MVP verification:

| Email | Password | Role |
| --- | --- | --- |
| `admin@example.com` | `password` | `manager` |
| `operator@example.com` | `password` | `operator` |

Implemented endpoint groups:

- API health: `GET /api/health`
- Public config: `GET /api/public/config`
- Public document metadata upload: `POST /api/documents/public-upload`
- Debtor intake: `POST /api/debtor-applications`
- Partner onboarding: `POST /api/partner-applications`
- Shared auth: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- Debtor portal: `POST /api/debtor/me/applications`, `GET /api/debtor/me/applications`, `GET /api/debtor/applications/:id`, `GET /api/debtor/me/match-cases`
- Partner portal: `POST /api/partner/me/application`, `GET /api/partner/me/organizations`, `GET /api/partner/me/match-cases`, `GET /api/partner/match-cases/:id`
- Admin auth: `POST /api/admin/auth/login`, `GET /api/admin/auth/me`, `POST /api/admin/auth/logout`
- Admin users: `GET /api/admin/users`
- Admin debtor review: `GET /api/admin/debtor-applications`, `GET /api/admin/debtor-applications/:id`, `POST /api/admin/debtor-applications/:id/review`
- Admin partner review: `GET /api/admin/partner-organizations`, `GET /api/admin/partner-organizations/:id`, `POST /api/admin/partner-organizations/:id/review`
- Admin matching: `POST /api/admin/match-cases`, `GET /api/admin/match-cases`, `GET /api/admin/match-cases/:id`, `POST /api/admin/match-cases/:id/transition`
- Case follow-up: `POST /api/admin/match-cases/:id/notes`, `POST /api/admin/match-cases/:id/documents`
- Audit: `GET /api/admin/audit-logs`

By default tests use the in-memory repository. Set `DATABASE_URL` to enable PostgreSQL persistence against the normalized tables created by `db/migrations/0001_debtbridge_mvp.sql`. Set `STORAGE_DRIVER=memory` to force the local memory adapter when a `DATABASE_URL` is present.

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

The backend repository writes application submission, partner onboarding, match creation, review transitions, document metadata, notes, and audit logs to the normalized PostgreSQL tables when `DATABASE_URL` is configured. Document upload endpoints create controlled metadata records and bind references to business entities; they do not persist binary file contents yet.

Full REST API documentation is in `docs/api/rest-api.md`.

## Frontend integration

The API base URL is the backend origin plus `/api`. For local development with the default backend port:

```bash
CLIENT_API_BASE_URL=http://localhost:3000/api
ADMIN_API_BASE_URL=http://localhost:3000/api
```

Configure the backend CORS allowlist with the browser origins of the two frontend apps:

```bash
CLIENT_ORIGIN=http://localhost:5173
ADMIN_ORIGIN=http://localhost:5174
CORS_ORIGINS=
```

Authenticated browser clients should send requests with credentials enabled so the httpOnly `db_session` cookie set by login is included. Non-browser clients may send `Authorization: Bearer <token>` using the token returned by the login endpoint.

Known frontend contract gaps for GOO-19/GOO-20:

- File endpoints currently create and bind controlled document metadata only; binary upload/storage URLs are not implemented.
- Debtor and partner self-service profile update endpoints are not implemented.
- Partner case detail returns a masked debtor summary; no partner-side note or status action endpoints exist yet.
- Admin statistics/dashboard endpoints are not implemented beyond filtered list endpoints and audit logs.

## CI and local infrastructure

Pull requests run `.github/workflows/ci.yml`, which verifies:

- Node.js API tests with `npm test`.
- PostgreSQL migration and seed scripts against a real Postgres 16 service.
- `docker compose config`.
- Application container image build.

The first SQL migration lives at `db/migrations/0001_debtbridge_mvp.sql`. It mirrors the MVP architecture docs and is intentionally kept as plain PostgreSQL SQL so it can be validated independently of the runtime repository adapter.

Local database defaults are development-only values in `.env.example`; production deployments must provide secrets through the target runtime or secret manager.
