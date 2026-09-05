# Historical documentation — before the 2026-09-05 realignment

> ARCHIVE ONLY. These documents describe earlier intentions and reported milestones.
> They are not current agent instructions, a current roadmap, or independently verified test results.
> Start with [AGENTS.md](../../AGENTS.md), [current plan](../../PLAN.md) and [audit](../AUDIT.md).
> Historical links and commands inside the fenced snapshots are preserved verbatim, not maintained.

## Original AGENTS.md

````markdown
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

````

## Original CLAUDE.md

````markdown
# VulnPrio — Claude Context

This file gets a new Claude instance up to speed. See PLAN.md for the phased build plan and current progress.

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

````

## Original PLAN.md

````markdown
# VulnPrio — Build Plan (Living Document)

Status key: ✅ Done | 🔄 In Progress | ⬜ Pending

---

## Phase 1 — Foundation ✅
1. ✅ `docker-compose.yml` — PostgreSQL 16, pgAdmin 4, FastAPI backend, frontend stub
2. ✅ Backend Dockerfile + FastAPI skeleton (`/health` endpoint, CORS)
3. ✅ `database.py` — async SQLAlchemy engine + `get_db` dependency
4. ✅ SQLAlchemy ORM models — `Vulnerability`, `IngestionLog`, `Setting`
5. ✅ Alembic setup + initial migration applied
6. ✅ Schema verified via pgAdmin

## Phase 2 — Ingestion Pipeline ✅
7.  ✅ `ingestion/utils.py` — sliding-window `RateLimiter`, async HTTP client, retry with backoff
8.  ✅ `ingestion/sources/kev.py` — CISA KEV single JSON download
9.  ✅ `ingestion/aggregator.py` — Polars-based normalization, `SOURCE_OWNED_COLUMNS`, `JSON_STRING_COLUMNS`
10. ✅ `services/vulnerability_service.py` — batched upserts (5k/batch), `ingestion_run` ctx manager, settings CRUD
11. ⬜ End-to-end KEV test (trigger → fetch → upsert → verify in pgAdmin) — pending Phase 3 API
12. ✅ `ingestion/sources/nvd.py` — paginated async generator, incremental sync, auto-splits 120-day windows
13. ✅ `ingestion/sources/epss.py` — official FIRST API (10k/page), rate-limited
14. ✅ `ingestion/sources/euvd.py` — resilient connector, returns [] on any failure
15. ✅ `ingestion/runner.py` — per-source runners + `run_all`, ingestion logs wired throughout

## Phase 3 — API Layer ✅
16. ✅ `GET /api/v1/vulnerabilities` — pagination, sorting, filtering
17. ✅ `GET /api/v1/vulnerabilities/{cve_id}`
18. ✅ `GET /api/v1/vulnerabilities/stats`
19. ✅ Ingestion trigger + status + logs endpoints
20. ✅ Settings CRUD endpoints

## Phase 4 — Scheduling ✅
21. ✅ `ingestion/scheduler.py` — APScheduler, one job per source
22. ✅ Wire scheduler into FastAPI lifespan (`main.py`)
23. ✅ Dynamic rescheduling when settings are updated via API

## Phase 5 — Frontend ✅
24. ✅ Frontend Dockerfile + Vite + React + TailwindCSS + TypeScript
25. ✅ API client (`api/client.ts`) with typed interfaces
26. ✅ `Layout.tsx` + `StatsBar.tsx`
27. ✅ `VulnTable.tsx` + `VulnRow.tsx` + `Pagination.tsx`
28. ✅ `VulnDetail.tsx` — expandable row
29. ✅ `Filters.tsx`
30. ✅ `SettingsPanel.tsx` — schedule config, manual triggers, logs

## Phase 6 — Polish ✅
31. ✅ Loading states, error handling, empty states (frontend)
32. ✅ Backend error handling (source API failures, DB issues)
33. ✅ Structured logging throughout backend
34. ✅ README with setup instructions

## Phase 7 — V2 Scoring / Prioritization ✅
35. ✅ DB columns: `priority_level` (V0-V3), `priority_score`, `priority_confidence` + migration
36. ✅ Scoring engine: configurable profile (weights, value mappings, thresholds), single SQL UPDATE CTE
37. ✅ Scoring API: GET/PUT `/scoring/profile`, POST `/scoring/run`, GET `/scoring/distribution`, GET `/scoring/column-values/{col}`
38. ✅ ScoringPanel frontend: column config, thresholds, compute button, distribution charts
39. ✅ Priority badge + score column in VulnTable, priority filter in Filters
40. ✅ Column grouping with fallbacks (COALESCE chain: e.g. cvss v4.0 → v3.1 → v3.0 → v2)
    - `fallbacks` field in ColumnConfig schema (backend + frontend)
    - `_build_update_sql` generates COALESCE across group; confidence = any non-null in chain
    - DEFAULT_SCORING_PROFILE uses 2 groups (CVSS Score, CVSS Severity) + 5 standalone
    - ScoringPanel UI: group chain with ↑/↓ reorder, × remove, + Add fallback
