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
