# DebtBridge

DebtBridge MVP is a credit-card overdue negotiation matching platform. The current backend implementation is a dependency-light Node.js API that covers public intake, partner onboarding, admin review, manual matching, progress tracking, document metadata binding, and audit logs.

## Backend API

Run tests:

```bash
npm test
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

Run the local MVP app and API:

```bash
npm start
```

Open `http://localhost:3000` for the public site, debtor application, partner onboarding, and operations back office.

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

The MVP stores data in memory. Document upload endpoints create controlled metadata records and bind references to business entities; they do not persist binary file contents yet. This keeps the API contract and workflow testable while leaving PostgreSQL, Prisma migrations, object storage, and production password hashing as the next infrastructure step.

## CI and local infrastructure

Pull requests run `.github/workflows/ci.yml`, which verifies:

- Node.js API tests with `npm test`.
- PostgreSQL migration and seed scripts against a real Postgres 16 service.
- `docker compose config`.
- Application container image build.

The first SQL migration lives at `db/migrations/0001_debtbridge_mvp.sql`. It mirrors the MVP architecture docs and is intentionally kept as plain PostgreSQL SQL so it can be validated before GOO-15/GOO-16 choose the final repository adapter or ORM. The current API still uses the in-memory store until that backend integration lands.

Local database defaults are development-only values in `.env.example`; production deployments must provide secrets through the target runtime or secret manager.
