# VVLN — roadmap produit

Mise à jour le 2026-09-05. Cette roadmap décrit l’avancement global et l’ordre des phases. Le travail actif est détaillé dans [PLAN.md](PLAN.md). Les anciennes phases 1–15 sont conservées dans [l’archive](docs/history/PRE_REALIGNMENT.md) et ne guident plus le développement.

Statuts : ✅ Implémenté dans le code / terminé pour une tâche documentaire ; ◐ Partiel ; 🧪 Expérimental / implémentation Lab ; ⬜ Non implémenté. « Implémenté » ne signifie pas validé en production. [AUDIT.md](docs/AUDIT.md) fournit les preuves par fichier ; [VISION.md](docs/VISION.md) fixe la direction produit.

## Réalignement documentaire — terminé ✅

- ✅ Inventorier code, modèles/migrations, pipelines, Lab, interfaces, tests, scripts et documentation, y compris les fichiers ignorés et le contexte local des agents.
- ✅ Classer les documents A–D et expliciter les contradictions OLD/CURRENT dans l’audit.
- ✅ Remplacer AGENTS.md, consolider CLAUDE.md et rendre les documents de pilotage visibles par Git.
- ✅ Écrire la vision, le domaine, la résolution Product/CPE, les assets, la couche LLM et l’évaluation ; intégrer le futur attack graph à la vision.
- ✅ Conserver les anciens documents et le Lab ; aucune migration de code métier/DB/UI pendant cette passe.
- ✅ Séparer cette roadmap durable du plan d’exécution de la prochaine tranche.

Validation documentaire : contrôle des liens locaux actifs, des statuts et références au code, des règles Git et du diff. Voir l’audit pour la portée exacte ; aucun résultat historique de test n’est repris comme exécution actuelle.

## Phase 0 — prototype technique privé : en cours

Le socle historique est déjà avancé. L’objectif est de démontrer le cœur Asset ↔ Product ↔ Vulnerability ↔ Finding ↔ Evidence sans repartir de zéro.

| Objectif | Statut actuel | Reste réel |
|---|---|---|
| NVD / EPSS / KEV / EUVD | ✅ Connecteurs, normalisation, upserts, logs, scheduling | Robustesse/qualité continue ; pas d’affirmation de disponibilité externe vérifiée aujourd’hui |
| Asset et inventory | ◐ UUID, contexte, raw et import CycloneDX JSON | Source records multisources, corrélation, autorité par attribut, CSV/JSON génériques |
| Scanner CSV générique | ⬜ | Adapter d’observations scanner et evidence |
| Product, alias/canonicalization store, resolver v0 | ✅ Product Resolution v0 déterministe, persistant et évalué | Catalogue v0 volontairement réduit ; validation humaine/fuzzy/LLM hors périmètre |
| Vulnerability | ◐ Agrégation multi-source sur CVE obligatoire | Identité logique multi-identifiants/advisories non-CVE |
| Contraintes de version et Applicability Engine | 🧪 Exact/range/wildcard déterministes existants | AST, familles, `unknown` et configurations composées |
| Findings / consolidation | ◐ Findings persistés, upsert composant × vulnérabilité | Action Asset × Vulnerability, observations multiples, historique stable |
| Evidence/provenance | ◐ Raw par source/composant et métadonnées de match/scoring | Evidence et décisions de premier rang, versions et liens durables |
| Première stratégie de priorisation | ✅ Scores vulnérabilité/asset/finding et profils configurables | Enrichir contexte et explication, sans reconstruire ce qui existe |
| UI minimale liste/détail/WHY PRIORITY | ◐ Listes, détails, filtres, score et match visibles | Chaîne explicite de raisons et evidence |
| Dataset de test reproductible | ◐ Tests et 50 BOM synthétiques déterministes | Corpus figés annotés, manifestes/versions, résultats attendus d’applicabilité |
| Interface commune, Module Registry, benchmark par module | ⬜ ; 🧪 runs/comparaisons scoring réutilisables | Contrat générique, registry et harness reproductible |

### Ordre des tranches du cœur

Une seule tranche est active à la fois. L’ordre ci-dessous exprime les dépendances, pas des chantiers parallèles :

1. ✅ **Product Resolution v0 traçable** : identité Product, aliases/bindings optionnels, décisions explicables, API/UI et benchmark reproductible. Validé le 2026-09-07 : migration aller-retour, 249 tests backend et 5 tests frontend.
2. **Product côté vulnérabilité et Applicability Engine — active** : relier les descriptions de vulnérabilités au même Product, introduire contraintes normalisées, familles de versions et résultat ternaire.
3. **Observations et consolidation des Findings** : importer un scanner CSV générique, conserver les observations multiples et consolider l’action Asset × Vulnerability.
4. **Evidence et WHY NOW end-to-end** : relier résolution, applicabilité et facteurs de priorité dans une explication consultable.
5. **Asset identity v0** : introduire les source records multisources et une corrélation prudente, seulement après stabilisation du modèle d’observation/evidence.

Les tranches 2–5 seront revalidées à la fin de chaque tranche précédente. Leur ordre peut évoluer sur preuve issue du code, du Lab ou des utilisateurs ; leur périmètre détaillé n’est pas encore un engagement d’implémentation.

## Phase 1 — démonstrateur crédible

Montrer une transformation mesurable : raw observations → résolution et consolidation → findings uniques → contexte et priorisation → petit backlog actionnable.

Acquis : UI Compare, profils et métriques de classement. Restent notamment evidence visible, confidence du resolver, `unknown`/`ambiguous`, validation humaine, comparaison évaluée CVSS baseline vs VVLN, precision/recall/calibration/coverage/coût/régressions et première mesure end-to-end des incertitudes.

## Phase 2 — validation terrain

Conduire des entretiens avec des praticiens du vulnerability management et mesurer leur problème réel. Aucune preuve d’entretiens n’est présente dans le checkout ; le statut terrain devra venir d’éléments externes explicites, pas être inféré du code.

## Phase 3 — design partner

Valider le cœur sur un environnement réel avec un connecteur inventory, un connecteur scanner, sécurité minimale, import/export et auditabilité. Ne pas multiplier les connecteurs avant cette preuve.

## Phase 4 — V1 commercialisable

Après validation de la valeur : RBAC, SSO, audit logs, isolation tenant, secrets, rétention, monitoring, backups, API stabilisée, onboarding, DPA, pentest et autres exigences d’exploitation. L’API REST locale actuelle ne constitue pas cette préparation commerciale.

## Phase 5 — Attack Path Intelligence

Construire le State/Capability graph, les préconditions/postconditions, les contrôles et les chemins. ATT&CK reste une couche d’annotation. Cette phase dépend de la fiabilité du cœur Product/Asset/Finding.

## Phase 6 — Defense Coverage & Recommendations

Introduire DefenseCapability, DefenseDeployment et des recommandations contextualisées qui découlent du graphe et de l’evidence.

Le repository reste privé. Le Research Lab accompagne chaque phase et fournit les preuves de qualité ; il n’est pas remplacé par l’UI produit.
