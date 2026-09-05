# VVLN — plan actuel

Mis à jour le 2026-09-05. Ce plan remplace les anciennes phases 1–15, conservées dans [l’archive](docs/history/PRE_REALIGNMENT.md). La nouvelle phase 0 ne signifie pas repartir de zéro. [AUDIT.md](docs/AUDIT.md) fournit les preuves par fichier ; [VISION.md](docs/VISION.md) fixe la direction.

Statuts : ✅ Implémenté dans le code / terminé pour une tâche documentaire ; ◐ Partiel ; 🧪 Expérimental / implémentation Lab ; ⬜ Non implémenté. « Implémenté » ne signifie pas validé en production. Mettre les statuts et la prochaine tranche à jour dès qu’un travail est terminé, en indiquant sa validation.

## Passe documentaire — terminée ✅

- ✅ Inventorier code, modèles/migrations, pipelines, Lab, interfaces, tests, scripts et documentation, y compris fichiers ignorés et contexte local des agents.
- ✅ Classer les documents A–D et expliciter OLD/CURRENT dans l’audit.
- ✅ Remplacer AGENTS.md, consolider CLAUDE.md et rendre PLAN.md/CLAUDE.md visibles par Git.
- ✅ Écrire la vision, le domaine, la résolution Product/CPE, les assets, la couche LLM et l’évaluation ; intégrer le futur attack graph à la vision.
- ✅ Conserver les anciens documents et le Lab ; aucune migration de code métier/DB/UI.
- ✅ Définir une prochaine tranche cohérente, sans commencer sa réalisation.

Validation documentaire : contrôle des liens locaux actifs, des statuts et références au code, des règles Git et du diff. Voir l’audit pour la portée exacte ; aucun résultat historique de test n’est repris comme exécution actuelle.

## Phase 0 — prototype technique privé : en cours, socle déjà avancé

| Objectif | Statut actuel | Reste réel |
|---|---|---|
| NVD / EPSS / KEV / EUVD | ✅ Connecteurs, normalisation, upserts, logs, scheduling | Robustesse/qualité continue ; pas d’affirmation de disponibilité externe vérifiée aujourd’hui |
| Asset et inventory | ◐ UUID, contexte, raw et import CycloneDX JSON | Source records multisources, corrélation, autorité par attribut, CSV/JSON génériques |
| Scanner CSV générique | ⬜ | Adapter d’observations scanner et evidence |
| Product, alias/canonicalization store, resolver v0 | ⬜ ; 🧪 aliases CPE Windows en code | Identité indépendante du CPE, décisions et store |
| Vulnerability | ◐ Agrégation multi-source sur CVE obligatoire | Identité logique multi-identifiants/advisories non-CVE |
| Contraintes de version et Applicability Engine | 🧪 Exact/range/wildcard déterministes existants | AST, familles, unknown et configurations composées |
| Findings / consolidation | ◐ Findings persistés, upsert composant × vulnérabilité | Action Asset × Vulnerability, observations multiples, historique stable |
| Evidence/provenance | ◐ Raw par source/composant et métadonnées de match/scoring | Evidence et décisions de premier rang, versions et liens durables |
| Première stratégie de priorisation | ✅ Scores vulnérabilité/asset/finding et profils configurables | Enrichir contexte et explication, sans reconstruire ce qui existe |
| UI minimale liste/détail/WHY PRIORITY | ◐ Listes, détails, filtres, score et match visibles | Chaîne explicite de raisons et evidence |
| Dataset de test reproductible | ◐ Tests et 50 BOM synthétiques déterministes | Corpus figés annotés, manifestes/versions, résultats attendus d’applicabilité |
| Interface commune, Module Registry, benchmark par module | ⬜ ; 🧪 runs/comparaisons scoring réutilisables | Contrat générique, registry et harness reproductible |

## Phases suivantes — direction, pas backlog à lancer en parallèle

