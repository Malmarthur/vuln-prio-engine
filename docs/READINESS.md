# Préparation GitHub / CV — Harmonia

État au **2026-09-27**. Préparation locale pour revue, aucune publication effectuée. Départ vérifié : `feat/assets` et HEAD sur `9cd5877`, arbre propre, **13 commits devant main**. Les changements de préparation sont sur `codex/github-readiness`, sans réécriture de ces commits.

## Validations exécutées

| Contrôle | Résultat et portée |
|---|---|
| Installation Docker | Images backend et frontend construites depuis ce worktree ; Python 3.12.14, PostgreSQL 16, Node 20. Dépendances frontend installées par `npm ci` |
| Migrations sur base vide | Dix migrations : `upgrade head → downgrade base → upgrade head` réussis sur `vvln_demo` jetable |
| Dernière migration avec données | `d9e0f1a2b3c4 → c8d9e0f1a2b3 → head` ; 6 vulnérabilités, 3 assets et 18 findings conservés. Les tables Product sont supprimées par ce downgrade, comme prévu ; résolution rejouée après upgrade |
| Backend | **249 tests réussis** sur `vvln_test`, base exclusivement dédiée ; 8 avertissements de dépréciation SQLAlchemy sur `DISTINCT ON` |
| Frontend | **5 tests / 3 fichiers réussis**, `npx tsc --noEmit` et `npm run build` réussis ; avertissement Browserslist sur l’ancienneté de sa base |
| Renommage de présentation | API reconstruite, test health repassé ; TypeScript/build repassés, réponse health `Harmonia` vérifiée dans la démo |
| Démo HTTP | Résolution de 3 composants, 18 matchs, job réel de comparaison de 3 presets, résumés/détails accessibles et cohérents ; rejouée après le rollback |
| Démo navigateur | Dashboard chargé, comparaison lancée depuis Compare et terminée à 100 %, distributions/rangs affichés ; captures réelles dans le guide |
| Benchmark Product v0 | 5 cas : 2 resolved, 1 unknown, 2 ambiguous ; exactitude 2/2 sur les résolutions attendues, coverage 2/5, faux matchs 0/5. Pas de preuve de généralisation |

Les migrations et tests ont utilisé la stack isolée `compose.demo.yml`, sans lecture du `.env` local, sans base existante et sans ingestion réelle. Le test de migration complète porte sur une base vide ; le test avec données porte uniquement sur la dernière migration. Aucun résultat ancien n’est utilisé comme preuve actuelle.

Le benchmark a utilisé le catalogue et corpus sous `samples/evaluation/product_resolution_v0` : catalogue SHA-256 `b53c6f9c1571362d7eac59b899ac6e8dc4453d35270aa8fc6d32304a206b4031`, corpus `a7ff84c5546529c4ab6e4f4dfc52d06c15706c1d26447ba2683b67b0c1c7d66f`.

## Reproduire les contrôles

Après démarrage de la stack de démonstration selon le [README](../README.md), créer **une fois** la base de tests séparée :

```bash
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml exec -T db createdb -U demo vvln_test
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml run --rm backend python -m pytest tests/ -q
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml exec -T frontend sh -c 'npx tsc --noEmit && npm test && npm run build'
docker compose --env-file /dev/null -p vvln-review -f compose.demo.yml exec -T backend python /scripts/check_demo.py
```

La [CI](../.github/workflows/ci.yml) reprend migrations, tests backend, TypeScript/Vitest/build et démonstration HTTP sur des services jetables. Elle est ajoutée au dépôt ; **aucune exécution GitHub Actions distante n’a été faite**. Les commandes correspondantes ont été exécutées localement. Ne jamais appliquer les commandes de downgrade ou les fixtures pytest à une base à conserver.

## Revue des treize commits

Revue du périmètre et des fichiers modifiés, lecture ciblée des modèles/migrations/services/tests et validation du résultat cumulé. Il ne s’agit pas d’un audit exhaustif de chaque ligne ni d’une certification de sécurité.

