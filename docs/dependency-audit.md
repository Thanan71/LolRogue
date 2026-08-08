# Audit des dépendances

État réévalué le **8 août 2026** avec le lockfile courant et `npm audit`, sans
`--force`. Ce document décrit l'état observé ; le script
`scripts/check-dependency-audit.mjs` reste le garde-fou exécutable.

## Versions réellement installées

La mise à jour groupée de l'outillage a porté la base sur :

- Node `24.x` pour l'exécution du projet et la compatibilité Vercel ;
- React/React DOM `19.2.8`, React Router DOM `7.18.2` et Zustand `5.0.14` ;
- Vite `8.1.5`, `@vitejs/plugin-react` `6.0.4` et TypeScript `7.0.2` ;
- Vitest/coverage `4.1.10`, Playwright `1.62.0`, jsdom `30.0.1` et Biome `2.5.6` ;
- Supabase JS `2.111.0` et CLI `2.110.0` ;
- `@types/node` `26.2.0`.

Le runtime, `.nvmrc` et les quatre jobs CI ciblent désormais Node 24, pris en charge
par Vercel. Aucun paquet n'a été rétrogradé : `@types/node` reste en 26.2.0.
TypeScript 7 reste une montée majeure et demeure couvert par le typage, le build,
les tests et la génération des types Supabase.

Le bundle autoritaire conserve l'alias isolé `esbuild-authority@0.25.0`. Il n'est
chargé que par `scripts/build-authority-bundle.mjs` afin de ne pas modifier le hash
des anciens rulesets par une montée implicite de l'outil.

## Régressions corrigées

La mise à jour groupée avait introduit trois entrées hautes correspondant à deux
causes :

1. `nanoid@3.3.16`, transitif via PostCSS, concerné par
   `GHSA-2v37-7h3g-55p8` ; le lockfile utilise maintenant `3.3.18` ;
2. `react-router@7.18.1` et son effet direct `react-router-dom`, concernés par
   `GHSA-qwww-vcr4-c8h2` ; la dépendance directe est maintenant `7.18.2`.

L'exception React Router temporaire et son analyse conditionnelle ont été retirées
du script : il n'existe plus d'alerte haute acceptée par dérogation.

Au 8 août, `npm audit` et `npm run audit:security` retournent :

```text
npm audit: no high or critical vulnerabilities.
```

Le script échoue désormais sur toute future alerte haute ou critique sans
allowlist. `nanoid` reste transitif et a été corrigé par résolution normale du
lockfile, sans `override`.

## Validation requise après correction

- `npm ci`, TypeScript, Biome et le build Vite/Rolldown ;
- `npm run audit:security` sans exception haute ou critique ;
- Vitest avec couverture et tests Supabase live ;
- les parcours Playwright dev et la matrice du build de production ;
- le bundle esbuild du moteur autoritaire et son contrôle de hash ;
- runtime, `.nvmrc`, CI et `@types/node` cohérents sur la majeure 26.
