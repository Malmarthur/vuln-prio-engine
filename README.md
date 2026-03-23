# VulnPrio

Vulnerability intelligence aggregation platform. Collects data from NVD, EPSS, CISA KEV, and EUVD into a unified PostgreSQL database, exposed via a REST API and React dashboard. Built for a cybersecurity research paper on vulnerability prioritization methodology.

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
