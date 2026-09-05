# Audit du repository et réalignement documentaire

Date : 2026-09-05. Référence de départ : commit `2b9fb20`, arbre suivi propre avant cette passe. Périmètre : checkout local, pas toutes les branches, volumes Docker ou systèmes externes. La direction canonique vient de la vision fournie par le porteur du projet ; le code décrit l’implémentation. Aucun service externe ni base d’exploitation n’a été interrogé.

## Méthode et inventaire documentaire

Recherche réelle par `rg --files --hidden`, liste des fichiers suivis Git, puis parcours des fichiers y compris ignorés (hors dépendances/Git) par noms Markdown, README, plans, prompts, TODO et instructions agents. Recherche de marqueurs TODO/FIXME/WIP et de termes LLM/research dans le code. Lecture des modèles, services/pipelines, routes, configurations, migrations et tests représentatifs. Pas de dossier `docs/` préexistant, pas d’autre AGENTS.md imbriqué, ni notebook, pipeline d’expérimentation autonome, design doc ou prompt applicatif découvert dans le checkout inspecté.

Classification **avant modification** : A = toujours valide ; B = valide mais incomplet ; C = historique utile non canonique ; D = contradictoire/dangereux comme instruction actuelle. Les fichiers mixtes sont classés par section.

| Fichier trouvé | Classe | Constat et traitement |
|---|---|---|
| `AGENTS.md` | D pour mission/priorités, B pour structure, A pour une partie des invariants ingestion | Présente agrégateur/papier, scoring futur et phase polish ; remplacé par contexte compact canonique |
| `CLAUDE.md` (ignoré) | D/B/A comme AGENTS | Copie quasi identique (seuls titre/introduction diffèrent) ; remplacée par pointeur vers AGENTS |
| `PLAN.md` (ignoré) | C pour phases 1–14 ; D pour direction CPE phase 15 ; A/B pour actifs et principes de revue/évaluation | Préservé intégralement en archive ; nouveau plan avec vrais acquis et phases 0–6 |
| `README.md` | B pour fonctionnement/démarrage ; D pour roadmap LLM→CPE comme pivot ; C pour positionnement papier | Réécrit en entrée produit + capacités actuelles + guide opérationnel |
| `samples/assets/README.md` | A pour catalogue/génération ; B pour portée CPE et résultats attendus | Catalogue conservé, limites expérimentales et pointeurs canoniques ajoutés |
| `.gitignore` | D pour exclusion du contexte partagé | Suppression des exclusions PLAN.md/CLAUDE.md pour transmettre la documentation aux nouveaux clones |
| `.claude/settings.local.json` (ignoré) | A, configuration locale opérationnelle | Permissions locales et statusLine, pas de vision produit ; laissé local et inchangé, contenu non publié |
| `src/backend/.pytest_cache/README.md` (généré/ignoré) | A, hors documentation projet | Notice technique pytest, laissée inchangée |

Autres ressources développeur inspectées : `Makefile`, Dockerfiles, `docker-compose.yml`, `.env.example` (pas les secrets `.env`), configurations Python/Vite/Vitest/TypeScript/Tailwind, scripts Alembic et générateur des samples. Pas de workflow CI versionné trouvé (`.github/workflows`, GitLab CI ou équivalent). Les artefacts `dist`, caches et dépendances ne sont pas des documents canoniques.

Les versions originales de quatre documents sont conservées textuellement dans [history/PRE_REALIGNMENT.md](history/PRE_REALIGNMENT.md), en blocs d’archive, sans fichier AGENTS actif dans un sous-dossier. Les commandes/liens historiques ne sont pas entretenus ni des instructions actuelles.

## Système existant : preuves et limites

