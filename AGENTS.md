# VVLN — contexte des agents

## Mission et autorité

VVLN construit une couche de réconciliation et d’intelligence sécurité au-dessus des inventaires, scanners et sources de vulnérabilités : **Asset ↔ Product ↔ Vulnerability ↔ Finding ↔ Evidence**, puis priorisation contextuelle explicable. Le Research Lab historique devient la couche d’évaluation du produit ; il doit être préservé.

La vision canonique a été révisée le **2026-09-05**. Hiérarchie : instructions actuelles de l’utilisateur → documentation canonique pour la direction produit → code pour ce qui est implémenté → documents historiques comme contexte seulement. Un écart code/cible n’est pas automatiquement un bug ni une autorisation de refonte.

Lire au début d’une session :

1. [ROADMAP.md](ROADMAP.md) : avancement produit réel et ordre des phases.
2. [PLAN.md](PLAN.md) : plan d’exécution de la seule tranche active.
3. [Vision](docs/VISION.md) et [architecture](docs/ARCHITECTURE.md) : invariants et cible.
4. [État du code et audit documentaire](docs/AUDIT.md) : preuves, limites, contradictions.
5. Selon la tâche : [Product/CPE et versions](docs/RESOLUTION.md), [assets/inventory](docs/INVENTORY.md), [LLM](docs/LLM.md), [Research Lab](docs/EVALUATION.md).

[README.md](README.md) fournit le démarrage et les commandes. [L’archive](docs/history/PRE_REALIGNMENT.md) n’est jamais une liste de travaux à exécuter. CLAUDE.md pointe ici pour éviter deux contextes concurrents.

## Invariants

- **Asset ≠ source record** : identité interne de corrélation avec liens vers les sources. VVLN ne remplace pas la CMDB. Autorité par attribut : vérité organisationnelle, observée, dérivée.
- **Product ≠ CPE** : identité logicielle interne stable, aliases, identifiants externes et bindings CPE optionnels. Un produit peut exister sans CPE officiel.
- **Vulnerability ≠ Finding** : vulnérabilité logique versus application potentielle/effective à un asset/produit. La cible consolide l’action Asset × Vulnerability et conserve les observations multiples.
- **Evidence en premier rang** : source/raw, méthode, version, candidats, confiance, décision humaine ; expliquer résolution, applicabilité et priorité. Ne pas se limiter à `match=true`.
- Asset Identity Resolution et Product Identity Resolution sont des moteurs et évaluations distincts. Ne jamais forcer un rapprochement ; conserver `unknown`, `ambiguous` et les candidats.
- Déterministe dès que possible, LLM pour ambiguïté linguistique/sémantique. Les contraintes de version sont évaluées par du code adapté à la famille de versions ; format inconnu → `unknown`.
- LLM via une couche de tâches indépendante des providers, sortie structurée/versionnée, désactivable selon politique. Une CVE = une unité d’inférence indépendante ; batch de requêtes atomiques. Pas de dépendance à l’envoi d’une CMDB client à un provider externe.
- Versionner modules, algorithmes, configurations, modèles, prompts, schémas et datasets pertinents. Prévoir evidence, replay et benchmark pour les modules approximatifs.
- Les futurs chemins d’attaque reposent sur un graphe interne **State/Capability**, ATT&CK étant une annotation. Ils viennent après validation du cœur.

## Existant à respecter

Monolithe FastAPI / SQLAlchemy async / PostgreSQL 16 / Alembic ; Polars ; APScheduler dans le backend ; React 18 / Vite / TypeScript / Tailwind ; Docker Compose. `VulnPrio` reste le nom dans l’UI, les packages et certaines propriétés d’import : ne pas les renommer en masse.

Déjà présents : ingestion NVD/EPSS/KEV/EUVD, import CycloneDX, assets/composants, matching CPE/version, findings, scores vulnérabilité/asset/finding, profils révisés, presets, jobs et comparaisons. Le Lab est dans les services de scoring et l’UI Compare, pas dans un dossier autonome.

Encore absents : Product canonique/store d’aliases, résolution asset multisource, Evidence générique, consolidation multiscanner, registry/benchmark générique, couche LLM. Le matcher actuel est une base expérimentale, pas une preuve complète d’applicabilité.

## Règles de travail

- Inspecter les modèles, services, migrations et tests concernés avant de changer le code. Préserver les pipelines, fixtures, résultats et fonctionnalités du Lab.
- Avancer par une tranche verticale testable ; migrations additives justifiées. Pas de refonte globale, microservices, CMDB enterprise, DSL géant, dix connecteurs ou attack paths anticipés.
- **Tenir PLAN.md à jour immédiatement** pendant une tranche : marquer ✅ ce qui est terminé avec validation et préciser les limites. À la fin, actualiser ROADMAP.md avec l’état réel et créer le plan de la tranche suivante. Ne pas remettre TODO une capacité existante ; utiliser Implémenté / Partiel / Expérimental / Non implémenté.
- Maintenir les documents canoniques concernés ; archiver clairement les décisions remplacées. Les nouveaux fichiers partagés doivent être visibles par Git.
- Conserver la propriété des colonnes par source, le merge `sources_raw` et le fallback KEV ; voir l’audit. Ne pas présenter ces blobs comme un historique immutable.
- Tester proportionnellement au changement et rapporter ce qui a effectivement tourné. Les tests DB tronquent/suppriment leurs tables : utiliser exclusivement une base de test dédiée.
- Ne pas exposer `.env` ou les paramètres locaux des agents. Le repository reste privé ; cette documentation n’autorise aucune publication.