41. ✅ Histogram order: most critical (highest score/confidence) at top

## Phase 8 — Assets & Findings MVP ✅
42. ✅ DB schema for `assets`, `asset_components`, `vulnerability_products`, `findings`, and `finding_scores`
43. ✅ CycloneDX JSON asset import: one BOM = one asset, components = installed software, CPEs parsed into normalized fields
44. ✅ Fixed asset metrics: internet exposure, business criticality, and patch complexity
45. ✅ NVD affected products retain version-bound inclusivity and sync into normalized `vulnerability_products`
46. ✅ On-demand CPE matching creates idempotent findings with exact, range, and wildcard match confidence
47. ✅ Finding scoring combines vulnerability priority with asset metrics and writes `finding_scores`
48. ✅ Asset and finding REST APIs with list/detail/stats/import/match/score endpoints
49. ✅ Frontend tabs for Assets and Findings plus finding priority status in Scoring
50. ✅ Unit, integration, and API tests for CPE parsing, import, matching, scoring, and endpoints
51. ✅ Demo validation on populated NVD dataset:
    - Imported 4 synthetic CycloneDX assets from `samples/assets/`
    - Matched 15 CPE-bearing components against normalized NVD products
    - Created 5,141 findings and scored all of them
    - Current finding distribution: P0=100, P1=1,019, P2=4,021, P3=1
    - Verified matching/scoring idempotence after re-importing `web-gateway-prod-01`
52. ✅ Polars-backed batch matcher: Postgres narrows CPE candidates, Polars evaluates/dedupes version matches, and findings are bulk upserted
53. ✅ Product-aware version matching: conservative `VersionMatcher`, normalized confidence levels, and Microsoft Windows product aliases without treating Windows 10/11 as versions
54. ✅ Expandable asset rows in the frontend showing imported components and CPE details
55. ✅ Loading animations for frontend buttons that launch scoring or matching computations
56. ✅ Expandable finding rows showing asset, component/CPE, vulnerability, match, score, and timeline details

## Phase 9 — Frontend Cockpit Rework ✅
57. ✅ Dashboard cockpit with compact vulnerability, asset, finding, and scoring overview
58. ✅ Navigation reorganized into Dashboard, Vulnerabilities, Assets, Findings, and Settings
59. ✅ Vulnerability table moved to the dedicated Vulnerabilities tab
60. ✅ Scoring controls integrated into Dashboard, with vulnerability profile editing and run controls
61. ✅ Finding scoring profile exposed via REST API with typed validation and reset support
62. ✅ Dashboard controls for finding scoring weights, thresholds, and asset-context value mappings
63. ✅ Compact KPI strips reused across Vulnerabilities, Assets, and Findings views
64. ✅ Asset prioritization marked WIP without adding a persisted asset score model
65. ✅ Findings filters added for search, priority, KEV-only, and exposure

## Phase 10 — Asset Prioritization ✅
66. ✅ Persisted `asset_scores` with score, confidence, and `A0-A3` priority levels
67. ✅ Asset scoring profile API with get/update/reset/run endpoints and typed validation
68. ✅ Asset stats/list/detail include scored/unscored counts, priority distributions, and score fields
69. ✅ Finding scoring now combines vulnerability priority with persisted asset priority
70. ✅ Legacy finding profiles normalize old asset-context weights into `asset_priority`
71. ✅ Dashboard shows assets as an active scoring stage with configurable weights, thresholds, values, and run controls
72. ✅ Assets tab shows priority filters, badges, scores, confidence, and compact scored KPIs
73. ✅ Findings tab surfaces asset priority next to finding priority context

## Phase 11 — Demo Asset Inventory ✅
74. ✅ Expanded `samples/assets/` from 4 synthetic assets to 50 realistic enterprise CycloneDX BOMs
75. ✅ Added a deterministic sample generator (`samples/assets/generate-sample-assets.mjs`) so the asset catalog can be regenerated consistently
76. ✅ Covered internet edge, identity, business apps, CI/CD, databases, observability, backup, endpoints, and segmented operational systems
77. ✅ Updated the sample asset README with scenarios, asset metrics, and component counts
78. ✅ Assets tab supports selecting and importing multiple CycloneDX JSON files in one action
79. ✅ Frontend Docker dependency install hardened for `lucide-react` and Rollup's Alpine ARM64 native package

