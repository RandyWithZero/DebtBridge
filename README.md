# DebtBridge

DebtBridge MVP is a credit-card overdue negotiation matching platform. The current backend implementation is a dependency-light Node.js API that covers public intake, partner onboarding, admin review, manual matching, progress tracking, document metadata binding, and audit logs.

## Backend API

Run tests:

```bash
npm test
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

The MVP stores data in memory. Document upload endpoints create controlled metadata records and bind references to business entities; they do not persist binary file contents yet. This keeps the API contract and workflow testable while leaving PostgreSQL, Prisma migrations, object storage, and production password hashing as the next infrastructure step.
