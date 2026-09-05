# Vision produit canonique — VVLN

Direction adoptée le 2026-09-05. Ce document décrit la cible ; [l’audit](AUDIT.md) décrit le code, [ROADMAP.md](../ROADMAP.md) ordonne son évolution et [PLAN.md](../PLAN.md) détaille la tranche active. L’ancien nom VulnPrio reste présent dans l’implémentation.

## Thèse et valeur

Construire une représentation fiable **Asset ↔ Product ↔ Vulnerability**, malgré des données réelles, sales et contradictoires, puis produire des **Findings** consolidés et une priorité contextualisée, explicable par de l’**Evidence**.

VVLN est une couche de réconciliation et d’intelligence sécurité au-dessus des inventaires, scanners et sources de vulnérabilités existants. Sa valeur est de déterminer quels assets existent, quels composants ils exécutent, leur identité produit canonique, les vulnérabilités applicables, les observations qui décrivent la même action à traiter et les raisons de leur priorité. Les scanners, scores CVSS et dashboards CVE sont des entrées ou interfaces, pas la proposition de valeur centrale.

VVLN maintient sa propre vue canonique sécurité sans devenir la CMDB maître du client. L’autorité dépend de l’attribut et de sa provenance. Un rapprochement erroné doit pouvoir être expliqué et corrigé ; l’incertitude est un résultat légitime.

## Le laboratoire sous le produit

Le Research Lab historique est un actif à conserver. Il doit progressivement permettre de comparer stratégies, algorithmes, heuristiques, modèles ML/LLM, prompts, datasets et versions de modules. Les améliorations du produit doivent être mesurables et rejouables : module + version + configuration + dataset → résultat + métriques + provenance. Les comparaisons de scoring existantes sont le point de départ, pas encore un système universel d’évaluation.

## Priorité produit

D’abord un prototype technique privé démontrant résolution, applicabilité, consolidation et priorisation ; ensuite une démonstration mesurable, validation du besoin sur le terrain et un design partner. Les fonctionnalités commerciales et les graphes d’attaque viennent après preuve de valeur. Voir les phases 0–6 de [ROADMAP.md](../ROADMAP.md) ; elles remplacent la numérotation historique.

Ne pas anticiper dix scanners, le remplacement des scanners ou de la CMDB, un ticketing complet, un DSL de scoring gigantesque, des microservices sans justification, du LLM partout ou une architecture dictée par une levée de fonds hypothétique. Ne pas supprimer le Lab.

Un éventuel sync-back suivrait des niveaux distincts : aucun write-back → recommandations → export → écriture contrôlée → réconciliation automatique à très haute confiance. Aucun n’est une priorité immédiate ni un connecteur actuellement implémenté.

## Direction long terme : State / Capability Attack Graph

Après validation du cœur, raisonner sur les transitions : état attaquant → préconditions → attaque atomique/finding/action → postconditions → nouvelles capacités → prochaines actions atteignables. Relier assets, findings, reachability réseau, identités, privilèges, credentials, confiance, contrôles, impacts CIA et métier.

ATT&CK apporte vocabulaire, taxonomie et annotations des comportements adverses. Une technique seule ne décrit pas l’état initial, la topologie, les privilèges, contrôles et transitions exactes ; elle ne constitue donc pas le modèle calculable central.

Les contrôles pourront empêcher une transition/capacité, réduire sa faisabilité, détecter une action, limiter la reachability ou un impact CIA. Un simple multiplicateur de risque ne suffit pas à cette cible.

La phase suivante distinguera **DefenseCapability** (capacité disponible : EDR, DLP, PAM, WAF, MFA, backup, chiffrement, segmentation) et **DefenseDeployment** (scope/asset, déploiement, configuration, efficacité observée, evidence). Recommander une capacité déjà disponible mais absente d’un scope devra découler du graphe et du contexte, jamais de règles telles que « Confidentiality critical → DLP ».

## Référentiels à étudier, sans les imposer au domaine

| Référentiel | Rôle envisagé |
|---|---|
| NVD, KEV, EPSS, EUVD, advisories éditeurs | Intelligence multi-source ; quatre premiers connecteurs déjà présents |
| CPE/NIST, CVSS, CWE | Interopérabilité produit, sévérité et classification |
| CAPEC | Patterns, prérequis, conséquences, relations ; source candidate à valider |
| MITRE ATT&CK | Annotation des comportements |
| MITRE Attack Flow | Échange et visualisation de séquences, pas nécessairement moteur interne |
| MITRE D3FEND | Vocabulaire défensif et mappings |
| STIX 2.1 | Échange, sans dicter le modèle de calcul |
| Logical attack graphs / raisonnement de type MulVAL | Inspiration pour préconditions/postconditions déterministes |
| Vulnerability-Lookup du CIRCL | Étudier agrégation, provenance, normalisation d’advisories, identifiants, recherche/API et mises à jour avant de réinventer ces briques |

Cette liste est une orientation de recherche fournie par la vision, pas une évaluation de ces projets ni une décision de copier leur architecture.
