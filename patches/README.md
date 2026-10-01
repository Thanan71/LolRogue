# Compatibilité du SDK Auth avec Web Storage bloqué

`@supabase+auth-js+2.117.2.patch` protège la lecture interne de
`supabase.gotrue-js.locks.debug` dans les distributions ESM et CommonJS.
Le SDK sonde d'abord les écritures de Web Storage, mais un navigateur peut
autoriser `setItem` et refuser `getItem`. Sans protection, cette lecture exécutée
au chargement du module empêche même l'écran invité de s'afficher.

Le patch transforme seulement cette expression en lecture protégée : si elle
lève une erreur, le debug des verrous reste désactivé. Il ne modifie ni les
verrous, ni les sessions, ni les déclarations TypeScript et n'altère pas les
prototypes du navigateur. La version publiée 2.117.2 présente encore cette
lecture non protégée dans les deux distributions, vérifiées le 1er octobre 2026.
Les deux contextes du patch 2.116.0 correspondent exactement à cette version ;
le patch reste donc limité à la même protection de lecture.

`patch-package` est épinglé à 8.0.1 ; le script `postinstall` applique le patch
avec `--error-on-fail`, y compris dans `npm ci`. Lors d'une montée de version
du SDK, vérifier la correction amont et retirer le patch si elle est présente,
ou le réévaluer explicitement pour la nouvelle version. Ne pas ignorer son
échec d'application. Cette compatibilité runtime est indépendante des exceptions
temporaires de déclarations du contrôle `typecheck:strict`.

Preuves : `tests/supabaseStorageBootstrap.test.mjs` charge les vraies entrées SDK
ESM/CJS dans des contextes navigateur isolés (getter révoqué, lecture seule
bloquée, drapeaux vrais/faux et verrous conservés).
`tests/supabaseAuthStorage.test.ts` vérifie séparément l'adaptateur opaque de
session, y compris de vrais clients configurés avec réseau simulé.
`e2e/storage-rehydration.spec.ts` vérifie le démarrage et la navigation invité
avec les quatre modes de panne Web Storage.