| Commit | Contribution conservée / point de revue |
|---|---|
| `eb9b3b2` | Assets, projections CPE, findings et migrations ; limites du matcher documentées |
| `3e7f1bc` | Cockpit frontend et lockfile ; build/typecheck validés |
| `d427580` | Priorité asset et combinaison finding ; tests dédiés conservés |
| `1f1cd57` | 50 BOM synthétiques, générateur et import multiple ; aucun dataset réel ajouté |
| `298cf68` | Présentation du cockpit ; parcours Lab conservé |
| `370d233` | `make dev` ajoutait seulement `--build` ; ordre corrigé pour appliquer les migrations avant le démarrage initial |
| `32ab2db` | Profils, presets, jobs et Compare ; démo réelle et tests vérifiés, limites de replay explicitées |
| `2b9fb20` | Ancienne intention LLM→CPE ; retirée de la direction active |
| `dd891ed` | Réalignement documentaire ; invariants utiles récupérés, documentation morte retirée |
| `9619d6d` | Product Resolution v0 ; modèles, catalogue, décisions et benchmark présents |
| `f531335` | Compatibilité TypeScript de Compare ; contrôle TypeScript repassé |
| `a9d0e6d` | Ancienne note de validation ; remplacée par les preuves actuelles |
| `9cd5877` | Catalogue embarqué et validation Product ; tests/API/démo repassés |

L’ancien audit et l’archive ont été retirés de l’arbre documentaire actif après vérification qu’ils sont suivis au commit de départ. Récupération possible par `git show 9cd5877:docs/AUDIT.md` et `git show 9cd5877:docs/history/PRE_REALIGNMENT.md`. Les invariants d’ingestion sont repris dans [architecture](ARCHITECTURE.md), les limites réimport/matching/replay dans leurs documents spécialisés. Le plan Applicability a été remplacé par le seul plan de préparation ; aucune de ses fonctionnalités n’a été commencée.

## Contrôle avant publication

351 blobs distincts accessibles par les références Git locales ont été contrôlés par signatures de clés privées, tokens GitHub/AWS/OpenAI/Slack, URL avec mot de passe et recherche complémentaire d’assignations sensibles. Aucun secret confirmé trouvé avec ces règles. Le signal URL identifié était une interpolation Compose avec identifiants de développement connus. Aucun chemin `.env` privé, clé privée, dump ou paramètre local d’assistant n’a été trouvé dans cet inventaire historique. Ce contrôle ne détecte pas tous les secrets possibles et ne couvre ni refs distantes non récupérées ni objets inaccessibles.

Les données de démonstration sont explicitement synthétiques, les captures proviennent uniquement de cette stack. `.env*` (sauf `.env.example`), configurations locales d’assistants, caches, dépendances et builds sont exclus de Git ; les contextes Docker excluent également les secrets locaux et fichiers générés. Liens Markdown locaux et `git diff --check` vérifiés sans erreur ; aucun cache/build/paramètre privé dans les fichiers candidats. Les captures sont les seuls nouveaux binaires intentionnels. Les métadonnées auteur des commits et l’ancien nom restent dans l’historique ; aucune réécriture effectuée.

Changements opérationnels bornés : installation frontend via lockfile, `make dev` appliquant les migrations avant démarrage, fallback pgAdmin aligné sur l’exemple `.dev`, stack de démonstration isolée et CI. Aucun changement des algorithmes métier ni nouvelle migration. Le nom visible Harmonia remplace les anciens titres ; bases, packages, clés d’import et stockage navigateur conservent leurs identifiants pour compatibilité.

## Limites et décisions restantes

- Licence : **reportée explicitement par l’utilisateur**, aucun fichier de licence ajouté.
- Nom Harmonia : validé pour la présentation ; disponibilité juridique non vérifiée, à traiter avant publication. Aucun logo tiers ajouté.
- Publication : autorisation séparée requise ; aucun push, merge, release ou tag. Choisir les références à publier et accepter leurs métadonnées auteur avant cette étape.
- Pas de vérification live de NVD/EPSS/KEV/EUVD, de test de charge, d’audit exhaustif des dépendances, d’authentification/RBAC ou d’isolation tenant. Le prototype ne doit pas être présenté comme un service sécurisé de production.
- Dépendances Python à bornes minimales et images Docker par tags : installation future non strictement reproductible. Les tests CI permettront de détecter des régressions, sans remplacer un verrouillage des dépendances.
- Matching expérimental, catalogue Product réduit, données de scores courantes et historique de réimport incomplet : voir [DEMO](DEMO.md), [EVALUATION](EVALUATION.md) et [RESOLUTION](RESOLUTION.md).