## Phase 12 — Dashboard Cockpit Refresh ✅
80. ✅ Dashboard tab reorganized into a coherent Vulnerabilities → Assets → Findings scoring pipeline
81. ✅ Each stage now aligns metrics, priority distribution, thresholds/configuration, and compute controls in one card
82. ✅ Global refresh, save, and reset actions moved into a compact dashboard toolbar
83. ✅ Asset and finding weights restyled as metric cards to match the vulnerability scoring controls
84. ✅ Frontend workspace widened and dashboard breakpoints adjusted so scoring stages have more breathing room
85. ✅ Dashboard threshold editors replaced with visual multi-handle criticality bars plus exact-value inputs
86. ✅ Lowest threshold markers (`V3`, `A3`, `P3`) fixed at the zero baseline to keep the lowest priority band well-defined
87. ✅ Threshold values moved directly under their sliders, with fixed baseline markers given a black outline
88. ✅ Threshold bar scale simplified to endpoint labels only, keeping slider values as centered text below the handles

## Phase 13 — Named Scoring Profiles & Comparisons ✅
89. ✅ Versioned vulnerability, asset, and finding profiles with locked, cloneable built-ins
90. ✅ Global presets compose one profile per scoring stage with a single independently selected active preset
91. ✅ Built-in Balanced, Active Exploitation, and Business Impact presets with deterministic defaults
92. ✅ Per-profile/context score persistence plus migration of legacy settings and existing score rows
93. ✅ Async run/comparison jobs with progress, cancellation, restart recovery, watermarks, snapshots, and stale metadata
94. ✅ Global and per-stage comparisons with distributions, transition matrices, score/rank deltas, and Spearman correlation
95. ✅ Configure/Compare dashboard workspace with preset selector, profile library, cloning, unlimited candidates, progress, filters, and divergent-item details
96. ✅ Legacy scoring endpoints retained as active-preset adapters; list, detail, stats, and distributions support optional `preset_id`
97. ✅ Migration upgrade/downgrade checks, 243 backend tests, frontend production build, browser UI verification, and three-preset demo comparison

## Phase 14 — Premium Comparison Workspace ✅
98. ✅ Promoted scoring comparison to a first-class navigation workspace with URL-restorable jobs and session-restored drafts
99. ✅ Replaced the flat comparison form with a visual reference/candidate composer and compact scoring signatures
100. ✅ Added multi-candidate overview, distribution shifts, movement bars, transition heatmap, candidate tabs, and item detail drawer
101. ✅ Added server-paginated divergence search, filters, transitions, deterministic sorting, and explicit positive-rank promotion semantics
102. ✅ Added compact persisted comparison summaries, recent-comparison history, stale/inconsistent metadata, and detail-expiration handling
103. ✅ Added contextual async progress, non-blocking cancellation, current-data re-runs, responsive layouts, and accessible focus/motion states
104. ✅ Added frontend Vitest/Testing Library coverage and backend API coverage for summaries, history, pagination, filters, and ranks

## Phase 15 — LLM-Assisted CPE Identification ⬜
105. ⬜ Define the LLM-assisted CPE identification workflow: vulnerability description/CVE context → ranked CPE candidates → analyst validation
106. ⬜ Add a provider-agnostic LLM client with configurable endpoint, model, timeout, retry, and token/cost limits
107. ⬜ Build a CPE candidate-generation service using NVD/CPE dictionary context and structured JSON output (CPE, rationale, evidence span, confidence, uncertainty)
108. ⬜ Persist CPE suggestions, prompt/model/version metadata, source evidence, review status, and analyst decisions for full auditability
109. ⬜ Add guardrails: strict CPE 2.3 validation, candidate limits, abstention when evidence is insufficient, prompt-injection-resistant input handling, and no automatic finding creation without policy approval
110. ⬜ Expose review and feedback APIs/UI so analysts can accept, reject, edit, or defer suggestions and feed decisions back into evaluation data
111. ⬜ Evaluate precision@k, recall@k, abstention quality, reviewer agreement, latency, and cost against a curated gold set of vulnerability descriptions and products
112. ⬜ Integrate approved CPE mappings with `vulnerability_products` and the existing matcher, preserving provenance and distinguishing LLM-assisted mappings from vendor-provided mappings

