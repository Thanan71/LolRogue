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

Chaque suite d'intégration DB porte obligatoirement le suffixe
`*.database.test.ts` sous `tests/`. Ce contrat est versionné dans
`config/database-tests.json` : aucun runner ni workflow ne maintient de liste de
tests en parallèle.

## Clean-room CI

La job `clean-room` repart d'un checkout sans `node_modules`, `dist` ni couverture et
n'utilise pas le cache npm de `setup-node`. Les assets Riot sont un paquet versionné :
ils sont donc vérifiés, pas téléchargés silencieusement.

Supabase est d'abord restauré à la migration v9 (`20260730300000`), puis migré vers
la version courante (ruleset v13 au 8 août 2026) afin de tester un upgrade réel. La job compare ensuite les types
TypeScript régénérés, effectue un reset complet et exécute les tests RLS/RPC live.

Après `npm run check`, `scripts/verify-production-build.mjs` sert `dist` avec le
contrat `vercel.json` et vérifie les deep links, la CSP, les assets d'entrée et un vrai
404 pour un asset absent.

Le job E2E dédié vérifie lui-même son checkout sans résidus. La suite fonctionnelle
utilise deux workers Chromium et contient deux runs UI complètes : victoire six
biomes grâce à une rune de test injectée au build, et défaite réelle. Les specs
d'interface plus courtes peuvent injecter les stores pour isoler leur contrat et
ne doivent pas être présentées comme des runs complètes.

Une seconde configuration sert le build de production et exécute un smoke test sur
Chromium, Firefox et WebKit, en desktop et mobile. Elle utilise un worker unique
afin que les mesures LCP/CLS/INP ne soient pas faussées par une contention CPU.
Chaque test conserve son propre contexte navigateur vierge.

Les budgets versionnés sont dans `config/performance-budgets.json` et contrôlés par
`npm run test:performance-budgets`. Ils couvrent le JavaScript total, le plus gros
chunk, l'entrée, la route Auth, les assets déployés et les Web Vitals mobiles.
