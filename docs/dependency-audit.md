# Audit des dépendances

Audit effectué le 23 juillet 2026 avec `npm audit`, sans `--force`.

## Corrections appliquées

`npm audit fix` a mis à jour les versions compatibles du fichier de verrouillage, notamment pour corriger les alertes React Router, PostCSS et Babel.

## Alertes restantes

Six alertes de développement restent signalées :

- 3 modérées ;
- 1 haute ;
- 2 critiques.

Elles proviennent de la chaîne Vite 5 / Vitest 2 et de leurs dépendances `esbuild`, `vite-node` et `@vitest/mocker`. npm ne propose qu’une résolution avec mises à jour majeures, jusqu’à Vite 8 et Vitest 4.

Ces dépendances ne sont pas embarquées dans le bundle de production. Le risque concerne principalement l’exposition d’un serveur de développement ou de l’interface Vitest à un réseau non fiable. Les serveurs locaux ne doivent donc pas être publiés sur Internet.

La suppression des six alertes doit passer par une montée de version dédiée avec validation du build, des 575 tests Vitest, de la couverture et du parcours Playwright. Aucune mise à jour forcée n’a été appliquée pendant cet audit.