| Domaine | Code de référence | État observé |
|---|---|---|
| Runtime | [main.py](../src/backend/app/main.py), [Compose](../docker-compose.yml) | Monolithe FastAPI, SQLAlchemy async, PostgreSQL 16, scheduler APScheduler in-process, React/Vite ; nettoyage de logs/jobs interrompus au démarrage |
| Ingestion | [sources/](../src/backend/app/ingestion/sources), [runner.py](../src/backend/app/ingestion/runner.py), [aggregator.py](../src/backend/app/ingestion/aggregator.py) | NVD paginé/incrémental avec découpage de fenêtres, EPSS paginé, KEV JSON, EUVD paginé ; normalisation Polars, progression et logs |
| Persistence intelligence | [vulnerability_service.py](../src/backend/app/services/vulnerability_service.py) | Upserts par CVE, colonnes appartenant à chaque source, merge JSONB et fallback KEV ; projection des CPE NVD avec bornes |
| Assets | [asset.py](../src/backend/app/models/asset.py), [asset_service.py](../src/backend/app/services/asset_service.py) | UUID, external_id unique, import CycloneDX, contexte exposition/criticité/patch, composants avec CPE/purl/raw ; pas de résolution multisource |
| Produits/applicabilité | [cpe.py](../src/backend/app/services/cpe.py), [finding_service.py](../src/backend/app/services/finding_service.py) | Recherche SQL des candidats CPE et matching Polars, exact/range/wildcard et aliases Windows ; base expérimentale sans Product canonique |
| Findings | [asset.py](../src/backend/app/models/asset.py) | Distincts des CVE, statut et first/last seen, unique composant × vulnérabilité, pas de scanner observations ni consolidation Asset × Vulnerability |
| Scoring/Lab | [scoring_service.py](../src/backend/app/services/scoring_service.py), [profile_service.py](../src/backend/app/services/profile_service.py), [models/scoring.py](../src/backend/app/models/scoring.py) | Scoring à trois étages, profils révisés, presets, jobs/runs, comparaison de distributions/transitions/deltas/Spearman ; voir [EVALUATION.md](EVALUATION.md) |
| API | [api/](../src/backend/app/api) | Vulnérabilités, assets, findings, ingestion, settings, scores, profils/presets, runs/jobs, résultats/résumés/items/historique de comparaisons |
| Frontend | [App.tsx](../src/frontend/src/App.tsx), [components/](../src/frontend/src/components) | Dashboard, Compare, Vulnerabilities, Assets, Findings, Settings ; profils, imports multiples, filtres, détails, progression, empty/loading/error states |
| Tests | [tests/](../src/backend/tests), [vitest.config.ts](../src/frontend/vitest.config.ts) | 23 fichiers backend (unit/integration/API), 3 fichiers frontend (composer/workspace/heatmap). Existence et contenu inspectés ; suites non exécutées pendant cette passe documentaire |
| Datasets/scripts | [samples/assets/](../samples/assets), [Makefile](../Makefile) | 50 BOM JSON synthétiques, générateur Node déterministe ; cibles tests/dev et création/reset de base test |

### Schéma et migrations

Neuf migrations chaînées dans [alembic/versions](../src/backend/alembic/versions), tête déclarée `c8d9e0f1a2b3` : schéma initial → améliorations ingestion → priorité CVE → table de scores séparée → assets/findings → niveaux P → scores assets → profils/contextes/presets/jobs/runs → comparison workspace. Cela décrit les fichiers, pas la révision effectivement appliquée à une base locale.

Tables ORM : `vulnerabilities`, `vulnerability_scores`, `ingestion_logs`, `settings`, `assets`, `asset_components`, `vulnerability_products`, `findings`, `finding_scores`, `asset_scores`, `scoring_profiles`, `scoring_contexts`, `scoring_presets`, `scoring_jobs`, `scoring_runs`. Aucune table Product canonique, SourceRecord, Evidence, ScannerObservation, ModuleRegistry ou AttackGraph.

### Invariants historiques toujours utiles

- Les normalizers utilisent Polars ; les champs complexes sont sérialisés en chaînes JSON dans les DataFrames puis désérialisés avant insert.
- `SOURCE_OWNED_COLUMNS` limite les mises à jour par source ; merge `COALESCE(sources_raw, '{}') || partial_raw` et fallback summary KEV évitent d’écraser les autres sources.
- `sources_raw` conserve la dernière valeur par source, pas l’historique de toutes les observations. EPSS y conserve une représentation minimale.
- Le runner NVD enregistre le début du sync réussi pour l’incrémental ; les plages longues sont découpées en fenêtres.
- Utiliser `TIMESTAMP(timezone=True)` dans SQLAlchemy ; migrations async et URL DB issues de la configuration d’environnement. Reconstruire l’image backend après changement de requirements.

## Contradictions significatives : OLD / CURRENT

