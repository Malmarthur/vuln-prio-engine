# Plan d’exécution — Product Resolution v0 traçable

Statut : **implémentation partielle ; validations PostgreSQL/Alembic/API restantes**. Mise à jour le 2026-09-05.

Ce document décrit la seule tranche active de la [roadmap](ROADMAP.md). Il doit être tenu à jour pendant l’implémentation : cocher uniquement les résultats terminés, noter les validations réellement exécutées et reporter immédiatement toute décision qui modifie le périmètre.

## Résultat attendu

À partir des composants CycloneDX déjà importés, VVLN doit produire une identité Product interne stable, indépendante d’un CPE officiel, et expliquer chaque résolution. Le parcours livré est :

```text
composant importé
  → résolution déterministe explicitement déclenchée
  → Product / unknown / ambiguous
  → décision et evidence persistées
  → résultat consultable dans l’API et l’écran Asset
  → qualité mesurée sur un corpus figé
```

Cette tranche établit le pivot Product et étend le Research Lab à un premier module autre que le scoring. Elle ne déclare pas qu’une vulnérabilité est applicable.

## Point de départ confirmé

- `AssetComponent` conserve nom, vendor/product, version, purl, CPE parsé et `raw_component`, mais aucun lien vers une identité Product canonique.
- `VulnerabilityProduct` est une projection des CPE NVD et ne doit pas être renommé ou réutilisé comme Product interne.
- Le matcher actuel travaille sur les CPE et versions ; ses aliases Windows et ses tests restent une baseline expérimentale.
- Le réimport CycloneDX supprime puis recrée les composants. Les décisions liées uniquement par cascade à `AssetComponent` perdraient donc leur valeur historique.
- L’API Asset sérialise déjà les composants ; l’UI les montre dans la ligne Asset dépliée. Ce chemin sera enrichi plutôt que remplacé.
- Les tests DB construisent les tables depuis l’ORM et les détruisent. La migration Alembic devra donc aussi être vérifiée séparément sur une base de test dédiée.

## Invariants de conception

1. Product possède un UUID interne et une clé canonique lisible stable telle que `apache/tomcat`. CPE, purl et autres identifiants restent des bindings externes optionnels.
2. Résoudre un nom ne modifie jamais silencieusement le texte observé. L’entrée normalisée et l’entrée raw restent distinctes.
3. Une décision rend exactement un statut parmi `resolved`, `unknown`, `ambiguous`. `resolved_product_id` est renseigné seulement pour `resolved`.
4. Plusieurs produits peuvent revendiquer le même alias normalisé ou un signal contradictoire. Le schéma ne doit pas empêcher de représenter l’ambiguïté.
5. Une décision est append-only. Elle contient un snapshot suffisant pour rester interprétable après la suppression du composant lors d’un réimport.
6. La confiance v0 est une indication heuristique associée à une méthode documentée, jamais présentée comme une probabilité calibrée.
7. Le resolver est déterministe pour une version, une configuration et un catalogue donnés. Aucun fuzzy matching, LLM ou création automatique de Product par ressemblance dans cette tranche.
8. L’import d’inventaire reste indépendant : la résolution est une étape dérivée explicitement déclenchée. Son échec ne doit pas annuler ou masquer un import CycloneDX réussi.
9. Le matcher d’applicabilité, les IDs d’assets, l’identité actuelle des findings et les scores existants restent inchangés.

## Modèle de données proposé

Les noms définitifs seront validés contre les conventions SQLAlchemy/Alembic existantes avant la migration, mais les responsabilités suivantes sont requises.

### `products`

- `id` UUID interne ;
- `key` canonique unique et stable (`vendor/product`) ;
- `vendor`, `canonical_name`, `metadata` ;
- timestamps de création/mise à jour.

La clé ne dépend ni d’un CPE ni du nom observé. La suppression d’un Product référencé doit être restrictive pendant v0.

### `product_aliases`

- référence au Product ;
- valeurs raw et normalisées de vendor/nom ;
- type d’alias et provenance/validation ;
- timestamps.

L’unicité porte sur un alias au sein d’un Product, pas globalement sur la clé normalisée : deux Products doivent pouvoir devenir candidats du même alias et provoquer `ambiguous`.

### `product_external_bindings`

- référence au Product ;
- type (`cpe`, puis extensible à d’autres identifiants) ;
- valeur raw, champs normalisés utiles et statut/provenance du binding ;
- timestamps.

