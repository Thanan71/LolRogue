# Stratégie de tests et couverture

La couverture est un garde-fou de risque, pas une mesure de volume. `npm run
test:coverage` exécute les tests dans un ordre mélangé mais reproductible
(`seed: 20260801`). La commande de couverture sérialise les fichiers afin que les
compteurs V8 ne varient pas selon l'ordonnancement ; `npm test` conserve le
parallélisme courant. Une suite qui dépend de l'ordre ou d'un état global non nettoyé
doit donc échouer localement comme en CI.

## Périmètre

La mesure couvre le domaine de jeu, les services, repositories, stores et utilitaires,
puis un premier anneau UI critique : combat, gardes de routes, feedback et raccourcis
clavier. Les fichiers de types, barrels et interfaces sans code exécutable sont exclus
afin de ne pas créer de faux 100 %.

Les seuils globaux constituent le plancher. Des seuils plus stricts s'appliquent aux
frontières de sauvegarde et de sécurité : `runAttemptService`, `runService`,
`SupabaseAuthRepository`, `SupabaseRunRepository` et `runStore`. Les seuils sont
augmentés uniquement après ajout de tests de comportement couvrant succès, refus,
idempotence et panne réseau.

## Sorties

La console n'affiche que le résumé global. Vitest produit aussi `coverage/index.html`,
`coverage/lcov.info` et `coverage/coverage-summary.json`. La job `validate` archive le
dossier `coverage/` pendant 14 jours, y compris lorsque la validation échoue.

Les tests Supabase live restent dans `npm run test:db`; leur objectif est la preuve
RLS/RPC et non l'augmentation artificielle de la couverture JavaScript.
