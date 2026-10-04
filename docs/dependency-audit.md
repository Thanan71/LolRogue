# Audit des dépendances

Versions relues dans le lockfile le **4 octobre 2026**. Les résultats d'audit
historiques ci-dessous sont datés et doivent être recalculés avec `npm audit`, sans
`--force`. Ce document décrit l'état observé ; le script
`scripts/check-dependency-audit.mjs` reste le garde-fou exécutable.

## Versions résolues dans le lockfile

La mise à jour groupée de l'outillage a porté la base sur :

- Node `24.x` pour l'exécution du projet et la compatibilité Vercel ;
- React/React DOM `19.3.0`, React Router DOM `7.18.4` et Zustand `5.0.15` ;
- Vite `8.3.1`, `@vitejs/plugin-react` `6.1.1` et TypeScript `7.0.2` ;
- Vitest/coverage `5.0.2`, Playwright `1.63.0`, jsdom `30.1.1` et Biome `2.5.14` ;
- Supabase JS `2.117.2` et CLI `2.118.0` ;
- `@types/node` `24.13.3`.

Le runtime, `.nvmrc` et les quatre jobs CI ciblent désormais Node 24, pris en charge
par Vercel. `@types/node` est épinglé sur la même majeure afin que les scripts ne
puissent pas compiler par erreur contre une API apparue après Node 24. TypeScript 7
reste une montée majeure et demeure couvert par le typage, le build, les tests et
la génération des types Supabase.

Preuves reproductibles : `npm run node:contract` compare runtime déclaré,
`.nvmrc`, workflows et types verrouillés ; `npm ls --depth=0` révèle les versions
installées et `npm run audit:security` refuse toute alerte haute/critique courante.
Exécuter ces commandes sous Node 24 : un shell resté sur Node 22 n'est pas conforme.

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

Au 9 août, `npm audit` et `npm run audit:security` retournent :

```text
npm audit: no high or critical vulnerabilities.
```

Le script échoue désormais sur toute future alerte haute ou critique sans
allowlist. `nanoid` reste transitif et a été corrigé par résolution normale du
lockfile, sans `override`.

## Correction du 3 octobre 2026

L'avis [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
concerne toutes les versions publiées de `braces` jusqu'à 3.0.3, sans version
corrigée disponible. La chaîne `patch-package` → `find-yarn-workspace-root` →
`micromatch` → `braces` faisait échouer le contrôle de sécurité de la CI.

`patch-package` est retiré. Le postinstall utilise désormais un applicateur Node
limité au correctif Web Storage de `@supabase/auth-js@2.117.2`. Le fichier `.patch`
reste la source du correctif ; l'applicateur vérifie la version et le contenu des
deux fichiers avant toute écriture, accepte un patch déjà appliqué et échoue si le
SDK diverge. Les tests couvrent ces garanties et le démarrage réel des SDK ESM/CJS
avec Web Storage bloqué. Le contrôle d'audit conserve son refus de toute alerte
haute ou critique, sans exception.

## Validation requise après correction

- `npm ci`, TypeScript, Biome et le build Vite/Rolldown ;
- `npm run audit:security` sans exception haute ou critique ;
- Vitest avec couverture et tests Supabase live ;
- les parcours Playwright dev et la matrice du build de production ;
- le bundle esbuild du moteur autoritaire et son contrôle de hash ;
- runtime, `.nvmrc`, CI et `@types/node` cohérents sur la majeure 24.
