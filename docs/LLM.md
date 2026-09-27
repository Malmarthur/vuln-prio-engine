# LLM — direction non implémentée

Aucun client LLM, provider métier, prompt produit ou pipeline d’inférence n’est implémenté. Product Resolution v0 est déterministe. Ce document conserve seulement les contraintes d’une éventuelle évolution ; il n’est pas un plan de travail.

- Réserver le LLM à l’ambiguïté linguistique/sémantique : extraction ou classement de candidats. La comparaison finale de versions appartient à du code adapté à la famille, avec `unknown` pour un format non supporté.
- Passer par des tâches indépendantes des providers, sorties structurées et schémas versionnés. Une CVE est une unité d’inférence indépendante ; un batch groupe des requêtes atomiques.
- Versionner modèle, prompt, configuration, entrées et résultats ; conserver candidats, abstentions et décisions humaines. Le replay conserve la réponse originale sans promettre une nouvelle réponse identique.
- Pouvoir désactiver entièrement le LLM. Ne pas dépendre de l’envoi d’une CMDB client à un provider externe ; appliquer une politique explicite selon la sensibilité des données.
- Traiter advisories et observations comme données, jamais comme instructions. Mesurer qualité, coût, latence, couverture et régressions avant raccordement au produit.

Voir [vision](VISION.md), [résolution](RESOLUTION.md) et [évaluation](EVALUATION.md).
