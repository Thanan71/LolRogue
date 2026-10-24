# Audit des dépendances

Versions relues dans le lockfile le **13 octobre 2026** pour ARCH-18, depuis
`dev` à `70b0a614`. Les résultats d'audit
historiques ci-dessous sont datés et doivent être recalculés avec `npm audit`, sans
`--force`. Ce document décrit l'état observé ; le script
`scripts/check-dependency-audit.mjs` reste le garde-fou exécutable.

## Versions résolues dans le lockfile

La mise à jour groupée de l'outillage a porté la base sur :

- Node `24.x` pour l'exécution du projet et la compatibilité Vercel ;
- React/React DOM `19.3.0`, React Router DOM `7.18.4` et Zustand `5.0.15` ;
- Vite `8.3.2`, `@vitejs/plugin-react` `6.1.1` et TypeScript `7.0.2` ;
- Vitest/coverage `5.0.3`, Playwright `1.63.0`, jsdom `30.1.1` et Biome `2.5.15` ;
- Supabase JS/Auth `2.117.2` et CLI `2.119.0` ;
- Tailwind et son plugin PostCSS `4.3.3`, PostCSS `8.5.28`, Autoprefixer `10.6.1` ;
- `@types/node` `24.13.3`.

Le runtime, `.nvmrc` et les sept jobs CI ciblent désormais Node 24, pris en charge
par Vercel. `@types/node` est épinglé sur la même majeure afin que les scripts ne
puissent pas compiler par erreur contre une API apparue après Node 24. TypeScript 7
reste une montée majeure et demeure couvert par le typage, le build, les tests et
la génération des types Supabase.

Preuves reproductibles : `npm run node:contract` compare runtime déclaré,
`.nvmrc`, workflows et types verrouillés ; `npm ls --depth=0` révèle les versions
installées et `npm run testing -- security` refuse toute alerte haute/critique courante.
Exécuter ces commandes sous Node 24 : un shell resté sur Node 22 n'est pas conforme.

Le bundle autoritaire conserve l'alias isolé `esbuild-authority@0.25.0`. Les onze
scripts de construction, génération et reproduction authority/balance ainsi que
le test de bootstrap Auth l'utilisent. Une montée implicite de cet outil modifierait
les octets des bundles historiques. Le moteur courant reste `0.2.5` et les archives
sont conservées sans changement de contenu.

## Usage vérifié et baseline ARCH-18

L'examen AST des 847 fichiers TS/JS suivis dans la baseline `70b0a614`, hors bundles
gelés et données générées, n'a rencontré aucune erreur de parsing. Ce périmètre
précède les nouveaux fichiers d'ARCH-S5. Il est complété par les configurations,
commandes et tests : l'absence d'un import explicite ne prouve pas l'inutilité d'un
plugin, d'un binaire, d'un environnement de test ou d'un paquet de types.

| Dépendances | Consommateurs vérifiés | Décision |
| --- | --- | --- |
| Supabase JS | Client/transport, repositories, scripts de restauration, tests connectés | Conserver le pin exact et le patch Auth associé |
| React, React DOM, Router, Zustand | Application, routes, stores et tests UI | Conserver |
| Analytics, Speed Insights | `src/main.tsx`, contrats de configuration et de typage | Conserver |
| Tailwind, plugin PostCSS, PostCSS, Autoprefixer | `postcss.config.js`, `tailwind.config.ts`, CSS/build Vite | Conserver ; le plugin déclaré dans `dependencies` intervient au build |
| Babel parser | Checker de frontières métier et tests de contrats AST | Conserver |
| Testing Library, jest-dom, user-event | Tests UI ; user-event vérifie combat, clavier et tooltips | Conserver les interactions réelles |
| Playwright, axe | Parcours navigateur et contrôles d'accessibilité | Conserver |
| Biome, TypeScript, types Node/React | CLI/checks et compilation ; types Node sur la majeure 24 | Conserver |
| Vite/plugin React, Vitest/coverage, jsdom | Configurations, commandes de tests, provider coverage et environnement jsdom | Conserver |
| Supabase CLI, esbuild authority | CLI locale épinglée et reproductibilité authority/balance | Conserver les versions exactes |

