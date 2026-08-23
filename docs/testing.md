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
`runAuthorityJournal`, `SupabaseAuthRepository`, `SupabaseRunRepository`,
`SupabaseDailyRunRepository`, `SupabasePlayerRepository`, `ProfilePage` et `runStore`.
Les seuils sont augmentés uniquement après ajout de tests de comportement couvrant
succès, refus, idempotence et panne réseau. Les contrats Daily sont en plus soumis à
des mutations champ par champ afin que les branches de validation PostgREST ne puissent
pas devenir permissives silencieusement.

## Sorties

La console n'affiche que le résumé global. Vitest produit aussi `coverage/index.html`,
`coverage/lcov.info` et `coverage/coverage-summary.json`. La job `validate` archive le
dossier `coverage/` pendant 14 jours, y compris lorsque la validation échoue.

Les tests Supabase live restent dans `npm run test:db`; leur objectif est la preuve
RLS/RPC et non l'augmentation artificielle de la couverture JavaScript.

## Frontières TypeScript

`npm run typecheck` compile trois contrats indépendants avant les tests : application,
scripts/configurations Node et E2E Playwright. `tsconfig.scripts.json` active
`checkJs` pour les `.mjs`, couvre les scripts TypeScript et les configurations Vite,
Tailwind et PostCSS, avec uniquement `ES2023` et les types Node. Le fixture
`scripts/typecheck/node-globals.ts` utilise des erreurs attendues pour garantir que
`document` et `window` ne deviennent pas disponibles accidentellement.

`tsconfig.e2e.json` couvre les specs et les deux configurations Playwright. Il déclare
explicitement Node pour le runner, ainsi que DOM/DOM.Iterable pour les callbacks
exécutés dans la page. `tests/toolingTypecheckContract.test.ts` verrouille ces listes,
les inclusions et le branchement des trois compilations dans `npm run check`.

## Politique des advisors Supabase

`config/supabase-advisors.json` versionne le contrat commun aux advisors sécurité et
performance. Toute `ERROR` sécurité échoue sans exception. Les constats acceptés sont
identifiés exactement par type, `cacheKey`, nom et niveau, avec une justification et
une date d'expiration. Une alerte inconnue, même `INFO`, une identité qui change ou
une exception expirée fait échouer le contrôle.

`npm run db:advisors` applique ce contrat à la stack locale. `npm run db:validate`
l'exécute après le reset et l'audit de sécurité, tandis que le preflight de release
relance `node scripts/check-supabase-advisors.mjs --linked` sur le projet Supabase
explicitement lié. Les exceptions actuelles expirent le 30 septembre 2026 et doivent
être supprimées, corrigées ou renouvelées avec une nouvelle justification avant
cette date.

La protection Auth contre les mots de passe compromis n'est pas activée ni couverte
par ce contrôle DB : son activation payante reste explicitement différée. Elle ne
doit pas être présentée comme une gate validée par les advisors versionnés.

`repositoryIntegration.database.test.ts` appelle réellement
`getPlayerRunHistory()` contre Supabase local. Il valide le nested-select via les noms
de FK migrés, les métadonnées de version de l'attempt, les membres de l'équipe, la
pagination et le résultat vide sous RLS.

Chaque suite d'intégration DB porte obligatoirement le suffixe
`*.database.test.ts` sous `tests/`. Ce contrat est versionné dans
`config/database-tests.json` : aucun runner ni workflow ne maintient de liste de
tests en parallèle.

Toute occurrence de `skip`, `skipIf` ou `todo` dans ces suites fait échouer
`npm run test:db`, sauf correspondance exacte avec une entrée justifiée de
`skipAllowlist`. Les seules exceptions actuelles sont les gardes qui permettent à la
suite générique sans Supabase local d'ignorer les tests live ; `db:validate` passe par
`run-local-db-tests.mjs`, fournit les identifiants locaux à `test:db` et les exécute
réellement.

`npm run test:db:list` applique ces mêmes règles et affiche, dans l'ordre, chaque
fichier que `npm run test:db` transmettra à Vitest. Cette commande ne démarre ni
Supabase ni les tests et sert de preuve locale de discovery.

## Clean-room CI

La job `clean-room` repart d'un checkout sans `node_modules`, `dist` ni couverture et
n'utilise pas le cache npm de `setup-node`. Les assets Riot sont un paquet versionné :
ils sont donc vérifiés, pas téléchargés silencieusement.

Supabase est d'abord restauré à la migration v9 (`20260730300000`), puis migré vers
la version courante (ruleset v16 au 23 août 2026) afin de tester un upgrade réel.
La job compare ensuite les types TypeScript régénérés, effectue un reset complet
et exécute les tests RLS/RPC live.

Après `npm run check`, `scripts/verify-production-build.mjs` sert `dist` avec le
contrat `vercel.json` et vérifie les deep links, la CSP, les assets d'entrée et un vrai
404 pour un asset absent.

Le job E2E dédié vérifie lui-même son checkout sans résidus. La suite fonctionnelle
utilise deux workers Chromium et contient deux runs UI complètes : victoire six
biomes grâce à une rune de test injectée au build, et défaite réelle. Les specs
d'interface plus courtes peuvent injecter les stores pour isoler leur contrat et
ne doivent pas être présentées comme des runs complètes.

Une seconde configuration sert le build de production et exécute un smoke test sur
Chromium, Firefox et WebKit, en desktop et mobile. Elle utilise un worker unique pour
limiter la contention et chaque test conserve son propre contexte navigateur vierge.
Cette matrice vérifie la compatibilité ; elle ne porte plus le budget Web Vitals.

Les budgets versionnés sont dans `config/performance-budgets.json` et contrôlés par
`npm run test:performance-budgets`. Ils couvrent le JavaScript total, le plus gros
chunk, l'entrée, la route Auth, les assets déployés, une marge globale minimale de 10 %
et les cinq chunks les plus lourds. Le rapport détaillé est écrit dans
`performance-report/bundle-report.json`.

Après le build, `npm run test:performance-preview` démarre une vraie preview Vite,
ouvre `/auth` avec Chromium et écrit `performance-report/preview-report.json`. Ce test
vérifie notamment que les chunks champions, Database, Admin et légal ne sont pas
téléchargés sur cette route publique. Il exécute aussi un warm-up puis cinq contextes
Pixel 5 isolés avec CPU ralenti ×4 et réseau versionné. Chaque échantillon doit produire
un LCP et une interaction INP non nuls ; le p75 de LCP/CLS/INP est comparé aux budgets
de laboratoire. Le détail est écrit dans
`performance-report/web-vitals-report.json`.

Le job CI `validate` exécute cette commande sans tolérance d'échec et archive tout le
dossier `performance-report/` pendant 30 jours. Les cinq points, le warm-up, le profil,
le SHA et l'agrégat restent donc consultables entre les runs, au lieu de ne conserver
qu'une valeur console. La télémétrie terrain Vercel reste hors de cette gate.

## CSP et styles dynamiques

`npm run csp:styles:check` analyse tous les fichiers source et refuse les styles
statiques inline, les mutations directes du DOM et tout binding dynamique absent de
`config/csp-inline-styles.json`. Les tests `cspDynamicStyles.test.tsx` protègent les
valeurs et bornes des jauges PV/PM/XP ainsi que les coordonnées et interactions SVG de
la carte. `productionConfig.test.ts` et `test:production-build` vérifient les politiques
CSP appliquée et Report-Only servies sur les routes profondes.
