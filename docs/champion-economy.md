# Économie des champions — P3-ECO-01

## Contrat v1

Le contrat produit est figé dans `src/product/productDecisions.ts` et détaillé
dans `product-decisions.md`. L'économie est indépendante du ruleset de combat
v21 : elle ne change ni les Candies, ni la maîtrise, ni l'or, ni les replays.

Le catalogue v1 comprend les dix champions implémentés et autorisés par v21.
Les sept non gratuits sont triés par identifiant. Pour chaque lundi UTC, un
offset égal au nombre de semaines depuis le 5 janvier 2026 modulo la taille du
pool choisit cinq champions consécutifs, avec retour au début du pool. Deux
semaines voisines ont des offres distinctes tant que le pool dépasse cinq.
Les semaines ISO, dont la semaine 53, déterminent l'identifiant de période.
La première résolution côté serveur matérialise l'offre ; une modification
du catalogue en cours de semaine ne réécrit jamais une période déjà créée.

Les accès standard suivent la priorité gratuit permanent, possédé, rotation,
verrouillé. Les acquisitions et récompenses sont des transactions serveur
idempotentes. Les compteurs de récompense viennent du replay : vagues gagnées
et index des biomes réellement terminés, plutôt que biomes simplement visités.

## Livraison et activation

L'implémentation, les migrations et les preuves locales sont à compléter dans
cette branche. Le flag reste OFF dans les migrations. L'activation en production
requiert une migration validée, un catalogue compatible avec le ruleset actif,
les tests RLS et le smoke du SHA candidat. Aucun déploiement ni activation de
production n'est implicite dans la PR.