Les 29 dépendances directes restent toutes justifiées : huit déclarées dans
`dependencies` et 21 dans `devDependencies`. Seize déclarations utilisent une plage
de version ; le lockfile et `npm ci` fixent leur résolution. Les pins Supabase,
outils de déploiement, Node types et esbuild restent exacts. Aucune version, override
ou exception de sécurité n'est ajoutée. La documentation officielle
[Securing npm installs](https://supabase.com/docs/guides/security/npm-security)
confirme le rôle du lockfile et des installations gelées ; les paquets Supabase
restent également épinglés dans le manifeste.

Le lockfile contient 284 entrées de paquets pour 267 noms distincts, y compris les
binaires optionnels des autres plateformes. Seize noms ont plusieurs versions,
principalement les versions Lightning CSS utilisées par Vite et Tailwind ; les
autres sont `dom-accessibility-api`, `magic-string`, `js-tokens` et `whatwg-url`.
Ces résolutions répondent aux plages des consommateurs. Une déduplication forcée
ou un override n'est pas justifié par cet audit. `npm audit --json` retourne zéro
alerte pour toutes les sévérités le 13 octobre.

Le typage application/e2e garde `noUnusedLocals` et `noUnusedParameters` ; le typage
des scripts garde `checkJs`. Aucun import mort ni paquet supprimable n'est prouvé.
Les 59 fichiers d'entrée `scripts/*.{mjs,js,ts}` de la baseline ont une référence
dans les sources, commandes, tests ou documents suivis. ARCH-16 ajoute l'entrée
`scripts/check-generated-artifacts.mjs` au contrôle des artefacts, portant la tranche
complète à 60 entrées de scripts ; ARCH-18 n'en retire ni ajoute. Parmi les 40 entrées npm publiques, `format`
et `test:watch` n'ont pas d'appelant recensé : ils restent des utilitaires interactifs
existants. Le retrait des 72 anciens alias npm appartient à ARCH-S1 et n'est pas
compté comme un gain d'ARCH-18.

| Mesure | Avant ARCH-18 | Après le garde ARCH-18 |
| --- | --- | --- |
| Dépendances directes / entrées lock / noms distincts | 29 / 284 / 267 | 29 / 284 / 267 |
| Entrées npm publiques / fichiers d'entrée scripts | 40 / 59 | 40 / 59 |
| Alertes npm audit | 0 | 0 |
| Rapport d'erreur registre JSON, sortie 1 | Succès annoncé | Échec |
| Rapport absent `{}`, sortie 2 | Succès annoncé | Échec |
| Alertes hautes/critiques | Bloquées | Bloquées |
| Alertes basses/modérées dans un rapport valide | Acceptées | Acceptées |

La baseline CI du commit candidat `e517370b`, workflow `38437033958`, mesure les
jobs complets : security 19 s, build/assets 77 s, static 27 s, unit/coverage 538 s,
DB 178 s, clean-room 755 s et browser 868 s. Ils incluent leurs installations et
préparations propres ; ce sont des mesures historiques, pas des gains attribuables
au garde. La baseline de couplage comprend 429 fichiers, 2 001 imports, 1 819 imports
internes, 457 imports de types, zéro import de barrel services et zéro violation,
avec le SCC historique des six stores. Les mesures finales de bundles, installation
et CI de la tranche complète sont consignées dans la validation ARCH-S5 ; ce lot ne
change aucune dépendance du navigateur ou du moteur.

## Contrat du contrôle de sécurité

`check-dependency-audit.mjs` exécute le npm local avec `audit --json` et délègue la
validation pure à `scripts/lib/dependency-audit.mjs`. Le succès requiert un rapport
npm v2 complet : objet `vulnerabilities`, compteurs entiers positifs ou nuls par
sévérité et total cohérent avec les entrées. Une erreur de lancement, un signal,
un statut inattendu, un JSON d'erreur registre, absent/corrompu ou de format non pris
en charge bloque. La sortie npm 1 est recevable seulement si un rapport valide
contient effectivement des alertes ; le seuil reste haut/critique, sans allowlist.
Un futur format de rapport nécessite une adaptation explicite et ses preuves.

`tests/dependencyAudit.test.mjs` couvre le rapport sain, les alertes sous/au-dessus
du seuil, les erreurs de processus/registre, les rapports incomplets, les compteurs
malformés et les divergences entre résumé et entrées. Un processus lancé avec un
faux npm reproduit le défaut original et vérifie la sortie d'échec réelle du CLI,
sans réseau ni modification de l'installation du projet.

## Dette résiduelle suivie

| Sujet | Responsable | Condition de réexamen |
| --- | --- | --- |
| Patch Auth `2.118.0` | Mainteneurs authentication/outillage | Vérifier un correctif amont sur les vrais SDK ESM/CJS avec Web Storage bloqué, puis les parcours Auth, avant montée de version ou retrait du postinstall |
| esbuild authority `0.25.0` | Mainteneurs authority/balance | Refaire les checks de sources, hashes et toutes les reproductions historiques avant toute migration de l'outil ; conserver les anciens octets |
| SCC historique des six stores | Mainteneurs architecture | Tranche métier dédiée avec tests de cycle de vie ; aucune rupture de store dans cet audit |
| `format` / `test:watch` sans appelant automatique | Mainteneurs outillage | Vérifier l'usage interactif et une migration autorisée avant retrait |
| Évolution du format npm audit et alertes futures | Mainteneurs outillage | Adapter le garde avec preuves ; corriger les versions sur justification, sans `--force` ni dérogation haute/critique |

## Régressions corrigées

La mise à jour groupée avait introduit trois entrées hautes correspondant à deux
causes :

1. `nanoid@3.3.16`, transitif via PostCSS, concerné par
   `GHSA-2v37-7h3g-55p8` ; le lockfile utilise maintenant `3.3.18` ;
2. `react-router@7.18.1` et son effet direct `react-router-dom`, concernés par
   `GHSA-qwww-vcr4-c8h2` ; cette correction avait épinglé la dépendance directe
   en `7.18.2`, avant la résolution `7.18.4` consignée plus haut.

L'exception React Router temporaire et son analyse conditionnelle ont été retirées
du script : il n'existe plus d'alerte haute acceptée par dérogation.

L'audit consigné le 9 août retournait :

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

Le 7 octobre 2026, le clone propre a détecté
[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
sur `source-map-js@1.2.1`. Le lockfile résout désormais cette dépendance transitive
en `1.2.2`, version corrigée compatible avec les plages déclarées. Aucun override
ni exception d'audit n'est ajouté. Le contrôle `npm run testing -- security` et le build
doivent passer sur cette nouvelle résolution.

- `npm ci`, TypeScript, Biome et le build Vite/Rolldown ;
- `npm run testing -- security` sans exception haute ou critique ;
- Vitest avec couverture et tests Supabase live ;
- les parcours Playwright dev et la matrice du build de production ;
- le bundle esbuild du moteur autoritaire et son contrôle de hash ;
- runtime, `.nvmrc`, CI et `@types/node` cohérents sur la majeure 24.

Le lot ciblé ARCH-18 du 13 octobre passe 83 tests dans quatre fichiers :
`dependencyAudit`, `supabaseAuthPatch`, `supabaseStorageBootstrap` et
`supabaseAuthStorage`. Le typage des scripts, Biome explicite et l'audit réel passent.
`npm run balance -- check` reproduit les dix baselines authority, les trois
Early Top, 7 560 combats par moteur, 1 000 seeds de carte/économie et les trois
campagnes Veigar de 180 runs appariées ; ses 148 tests dans 31 fichiers passent
(phase Vitest : 172,64 s). Les résultats CI/distants et les validations complètes
de la tranche sont rapportés séparément dans la validation ARCH-S5.

## Mise à jour Supabase du 23 octobre 2026

Le SDK JS et ses paquets internes passent de `2.117.2` à `2.118.0` (PR #233).
Le [code Auth publié en 2.118.0](https://github.com/supabase/supabase-js/blob/v2.118.0/packages/core/auth-js/src/lib/locks.ts)
évalue toujours le drapeau de diagnostic des verrous en lisant `localStorage`
sans protéger l'ensemble de l'expression. Le test de capacité protège ses propres
accès, mais un `getItem` refusé ou un getter devenu inaccessible après ce test
peut encore empêcher l'import du SDK. Ce défaut de disponibilité n'est pas
un contournement de l'authentification ou des règles RLS.

Le patch est donc conservé et relu pour la version exacte `2.118.0` : les deux
hunks CJS/ESM correspondent sans changement au tarball npm. Le postinstall
continue de refuser toute autre version, tout contenu divergent et toute cible
non revue avant d'écrire. Les tests exécutent les vrais points d'entrée CJS/ESM
avec des getters et lectures Web Storage qui lèvent `SecurityError` ou
`QuotaExceededError`, et vérifient que le drapeau retombe sur `false`. Les tests
de stockage conservent les sessions en mémoire quand les écritures échouent
et empêchent le retour d'une session après une déconnexion non persistable.

Les [notes de version 2.118.0](https://github.com/supabase/supabase-js/releases/tag/v2.118.0)
ajoutent la prise en charge de `content-encoding` aux uploads Storage et corrigent
le typage PostgREST des champs calculés et des surcharges RPC sans argument.
Elles n'annoncent pas de correction Auth pour ce défaut. Les corrections de
sécurité Next/sharp mentionnées concernent l'outillage et les exemples amont ;
elles ne démontrent pas de vulnérabilité corrigée dans le client LolRogue.
Aucun schéma, migration, secret ou déploiement distant n'est modifié par ce lot.
