# Plan actif — préparation GitHub et CV

Mise à jour : 2026-09-27. Aucune nouvelle fonctionnalité produit autorisée dans cette tranche.

- ✅ Point de départ vérifié : `feat/assets` = `9cd5877`, treize commits devant `main`, arbre propre. Branche locale `codex/github-readiness` créée depuis ce commit.
- ✅ Recentrer README et démonstration sur le Lab intégré ; consolider les documents et retirer les archives actives après récupération des invariants.
- ✅ Vérifier installation, migrations et tests dans une stack jetable avec bases dédiées ; exécuter une comparaison de bout en bout.
- ✅ Ajouter une CI minimale reproduisant les contrôles ; corriger seulement les défauts observés.
- ✅ Examiner les treize commits et les fichiers/historique destinés à publication ; documenter la portée de ce contrôle.
- ✅ Livrer les preuves, limites et décisions restantes dans `docs/READINESS.md`.

Décisions : licence reportée par l’utilisateur ; nom de présentation Harmonia validé (disponibilité juridique non vérifiée), identifiants techniques conservés. Aucune publication, push, fusion, tag ou réécriture d’historique.

Après cette tranche : revue de la préparation et décision de publication. L’Applicability Engine reste prévu, non commencé ; son implémentation demandera une autorisation séparée. Il n’existe aucun autre plan actif.

Validation finale (détails dans [READINESS](docs/READINESS.md)) : dix migrations upgrade/downgrade/upgrade sur base vide ; 249 tests backend, 5 frontend, TypeScript et build réussis. Démo HTTP : 3 résolutions, 18 findings, 3 presets comparés. Comparaison lancée et terminée aussi depuis l’UI Harmonia.

Tranche de préparation terminée ; prochaine étape uniquement : revue locale, choix de licence et vérification du nom avant toute décision de publication. CI ajoutée, pas encore exécutée sur GitHub.