Next steps:
- Validate the premium comparison workspace against real user workflows and tune default candidate suggestions if custom preset libraries grow large.
- Add an optional backend bulk-import endpoint if the demo dataset grows beyond browser-friendly multi-file uploads.
- Add a first-class way to filter or down-rank low-confidence `product_wildcard` findings in the UI.
- Benchmark the Polars-backed matcher with a larger asset inventory and tune candidate batching if memory pressure appears.
- Monitor large NVD backfills and tune indexes around `vulnerability_products(cpe_part, cpe_vendor, cpe_product)` if matching becomes slow on full datasets.
- Validate matching quality against real imported CycloneDX BOMs when available.
- Expand product-aware aliases only with explicit test fixtures, especially for Windows build/release labels and Linux distribution package versions.
- Add richer finding filters/saved views if needed for the prioritization-method demo.
- Design the LLM-assisted CPE identification MVP as a human-in-the-loop capability; prioritize measurable candidate quality and auditability over autonomous matching.
- Curate an initial gold dataset of vulnerability descriptions, affected products, valid CPEs, and explicit “insufficient evidence” examples before selecting a model/provider.
- Decide the first deployment mode (hosted API or self-hosted model) based on data sensitivity, cost, latency, and reproducibility requirements.

## Future capability: LLM-assisted CPE identification

The largest expected value opportunity for vulnerability-management workflows is reducing the gap between a natural-language vulnerability description and the normalized CPEs required to match that vulnerability against an asset inventory. A future module should call an LLM API to produce **ranked CPE candidates**, not silently assert a single answer.

The proposed flow is:

```text
description + CVE/vendor/product context
        ↓
LLM candidate generation with CPE/NVD context
        ↓
strict validation + deduplication + confidence/uncertainty
        ↓
analyst review (accept / reject / edit / defer)
        ↓
approved mapping → vulnerability_products → existing CPE matcher
```

Required properties:

- provider-agnostic adapter so model/provider changes do not affect the domain model;
- structured output containing candidate CPE, rationale, evidence span, confidence, and abstention reason;
- provenance for model, prompt/template version, context, timestamp, and reviewer decision;
- explicit separation between vendor/NVD mappings and LLM-assisted mappings;
- conservative behavior: invalid CPEs, weak evidence, and ambiguous products must be surfaced for review rather than converted directly into findings;
- an evaluation set and metrics (precision@k, recall@k, abstention quality, reviewer agreement, latency, and cost) to demonstrate whether the module improves vulnerability-management coverage.

---

## API Endpoints Reference (Phase 3 target)

```
GET  /api/v1/vulnerabilities           paginated list, full filter set
GET  /api/v1/vulnerabilities/stats     aggregated stats
GET  /api/v1/vulnerabilities/{cve_id}  full detail

POST /api/v1/ingestion/trigger         { source: "nvd"|"epss"|"kev"|"euvd"|"all" }
GET  /api/v1/ingestion/status          latest run per source
GET  /api/v1/ingestion/logs            paginated history

GET  /api/v1/settings
PUT  /api/v1/settings/{key}

GET/POST/PATCH/DELETE /api/v1/scoring/profiles
POST /api/v1/scoring/profiles/{id}/clone
GET/POST/PATCH/DELETE /api/v1/scoring/presets
POST /api/v1/scoring/presets/{id}/clone
POST /api/v1/scoring/presets/{id}/activate
POST /api/v1/scoring/runs
POST /api/v1/scoring/comparisons
GET  /api/v1/scoring/jobs/{id}
POST /api/v1/scoring/jobs/{id}/cancel
GET  /api/v1/scoring/comparisons/{job_id}

POST /api/v1/assets/import/cyclonedx  import one CycloneDX JSON BOM as an asset
GET  /api/v1/assets                   paginated asset list
GET  /api/v1/assets/stats             asset/component aggregate stats
GET  /api/v1/assets/{id}              asset detail with components
POST /api/v1/assets/scoring/run       compute asset priorities
GET  /api/v1/assets/scoring/profile   get asset scoring profile
PUT  /api/v1/assets/scoring/profile   update asset scoring profile
DEL  /api/v1/assets/scoring/profile   reset asset scoring profile

POST /api/v1/findings/match/run       run CPE-based asset ↔ vulnerability matching
POST /api/v1/findings/scoring/run     compute finding priorities
GET  /api/v1/findings/scoring/profile get finding scoring profile
PUT  /api/v1/findings/scoring/profile update finding scoring profile
DEL  /api/v1/findings/scoring/profile reset finding scoring profile
GET  /api/v1/findings                 paginated findings list
GET  /api/v1/findings/stats           finding aggregate stats
```

