# Inventaire et identité des assets

## Implémentation actuelle

L’import CycloneDX JSON dans [asset_service.py](../src/backend/app/services/asset_service.py) associe un BOM à un asset. Le modèle [asset.py](../src/backend/app/models/asset.py) conserve un UUID interne, un `external_id` global, la source, le dernier `raw_payload`, les composants et le contexte (exposition, criticité métier, complexité de patch).

Les composants conservent nom, version, CPE, purl et `raw_component`. Product Resolution s’exécute séparément sur ces observations ; voir [résolution](RESOLUTION.md). Les [50 BOM synthétiques](../samples/assets/README.md) et leur générateur servent aux essais, sans vérité terrain complète sur les CVE applicables.

## Réimport et limites

L’import retrouve l’asset via son `external_id`, met à jour son contenu et **remplace ses composants**. La suppression cascade vers leurs findings/scores : un matching ultérieur peut retrouver les mêmes couples fonctionnels sans préserver leurs UUID ou `first_seen_at`. Les décisions Product conservent leurs snapshots et perdent leur lien vers le composant supprimé. Une réimportation n’est donc pas une garantie de continuité d’historique.

Aucun connecteur CMDB/cloud/scanner, import CSV générique, collection de source records, historique d’observations ou arbitrage par attribut n’est implémenté. L’unicité de `external_id` n’est pas une résolution multisource.

## Direction, hors tranche active

Un Asset serait une identité de corrélation reliée aux records de plusieurs sources, sans remplacer leur CMDB. L’autorité serait définie par attribut : organisationnelle (owner/service), observée (version/hostname) ou dérivée (Product/priorité). Il faudrait préserver valeur source, conflit, règle, date et décision.

La résolution d’asset et la résolution de produit doivent rester deux moteurs évalués séparément. Hostname ou IP réutilisé ne suffit pas à prouver une identité ; utiliser IDs forts, temporalité, contradictions et abstention (`unknown`/`ambiguous`) avant de fusionner. Ce chantier n’est pas commencé.
