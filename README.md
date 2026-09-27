# Harmonia

**An integrated lab for understanding how scoring strategies change remediation priorities.**

Harmonia combines vulnerability intelligence with asset context, computes scores at three levels, then compares profiles and scenarios: distributions, rank changes, priority transitions and divergences. The project then explores Asset ↔ Product ↔ Vulnerability ↔ Finding reconciliation, starting with a first traceable product resolver.

This is a **prototype**, not a scanner, a CMDB or a production-ready service. The main path is the Lab under **Dashboard → Compare**, which is part of the application itself.

![Harmonia strategy comparison on synthetic data](docs/images/harmonia-compare.png)

## Available, experimental, planned

| Available in the prototype | Limitations |
|---|---|
| NVD, EPSS, KEV and EUVD connectors; normalization and PostgreSQL storage | Depends on external APIs; no availability guarantee |
| CycloneDX import, asset context, components and findings | Reimport replaces components; incomplete history |
| Vulnerability / asset / finding scoring, revised profiles, presets and Compare | Compares strategies; no proof of business benefit |
| Product Resolution v0: aliases, optional bindings, decisions, candidates, `unknown` / `ambiguous` | Small catalog, deterministic, heuristic confidence |

**Experimental:** CPE/version matching and finding applicability. **Planned, not started:** ternary Applicability Engine. Multi-source asset identity, multi-scanner consolidation, generic Evidence, LLM support and attack graphs are not implemented.

## Try the Lab

Requirements: Docker with Compose. From the repository root, this isolated stack uses synthetic fixtures only, with no API key and no `.env`. Ports are bound locally and its database is disposable.

```bash
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml build
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml up -d db
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml run --rm backend alembic upgrade head
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml run --rm -e PYTHONPATH=/app backend python /scripts/seed_demo.py
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml up -d backend frontend
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml exec -T backend python /scripts/check_demo.py
```

Open [Harmonia](http://localhost:13000), then **Compare → Recent comparisons** and the prepared comparison. It covers 6 made-up vulnerabilities, 3 assets and 18 findings. Compare Balanced with Active Exploitation and Business Impact, then inspect the divergences. The `CVE-2099-*` identifiers are fixtures, not real advisories.

The [demo guide](docs/DEMO.md) explains the results and the manual walkthrough. The [readiness report](docs/READINESS.md) separates the checks that were run from their limitations.

To remove **only this disposable stack**:

```bash
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml down -v
```

## Development with real sources

Create `.env` from `.env.example` if it does not exist, adjust the values, then run `make dev`: build, PostgreSQL startup, migrations, then the application. The UI is on [localhost:3000](http://localhost:3000) and the API/OpenAPI on [localhost:8000/docs](http://localhost:8000/docs). The Compose settings are intended for local development.

Configure ingestion in Settings. The first NVD sync can take a long time. Import the [synthetic BOMs](samples/assets/README.md) under Assets, resolve products, run matching under Findings, then compute and compare scores. The number of findings depends on the ingested data; a resolved Product identity does not yet feed a complete applicability engine.

## Architecture and verification

FastAPI / async SQLAlchemy / PostgreSQL 16 / Alembic, Polars for normalization and scoring, APScheduler inside the backend; React 18 / Vite / TypeScript / Tailwind. The monolith makes it possible to experiment without distributed infrastructure.

- [Architecture and ingestion invariants](docs/ARCHITECTURE.md)
- [Product resolution and CPE/version limitations](docs/RESOLUTION.md)
- [Inventory and reimport behavior](docs/INVENTORY.md)
- [Lab, metrics and scientific limitations](docs/EVALUATION.md)
- [Validation commands and commit review](docs/READINESS.md)
- [Vision](docs/VISION.md), [roadmap](ROADMAP.md), [LLM constraints](docs/LLM.md)

CI checks migrations on a dedicated PostgreSQL instance, backend tests, TypeScript, Vitest and the build. The DB fixtures truncate/drop their tables: never point them at a database you want to keep. Backend dependencies have lower bounds only, without a full lock; a future install may therefore resolve different versions.

The display name is **Harmonia**. The technical names `vulnprio`/`vvln` (packages, databases, import keys and browser storage) are kept for compatibility.

## License

Harmonia is licensed under the [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`). You can use, modify and self-host it freely; if you run a modified version as a network service, you must make its source code available to its users.