| Sujet | OLD | CURRENT |
|---|---|---|
| Mission | Agrégateur CVE pour papier de scoring | Réconciliation Asset/Product/Vulnerability/Finding/Evidence ; Lab comme évaluation sous le produit |
| Avancement | AGENTS : scoring en V2, polish à faire, une migration | Scoring/Compare et polish déjà présents ; neuf migrations. Ne pas reprendre la phase 6 historique |
| Pivot logiciel | README/PLAN : LLM → CPE validé → matcher | Product interne stable, CPE optionnel ; resolver gradué, LLM si ambiguïté seulement |
| Données asset | Un BOM = un asset et external_id comme identité suffisante pour le MVP | Vue sécurité interne corrélant plusieurs source records, autorité par attribut ; code actuel partiel |
| Finding | Déduplication par composant présentée comme MVP accompli | Action cible Asset × Vulnerability avec observations multiples conservées ; l’ancienne unicité reste en code |
| Réimport/idempotence | Ancien plan rapporte idempotence après réimport | Asset réutilisé, composants remplacés ; cascade findings/scores et perte d’identité/historique possible. Pas de continuité démontrée |
| Versions | Ancien plan qualifie le matcher de product-aware/conservateur | Quelques aliases et logique déterministe réels ; pas d’AST/familles/unknown ni sémantique NVD complète |
| Scoring | Ancien plan décrit un unique UPDATE SQL de vulnérabilités | Vulnérabilités calculées par Polars puis remplacement/COPY des scores du profil ; assets/findings via SQL |
| Provenance/replay | Raw et snapshots peuvent suggérer audit complet | Blobs écrasables, configuration snapshotée, watermarks agrégés ; pas de dataset immutable/replay exact |
| EUVD | AGENTS/ancien plan : catch-all renvoyant `[]` | Générateur async paginé ; retour anticipé sur JSON invalide, erreurs HTTP via retries/log de run. `run_all` isole les échecs par source |
| Logging | « Structured logging » présenté comme terminé | Format texte standardisé et accès HTTP, pas journal JSON d’evidence ou audit métier |
| Persistance documentaire | PLAN/CLAUDE locaux ignorés | Documents partagés visibles par Git ; une autorité AGENTS + liens canoniques |

ATT&CK central, remplacement de CMDB ou LLM omniprésent : aucune implémentation correspondante trouvée. Les nouveaux documents les écartent comme directions futures, sans inventer une contradiction historique absente du code.

## Écarts d’architecture à traiter ensuite

1. **Product** : pas d’identité indépendante des CPE ni store de résolution/aliases/candidats versionnés.
2. **Asset** : pas de source records multisources, moteur de corrélation, temporalité des observations ou politique par attribut.
3. **Vulnerability** : agrégation réelle multi-source, mais CVE obligatoire ; pas d’identité advisory générique.
4. **Applicabilité** : range comparator générique, booléen et niveaux fixes ; pas de famille/unknown ni représentation complète de configurations composées. Les composants sans CPE ne sont pas matchés.
5. **Finding** : unicité composant × vulnérabilité, absence d’import scanner et evidence multiple ; réimports destructifs pour les composants/findings, matchs périmés non réconciliés automatiquement par `run_matching`.
6. **Evidence** : pas de chaîne de décisions durable reliant résolution, applicabilité et priorité. Le matcher ne conserve que les matchs gagnants.
7. **Priorité** : première stratégie et UI déjà utiles ; manque WHY NOW fondé sur les décisions, facteurs et provenance, ainsi que contexte métier plus large.
8. **Évaluation** : pas de registry générique ni corpus annoté/snapshot immutable pour chaque module. Profils/runs/comparaisons constituent le socle réutilisable.
9. **LLM, attack graph, defenses, commercialisation** : non implémentés, à phaser. Les logs opérationnels ne remplacent pas audit métier, RBAC ou isolation tenant.

Ces écarts sont des travaux d’évolution, pas une justification de migration globale pendant cet audit. La tranche Product v0 dans [PLAN.md](../PLAN.md) s’appuie sur les composants importés et introduit identité/evidence/évaluation sans remplacer les moteurs actuels.

## Livrables et validation de cette passe

Modifiés : AGENTS.md, README.md, samples/assets/README.md, .gitignore. Réécrits et désormais non ignorés : PLAN.md, CLAUDE.md. Créés : VISION.md, ARCHITECTURE.md, INVENTORY.md, RESOLUTION.md, LLM.md, EVALUATION.md, ce AUDIT.md sous docs/, et history/PRE_REALIGNMENT.md.

Validation : références locales de la documentation active et chaîne de migrations contrôlées statiquement, copies historiques comparées aux originaux, `git diff --check`, visibilité Git de tous les documents partagés et périmètre du diff vérifiés. Aucun fichier métier, migration, fixture JSON ou configuration locale des agents modifié. Aucune base, ingestion, suite de tests, build frontend ou démo navigateur exécuté : cette passe établit l’état du code, pas une certification de fonctionnement runtime. Les « 243 tests », volumes de findings et vérifications UI du plan ancien restent des résultats historiques non revalidés.
