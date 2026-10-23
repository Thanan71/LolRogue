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

Le script `postinstall` exécute `scripts/apply-supabase-auth-patch.mjs`, y compris
dans `npm ci`. Cet applicateur utilise uniquement les modules natifs de Node et
lit le fichier `.patch` ci-dessus, qui reste la source du correctif. Il exige
la version exacte 2.117.2 du SDK, les deux chemins de distributions attendus et
un seul hunk par fichier. Il valide les deux contenus avant toute écriture,
accepte une réapplication déjà complète et échoue si un fichier manque, diverge
ou contient plusieurs correspondances. `patch-package` et sa chaîne de
dépendances vulnérables `find-yarn-workspace-root` / `micromatch` / `braces`
ont été retirés ; aucune exception d'audit n'est ajoutée.

Lors d'une montée de version
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
`tests/supabaseAuthPatch.test.mjs` vérifie dans des répertoires temporaires
l'application, la réapplication et les refus de version, contenu ou format
inattendus, sans toucher au SDK installé.

Les déclarations tierces sont corrigées séparément par
`scripts/lib/dependency-type-patches.mjs`, appelé par le même postinstall.
Supabase Auth 2.118.0 redéfinit `toJSON` via `Omit<PublicKeyCredential, 'toJSON'>`.
Son sérialiseur de compatibilité conserve des champs optionnels et les extensions
brutes ; son résultat diffère du JSON natif du DOM TypeScript 7. Ce correctif
préserve ce contrat SDK au lieu d'imposer des champs absents du runtime.
Speed Insights 2.0.0 utilise le namespace JSX exporté par React 19.
Ces corrections portent uniquement sur les déclarations CJS/ESM ; chaque fichier
complet est vérifié par SHA-256 et chaque version est exigée avant toute écriture.
Aucune exception du typecheck strict n'est nécessaire. Sources de référence :
https://github.com/supabase/supabase-js/blob/v2.118.0/packages/core/auth-js/src/lib/webauthn.dom.ts
et https://react.dev/blog/2024/04/25/react-19-upgrade-guide#the-jsx-namespace-in-typescript.