Un binding CPE officiel/validé est distinct d’un CPE seulement dérivé. Aucun binding n’est obligatoire pour créer ou résoudre un Product.

### `product_resolution_decisions`

- `id`, date de décision et référence au run ;
- référence nullable au composant courant avec `ON DELETE SET NULL` ;
- références nullables à l’Asset et au Product résolu, sans cascade destructive de l’evidence ;
- snapshot de l’asset et du composant : IDs externes, nom, vendor/product, version, purl, CPE et raw utile ;
- empreinte de l’entrée ;
- statut, méthode, confiance et base de confiance ;
- candidats et signaux associés sous une structure versionnée ;
- `module_id`, `module_version`, configuration et empreintes de configuration/catalogue ;
- éventuelle référence à la décision précédente lorsque la même observation est rejouée.

Les candidats doivent contenir les Product IDs/keys et les raisons de sélection. Un nouveau run crée une nouvelle décision : il ne réécrit pas l’explication historique. L’API choisit la décision la plus récente du composant courant.

### `product_resolution_runs`

- `id`, scope demandé et statut du run ;
- `module_id`, `module_version`, configuration et empreinte de configuration ;
- versions/empreintes du catalogue et du schéma de décision ;
- dates de début/fin, compteurs `resolved`/`unknown`/`ambiguous`/erreurs ;
- erreur terminale éventuelle.

Chaque décision référence son run. Cette table garde la provenance des exécutions produit sans détourner `ScoringRun`, qui reste propre au Lab de scoring actuel.

## Contrat du resolver v0

Entrée logique : snapshot d’un composant et catalogue versionné. Sortie : statut, Product éventuel, candidats, méthode, confiance heuristique et evidence de signaux.

Ordre des signaux déterministes :

1. alias raw exact validé ;
2. alias ou nom canonique après normalisation prudente ;
3. binding externe connu, notamment CPE ;
4. purl connu uniquement si le catalogue fournit explicitement ce binding.

La normalisation v0 peut uniformiser casse, espaces et séparateurs clairement équivalents. Elle ne doit pas supprimer des tokens de version/édition au point de confondre des familles différentes. Les règles sont pures, testées et identifiées par la version du module.

Décision :

- aucun candidat plausible → `unknown` ;
- un candidat cohérent entre les signaux disponibles → `resolved` ;
- plusieurs candidats ou contradiction entre signaux forts → `ambiguous`, avec tous les candidats et leurs raisons ;
- aucune préférence silencieuse en cas de conflit alias/CPE.

Le catalogue initial est un petit fichier versionné et relisible, chargé par un service idempotent dans le store. Il couvre des produits représentatifs des samples existants, dont au moins un Product sans binding CPE. Les données de schéma et les données de catalogue ne seront pas confondues dans la migration Alembic.

## Contrat API et UI

Ajouter `POST /api/v1/products/resolution/run`, avec `asset_id` optionnel dans la requête. La réponse retourne l’ID/statut du run, les composants traités, `resolved`, `unknown`, `ambiguous`, erreurs, module/version et empreintes de configuration/catalogue. Le traitement v0 peut rester synchrone et borné ; il ne doit pas réutiliser les jobs de scoring sans contrat commun démontré.

Enrichir chaque composant de la réponse Asset avec sa dernière résolution :

- statut ;
- Product canonique éventuel (`id`, `key`, vendor, nom) ;
- méthode et confiance heuristique ;
- candidats pour `ambiguous` ;
- identifiant/date de décision et version du resolver ;
- raisons essentielles permettant de comprendre le résultat.

Dans `AssetsPanel`, ajouter aux composants « Canonical Product » et « Resolution ». Les états `unknown` et `ambiguous` sont visibles, les candidats et signaux sont consultables, et un composant sans CPE peut apparaître `resolved`. Le bouton de résolution doit distinguer son run d’un import et du matching de findings.

Éviter de charger l’historique complet dans la liste Asset : seule la dernière décision du composant est incluse. L’historique demeure en base et pourra recevoir un endpoint dédié plus tard.

## Surface de code attendue

Cette carte indique les points d’intégration probables ; elle n’impose pas de concentrer tout le domaine dans les fichiers existants.

