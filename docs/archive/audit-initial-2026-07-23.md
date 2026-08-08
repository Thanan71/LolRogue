# Archive — audit initial du 23 juillet 2026

Ce document conserve les constats qui ont servi à créer le backlog de remise à
niveau. Ils décrivent l'état du 23 juillet 2026 et ne doivent pas être lus comme
l'état actuel du produit.

## Verdict initial

Le projet était alors un prototype avancé non prêt pour une bêta publique. Des
éléments visibles — passifs, runes, augments, objets, ciblage et maîtrise — ne
correspondaient pas toujours aux règles exécutées. Un client modifié pouvait aussi
falsifier de la progression et des données de classement.

## Mesures initiales archivées

- 582 tests Vitest passaient, avec trois tests Supabase live ignorés.
- La couverture globale des lignes était de 55,77 % et la couverture Services
  faisait échouer `npm run check` à 27,98 % pour un seuil de 28 %.
- Le seul scénario Playwright manipulait directement les stores et ne jouait pas
  les combats ni les encounters.
- L'audit npm remontait six vulnérabilités d'outillage : deux critiques, une haute
  et trois modérées.
- Plusieurs parcours mobiles rendaient des actions inaccessibles.
- Environ 17 Mo d'assets Riot locaux n'étaient pas versionnés malgré les anciennes
  affirmations de livraison.
- Les politiques SQL avaient été inspectées sans reset de l'instance locale déjà
  présente.

Les correctifs et preuves qui ont remplacé ces constats sont suivis dans
[`TODO.md`](../../TODO.md) et dans la
[matrice des fonctionnalités](../feature-status.md).
