# GitHub readiness — Harmonia

Status as of **2026-09-27**. Local preparation for review; nothing has been published. Verified starting point: `feat/assets` and HEAD at `9cd5877`, clean tree, **13 commits ahead of main**. Preparation changes live on `codex/github-readiness`, without rewriting those commits.

## Checks performed

| Check | Result and scope |
|---|---|
| Docker install | Backend and frontend images built from this checkout; Python 3.12.14, PostgreSQL 16, Node 20. Frontend dependencies installed with `npm ci` |
| Migrations on an empty database | Ten migrations: `upgrade head → downgrade base → upgrade head` succeeded on the disposable `vvln_demo` |
| Latest migration with data | `d9e0f1a2b3c4 → c8d9e0f1a2b3 → head`; 6 vulnerabilities, 3 assets and 18 findings preserved. Product tables are dropped by this downgrade, as expected; resolution replayed after upgrade |
| Backend | **249 tests passed** on `vvln_test`, a dedicated database; 8 SQLAlchemy deprecation warnings about `DISTINCT ON` |
| Frontend | **5 tests / 3 files passed**, `npx tsc --noEmit` and `npm run build` succeeded; Browserslist warning about its outdated database |
| Display rename | API rebuilt, health test rerun; TypeScript/build rerun, `Harmonia` health response verified in the demo |
| HTTP demo | Resolution of 3 components, 18 matches, a real comparison job over 3 presets, summaries/details accessible and consistent; replayed after the rollback |
| Browser demo | Dashboard loaded, comparison launched from Compare and completed at 100 %, distributions/ranks displayed; real screenshots in the guide |
| Product v0 benchmark | 5 cases: 2 resolved, 1 unknown, 2 ambiguous; accuracy 2/2 on expected resolutions, coverage 2/5, false matches 0/5. No evidence of generalization |

Migrations and tests used the isolated `compose.demo.yml` stack, without reading the local `.env`, without any existing database and without real ingestion. The full migration test covers an empty database; the test with data covers the latest migration only. No older result is used as current evidence.

The benchmark used the catalog and corpus under `samples/evaluation/product_resolution_v0`: catalog SHA-256 `b53c6f9c1571362d7eac59b899ac6e8dc4453d35270aa8fc6d32304a206b4031`, corpus `a7ff84c5546529c4ab6e4f4dfc52d06c15706c1d26447ba2683b67b0c1c7d66f`.

## Reproducing the checks

After starting the demo stack as described in the [README](../README.md), create the separate test database **once**:

```bash
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml exec -T db createdb -U demo vvln_test
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml run --rm backend python -m pytest tests/ -q
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml exec -T frontend sh -c 'npx tsc --noEmit && npm test && npm run build'
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml exec -T backend python /scripts/check_demo.py
```

The [CI workflow](../.github/workflows/ci.yml) covers migrations, backend tests, TypeScript/Vitest/build and the HTTP demo on disposable services. It has been added to the repository; **it has not been run on GitHub Actions yet**. The equivalent commands were run locally. Never run the downgrade commands or the pytest fixtures against a database you want to keep.

## Review of the thirteen commits

Review of scope and changed files, targeted reading of models/migrations/services/tests, and validation of the cumulative result. This is neither an exhaustive line-by-line audit nor a security certification.

| Commit | Kept contribution / review note |
|---|---|
| `eb9b3b2` | Assets, CPE projections, findings and migrations; matcher limitations documented |
| `3e7f1bc` | Frontend cockpit and lockfile; build/typecheck validated |
| `d427580` | Asset priority and finding combination; dedicated tests kept |
| `1f1cd57` | 50 synthetic BOMs, generator and multi-file import; no real dataset added |
| `298cf68` | Cockpit presentation; Lab path preserved |
| `370d233` | `make dev` only added `--build`; order fixed so migrations run before the first start |
| `32ab2db` | Profiles, presets, jobs and Compare; real demo and tests verified, replay limitations made explicit |
| `2b9fb20` | Former LLM→CPE intent; removed from the active direction |
| `dd891ed` | Documentation realignment; useful invariants recovered, dead documentation removed |
| `9619d6d` | Product Resolution v0; models, catalog, decisions and benchmark present |
| `f531335` | TypeScript compatibility for Compare; type check rerun |
| `a9d0e6d` | Former validation note; superseded by the current evidence |
| `9cd5877` | Embedded catalog and Product validation; tests/API/demo rerun |

The former audit and archive were removed from the active documentation tree after checking that they are tracked at the starting commit. They can be recovered with `git show 9cd5877:docs/AUDIT.md` and `git show 9cd5877:docs/history/PRE_REALIGNMENT.md`. Ingestion invariants are carried over into the [architecture](ARCHITECTURE.md), and reimport/matching/replay limitations into their dedicated documents. The Applicability plan was superseded by the preparation work; none of its features have been started.

## Pre-publication check

351 distinct blobs reachable from local Git refs were checked against private-key signatures, GitHub/AWS/OpenAI/Slack tokens, URLs with passwords, plus a complementary search for sensitive assignments. No confirmed secret was found with these rules. The only URL signal was a Compose interpolation with known development credentials. No private `.env` path, private key, dump or local assistant settings were found in this historical inventory. This check does not detect every possible secret and does not cover unfetched remote refs or unreachable objects.

Demo data is explicitly synthetic; screenshots come only from this stack. `.env*` (except `.env.example`), local assistant configuration, caches, dependencies and builds are excluded from Git; Docker contexts also exclude local secrets and generated files. Local Markdown links and `git diff --check` verified without errors; no cache/build/private setting in the candidate files. Screenshots are the only new intentional binaries. Commit author metadata and the former project name remain in history; no rewrite was performed.

Agent context files (`AGENTS.md`, `CLAUDE.md`, `PLAN.md`) are now local-only and ignored by Git. Their earlier versions remain in the history of the commits above.

Bounded operational changes: frontend install from the lockfile, `make dev` applying migrations before startup, pgAdmin fallback aligned with the `.dev` example, isolated demo stack and CI. No change to business algorithms and no new migration. The display name Harmonia replaces the former titles; databases, packages, import keys and browser storage keep their identifiers for compatibility.

## Limitations and open decisions

- License: AGPL-3.0-only ([LICENSE](../LICENSE)); runtime dependencies checked as permissive (MIT/ISC/BSD/Apache-2.0) and compatible.
- Harmonia name: approved for display; legal availability not verified, to be handled before publication. No third-party logo added.
- Publication: no push, merge, release or tag yet. Choose which refs to publish and accept their author metadata before that step.
- No live check of NVD/EPSS/KEV/EUVD, no load test, no exhaustive dependency audit, no authentication/RBAC or tenant isolation. The prototype must not be presented as a secure production service.
- Python dependencies with lower bounds only and Docker images pinned by tag: future installs are not strictly reproducible. CI will catch regressions, but does not replace a dependency lock.
- Experimental matching, small Product catalog, current-only score data and incomplete reimport history: see [DEMO](DEMO.md), [EVALUATION](EVALUATION.md) and [RESOLUTION](RESOLUTION.md).
