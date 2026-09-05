# Product Resolution, CPE et applicabilité des versions

Direction canonique du 2026-09-05. Product Resolution v0 est présent de façon additive ; le reste du modèle cible demeure directionnel.

## Le pivot est Product

```text
CVE / advisory → extraction vendor/product/component → Product Resolver
                                                      ↓
                                               Canonical Product
                                                      ↑
Inventory → raw software name → Product Resolver

Canonical Product + version observée + contraintes → Applicability Engine
```

Exemples d’identités : `microsoft/sql_server`, `apache/tomcat`, `postgresql/postgresql`. Le modèle possède un ID interne stable, vendor, nom canonique, aliases, metadata/composants, identifiants externes et bindings CPE. Distinguer identité produit et version observée.

**CPE est externe et optionnel.** Séparer `internal_product_identity`, `official_cpe_binding` et `derived_cpe_name`. Un nom CPE dérivé n’est pas un binding officiel. Le dictionnaire NVD peut contenir absences, doublons, incohérences, dépréciations, erreurs ou noms mal formés. L’absence du dictionnaire n’interdit ni l’existence du Product ni sa résolution. Conserver les CPE comme interopérabilité et evidence, pas comme clé conceptuelle.

## Workflow v0 et évolution souhaitée

Le v0 implémenté s’arrête volontairement aux trois premiers signaux déterministes : alias raw validé, alias/nom canonique normalisé de façon prudente, et binding CPE/purl explicitement catalogué. Il retourne `resolved`, `unknown` ou `ambiguous`, sans tie-break sur conflit. Les décisions persistent le snapshot de composant, candidats/signes versionnés, module, configuration et empreintes catalogue. La confiance 100/75 est une indication heuristique, pas une calibration.

L’évolution souhaitée est :

1. Exact alias match.
2. Normalized string match.
3. External ID / binding CPE connu.
4. Fuzzy candidate retrieval.
5. Si nécessaire, ranking/désambiguïsation LLM d’un petit ensemble de candidats.
6. Sans candidat plausible, proposition d’une nouvelle identité produit.
7. Validation humaine selon risque, seuil et confiance.
8. Mémorisation de l’alias/règle validée avec sa provenance.

Ne jamais forcer un match. Conserver `unknown`, `ambiguous`, candidats, scores et evidence ; versionner resolver et configuration ; permettre replay et validations humaines auditables. Un alias ambigu ne devient pas une règle globale silencieuse. La logique exacte des seuils sera testée plutôt que déclarée certaine.

Évaluer precision/recall, top-1/top-k accuracy, taux d’auto-résolution, de validation humaine, faux matchs, non résolus et régressions entre versions. Les jeux annotés doivent inclure produits sans CPE, homonymes, noms bruités et absence de candidat correct.

## Versions : extraction séparée de la décision

```text
raw version statement → parser ou extraction LLM
                      → normalized constraint AST
                      → version-family comparator
                      → applicable / not applicable / unknown
```

Conserver toujours le texte original et sa source. Exemple : « 9.0.0.M1 through 9.0.80 » peut être extrait en bornes inclusives `9.0.0.M1` et `9.0.80`. Le résultat de comparaison doit venir d’un moteur déterministe compétent pour cette famille, pas du LLM.

Prévoir SemVer, versions éditeurs, build numbers, Cisco-like, Java-like et formats non standards. Un format ou une famille non supportés doit pouvoir rendre `unknown`. Un AST pourra représenter les contraintes composées ; sa forme et les comparateurs sont des travaux futurs, pas un simple renommage des colonnes actuelles.

## Ce qui existe réellement

[models/product.py](../src/backend/app/models/product.py) ajoute `Product`, aliases, bindings, runs et décisions de résolution ; [product_resolution.py](../src/backend/app/services/product_resolution.py) porte le resolver pur et [product_resolution_service.py](../src/backend/app/services/product_resolution_service.py) son orchestration. Le catalogue de démonstration et le corpus de benchmark sont distincts sous [samples/evaluation/product_resolution_v0](../samples/evaluation/product_resolution_v0/). La migration additive est `d9e0f1a2b3c4`.

[cpe.py](../src/backend/app/services/cpe.py) contient un parseur CPE 2.3/URI partiel, quelques aliases Windows en code et `VersionMatcher` : exact, équivalence numérique prudente, bornes inclusives/exclusives et wildcard. Le comparateur de ranges tokenize chiffres/lettres et les compare ; il ne sélectionne pas de famille de versions et n’expose pas `unknown` comme troisième résultat.

[finding_service.py](../src/backend/app/services/finding_service.py) sélectionne les candidats par CPE part/vendor/product en SQL, évalue et déduplique avec Polars, puis upsert les matchs. Les composants sans champs CPE résolus sont exclus. Les non-matchs/candidats perdants ne sont pas persistés. Les valeurs 100/98/95/90/65 sont des niveaux heuristiques, pas des probabilités calibrées.

`VulnerabilityProduct` stocke les CPE et bornes issus de NVD ; il n’est ni un catalogue Product, ni un store d’aliases. L’extraction `aggregator._extract_products` aplatit les entrées `vulnerable` et ne représente pas l’ensemble des opérateurs, négations et prérequis d’environnement des configurations NVD. La source raw reste accessible, mais le matching n’est pas un évaluateur complet de ces configurations.

Conserver ce matcher et ses tests comme baseline expérimentale. La [prochaine tranche](../PLAN.md) introduit la résolution produit traçable de manière additive ; elle ne remplace pas immédiatement l’applicabilité existante.