| Phase | Objectif / condition de passage | Acquis et limites |
|---|---|---|
| 1 — Démonstrateur crédible | Montrer raw observations → résolution/consolidation → findings uniques → contexte → petit backlog actionnable | UI Compare et métriques de classement existent ; evidence complète, confidence resolver, unknown/ambiguous, validation humaine, comparaison évaluée CVSS vs VVLN, precision/recall/calibration/coverage/coût/régressions et incertitude end-to-end restent à construire |
| 2 — Validation terrain | Entretiens avec praticiens VM, mesurer le pain | Aucune preuve d’entretiens dans le checkout ; statut terrain à confirmer, pas inféré du code |
| 3 — Design partner | Un environnement réel, un vrai connecteur inventory et un scanner, sécurité minimale, import/export, auditabilité | Non implémenté dans ce checkout ; ne pas multiplier les connecteurs |
| 4 — V1 commercialisable | Après valeur prouvée : RBAC, SSO, audit logs, isolation tenant, secrets, retention, monitoring, backups, onboarding, DPA, pentest… | API REST locale déjà présente ; préparation commerciale/sécurité multi-tenant absente |
| 5 — Attack Path Intelligence | State/Capability graph, annotations ATT&CK, préconditions/postconditions, contrôles et chemins | Direction long terme, non implémentée |
| 6 — Defense Coverage & Recommendations | Catalogue DefenseCapability, DefenseDeployment et recommandations contextuelles | Direction long terme, non implémentée |

Le repository reste privé. Le Lab accompagne chaque phase ; il n’est pas remplacé par l’UI produit.

## Prochaine tranche unique proposée — Product Resolution v0 traçable

**But :** à partir des noms/versions/raw déjà importés via CycloneDX, obtenir une identité Product interne indépendante du CPE, une décision consultable et une évaluation reproductible. Utiliser l’API/détail asset existants pour rendre la transformation observable. Cette tranche est proposée, non commencée.

Périmètre cohérent :

1. Ajouter Product, aliases validés et bindings CPE optionnels ainsi qu’un enregistrement de décision de résolution contenant référence/source raw figée, méthode, candidats, statut, confiance, resolver/version et configuration. L’evidence doit rester interprétable après un réimport, même si l’ancien composant disparaît.
2. Ajouter un resolver déterministe v0 (alias exact, normalisation prudente, binding connu). Ne pas inventer une nouvelle identité automatiquement sur simple ressemblance ; les produits initiaux/aliases viennent d’un corpus validé. Conserver `unknown` et `ambiguous` ; pas de LLM/fuzzy obligatoire dans cette tranche.
3. Raccorder de façon additive les composants déjà importés au résultat, exposer le résultat et ses raisons dans le détail asset/API. Les produits sans CPE doivent pouvoir être résolus.
4. Fournir un petit contrat de module versionné, une entrée registry minimale pour ce resolver et un benchmark à corpus figé (entrées, annotations, version/digest, configuration, résultats, métriques). Conserver les comparaisons scoring et leur baseline existante.

Critères d’acceptation :

- Deux noms/aliases connus convergent vers le même Product stable ; un CPE officiel absent n’empêche pas ce résultat.
- Un cas inconnu reste unknown ; une collision conserve plusieurs candidats et reste ambiguous. Aucun faux match forcé dans le corpus contrôlé.
- Chaque résolution justifie source, méthode, version et candidats ; un changement de règle produit une nouvelle décision traçable et reste comparable à l’ancienne.
- Un replay du même corpus/configuration/version produit les mêmes décisions ; le rapport donne qualité, coverage, taux de faux matchs et d’abstention, avec dénominateurs explicites.
- Tests d’intégration sur import → résolution → consultation et tests de régression sur import/CPE/scoring/Compare pertinents ; migration additive testée sur base dédiée.

Frontière : ne pas modifier dans cette tranche l’identité des findings, le matcher d’applicabilité courant, les IDs d’assets, ni construire un nouveau système d’inventaire, un LLM, des connecteurs entreprise ou un graphe d’attaque. Résoudre un Product ne déclare pas une CVE applicable. Le raccordement côté vulnérabilité et l’applicabilité fondée sur Product viendront dans une tranche suivante, après mesure de cette brique.