| Zone | Évolution attendue |
|---|---|
| `src/backend/app/models/` | Nouveau module Product/runs/décisions, exports mis à jour ; relations AssetComponent sans modifier son identité |
| `src/backend/alembic/versions/` | Nouvelle révision additive après `c8d9e0f1a2b3` |
| `src/backend/app/services/` | Catalogue idempotent, normalizer pur, resolver v0 et orchestration persistante |
| `src/backend/app/schemas/` | Product, candidat, dernière décision et résumé de run |
| `src/backend/app/api/` et `main.py` | Route Products enregistrée sous `/api/v1` et enrichissement des réponses Asset |
| `src/backend/app/evaluation/` | Descripteur/registry de module et runner de benchmark, nouveau package limité à l’évaluation |
| `src/backend/tests/` | Tests unitaires resolver/benchmark, intégration persistance/réimport, API et régressions ciblées |
| `samples/evaluation/product_resolution_v0/` | Catalogue de démonstration, corpus annoté et manifestes distincts |
| `src/frontend/src/api/client.ts` | Types et appel du run de résolution |
| `src/frontend/src/components/AssetsPanel.tsx` | Déclenchement, résumé du run et explication par composant |

Si l’implémentation révèle qu’un de ces emplacements contredit une convention existante, noter le changement dans le journal avant de déplacer le périmètre.

## Extension minimale du Research Lab

Créer un contrat de module partagé en code comprenant au minimum `module_id`, `version`, schéma/configuration et fonction d’exécution. Enregistrer `product_resolver` dans une registry en mémoire simple ; ne pas introduire une plateforme de plugins ni une table générique prématurée.

Ajouter un corpus annoté indépendant du catalogue applicatif avec :

- entrées raw et résultat attendu ;
- alias multiples d’un même Product ;
- produit sans CPE ;
- casse, espaces et séparateurs ;
- homonymes/collisions produisant `ambiguous` ;
- signaux contradictoires ;
- aucun candidat correct produisant `unknown` ;
- manifeste avec version, schéma, digest et provenance.

Un runner automatisé émet un rapport JSON contenant au minimum : exactitude sur les cas résolus, coverage, false match rate, `unknown` rate, `ambiguous` rate, top-k candidate accuracy et dénominateur de chaque métrique. Le rapport contient module/version, configuration, digest du catalogue et digest du dataset. À entrée identique, deux exécutions doivent produire le même rapport hors timestamps/durée.

## Ordre d’implémentation

### 1. Contrats, corpus et tests purs

- [x] Définir les types/status et la structure versionnée des candidats/evidence.
- [x] Écrire le normalizer prudent et ses tests de collision/non-collision.
- [x] Créer le petit catalogue v0 et le corpus annoté séparé avec leurs manifestes/digests.
- [x] Écrire les tests du resolver avant son raccordement DB : resolved sans CPE, unknown, ambiguous et conflit de signaux.
- [x] Définir le descripteur de module et enregistrer le resolver v0.

Sortie : le comportement du module est fixé et mesurable sans base de données.

### 2. Persistance additive

- [x] Ajouter les modèles Product, aliases, bindings, runs et décisions, relations et indexes.
- [x] Ajouter une migration Alembic après `c8d9e0f1a2b3`, uniquement additive.
- [x] Mettre à jour les exports de modèles et le nettoyage des fixtures DB.
- [x] Ajouter le chargement idempotent du catalogue versionné hors migration.
- [ ] Tester contraintes, ambiguïtés représentables, décisions append-only et survie après réimport du même asset.

Sortie : le catalogue et l’historique des décisions sont durables sans affecter les tables existantes.

### 3. Service de résolution et orchestration

- [x] Adapter les `AssetComponent` au contrat d’entrée sans modifier leurs champs raw.
- [x] Résoudre un asset ou tous les composants dans des lots bornés et une transaction maîtrisée.
- [x] Persister une décision par composant/run, y compris `unknown` et `ambiguous`.
- [x] Garantir qu’un rerun avec la même version/config/catalogue conserve l’ancienne décision et produit le même résultat logique.
- [x] Ajouter logs opérationnels avec compteurs, sans les présenter comme evidence métier.

Sortie : les composants déjà importés peuvent être résolus et rejoués indépendamment de l’ingestion.

### 4. API et parcours Asset

- [x] Ajouter les schémas Pydantic Product, candidat, décision et résumé de run.
- [x] Ajouter `POST /api/v1/products/resolution/run` et ses erreurs explicites.
- [x] Charger efficacement la dernière décision dans le détail/résultat Asset, sans requête N+1.
- [x] Étendre les types frontend et l’écran Asset avec statuts, Product, candidats, signaux et action de résolution.
- [x] Conserver lisibles les champs CPE actuels comme evidence externe distincte.

