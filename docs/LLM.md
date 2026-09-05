# Architecture LLM et politique de données

Cible du 2026-09-05. **Non implémentée** : aucun client LLM, provider métier, task registry, prompt produit ou pipeline d’inférence n’a été trouvé dans le code applicatif. L’ancienne roadmap CPE était une intention, pas une fonctionnalité.

## Principe

LLM lorsque le langage est ambigu ; algorithmes lorsque la logique peut être exacte. Usages pertinents : extraction d’advisories/vendor/product/component, noms logiciels sales, génération de candidats, ranking/désambiguïsation, propositions d’aliases et synthèse. Plus tard : propositions de mappings ATT&CK et extraction de préconditions/postconditions. La comparaison finale des versions appartient au code déterministe.

Le domaine demande une tâche, pas un provider. Organisation conceptuelle possible, non arborescence déjà existante :

```text
llm/
  client, policies, models, schemas
  tasks/
    product_resolution
    vulnerability_extraction
    advisory_summary
```

La couche sélectionne provider, modèle, prompt, schéma structuré et politique de données. Une interface remplaçable doit permettre de désactiver le LLM sans empêcher import, résolution déterministe et fonctionnement fondamental du produit.

## Contrats conceptuels

```text
LLMTaskRequest {
  task_id, input_id, payload,
  schema_version, prompt_version,
  model_policy, data_classification
}
LLMTaskResult {
  normalized_output, model, provider, prompt_version,
  token_usage, cost, latency, confidence, evidence
}
```

Associer résultat, requête, module/version et configuration à une décision rejouable. Valider la sortie structurée ; conserver candidats, abstentions et éventuelles validations humaines. Traiter le texte des advisories et observations comme des données, pas comme des instructions. Les seuils de revue dépendent du risque et de la politique ; une suggestion LLM seule n’est pas une preuve d’applicabilité.

## Atomicité et volume

Pour les tâches indépendantes, une vulnérabilité = une unité logique d’inférence. Éviter de grouper arbitrairement 50 CVE dans un prompt pour amortir le system prompt. Les unités atomiques permettent retries, cache, parallélisme, benchmark et provenance. Pour les gros volumes, envisager une batch API contenant des requêtes indépendantes. Un prompt multivulnérabilité n’est justifié que pour un problème relationnel.

Clés de replay/cache : version d’entrée/dataset, task/schema, prompt, modèle et configuration/politique pertinentes ; ne pas réutiliser silencieusement un résultat après modification de ces éléments. La reproductibilité d’un LLM inclut la conservation du résultat original, pas une promesse de réponse identique à chaque nouvel appel.

## Gouvernance

| Classification | Direction de politique |
|---|---|
| Public vulnerability data | Providers standards autorisés |
| Customer non-sensitive | Providers approuvés |
| Customer sensitive | Zero retention, BYOK, dédié, self-hosted ou LLM disabled, selon politique |

Ces options ne sont pas équivalentes : BYOK ne garantit pas à lui seul absence de rétention. La politique doit contrôler les données effectivement autorisées à sortir et les conditions du provider choisi. Aucun transfert de données client n’est autorisé par ce document seul.

À terme, activation et remplacement par tenant/politique. Le prototype actuel n’a pas d’isolation tenant ; ne pas annoncer cette capacité comme disponible. Ne jamais rendre le produit dépendant de l’envoi d’une CMDB complète à un service externe. Les mesures de coût/latence/qualité seront intégrées au [Lab](EVALUATION.md).
