# Audit des dépendances

Audit réévalué le 26 juillet 2026 avec `npm audit`, sans `--force` et sans
contournement des peer dependencies.

## Versions corrigées

La chaîne de build et de test est désormais épinglée sur :

- Vite `8.1.5`, avec Rolldown et une exigence Node `>=22.12.0 <23` ;
- `@vitejs/plugin-react` `6.0.4` ;
- Vitest et `@vitest/coverage-v8` `4.1.10` ;
- esbuild `0.25.0`, installé sous l'alias isolé `esbuild-authority` pour le bundle
  Edge autoritaire.

Cette montée supprime les anciennes alertes critiques et hautes de Vite, Vitest,
`vite-node`, `@vitest/mocker`, esbuild et la chaîne de couverture. La configuration
de chunks utilise maintenant `build.rolldownOptions.output.codeSplitting`. Vitest 4
emploie un remappage V8 basé sur l'AST : les seuils par domaine ont été recalés sur
la nouvelle baseline mesurée, sans exclure de fichiers.

esbuild `0.25.0` est la première version publiée hors de la plage vulnérable
`<=0.24.2`. Son bundle normalisé est identique à celui du ruleset autoritaire v1 ;
le hash et la vérification des attempts déjà ouverts restent donc valides. L'alias
évite de le présenter à Vite 8 comme son peer optionnel : Vite utilise Rolldown,
tandis que seul `scripts/build-authority-bundle.mjs` charge cet esbuild dédié.

## Exception temporaire React Router

`npm audit` signale deux entrées hautes (`react-router` et son effet direct
`react-router-dom`) pour un même avis :
[GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2).
L'avis concerne le traitement CSRF des Server Actions en mode React Server
Components.

L'exception est acceptée jusqu'au **10 août 2026** avec les limites suivantes :

- version exacte `react-router-dom@7.18.1`, qui conserve les correctifs XSS et DoS
  des versions précédentes ;
- application exclusivement client rendue par `BrowserRouter` ;
- aucun Data Router, Server Action, SSR ou React Server Component ;
- hébergement Vercel statique avec réécriture vers `index.html`, sans runtime
  serveur React Router.

Le script `npm run audit:security` vérifie ces hypothèses dans les sources, refuse
toute autre alerte critique/haute et échoue automatiquement après l'échéance.
Il est inclus dans `npm run check` et donc dans la CI. À l'échéance, mettre à jour
React Router vers une version corrigée, ou retirer la dépendance si aucun correctif
compatible n'est publié ; ne pas prolonger l'exception sans une nouvelle analyse.

## Validation de la montée

La migration doit conserver verts :

- TypeScript, Biome et le build Vite/Rolldown ;
- les tests Vitest avec la couverture V8 ;
- les tests Auth/RLS sur Supabase local ;
- le parcours Playwright ;
- le bundle esbuild du moteur autoritaire et son hash de contenu.
