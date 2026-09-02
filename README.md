# Mini ERP — Multi-Source Inventory & Order Sync

![CI](https://github.com/hkndsky/mini-erp/actions/workflows/ci.yml/badge.svg)

Inventory and orders arrive from three sources that disagree with each other: a partner
JSON feed, a messy CSV export, and a legacy database table. This app ingests all three,
reconciles the differences, flags conflicts for human review, and tracks stock and
orders through their lifecycles with role-based access and a full audit trail.

## What it does

- **Three ingestion sources** — a partner REST feed (inventory + orders), a CSV upload,
  and a legacy database table — each normalized to a common record shape.
- **Pure reconciliation engine** — for every `(sku, field)` it decides whether a change is
  absorbed, auto-applied, or flagged, using per-field rules (`SOURCE_PRIORITY`,
  `LAST_WRITE_WINS`, `FLAG_FOR_REVIEW`) plus numeric tolerances.
- **Conflict review workflow** — divergent values are flagged, then a user resolves each
  one (apply the incoming value or keep the current) with an audit entry.
- **Stock & order lifecycle** — products, stock-on-hand with reorder points, and orders
  with line items, all created/updated by the pipeline or by hand.
- **Role-based access** — JWT auth with `ADMIN`, `WAREHOUSE`, and `SALES` roles; e.g. a
  `SALES` user never sees supplier cost fields.
- **Audit trail** — every applied field, opened conflict, and created entity is logged.
- **Background sync** — cron jobs re-pull the partner feed (`*/10 * * * *`) and the
  legacy table (`*/30 * * * *`), disableable with `SYNC_ENABLED=false`.

## Workspaces

| Workspace            | Stack                                          |
| -------------------- | ---------------------------------------------- |
| `apps/api`           | NestJS + Prisma (PostgreSQL) REST API          |
| `apps/web`           | React 19 + Vite + TypeScript (TanStack Table)  |
| `apps/mock-partner`  | Express mock of the external partner feed      |
| `packages/shared`    | Shared types/enums + reconciliation config     |

## Quick start (Docker)

```sh
docker compose up --build
```

- Web: http://localhost:5173
- API: http://localhost:4000 (`GET /health`)
- Partner mock: http://localhost:4010 (`GET /inventory`, `GET /orders`)

Migrations and the seed run automatically on API startup. Seeded logins (all
`Password123!`):

| Email                | Role      |
| -------------------- | --------- |
| `admin@erp.local`    | ADMIN     |
| `warehouse@erp.local`| WAREHOUSE |
| `sales@erp.local`    | SALES     |

Reset all data: `docker compose down -v && docker compose up --build`.

## Local development

Prereqs: Node 20+, PostgreSQL 14+ (a local server at `127.0.0.1:5432` with a role that
can create databases, e.g. `erp` / `erp_pass`).

```sh
npm install
npm run db:setup   # migrate + seed into DATABASE_URL
```

Configure the API via `apps/api/.env` (copy from `apps/api/.env.example`), then:

```sh
npm run dev        # API (:4000) + web (:5173) + partner mock (:4010) concurrently
```

- `dev:api` compiles with `tsc` and runs `node --watch` (NestJS DI needs decorator
  metadata, which `tsx`/esbuild cannot emit).
- `API_PROXY_TARGET` (shell env, default `http://127.0.0.1:4000`) points the Vite
  dev-server proxy at the API.
- `PARTNER_DELAY_MS` / `PARTNER_FAIL_RATE` (partner mock) simulate latency and 503s.

## Configuration

API (`apps/api/.env`):

| Variable                   | What it does                                             | Example / default                     |
| -------------------------- | -------------------------------------------------------- | ------------------------------------- |
| `DATABASE_URL`             | Postgres connection string (Prisma + API)                | `postgresql://erp:erp_pass@127.0.0.1:5432/erp` |
| `PORT`                     | Port the API listens on                                   | `4000`                                |
| `JWT_SECRET`               | Must be set in production; dev fallback when unset        | —                                    |
| `SYNC_ENABLED`             | Set to `false` to disable the background sync jobs        | `false`                               |
| `WEB_ORIGIN`               | Comma-separated allowed browser origins (unset = allow all) | `http://localhost:5173`            |
| `PARTNER_API_URL`          | Mock partner service URL                                  | `http://127.0.0.1:4010`               |
| `PARTNER_TIMEOUT_MS`       | Partner request timeout (ms)                              | `3000`                                |
| `PARTNER_RETRIES`          | Partner request retries                                   | `3`                                   |
| `PARTNER_SYNC_CRON`        | Cron for the background partner sync                      | `*/10 * * * *`                        |
| `LEGACY_SYNC_CRON`         | Cron for the background legacy sync                       | `*/30 * * * *`                        |
| `RECON_SOURCE_PRIORITY`    | Reconciliation source priority, highest first             | `CSV,PARTNER_API,LEGACY`             |
| `RECON_TOLERANCE_QTY`      | (optional) quantity delta absorbed silently (default `0`) | `0`                                  |
| `RECON_TOLERANCE_COST_PCT` | (optional) cost delta % absorbed silently (default `1`)   | `1`                                  |

Partner mock: `PARTNER_DELAY_MS` and `PARTNER_FAIL_RATE` simulate latency and 503s.
Web: `API_PROXY_TARGET` points the Vite dev proxy at the API (default `http://127.0.0.1:4000`).

## Project structure

```
mini-erp/
├── apps/
│   ├── api/                        # NestJS + Prisma REST API
│   │   ├── prisma/                 #   schema.prisma + seed.ts
│   │   ├── src/
│   │   │   ├── auth/               #   JWT login, guards, roles (RBAC)
│   │   │   ├── imports/            #   import pipeline + sources (CSV, partner, legacy)
│   │   │   ├── reconciliation/     #   pure engine + order engine
│   │   │   ├── conflicts/          #   conflict list + resolve
│   │   │   ├── stock/              #   stock items + adjustments
│   │   │   ├── orders/             #   order lifecycle
│   │   │   ├── products/           #   product catalog
│   │   │   ├── suppliers/          #   supplier directory
│   │   │   ├── reports/            #   aggregate reports
│   │   │   ├── audit/              #   audit trail
│   │   │   └── sync/               #   background cron sync jobs
│   │   └── test/                   #   unit + integration suites, fixtures
│   ├── web/                        # React 19 + Vite frontend
│   │   ├── e2e/                    #   Playwright e2e (auth + import/conflict flow)
│   │   └── src/
│   │       ├── pages/              #   Dashboard, Stock, Orders, Conflicts, ...
│   │       ├── components/         #   DataGrid, CsvDropzone, Modals, ...
│   │       └── test/               #   RTL component tests
│   └── mock-partner/               # Express mock of the partner feed
└── packages/
    └── shared/                     # Shared types/enums + reconciliation config
```

## Testing approach

Four layers, each guarding a different boundary: pure reconciliation logic
(unit), API contracts + RBAC (integration), role-aware rendering (component),
and the whole user flow in a real browser (e2e).

| Command (root)        | What it needs                                    |
| --------------------- | ---------------------------------------------- |
| `npm run test:unit`    | nothing (pure unit tests, API)                 |
| `npm run test:integration` | Postgres at `127.0.0.1:5432` (`erp`/`erp_pass`); auto-creates and resets `erp_test` |
| `npm run test:web`     | nothing (RTL component tests)                  |
| `npm run test:e2e`     | the full stack (auto-resets + re-seeds the DB) |

- Unit tests cover the reconciliation engine against deliberately conflicting
  fixtures (source priority, last-write-wins, flag-for-review) and CSV/legacy
  normalization edge cases — the core logic, no infra needed.
- The integration suite (`apps/api/test/integration`) boots the real API
  in-process and covers auth, the import → conflict → resolve pipeline,
  malformed CSVs, an unreachable partner API, and unauthorized access attempts.
- Component tests (RTL) verify role-aware rendering — e.g., a SALES user
  genuinely cannot see supplier cost fields — plus loading/error/empty states.
- E2E (`apps/web/e2e`) drives a real browser through login, CSV upload,
  conflict flag, resolve, stock check, and a new order using
  `apps/api/test/fixtures/sample-import.csv`. It asserts exact numbers
  ("3 applied, 2 conflicts", on-hand `130`), so its global setup
  (`apps/web/e2e/global-setup.ts`) resets + re-seeds the database the API
  uses before every run — it is repeatable as-is. To point it at another
  database, set `E2E_DATABASE_URL`. Note: this resets your local dev DB.
- Typecheck everything with `npm run typecheck`.

## CI

`.github/workflows/ci.yml` runs typecheck + unit + integration + component tests
against a Postgres service container, and E2E against `docker compose up --build`.
