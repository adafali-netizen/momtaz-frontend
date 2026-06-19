Il manque encore une chose importante dans le bandeau KPI :
les cases des statuts leads ne bougent pas vraiment selon la donnée.

Je veux maintenant une règle claire et obligatoire :

- 1ère case : taux de confirmation
- 2e case : total leads
- ensuite : toutes les cases des statuts leads doivent être triées automatiquement du plus grand % au plus petit, de gauche à droite

C’est une règle métier importante.
Je ne veux pas un ordre fixe ou semi-fixe.
Je veux un ordre piloté par la donnée.

Exemple :
si Injoignable = 23% et Rappel = 23%, ces statuts doivent apparaître avant Annulé = 8%.
Si demain Annulé devient plus élevé, il doit remonter automatiquement.
Les cartes doivent donc bouger selon les vrais pourcentages.

Objectif :
qu’en lisant le bandeau KPI, je voie immédiatement :
- le taux de confirmation
- le volume total
- puis les statuts classés par poids réel dans le pipeline

Je veux que cette logique soit visible, assumée et systématique.

En cas d’égalité entre deux statuts :
- priorité au statut le plus problématique métier
- ensuite au volume absolu
- puis ordre secondaire stable si nécessaire

Je veux aussi que cette logique se traduise visuellement :
- plus le % est élevé, plus la carte doit être importante dans la lecture
- les petits statuts doivent passer après
- les statuts à 0% doivent être en fin de ligne ou visuellement affaiblis

Je veux dans ta réponse :
1. expliquer la nouvelle règle de tri
2. montrer l’ordre attendu des cartes
3. appliquer le tri dynamique du plus grand % au plus petit
4. améliorer le rendu visuel pour qu’on sente que les cartes “bougent” vraiment selon la donnée
5. puis fournir le code refactoré
