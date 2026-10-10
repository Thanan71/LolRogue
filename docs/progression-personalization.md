# Progression et personnalisation

## Maîtrise et propriété des champions

Les Candies restent propres au champion et déterminent sa maîtrise. Les Éclats
sont un solde global du compte et achètent l'accès permanent au roster ; l'or
reste dans la run. Aucune conversion entre ces trois monnaies n'existe. Un achat
ne retire aucune Candy et ne modifie aucun niveau, statistique ou unlock de maîtrise.

Lorsque l'économie v1 est activée, Garen, Annie et Ashe restent gratuits ; cinq
autres champions sont gratuits chaque semaine, du lundi 00:00 UTC au suivant.
Un champion acheté reste disponible après sa rotation. Un champion essayé puis
verrouillé conserve sa maîtrise, retrouvée intacte après achat. Le prix canonique
v1 est 400 Éclats. Les comptes antérieurs à la première activation conservent leur
ancien roster par des grants permanents. Les invités conservent leur maîtrise
locale, sans wallet ni achats durables.

Seules les runs vérifiées rapportent des Éclats : 25 après une vague validée,
10 par biome terminé, 50 pour une victoire, et 50 par champion de rotation dont
la première victoire de la période n'a pas encore été réclamée. Le snapshot du
démarrage détermine cette période. Voir `champion-economy.md` pour l'autorité,
l'activation et le kill-switch ; les seuils et calculs de maîtrise sont inchangés.

## Slots de starter

Le contrat actuel fixe deux starters en Standard et un en Daily. Le serveur
vérifie cette limite au démarrage puis fige l'équipe. La personnalisation de
maîtrise peut élargir l'offre ou les rerolls ; elle n'ajoute pas de membre initial.
Changer le nombre de starters modifierait survie, actions et synergies et exige
donc un nouveau contrat d'équilibrage autoritaire.

## Cosmétiques

Les dix concepts de chroma dans `personalizationContract.ts` ne modifient ni stats,
sorts, ciblage, IA, hitbox, récompenses, seed ni score. Ils définissent seulement un
identifiant et une palette. Aucun chroma n'est annoncé comme disponible tant que
ses assets versionnés, son sélecteur et sa persistance serveur ne sont pas livrés.
Les concepts de niveau 2 ne réactivent donc pas les anciens IDs SQL fantômes.

## Achievements et quêtes

Ils restent désactivés. Leur activation nécessite une métrique versionnée issue des
runs `verified`, une attribution serveur idempotente, une décision explicite de
backfill et une revue confidentialité. Un compteur calculé côté client ou une run
legacy ne peut jamais accorder une récompense durable.

## Historique comparable

Le profil charge les 20 dernières runs avec équipe finale et attempt autoritaire.
Chaque ligne dépliable affiche résultat, date, niveau, vagues, éliminations,
difficulté, mode, gameplay ruleset, équipe, économie, dégâts, soins, boucliers,
runes et augments. Deux runs ne sont comparables que si leur
`gameplay_ruleset_version` est identique. Une run sans attempt reste visible comme
historique legacy, mais son groupe de comparaison est inconnu.

## Saisons, reset et migration

Maîtrise, améliorations et cosmétiques sont permanents. Rang, quêtes et rating sont
des données saisonnières. Un changement de saison ajoute de nouvelles lignes
versionnées : il ne remet jamais les colonnes permanentes à zéro et ne réécrit pas
les runs vérifiées.

Ordre obligatoire : geler la saison précédente, produire son snapshot agrégé,
activer la nouvelle saison par migration, puis vérifier que l'historique reste
lisible. Avant toute économie monétisée, une table de saisons, des clés étrangères
de version et un dry-run de migration sur copie restaurée sont obligatoires.
