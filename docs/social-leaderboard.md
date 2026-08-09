# Social et classement

## Données publiques

Le nom de compte et le `player_id` ne sont jamais publiés. Un joueur peut choisir un
alias public de 3 à 32 caractères ; sinon le serveur produit un pseudonyme stable de
la forme `Joueur A1B2C3`. L'opt-out retire tous ses scores des vues publiques sans
supprimer son historique privé.

Un score public contient uniquement un identifiant opaque de signalement, la date,
la saison, les versions Daily/gameplay/score, le rang et les métriques nécessaires au
classement. Les signalements sont privés et visibles uniquement par la modération.

Les deux vues publiques utilisent les droits de l'appelant
(`security_invoker=true`). Elles lisent des projections sanitisées conservées dans
un schéma non exposé et synchronisées par des triggers internes. Aucun droit de
lecture supplémentaire n'est accordé sur `players` ou `daily_runs` : un invité peut
lire le classement, mais pas ses tables sources ni les clés internes des
projections.

## Comparabilité et saisons

Le rang est partitionné par date UTC, version de calcul du score et version de
gameplay. Deux scores issus de règles différentes ne partagent donc jamais un rang.
Les saisons sont des fenêtres serveur explicites. Leur changement n'efface ni les
runs ni la progression permanente ; il change seulement le groupe compétitif.

L'écran Daily permet de filtrer les entrées par versions. Toute nouvelle formule de
score ou règle de jeu doit créer une nouvelle version, jamais réinterpréter les
scores existants.

## Modération

Un utilisateur authentifié peut signaler une entrée une fois, avec un motif borné.
Un administrateur peut invalider le score via la fonction privilégiée
`invalidate_daily_score`. L'entrée disparaît alors immédiatement de la vue publique,
mais reste conservée avec l'auteur, le motif et la date de l'action pour audit.

## Limite de périmètre

Partage de run, amis, guildes et mode spectateur restent volontairement absents.
Ils ne seront conçus qu'après une analyse dédiée des consentements, blocages,
visibilités croisées, rétention et risques de harcèlement.
