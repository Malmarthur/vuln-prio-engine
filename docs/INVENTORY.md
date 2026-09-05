# Inventory et Asset Identity Resolution

Direction canonique du 2026-09-05. État réel : import CycloneDX dans [asset_service.py](../src/backend/app/services/asset_service.py), modèles dans [asset.py](../src/backend/app/models/asset.py). Aucun connecteur CMDB/cloud/scanner ni import inventory CSV générique n’est présent.

## Vue canonique sécurité

```text
Source records (CMDB / cloud / scanner / CSV / agent…)
  → Asset Identity Resolution → Canonical Asset
  → Software observations → Canonical Product
  → Vulnerability → Finding
```

Un Asset VVLN pourrait corréler `ServiceNow CI ci_84921`, `Qualys host host_4382`, `AWS instance i-xxxx` et `Defender device xxxx`. Il conserve ces liens ; il n’exige pas que les systèmes clients adoptent son UUID comme clé maître. Prévoir la temporalité et l’espace de noms des identifiants sources.

## Autorité par attribut

| Type de vérité | Exemples | Autorité possible, selon politique et evidence |
|---|---|---|
| Organisationnelle | Owner, business service, centre de coût, environnement, criticité métier | CMDB |
| Observée | Version installée, hostname, package, port, OS, IP, cloud metadata | Scanner authentifié, agent, provider cloud |
| Dérivée VVLN | Product canonique, alias normalisé, binding CPE, finding consolidé, priorité, futur attack path | VVLN et ses décisions versionnées |

Exemples de règles futures : business_criticality → ServiceNow ; installed_version → scanner authentifié ; cloud_instance_id → AWS ; canonical_product/CPE binding → VVLN ; last_seen → observation la plus récente. Ce sont des politiques à définir par attribut, pas une source universellement autoritaire ni des intégrations déjà codées. Conserver valeur source, conflit, règle de sélection et résultat dérivé.

## Résolution d’asset, indépendante de la résolution de produit

La question est de savoir si `srv-prod-15`, `10.0.4.18`, `i-018abcd` et `device-uuid-xyz` désignent le même asset. Signaux : IDs natifs forts, cloud instance ID, serial, agent UUID, MAC, FQDN, hostname, IP, timestamps et confiance de la source.

Un faux merge peut affecter toute la chaîne de décision. Un hostname/IP réutilisé ne suffit pas à prouver l’identité ; considérer le temps, les candidats et les contradictions, permettre `unknown`/`ambiguous` et revue humaine. Prévoir décisions et métriques propres au moteur asset, séparées du [Product Resolver](RESOLUTION.md).

## Limites concrètes à préserver comme point de départ

L’import actuel choisit un `external_id`, met à jour l’asset correspondant, conserve le dernier BOM dans `raw_payload` et recrée ses composants. Ceux-ci conservent noms, versions, CPE, purl et `raw_component`. Les métriques importées sont exposition Internet, criticité métier et complexité de patch.

Il n’existe ni collection de source records par asset, ni historique d’observations, ni arbitrage par attribut. La suppression des anciens composants entraîne par les clés étrangères la suppression de leurs findings/scores : un réimport suivi du matching peut retrouver les mêmes couples fonctionnels sans préserver leurs UUID ou `first_seen_at`. L’ancienne mention « idempotence » ne doit pas être comprise comme continuité d’historique.

Les 50 BOM synthétiques et leur générateur restent des fixtures utiles. L’ajout de CSV/JSON générique devra se faire via un adapter vers un contrat interne, sans forcer un CPE ni étendre le payload CycloneDX en modèle universel.
