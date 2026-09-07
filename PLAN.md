# Plan d’exécution — Product côté vulnérabilité et Applicability Engine v0

Statut : **prêt à implémenter**. Mise à jour le 2026-09-07.

Cette tranche est la seule active dans la [roadmap](ROADMAP.md). Elle succède à Product Resolution v0, validé le 2026-09-07 ; son implémentation est dans le commit `9619d6d`, complété par les corrections de validation suivantes. Tenir ce document à jour pendant la tranche : cocher uniquement les résultats terminés et noter les validations réellement exécutées.

## Résultat attendu

À partir d’un `VulnerabilityProduct` issu de NVD et d’un `Product` canonique déjà résolu depuis un composant, VVLN doit représenter explicitement une contrainte de version et produire une décision d’applicabilité :

```text
Product résolu + version observée + contrainte vulnérabilité
  → comparateur déterministe par famille
  → applicable / not_applicable / unknown
  → décision, candidats et evidence persistés
  → résultat consultable sans modifier les Findings historiques
```

Le v0 relie un sous-ensemble explicite des projections CPE NVD au même Product interne. Il ne déclare pas qu’un Finding existant est automatiquement correct et ne remplace pas le matcher CPE/version historique.

## Point de départ confirmé

- `Product`, aliases, bindings, runs et décisions Product sont persistés ; les composants CycloneDX peuvent être `resolved`, `unknown` ou `ambiguous`.
- `VulnerabilityProduct` représente toujours une projection CPE NVD et des bornes de version ; il n’est pas un Product canonique.
- `VersionMatcher` actuel fait des comparaisons exact/range/wildcard mais n’exprime ni famille de versions ni `unknown`.
- Les Findings sont encore uniques par composant × vulnérabilité et restent inchangés durant cette tranche.

## Invariants de conception

1. `Product` reste l’identité partagée ; CPE et `VulnerabilityProduct` demeurent des bindings/projections externes.
2. Une contrainte conserve son texte/source raw, sa forme normalisée versionnée et une famille de comparaison explicite.
3. Toute comparaison retourne exactement `applicable`, `not_applicable` ou `unknown`. Version absente, format non supporté ou contrainte incomplète pertinente donnent `unknown`.
4. Les opérateurs/groupes NVD non représentables ne sont pas aplatis silencieusement en un match.
5. Les décisions sont append-only et explicables : snapshot, contrainte, comparateur/version, candidats, raisons et confiance heuristique.
6. Le chemin historique `Finding`/matching CPE continue de fonctionner inchangé jusqu’à une décision explicite de raccordement ultérieure.
7. Les comparateurs sont déterministes, testés par famille ; aucun LLM, fuzzy matching ou inférence de version ne fait partie du v0.

## Périmètre v0

- Définir un AST réduit : exact, wildcard, intervalle borné et conjonction simple ; versionner son schéma.
- Supporter `numeric_dotted` de manière conservatrice et `opaque` qui rend `unknown`.
- Conserver les configurations NVD composées/non représentables comme `unknown` avec evidence.
- Introduire un binding explicite `VulnerabilityProduct → Product` seulement lorsqu’un catalogue/règle versionnée le justifie ; absence ou collision restent visibles.
- Ajouter de façon additive contraintes normalisées, bindings Product côté vulnérabilité, runs et décisions d’applicabilité.
- Ajouter un endpoint synchrone borné pour rejouer l’applicabilité d’un asset ou composant, et exposer la dernière décision sans charger l’historique complet.
- Enregistrer `applicability_engine` dans la registry et mesurer exactitude par statut, coverage, `unknown`, faux positifs/faux négatifs et dénominateurs.

## Hors périmètre

- remplacement ou consolidation des Findings existants ;
- moteur complet de configurations NVD (négation, OR/AND arbitraires, prérequis environnementaux) ;
- LLM, fuzzy matching, validation humaine ou création automatique de Product ;
- support exhaustif de familles éditeurs, scanner CSV, identity Asset multisource, Evidence générique, attack paths ou RBAC.

## Ordre d’implémentation

### 1. Contrats purs et corpus

- [ ] Définir l’AST/version de schéma, les statuts et l’evidence versionnée.
- [ ] Implémenter les comparateurs purs `numeric_dotted` et `opaque` avec tests de bornes.
- [ ] Créer catalogue de bindings vulnérabilité et corpus annoté distinct avec manifestes/digests.
- [ ] Ajouter le module et le benchmark reproductible à la registry.

### 2. Persistance additive

- [ ] Ajouter modèles, indexes, relations et migration Alembic additive après `d9e0f1a2b3c4`.
- [ ] Charger les bindings versionnés hors migration et tester idempotence/collisions.
- [ ] Persister runs/décisions append-only, y compris `unknown`.

### 3. Orchestration et API/UI minimale

- [ ] Adapter les composants et projections vulnérabilité au contrat sans toucher aux champs raw.
- [ ] Résoudre un asset/composant dans des lots bornés et exposer la dernière décision.
- [ ] Ajouter endpoint, schémas et action/explication Asset ; garder le matcher/Findings clairement séparés.

### 4. Validation et clôture

- [ ] Exécuter tests unitaires, intégration réimport/persistance, API et régressions matching/scoring/Compare.
- [ ] Tester migration upgrade/downgrade/upgrade sur base dédiée contenant des données existantes.
- [ ] Exécuter benchmark stable, contrôle TypeScript, tests/build frontend et `git diff --check`.
- [ ] Mettre à jour roadmap, README, architecture, résolution et évaluation selon les preuves ; préparer la tranche suivante seulement après validation.

## Critères d’acceptation

- [ ] Une vulnérabilité CPE liée explicitement à un Product est comparée à une version observée compatible.
- [ ] Les bornes inclusives/exclusives sont justifiées dans l’evidence.
- [ ] Version absente, famille opaque, collision Product et configuration NVD non représentable restent `unknown`.
- [ ] Une décision expose snapshot, contrainte raw/normalisée, famille, module/version, configuration et raisons.
- [ ] Les décisions antérieures restent interprétables après changement de catalogue ou de règle.
- [ ] Corpus et rapport sont reproductibles et comportent leurs dénominateurs.
- [ ] Le matcher CPE/version et les Findings historiques passent leurs régressions sans changement de sémantique.

## Journal d’avancement

| Date | État | Validation / décision |
|---|---|---|
| 2026-09-07 | Tranche ouverte | Product Resolution v0 clôturé : migration principale appliquée, migration testée aller-retour avec conservation d’un asset, 249 tests backend et 5 tests frontend réussis. |