## Filter params for GET /api/v1/vulnerabilities
```
page, per_page (max 200)
sort_by: published_date | cvss_v31_score | epss_score | updated_at
sort_order: asc | desc
search: free text on cve_id + summary
severity: CRITICAL | HIGH | MEDIUM | LOW | NONE  (cvss_v31_severity)
kev_only: bool
min_epss: float
min_cvss: float
date_from / date_to
```

````

## Original README.md

````markdown
# VulnPrio

Vulnerability intelligence and prioritization demo platform. Collects data from NVD, EPSS, CISA KEV, and EUVD into a unified PostgreSQL database, imports CycloneDX asset inventories, matches vulnerable CPEs into findings, and exposes everything via a REST API and React dashboard. Built for a cybersecurity research paper on vulnerability prioritization methodology.

## Tech Stack

| Layer           | Technology                                          |
|-----------------|-----------------------------------------------------|
| Backend         | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic |
| Data Processing | Polars                                              |
| Scheduling      | APScheduler                                         |
| Database        | PostgreSQL 16                                       |
| Frontend        | React 18, Vite, TailwindCSS, TypeScript             |
| Infrastructure  | Docker Compose                                      |

## Quick Start

```bash
# Clone and configure
cp .env.example .env        # edit with your NVD API key (optional, higher rate limits)

# Start all services
docker compose up -d

# Apply database migrations (first time only)
docker compose exec backend alembic upgrade head
```

## Services

| Service    | URL                    | Notes                          |
|------------|------------------------|--------------------------------|
| Frontend   | http://localhost:3000   | Vite dev server, proxies `/api` to backend |
| Backend API| http://localhost:8000   | Health check: `/health`        |
| pgAdmin    | http://localhost:5050   | admin@vulnprio.dev / admin     |
| PostgreSQL | localhost:5432          | Default creds in `.env`        |

## Data Sources

- **NVD** (National Vulnerability Database) — CVE details, CVSS scores (v2/v3.0/v3.1/v4.0), CWEs, affected products
- **EPSS** (Exploit Prediction Scoring System) — Exploitation probability scores from FIRST (~260k CVEs)
- **CISA KEV** (Known Exploited Vulnerabilities) — Actively exploited CVEs tracked by CISA
- **EUVD** (EU Vulnerability Database) — European vulnerability data from ENISA
- **CycloneDX JSON** — Asset inventory import; one BOM represents one asset and its components represent installed software with CPEs

Synthetic CycloneDX asset samples are available in `samples/assets/` for local demos and finding-prioritization tests.

## Roadmap: LLM-assisted CPE identification

A planned V2+ capability will use an LLM API to turn a vulnerability description and available CVE/vendor/product context into ranked CPE 2.3 candidates. The output will include rationale, evidence, confidence, and uncertainty, then go through strict validation and analyst review before approved mappings are sent to the existing `vulnerability_products` and CPE-matching pipeline.

This is intentionally a human-in-the-loop workflow: LLM suggestions will be auditable and distinguishable from NVD/vendor mappings, with abstention when evidence is insufficient. The roadmap also includes a curated evaluation set covering precision/recall, abstention quality, reviewer agreement, latency, and cost.

## API Endpoints

```
GET  /api/v1/vulnerabilities           Paginated list with filters
GET  /api/v1/vulnerabilities/stats     Aggregated statistics
GET  /api/v1/vulnerabilities/{cve_id}  Full CVE detail
POST /api/v1/ingestion/trigger         Trigger ingestion (body: {"source": "nvd"|"epss"|"kev"|"euvd"|"all"})
GET  /api/v1/ingestion/status          Latest run per source
GET  /api/v1/ingestion/logs            Paginated ingestion history
GET  /api/v1/settings                  All settings
PUT  /api/v1/settings/{key}            Update a setting
POST /api/v1/assets/import/cyclonedx   Import a CycloneDX JSON BOM as an asset
GET  /api/v1/assets                    Paginated asset list
GET  /api/v1/assets/stats              Asset/component aggregate statistics
GET  /api/v1/assets/{id}               Asset detail with components
POST /api/v1/findings/match/run        Run CPE-based matching
POST /api/v1/findings/scoring/run      Compute finding priorities
GET  /api/v1/findings/scoring/profile  Get finding scoring profile
PUT  /api/v1/findings/scoring/profile  Update finding scoring profile
DEL  /api/v1/findings/scoring/profile  Reset finding scoring profile
GET  /api/v1/findings                  Paginated findings list
GET  /api/v1/findings/stats            Finding aggregate statistics
```

## Development

```bash
# After backend requirements.txt changes
docker compose build backend && docker compose up -d

# After frontend package.json changes
docker compose build frontend && docker compose up -d

# View logs
docker compose logs -f backend
```

## License

MIT

````
