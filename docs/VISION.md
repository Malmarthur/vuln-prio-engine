# Vision — de la comparaison de stratégies à la réconciliation

Harmonia explore comment passer de signaux de vulnérabilité et d’inventaire à une priorité contextualisée et explicable. Le prototype actuel permet surtout de comparer des stratégies de scoring dans un laboratoire intégré au produit. [README](../README.md) décrit ce qui est disponible ; [ROADMAP](../ROADMAP.md) distingue les évolutions.

La cible est une chaîne **Asset ↔ Product ↔ Vulnerability ↔ Finding ↔ Evidence** : corréler les observations, conserver les identités logicielles indépendamment des CPE, déterminer l’applicabilité puis consolider les actions à traiter. Harmonia ne remplace ni les scanners ni la CMDB ; l’autorité doit dépendre de l’attribut et de sa provenance.

Le Lab doit rester intégré : comparer stratégies, versions de modules et datasets, mesurer erreurs et abstentions, puis conserver les raisons d’une décision. Les scores et deltas actuels montrent les conséquences de choix de pondération ; ils ne prouvent pas une réduction du risque réel.

Les moteurs doivent privilégier le déterminisme et accepter l’incertitude. Un Product peut exister sans CPE ; une résolution de produit ne prouve pas qu’une CVE s’applique. Le recours éventuel au LLM restera borné, désactivable et traçable ; il n’est pas implémenté.

Après validation du cœur et du besoin terrain, un graphe interne State/Capability pourrait représenter préconditions, transitions et contrôles. ATT&CK serait une annotation, pas le modèle de calcul. Attack paths, recommandations défensives et fonctions commerciales ne font pas partie du prototype présenté.
