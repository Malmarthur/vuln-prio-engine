# Roadmap — état du prototype

Mise à jour : 2026-09-27. La préparation GitHub/CV est terminée pour revue locale ; le [plan actif](PLAN.md) consigne sa clôture et les décisions restantes. Les validations actuelles sont dans [READINESS](docs/READINESS.md).

| Capacité | État |
|---|---|
| Ingestion NVD, EPSS, KEV, EUVD | Implémentée ; disponibilité des services externes non certifiée |
| Lab intégré : scoring vulnerability/asset/finding, profils révisés, presets, runs et Compare | Implémenté ; parcours principal de démonstration |
| Import CycloneDX, assets/composants et findings | Implémenté ; réimport remplaçant les composants, sans continuité complète d’historique |
| Product Resolution v0 | Implémenté ; catalogue réduit, décisions persistées, unknown/ambiguous et benchmark versionné |
| Matching CPE/version | Expérimental ; pas d’évaluation complète des configurations NVD |
| Applicability Engine ternaire | Prévu, non commencé |
| Consolidation multiscanner, identité asset multisource et Evidence générique | Non implémentés |
| LLM, graphe d’attaque, fonctions commerciales | Non implémentés ; hors périmètre de cette préparation |

Prochaine décision : revue du prototype, licence et identité publique, puis autorisation explicite de publication. Aucun renommage n’est appliqué.

L’évolution produit envisagée est : Product côté vulnérabilité/applicabilité → observations et consolidation → evidence de bout en bout → identité asset multisource. Cet ordre sera réévalué selon les preuves du Lab et les retours terrain. Il ne constitue pas une liste de fonctionnalités promises ou un chantier actif.

La validation terrain précède toute ambition commerciale. RBAC, isolation tenant, audit d’exploitation et robustesse de production restent à construire. Les graphes State/Capability et les recommandations défensives sont une direction lointaine, après validation du cœur.
