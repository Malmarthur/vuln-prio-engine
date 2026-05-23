# VulnPrio — Codex Context

This file gets a new Codex instance up to speed. See PLAN.md for the phased build plan and current progress.

**PLAN.md must be kept up to date as development progresses.** Mark steps as done (✅) immediately after completing them, and update "next steps" notes whenever the current phase changes.

---

## What this project is

A vulnerability intelligence aggregation platform for a cybersecurity research paper on vulnerability prioritization methodology. V1 aggregates data from NVD, EPSS, CISA KEV, and EUVD into a PostgreSQL database and exposes it via a REST API + React dashboard. Scoring/prioritization comes in V2.

---

## Tech stack

| Layer       | Technology                                        |
|-------------|---------------------------------------------------|
| Backend     | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic |
| Data proc.  | Polars (DataFrames for all source normalization)  |
| Scheduling  | APScheduler (integrated in FastAPI process)       |
| Database    | PostgreSQL 16                                     |
| DB Admin    | pgAdmin 4                                         |
| Frontend    | React 18 + Vite + TailwindCSS + TypeScript         |
| Infra       | Docker Compose                                    |

---

## Running the project

```bash
docker compose up -d                                    # start all services
docker compose exec backend alembic upgrade head        # apply migrations (first time)
docker compose build backend && docker compose up -d    # after requirements.txt changes
```

Services:
- Backend API: http://localhost:8000 (health: `/health`)
- Frontend:    http://localhost:3000 (Vite dev server, proxies `/api` to backend)
- pgAdmin:     http://localhost:5050 (admin@vulnprio.dev / admin)
- PostgreSQL:  localhost:5432

The `.env` file holds DB credentials and the NVD API key. It is gitignored.

---

## Project structure

```
src/backend/
├── alembic.ini
├── alembic/
│   └── versions/a1b2c3d4e5f6_initial_schema.py
├── requirements.txt
└── app/
    ├── main.py           FastAPI app + lifespan
    ├── config.py         pydantic-settings (reads .env)
    ├── database.py       async engine, AsyncSessionLocal, Base, get_db
    ├── models/
    │   ├── vulnerability.py    core table
    │   ├── ingestion_log.py
    │   └── setting.py
    ├── schemas/
    │   ├── vulnerability.py  Pydantic response schemas (list, detail, stats)
    │   └── ingestion.py      Ingestion log + trigger schemas
    ├── api/
    │   ├── vulnerabilities.py  list, detail, stats endpoints
    │   ├── ingestion.py        trigger, status, logs endpoints
    │   └── settings.py         GET/PUT settings
    ├── services/
    │   └── vulnerability_service.py   upsert, queries, ingestion_run, settings CRUD
    └── ingestion/
        ├── utils.py          RateLimiter, get_http_client, fetch_with_retry
        ├── aggregator.py     normalize_nvd/epss/kev/euvd → pl.DataFrame
        ├── runner.py         run_kev/nvd/epss/euvd/run_all
        ├── scheduler.py      APScheduler, per-source interval jobs
        └── sources/
            ├── kev.py        CISA KEV JSON feed
            ├── nvd.py        NVD API 2.0, paginated async generator
            ├── epss.py       FIRST EPSS API (official, paginated)
            └── euvd.py       ENISA EUVD (resilient, returns [] on failure)

src/frontend/
├── Dockerfile
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── api/
    │   └── client.ts         typed API client (all interfaces exported)
    └── components/
        ├── Layout.tsx         header + tab navigation
        ├── StatsBar.tsx       aggregated stats cards
        ├── Filters.tsx        search, severity, KEV, EPSS/CVSS, date range
        ├── VulnTable.tsx      main table with sort + fetch coordination
        ├── VulnRow.tsx        individual vulnerability row
        ├── VulnDetail.tsx     expandable detail panel (fetches full CVE)
        ├── Pagination.tsx     page navigation with ellipsis
        └── SettingsPanel.tsx  schedule config, manual triggers, logs
```

---

## Key architectural decisions

### Polars for data processing
All `normalize_*` functions in `aggregator.py` return `pl.DataFrame`. Polars handles the ~260k-row EPSS dataset efficiently. NVD and KEV also normalize through DataFrames for a consistent interface.

### Column ownership (upsert pattern)
`SOURCE_OWNED_COLUMNS` in `aggregator.py` defines which DB columns each source may update. The service's `upsert_vulnerabilities()` builds the `ON CONFLICT DO UPDATE SET` clause using only those columns — no cross-source data pollution.

### sources_raw JSONB merge
Each source writes its raw payload under its own key. On upsert conflict:
```sql
sources_raw = COALESCE(existing_sources_raw, '{}'::jsonb) || new_partial_sources_raw
```
Result: `{"nvd": {...}, "kev": {...}, "epss": {...}}` — all sources preserved independently.

### KEV fallback summary
KEV provides a `shortDescription` that should only populate `summary` when NVD hasn't been ingested yet. Implemented via `COALESCE(existing_summary, excluded.summary)` in the upsert.

### JSON-string columns
Complex JSONB fields (`cwe_ids`, `affected_products`, `references`, `sources_raw`) are stored as JSON *strings* inside Polars DataFrames (Polars has no native JSONB type), then deserialized back to Python objects in `_df_to_records()` before the SQLAlchemy insert.

### NVD incremental sync
After each successful NVD run, `nvd_last_sync_time` is written to the `settings` table. On next run, `fetch_nvd_since()` uses that timestamp. Date ranges > 120 days are automatically split (NVD API cap). Force a full re-sync by setting `force_full=True` in the runner.

### EUVD resilience
`fetch_euvd()` catches all exceptions and returns `[]` with a warning log. EUVD is a new, less-stable API — failures must never block NVD/EPSS/KEV.

---

## Common gotchas

- **`TIMESTAMPTZ` does not exist in SQLAlchemy.** Use `TIMESTAMP(timezone=True)` from `sqlalchemy`.
- **pgAdmin rejects `.local` TLDs.** Use `admin@vulnprio.dev` (or any real TLD) for `PGADMIN_DEFAULT_EMAIL`.
- **Polars `from_dicts` with nested Python objects** (lists, dicts) creates `Object`-dtype columns. NVD's complex fields are pre-serialized to JSON strings to avoid this.
- **`requirements.txt` changes** require a `docker compose build backend` before the new package is available in the container.
- **Alembic async setup**: `alembic/env.py` uses `asyncio.run(run_async_migrations())`. The DB URL is read from the `DATABASE_URL` env var, not from `alembic.ini`.

---

## Database schema highlights

Table `vulnerabilities` — one row per CVE:
- CVSS for all four versions: v2, v3.0, v3.1, v4.0 (many older CVEs have only v2)
- `kev_known_exploited BOOLEAN DEFAULT FALSE` — indexed for fast KEV-only filter
- `sources_raw JSONB` — raw payloads from each source for audit/debug
- `updated_at` — auto-updated via PostgreSQL trigger (see initial migration)

Table `ingestion_logs` — one row per ingestion run (source, status, counts, timing)

Table `settings` — key/value store seeded with default schedule intervals

---

## Phase 6 next steps (Polish)

See PLAN.md steps 31–34. Remaining work:
- Loading states, error handling, empty states (frontend)
- Backend error handling (source API failures, DB issues)
- Structured logging throughout backend
- README with setup instructions
