# Progression et personnalisation

## Slots de starter

Les slots supplémentaires font partie de l'équilibrage : commencer avec deux ou
trois champions augmente directement survie, actions disponibles et synergies. Le
contrat reste donc serveur : un slot par défaut, deuxième au niveau de maîtrise 1,
troisième au niveau 3, maximum trois. Le serveur recalcule la limite au démarrage et
fige le snapshot pour la run et le Daily ; le client ne peut pas l'augmenter.

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
