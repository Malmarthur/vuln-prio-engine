# Research Lab et évaluation

Le laboratoire historique est la future couche d’évaluation de VVLN, à préserver. État vérifié par lecture du code le 2026-09-05 ; les résultats d’anciennes sessions conservés en archive ne sont pas des tests relancés aujourd’hui.

## Où se trouve le Lab actuel

Il n’existe pas de dossier Research Lab séparé dans ce checkout. Ses capacités sont intégrées à l’application :

| Actif | Emplacement et comportement |
|---|---|
| Moteurs de scoring | [scoring_service.py](../src/backend/app/services/scoring_service.py) (Polars + bulk COPY), [asset_service.py](../src/backend/app/services/asset_service.py), [finding_service.py](../src/backend/app/services/finding_service.py) (calculs SQL) |
| Profils et scénarios | [models/scoring.py](../src/backend/app/models/scoring.py) : profils vulnerability/asset/finding révisés, contextes, presets |
| Exécutions/comparaisons | [profile_service.py](../src/backend/app/services/profile_service.py) : jobs async, progression, annulation, runs, snapshots de configuration, watermarks, stale/inconsistent |
| Interface expérimentale | [DashboardPanel.tsx](../src/frontend/src/components/DashboardPanel.tsx), [ProfileManager.tsx](../src/frontend/src/components/ProfileManager.tsx), [comparison/](../src/frontend/src/components/comparison) : composer baseline/candidats, distributions, heatmap, divergences, historique |
| Fixtures et vérification | [tests backend](../src/backend/tests), trois fichiers de tests frontend de comparaison, [50 BOM synthétiques et générateur](../samples/assets/README.md) |

Les presets intégrés Balanced, Active Exploitation et Business Impact sont cloneables ; le preset actif est distinct du choix des candidats comparés. Les scores persistent par profil ou contexte, avec révision et référence de run. Les anciennes API de scoring restent des adapters vers le preset actif.

Les comparaisons mesurent distributions, transitions de niveaux, promotions/démotions, deltas de score/rang et corrélation de Spearman. Le détail des divergences dispose de recherche, filtres et pagination. Ces métriques comparent des stratégies ; elles ne prouvent pas la justesse des findings ou le gain métier sans ground truth.

## Limites scientifiques actuelles

- Les snapshots concernent la **configuration**, pas un dataset immutable. Les watermarks utilisent counts et dates maximales ; ils détectent certaines évolutions sans identifier cryptographiquement toutes les entrées.
- Les tables de scores contiennent les résultats courants par profil/contexte. Un recalcul peut remplacer les lignes utilisées par une comparaison ; ses résumés persistent, mais le détail peut expirer. Le rerun utilise les données courantes, pas un replay garanti du passé.
- Les jobs vivent dans le processus FastAPI ; au redémarrage les jobs interrompus sont marqués failed. Ce n’est pas une file distribuée ni une reprise exacte.
- `priority_confidence` représente principalement la disponibilité pondérée des données ; `match_confidence` est heuristique. Aucune calibration empirique générale n’est établie.
- Le catalogue synthétique possède un générateur déterministe mais pas de vérité terrain complète sur les vulnérabilités applicables. Le nombre de findings dépend aussi des données NVD ingérées.
- Le registry en mémoire ne couvre pour l’instant que `product_resolver` v0 ; il n’existe pas de plateforme de plugins, d’évaluation ML/LLM/prompts ou de benchmark générique universel. Tests logiciels et benchmark scientifique sont complémentaires.

## Contrat cible et adaptation progressive

```text
EvaluationRun {
  module_id, module_version,
  configuration,
  dataset_id, dataset_version / digest,
  input_refs, output_refs,
  result, metrics, provenance
}
ModuleResult {
  result / status, confidence, candidates,
  evidence, module_id / version
}
```

Versionner les schémas, résolveurs, algorithmes, modèles, prompts et stratégies pertinents. Conserver les entrées/résultats nécessaires au replay, les annotations et leur provenance ; distinguer corpus de développement et corpus d’évaluation. Les décisions humaines peuvent enrichir le dataset, avec traçabilité des changements.

Le Module Registry décrira progressivement contrats, versions et configurations. Ne pas transformer automatiquement `ScoringProfile` en registry universel : une configuration révisée n’est pas la version du code exécuté. Adapter les moteurs historiques derrière un contrat commun seulement lorsque cela sert une tranche mesurable.

| Module | Évaluations attendues |
|---|---|
| Asset Identity Resolution | Qualité des liens, faux merges/splits, abstentions ; corpus et métriques distincts du produit |
| Product Resolver | Precision/recall, top-1/top-k, auto-résolution, revue humaine, faux matchs, non résolus, régressions |
| Applicabilité | Décisions correctes par famille/version/borne, coverage, unknown, faux positifs/négatifs |
| Consolidation | Observations correctement regroupées, faux merges/splits, conservation d’evidence |
| Priorité | Baseline CVSS vs VVLN, backlog actionnable, pertinence métier et explications, deltas existants |
| ML/LLM/prompts | Qualité, calibration, coverage, coût, latence, régressions et politique de données |

La phase 1 doit ajouter une première mesure end-to-end des incertitudes. Ne pas multiplier arbitrairement les confidences des étapes comme si elles étaient des probabilités indépendantes.

Le premier module enregistré est `product_resolver` v0 : son runner produit exactitude des résolutions, coverage, faux matchs, taux `unknown`/`ambiguous` et top-k avec dénominateurs. Catalogue et corpus JSON distincts sont sous `samples/evaluation/product_resolution_v0/`; le rapport porte leurs digests. Le module a été validé avec la tranche v0 le 2026-09-07. Voir [PLAN.md](../PLAN.md) pour le prochain module Applicability Engine.
