# Audit des dépendances

État réévalué le **8 août 2026** avec le lockfile courant et `npm audit`, sans
`--force`. Ce document décrit l'état observé ; le script
`scripts/check-dependency-audit.mjs` reste le garde-fou exécutable.

## Versions réellement installées

La mise à jour groupée de l'outillage a porté la base sur :

- Node `>=22.22.2 <23` pour l'exécution du projet ;
- React/React DOM `19.2.8`, React Router DOM `7.18.1` et Zustand `5.0.14` ;
- Vite `8.1.5`, `@vitejs/plugin-react` `6.0.4` et TypeScript `7.0.2` ;
- Vitest/coverage `4.1.10`, Playwright `1.62.0`, jsdom `30.0.1` et Biome `2.5.6` ;
- Supabase JS `2.111.0` et CLI `2.110.0` ;
- `@types/node` `26.1.2`.

`@types/node` 26 ne correspond plus à la cible runtime Node 22. Cela ne change pas
le moteur réellement exécuté, mais élargit à tort le contrat de compilation et
doit être réaligné avant de considérer la montée d'outillage validée. TypeScript 7
doit également rester traité comme une montée majeure jusqu'à validation complète
des plugins et types générés.

Le bundle autoritaire conserve l'alias isolé `esbuild-authority@0.25.0`. Il n'est
chargé que par `scripts/build-authority-bundle.mjs` afin de ne pas modifier le hash
des anciens rulesets par une montée implicite de l'outil.

## Vulnérabilités courantes

`npm audit` remonte actuellement trois entrées hautes correspondant à deux causes :

1. `nanoid@3.3.16`, transitif via PostCSS, est concerné par
   `GHSA-2v37-7h3g-55p8`; une version `>=3.3.17` est disponible ;
2. `react-router@7.18.1` et son effet direct `react-router-dom` sont concernés par
   `GHSA-qwww-vcr4-c8h2`; la correction compatible est `7.18.2`.

L'exception React Router écrite le 26 juillet ne reconnaît plus l'identifiant
courant de l'advisory et expire de toute façon le **10 août 2026**. L'application
reste une SPA `BrowserRouter` sans RSC ni Server Actions, ce qui limite
l'exploitabilité de cette alerte précise, mais ne rend pas la CI verte.

Au 8 août, `npm run audit:security` échoue donc avec :

```text
Unaccepted high/critical npm advisories: nanoid (high), react-router (high)
```

Il est interdit de qualifier la chaîne de dépendances de saine tant que ce résultat
n'est pas corrigé. La résolution attendue est une mise à jour du lockfile vers
`nanoid >=3.3.17` et `react-router-dom >=7.18.2`, puis le retrait de l'exception
temporaire si l'audit devient vide. Une `override` npm n'est acceptable qu'après
validation des dépendants PostCSS/Vite.

## Validation requise après correction

- `npm ci`, TypeScript, Biome et le build Vite/Rolldown ;
- `npm run audit:security` sans exception haute ou critique ;
- Vitest avec couverture et tests Supabase live ;
- les parcours Playwright dev et la matrice du build de production ;
- le bundle esbuild du moteur autoritaire et son contrôle de hash ;
- `@types/node` revenu sur la majeure 22, cohérente avec `engines.node`.
