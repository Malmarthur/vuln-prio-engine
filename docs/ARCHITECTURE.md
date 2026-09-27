# Architecture et domaine canoniques

État du prototype et frontières de la cible. Les colonnes « actuelle » ci-dessous décrivent le code ; le flux complet reste une direction, pas un pipeline déjà disponible.

## Flux et frontières

```text
Connectors → Raw ingestion / staging → Normalization
          → Identity Resolution → Canonical Domain Model
          → Applicability Engine → Finding Consolidation
          → Context / Prioritization → API / UI / workflow

Transversal : Evidence / provenance, versions, replay,
              Module Registry, Evaluation / Research Lab
```

Les adapters futurs traduiraient Qualys, Tenable, ServiceNow ou GLPI ; les entrées actuelles sont NVD/EPSS/KEV/EUVD et CycloneDX. Ils traduisent les données vers des représentations internes stables. Les formats externes ne doivent pas définir le domaine. Ce découpage est fonctionnel : conserver le monolithe actuel tant qu’une séparation de déploiement n’est pas justifiée. Le « graphe » conceptuel n’impose pas une nouvelle base graphe ; PostgreSQL peut porter les relations.

## Concepts distincts

| Concept cible | Responsabilité | Correspondance actuelle |
|---|---|---|
| Asset | Entité observée/gérée : host, VM, cloud resource, container, workload, application, service, database ; identité interne de corrélation | `Asset` avec UUID, mais un seul `external_id` global et une source |
| Source record | Objet externe identifié dans sa source, observations datées et lien vers l’Asset | `raw_payload` et `external_id`, pas de modèle multisource |
| Software observation | Nom/version réellement observés sur un asset, date, source, evidence | `AssetComponent`, remplacé lors du réimport |
| Product | Identité logicielle interne stable, vendor, nom canonique, aliases, metadata/composants, identifiants externes et bindings CPE optionnels | `Product`, aliases et bindings v0 ; `VulnerabilityProduct` reste une projection CPE NVD distincte |
| Vulnerability | Vulnérabilité logique pouvant avoir CVE, advisory et autres identifiants/intelligence | `Vulnerability` UUID, mais `cve_id` obligatoire/unique et colonnes propres aux sources |
| Finding | Application potentielle/effective d’une vulnérabilité à un asset/produit ; action consolidée | `Finding` existe, unicité composant × vulnérabilité |
| Evidence / décision | Justification traçable des observations, résolutions, applicabilités et priorités | Décisions Product v0 append-only et snapshots ; pas d’entité générique couvrant les autres domaines |

Un CVE seul est une Vulnerability ; ce CVE sur `finance-db-prod-01` est un Finding. Plusieurs composants et observations peuvent contribuer à l’action consolidée Asset × Vulnerability. Le produit et les versions restent dans les liens justificatifs, même si l’action est consolidée.

## Evidence et incertitude

Product Resolution v0 matérialise ce contrat pour sa seule décision : run/module/configuration/catalogue, snapshot de composant, candidats et signaux sont persistés. Il ne remplace pas encore les blobs raw ou les mécanismes de scoring existants, et sa confiance est heuristique.

Toute décision importante devrait référencer les observations et sources utilisées, leur chaîne raw, la méthode, le resolver/module et sa version, sa configuration, ses candidats/scores, la confiance et une éventuelle validation humaine. Pour une inférence LLM : provider, modèle, prompt et schéma versionnés. Distinguer heure d’observation, d’ingestion et de décision lorsque pertinentes.

Contrat conceptuel :

```text
Decision {
  result / status,
  confidence,
  candidates,
  evidence_refs,
  method,
  module_id / module_version,
  configuration_ref,
  human_validation
}
```

Les statuts doivent distinguer résolu, unknown et ambiguous ; l’applicabilité doit distinguer applicable, non applicable et unknown. Le contrat Product v0 existe ; sa généralisation et le contrat d’applicabilité restent à implémenter. Une confiance heuristique n’est pas automatiquement une probabilité calibrée. Conserver les désaccords et raisons d’abstention.

Questions d’acceptation : pourquoi Tomcat 9.0.80 sur cet asset ? Pourquoi cette CVE est-elle applicable ? Pourquoi ce finding est-il critique maintenant ? Une chaîne de liens explicable doit permettre de répondre, sans seulement afficher un booléen.

## Consolidation et priorité

Observation Qualys + observation Tenable + evidence manuelle peuvent contribuer au même Finding. Conserver les observations et rendre les règles de consolidation auditables. La présence d’une contrainte d’unicité ne constitue pas à elle seule cette consolidation. Préserver l’identité et l’historique lors des mises à jour d’inventaire est un chantier distinct du matching actuel.

Le moteur de priorité peut combiner CVSS, EPSS, KEV, EUVD/intelligence d’exploitation, exposition Internet, reachability, environnement, criticité métier, owner/service, CIA, âge du finding, contrôles et règles client ; contribution aux chemins d’attaque seulement plus tard. Sortie : score/rang/niveau, facteurs qui augmentent ou réduisent la priorité, explication et version de stratégie — « WHY NOW? ».

Le scoring actuel constitue une première stratégie : vulnérabilité puis asset puis finding, configurations et révisions conservées pour les runs. L’UI affiche des détails de match et de score, mais ne fournit pas encore cette chaîne complète d’explication.

## Évolution incrémentale

Les identités actuelles, pipelines et API restent utiles. Ajouter les nouvelles abstractions à côté, évaluer sur fixtures figées puis raccorder une tranche prouvée. Ne pas renommer `VulnerabilityProduct` en Product pour masquer la différence ; ne pas convertir sans analyse les findings existants ou effacer leurs scores. Détails : [inventory](INVENTORY.md), [résolution](RESOLUTION.md), [LLM](LLM.md), [évaluation](EVALUATION.md), [roadmap](../ROADMAP.md) et [plan actif](../PLAN.md).

## Invariants de l’ingestion existante

Les normalizers Polars sérialisent les champs complexes en JSON avant leur conversion pour l’insert. `SOURCE_OWNED_COLUMNS` limite les mises à jour de chaque source ; le merge JSONB de `sources_raw` et le fallback summary KEV préservent les données des autres sources. Ces blobs conservent la dernière valeur par source, pas un historique immutable (EPSS y conserve une représentation minimale).

Le runner NVD découpe les longues fenêtres et mémorise le début du sync réussi pour l’incrémental. EUVD est paginé ; les erreurs de source sont isolées par le runner. Les timestamps SQLAlchemy sont timezone-aware. Le scheduler et les jobs restent dans le processus FastAPI ; les logs texte opérationnels ne sont pas un audit métier.