Sortie : un utilisateur peut déclencher la résolution et répondre à « pourquoi VVLN pense que ce composant correspond à ce Product ? ».

### 5. Benchmark, régressions et documentation

- [x] Finaliser le runner et vérifier la stabilité du rapport.
- [x] Ajouter les métriques à la documentation du Lab sans les mélanger aux comparaisons de scoring.
- [ ] Exécuter tests unitaires du resolver, tests intégration import/réimport/persistance, tests API et test UI ciblé.
- [ ] Exécuter les régressions pertinentes : matching CPE/version, scoring asset/finding et Compare.
- [ ] Tester la migration `upgrade`, `downgrade` d’une révision puis `upgrade` sur une base de test dédiée contenant des données existantes.
- [x] Exécuter le build frontend et le contrôle TypeScript.
- [x] Mettre à jour [ROADMAP.md](ROADMAP.md), [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/RESOLUTION.md](docs/RESOLUTION.md) et [docs/EVALUATION.md](docs/EVALUATION.md) selon le résultat réel.

Sortie : tranche démontrée, mesurée et documentée ; la roadmap peut décider de la tranche suivante sur preuve.

## Critères d’acceptation

- [ ] Deux aliases validés convergent vers le même Product stable.
- [ ] Au moins un Product sans CPE officiel est résolu.
- [ ] Un cas sans candidat reste `unknown` et une collision reste `ambiguous` avec plusieurs candidats.
- [ ] Un conflit entre un alias et un binding externe ne force aucun match silencieux.
- [ ] Chaque décision expose source raw/snapshot, méthode, candidats, confiance, module/version et configuration/catalogue identifiables.
- [ ] Les décisions antérieures restent interprétables après réimport et après changement de règle/catalogue.
- [ ] Un replay du corpus produit les mêmes décisions et métriques, hors champs non déterministes explicitement exclus.
- [ ] Le rapport fournit qualité, coverage, faux matchs et abstentions avec dénominateurs explicites.
- [ ] Le parcours import → résolution → consultation fonctionne par API et dans l’écran Asset.
- [ ] Les tests de régression confirment que matching, findings, scoring et Compare continuent de fonctionner.

## Hors périmètre

- liaison des descriptions de vulnérabilités au Product canonique ;
- nouveau moteur d’applicabilité ou AST de contraintes de version ;
- modification/consolidation des Findings ;
- résolution d’identité Asset multisource ;
- import scanner CSV ou connecteurs entreprise ;
- fuzzy matching, LLM, validation humaine et création automatique de Product ;
- catalogue produit exhaustif ou interface complète d’administration ;
- Evidence générique couvrant tous les domaines ;
- microservices, graph database, attack paths, RBAC ou multi-tenant.

## Risques à surveiller

- Une normalisation trop agressive augmente les faux matchs ; privilégier l’abstention et mesurer les collisions.
- Un snapshot incomplet rendrait les décisions orphelines illisibles après réimport ; tester explicitement cette séquence.
- Les blobs de candidats doivent avoir un schéma/version et une taille bornée pour ne pas devenir un stockage opaque.
- Charger toutes les décisions avec toutes les listes d’assets créerait un coût inutile ; ne joindre que la dernière décision utile.
- Le catalogue et le corpus d’évaluation doivent rester séparés pour éviter un benchmark circulaire.
- Les tests ORM ne valident pas Alembic ; conserver le contrôle de migration dédié.

## Journal d’avancement

| Date | État | Validation / décision |
|---|---|---|
| 2026-09-05 | Plan rédigé ; implémentation non commencée | Périmètre aligné avec le code, la roadmap et les documents canoniques |
| 2026-09-05 | Implémentation v0 partielle | Noyau déterministe, persistance, API/UI et benchmark ajoutés. `compileall`, benchmark déterministe, `npm run build` et `git diff --check` réussissent. Les tests pytest, DB/Alembic et API n’ont pas tourné : le daemon Docker n’est pas disponible ; `npx tsc --noEmit` échoue sur un `.at()` préexistant dans `ComparisonWorkspace.tsx`. |
| 2026-09-05 | Contrôle frontend rétabli | Correction de compatibilité TypeScript dans Compare ; `npx tsc --noEmit` et `npm run build` réussissent. Les validations PostgreSQL/Alembic/API restent à exécuter sur la base dédiée. |
