# Harmonia

**Un laboratoire intégré pour comprendre comment les stratégies de scoring changent les priorités de remédiation.**

Harmonia croise intelligence de vulnérabilité et contexte des assets, calcule des scores à trois niveaux, puis compare profils et scénarios : distributions, changements de rang, transitions de priorité et divergences. Le projet explore ensuite la réconciliation Asset ↔ Product ↔ Vulnerability ↔ Finding, avec un premier résolveur de produits traçable.

C’est un **prototype**, pas un scanner, une CMDB ni un service prêt pour la production. Le parcours principal est le Lab dans **Dashboard → Compare** ; il fait partie de l’application.

![Comparaison de stratégies Harmonia sur données synthétiques](docs/images/harmonia-compare.png)

## Disponible, expérimental, prévu

| Disponible dans le prototype | Limites |
|---|---|
| Connecteurs NVD, EPSS, KEV, EUVD ; normalisation et stockage PostgreSQL | Dépendance aux API externes ; pas de garantie de disponibilité |
| Import CycloneDX, contexte asset, composants et findings | Réimport remplaçant les composants ; historique incomplet |
| Scoring vulnérabilité / asset / finding, profils révisés, presets et Compare | Comparaison de stratégies, sans preuve de gain métier |
| Product Resolution v0 : aliases, bindings optionnels, décisions, candidats, `unknown` / `ambiguous` | Catalogue réduit, déterministe, confiance heuristique |

**Expérimental :** matching CPE/version et applicabilité des findings. **Prévu, non commencé :** Applicability Engine ternaire. Identité asset multisource, consolidation multiscanner, Evidence générique, LLM et graphes d’attaque ne sont pas implémentés.

## Essayer le Lab

Prérequis : Docker avec Compose. Depuis la racine, cette stack isolée utilise uniquement des fixtures synthétiques, sans clé API ni `.env`. Les ports sont locaux ; sa base est jetable.

```bash
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml build
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml up -d db
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml run --rm backend alembic upgrade head
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml run --rm -e PYTHONPATH=/app backend python /scripts/seed_demo.py
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml up -d backend frontend
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml exec -T backend python /scripts/check_demo.py
```

Ouvrir [Harmonia](http://localhost:13000), puis **Compare → Recent comparisons** et la comparaison préparée. Elle porte sur 6 vulnérabilités inventées, 3 assets et 18 findings. Comparer Balanced à Active Exploitation et Business Impact, puis examiner les divergences. Les identifiants `CVE-2099-*` sont des fixtures, pas des advisories réels.

Le [guide de démonstration](docs/DEMO.md) explique les résultats et le parcours manuel. Le [bilan de validation](docs/READINESS.md) distingue les contrôles exécutés de leurs limites.

Pour supprimer **uniquement cette stack jetable** :

```bash
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml down -v
```

## Développement avec sources réelles

Créer `.env` à partir de `.env.example` s’il n’existe pas, adapter les valeurs puis lancer `make dev` : build, démarrage PostgreSQL, migrations, puis application. Interface sur [localhost:3000](http://localhost:3000), API/OpenAPI sur [localhost:8000/docs](http://localhost:8000/docs). Les réglages Compose sont destinés au développement local.

Configurer les ingestions dans Settings. La première synchronisation NVD peut être longue. Importer les [BOM synthétiques](samples/assets/README.md) dans Assets, résoudre les produits, lancer le matching dans Findings, puis calculer/comparer les scores. Le nombre de findings dépend des données ingérées ; une identité Product résolue n’alimente pas encore un moteur d’applicabilité complet.

## Architecture et vérification

FastAPI / SQLAlchemy async / PostgreSQL 16 / Alembic, Polars pour normalisation et scoring, APScheduler dans le backend ; React 18 / Vite / TypeScript / Tailwind. Le monolithe permet d’expérimenter sans infrastructure distribuée.

- [Architecture et invariants d’ingestion](docs/ARCHITECTURE.md)
- [Résolution Product et limites CPE/version](docs/RESOLUTION.md)
- [Inventory et comportement du réimport](docs/INVENTORY.md)
- [Lab, métriques et limites scientifiques](docs/EVALUATION.md)
- [Commandes de validation et revue des commits](docs/READINESS.md)
- [Vision](docs/VISION.md), [roadmap](ROADMAP.md), [seul plan actif](PLAN.md), [instructions assistants](AGENTS.md)

La CI vérifie migrations sur PostgreSQL dédié, tests backend, TypeScript, Vitest et build. Les fixtures DB tronquent/suppriment leurs tables : ne jamais les pointer vers une base à conserver. Les dépendances backend ont des bornes minimales, sans verrouillage complet ; une installation future peut donc résoudre d’autres versions.

Le nom de présentation est **Harmonia**. Les noms techniques `vulnprio`/`vvln` (packages, bases, clés d’import et stockage navigateur) sont conservés pour compatibilité. La licence sera choisie ultérieurement ; la disponibilité juridique du nom reste à vérifier avant publication.
