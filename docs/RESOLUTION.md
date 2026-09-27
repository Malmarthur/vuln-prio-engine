# Product Resolution et limites de l’applicabilité

## Product Resolution v0 — implémenté

`Product` est une identité logicielle interne stable, indépendante de sa version observée et de ses CPE éventuels. Un produit peut être résolu sans CPE officiel. Les modèles [product.py](../src/backend/app/models/product.py) persistent Product, aliases, bindings, runs et décisions ; migration additive `d9e0f1a2b3c4`.

Le [resolver pur](../src/backend/app/services/product_resolution.py) compare alias exact, alias/nom canonique normalisé prudemment, puis bindings CPE/purl explicitement catalogués. Il conserve tous les candidats plausibles et retourne `resolved`, `unknown` ou `ambiguous`, sans départager silencieusement un conflit. Les confiances 100/75 sont des niveaux heuristiques, pas des probabilités calibrées.

L’[orchestration](../src/backend/app/services/product_resolution_service.py) charge le catalogue embarqué, persiste une décision par composant avec snapshot, signaux, candidats, versions et empreintes de configuration/catalogue. Les décisions sont ajoutées à chaque run et survivent au remplacement du composant grâce à leur snapshot. Aucun fuzzy matching, validation humaine ou appel LLM n’est implémenté.

Le catalogue opérationnel embarque seulement quatre identités (dont des produits fictifs) : ce v0 démontre le contrat et la traçabilité, pas une couverture logicielle universelle. Le [corpus annoté](../samples/evaluation/product_resolution_v0/) contient cinq cas ; voir [évaluation](EVALUATION.md).

## Matching historique — expérimental et indépendant

[VersionMatcher et CPE](../src/backend/app/services/cpe.py) gèrent parseur CPE partiel, aliases Windows, exact/range/wildcard et quelques équivalences numériques. Le comparateur tokenize chiffres/lettres ; il ne choisit pas une famille de versions et n’expose pas `unknown`.

Le [service findings](../src/backend/app/services/finding_service.py) sélectionne par CPE part/vendor/product en SQL, évalue avec Polars et upsert les matchs composant × vulnérabilité. Les composants sans champs CPE exploitables sont exclus ; les candidats perdants et non-matchs ne sont pas persistés. Ses niveaux de confiance 100/98/95/90/65 sont également heuristiques.

`VulnerabilityProduct` représente les CPE/bornes projetés depuis NVD, pas un Product canonique. L’extraction NVD aplatit les entrées `vulnerable` et ne conserve pas toute la sémantique AND/OR, négations ou prérequis environnementaux. Les sources raw restent consultables. **Une résolution Product réussie ne démontre donc pas l’applicabilité d’une CVE et ne remplace pas ce matcher.**

## Applicability Engine — prévu, non commencé

La cible est : Product canonique + version observée + contrainte normalisée/versionnée → comparateur par famille → `applicable` / `not_applicable` / `unknown`, avec texte source et justification. Les bindings côté vulnérabilité, l’AST, les familles et les configurations composées restent à implémenter. Un format non supporté doit pouvoir rester inconnu.

Cette évolution demandera une nouvelle tranche explicitement autorisée ; le [plan actif](../PLAN.md) concerne la préparation du prototype. Les validations récentes sont dans [READINESS](READINESS.md).
