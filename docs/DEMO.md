# Démonstration du Lab Harmonia

Utiliser la stack synthétique du [README](../README.md). Le script de préparation refuse une base contenant déjà des assets ou vulnérabilités et exige la base dédiée `vvln_demo`. Le stockage PostgreSQL est jetable : un arrêt du conteneur DB peut perdre les données. Ne pas y importer de données à conserver.

## Parcours de présentation (5 minutes)

1. **Dashboard** : montrer les trois étapes. Le score d’une vulnérabilité dépend des signaux CVSS/EPSS/KEV ; le score asset dépend de l’exposition, criticité et complexité de patch ; les findings combinent les deux.
2. **Compare → Recent comparisons** : ouvrir la comparaison préparée, ou composer une nouvelle comparaison de presets avec **Balanced** comme baseline et **Active Exploitation** / **Business Impact** comme candidats. Lancer et attendre `completed`.
3. **Résultats** : comparer les distributions puis sélectionner un candidat. La matrice présente les changements de niveau ; les divergences montrent les changements de score et de rang. Une promotion de rang n’implique pas forcément un changement de niveau.
4. **Interprétation** : expliquer une divergence à partir des poids et du contexte. Active Exploitation met davantage l’accent sur les signaux d’exploitation ; Business Impact sur le contexte métier. Aucun de ces profils n’est une vérité terrain.
5. **Assets** : montrer un composant Tomcat et sa décision Product, distincte du match CVE. **Vulnerabilities** permet de constater le marquage `SYNTHETIC DEMO` des données.

La commande `check_demo.py` exécute réellement résolution Product → matching → job de comparaison des trois presets → lecture des résumés et détails, via HTTP. Elle calcule les trois étages du scoring. Elle vérifie 18 findings et 18 lignes par candidat ; elle ne simule pas les résultats côté interface.

## Résultats de référence de la fixture v1

Exécution du 2026-09-27 : 6 vulnérabilités inventées × 3 assets, tous avec Tomcat 9.0.80. Les six contraintes synthétiques acceptent cette version. Trois composants résolus, 18 findings.

| Preset | P0 | P1 | P2 | P3 | Spearman vs Balanced |
|---|---:|---:|---:|---:|---:|
| Balanced | 2 | 7 | 8 | 1 | — |
| Active Exploitation | 3 | 3 | 7 | 5 | 0,893 |
| Business Impact | 3 | 5 | 10 | 0 | 0,942 |

Ces différences illustrent la sensibilité du classement aux hypothèses. Elles ne mesurent ni précision du matching réel, ni réduction du risque, ni qualité supérieure d’un profil. La fixture est volontairement petite et sans appels aux sources réelles ; les tests d’ingestion couvrent séparément les normalizers et runners avec réponses simulées.

## Limites à expliquer

Les configurations de runs sont snapshotées, mais pas l’intégralité du dataset. Un recalcul peut rendre les détails d’une ancienne comparaison indisponibles. Un réimport remplace les composants et peut supprimer leurs findings/scores. Le matching aplatit certaines configurations NVD et ne produit pas de statut ternaire. Voir [évaluation](EVALUATION.md) et [résolution](RESOLUTION.md).

## Présentation CV suggérée

« Harmonia — prototype de priorisation des vulnérabilités : ingestion multi-source, inventaire CycloneDX et laboratoire de comparaison de stratégies de scoring. Backend FastAPI/PostgreSQL/Polars, interface React/TypeScript ; résolution de produits traçable, tests automatisés et migrations. »

En entretien, présenter le choix du monolithe, la séparation identité produit/applicabilité, la gestion explicite de l’incertitude et la différence entre tester un logiciel et valider une stratégie de risque. Ne pas revendiquer une exploitation en production ou des performances mesurées sur un parc réel. L’assistance IA n’est pas dissimulée ; les validations rapportées doivent rester vérifiables.

## Captures réelles

Capturées le 2026-09-27 sur la fixture synthétique, sans données privées.

![Composition de la comparaison](images/harmonia-compare.png)

![Résultats des stratégies](images/harmonia-results.png)
