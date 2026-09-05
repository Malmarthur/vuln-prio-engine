# VVLN

VVLN construit une plateforme de vulnerability management centrée sur la réconciliation **Asset ↔ Product ↔ Vulnerability ↔ Finding ↔ Evidence**, puis sur une priorisation contextuelle explicable. Elle s’appuie sur les inventaires, scanners et sources de vulnérabilités existants. Le Research Lab historique reste sa couche d’expérimentation et d’évaluation.

**État actuel :** prototype privé avec agrégation NVD/EPSS/KEV/EUVD, import d’assets CycloneDX, matching CPE/version, findings, scoring configurable à trois niveaux et espace de comparaison. Le Product canonique indépendant du CPE, la résolution asset multisource et l’Evidence de premier rang restent à construire. L’UI et plusieurs identifiants techniques utilisent encore le nom **VulnPrio**.

## Documentation de référence

- [AGENTS.md](AGENTS.md) : point d’entrée des agents et règles de travail.
- [PLAN.md](PLAN.md) : avancement réel, phases 0–6 et prochaine tranche Product Resolution v0.
- [Vision produit](docs/VISION.md) : positionnement et direction future State/Capability graph.
- [Architecture/domaine](docs/ARCHITECTURE.md), [Product/CPE et versions](docs/RESOLUTION.md), [assets/inventory](docs/INVENTORY.md).
- [Architecture LLM](docs/LLM.md) et [Research Lab/évaluation](docs/EVALUATION.md).
- [Audit du code et des anciens documents](docs/AUDIT.md) : preuves, limites et divergences.
- [Archive avant réalignement](docs/history/PRE_REALIGNMENT.md) : historique uniquement, aucune instruction actuelle.

La direction a changé le 2026-09-05 ; le code reste la vérité sur ce qui fonctionne effectivement. Les anciennes phases et la roadmap « LLM → CPE » ne guident plus les développements.

## Stack et structure actuelles

| Couche | Technologie / emplacement |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 async ; `src/backend/app/` |
| Données | PostgreSQL 16, neuf migrations Alembic ; `src/backend/alembic/` |
| Ingestion / calcul | Polars, httpx, APScheduler dans le processus FastAPI |
| Frontend | React 18, Vite, TypeScript, Tailwind ; `src/frontend/` |
| Développement | Docker Compose, pgAdmin ; `docker-compose.yml`, `Makefile` |
| Tests / démo | `src/backend/tests/`, tests Vitest dans le frontend, `samples/assets/` |

## Démarrage local

Prérequis : Docker avec Compose. Créer `.env` seulement s’il n’existe pas déjà, à partir de `.env.example`, puis adapter sa configuration (clé NVD optionnelle).

```bash
cp .env.example .env

# Première installation : schéma avant le démarrage de l’application
# Le lifespan du backend lit les tables de scoring dès son démarrage.
docker compose up -d db
docker compose run --rm backend alembic upgrade head
docker compose up -d
```

Pour une installation déjà migrée : `docker compose up -d`. Lorsqu’une nouvelle migration est ajoutée, l’appliquer avant de démarrer la version du backend qui en dépend. Cette passe documentaire n’ajoute aucune migration.

| Service | Adresse locale | Notes |
|---|---|---|
| Frontend | http://localhost:3000 | Vite, proxy `/api` vers backend |
| API | http://localhost:8000 | `/health`, documentation générée `/docs` et `/openapi.json` |
| pgAdmin | http://localhost:5050 | Avec `.env.example` : admin@vulnprio.dev / admin |
| PostgreSQL | localhost:5432 | Configuration dans `.env` |

Le fallback pgAdmin de Compose est encore `admin@vulnprio.local`, différent de `.env.example`. Utiliser la valeur `.dev` de l’exemple ; le piège `.local` est conservé dans l’historique. Les paramètres du stack sont destinés au développement local, pas à une offre commerciale sécurisée.

Le scheduler d’ingestion est intégré au backend et réglable dans Settings. NVD démarre par une synchronisation complète si aucun watermark n’existe ; les suivantes sont incrémentales. La disponibilité des API externes n’a pas été retestée pendant l’audit documentaire.

## Parcours existant

1. Dans Settings, configurer/déclencher l’ingestion des sources nécessaires.
2. Dans Assets, importer un ou plusieurs fichiers CycloneDX JSON ; un BOM représente un asset, ses composants représentent le logiciel observé. [50 samples synthétiques](samples/assets/README.md) sont fournis.
3. Lancer le matching depuis Findings. Aujourd’hui seuls les composants avec champs CPE exploitables participent ; les matchs ne sont pas une preuve complète d’applicabilité.
4. Configurer et calculer les scores vulnerability/asset/finding dans Dashboard. Consulter les détails et filtres dans les listes.
5. Dans Compare, choisir une référence et des candidats pour comparer profils/presets, distributions, transitions et divergences. Les résumés historiques ne garantissent pas le replay des données d’origine.

Un réimport remplace les composants de l’asset et peut supprimer leurs findings/scores par cascade. Les samples sont une base de démonstration, pas un dataset annoté prouvant les CVE applicables.

## Surface API

Référence précise : routes de [app/api/](src/backend/app/api), schémas Pydantic et OpenAPI généré par le backend en fonctionnement. Toutes les familles ci-dessous ont le préfixe `/api/v1`.

| Famille | Capacités implémentées |
|---|---|
| `/vulnerabilities` | Liste/filtres/tri, stats et détail `/{cve_id}` |
| `/ingestion` | Trigger, cancel, status, logs |
| `/settings` | Lecture et mise à jour `/{key}` |
| `/assets` | Import `/import/cyclonedx`, liste/stats/détail, profil/calcul de scoring |
| `/findings` | Liste/stats, `/match/run`, profil/calcul de scoring ; détails inclus dans les réponses de liste |
| `/scoring` | Profils nommés, presets, clonage/activation, runs/jobs/annulation, comparaisons, résumés/items/historique, endpoints historiques de scoring |

Les profils/stats/listes concernés supportent un contexte de preset ; se référer aux signatures réelles plutôt qu’à une ancienne liste d’endpoints. Aucun endpoint Product Resolver, scanner CSV, Evidence générique ou LLM n’existe encore.

## Développement et vérification

```bash
# Après modification des dépendances backend
docker compose build backend
docker compose up -d backend

# Après modification des dépendances frontend
docker compose build frontend
docker compose up -d frontend

# Logs
docker compose logs -f backend

# Tests unitaires backend (aucune DB touchée par ces tests)
make test-unit

# Créer une base dédiée, puis tests backend incluant intégration/API
make test-db-create
make test

# Frontend
docker compose exec frontend npm test
docker compose exec frontend npm run build
```

`Makefile` propose aussi `test-integration`, `test-api`, `test-cov` et `ARGS=...`. Les commandes de création de DB utilisent les noms locaux par défaut ; les adapter si `.env` change. `TEST_DB_URL` doit toujours désigner une **base de test dédiée** : les fixtures créent les tables via l’ORM, les tronquent après chaque test et les suppriment en fin de session. Elles ne valident donc pas à elles seules la chaîne Alembic.

Le frontend `build` lance Vite ; un contrôle TypeScript séparé peut être exécuté avec `docker compose exec frontend npx tsc --noEmit`. Aucun workflow CI versionné n’a été trouvé. Pour une modification documentaire, vérifier liens, cohérence des statuts et `git diff --check` ; ne pas annoncer des tests runtime non exécutés.
