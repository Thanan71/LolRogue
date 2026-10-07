# Sprint F — fiabilité produit et exploitation

Preuve locale du 7 octobre 2026. Les cinq tâches sont implémentées sur des
branches distinctes, puis intégrées dans `feat/sprint-f-integration`.
Cette livraison ne constitue pas une autorisation de bêta.

## Livrables et branches

| Tâche | Branche | Résultat |
| --- | --- | --- |
| `P1-SEC-03` | `feat/p1-sec-03-server-only` | Inventaire des 22 tables `public`, décision motivée de conserver les trois tables internes sous RLS sans grants clients, tests SQL/Data API réels et exceptions INFO limitées aux trois objets. |
| `P1-RUN-02` | `feat/p1-run-02-rejection-ux` | Messages FR/EN actionnables, diagnostics copiables, absence de récompenses/retry après rejet terminal, retry conservant commande et snapshot, persistance après refresh/menu et priorité de l'erreur amélioration sur Game Over. |
| `P1-RUN-03` | `feat/p1-run-03-incident-policy` | Politique de preuve serveur, trace rejetée immuable, registre d'incidents avec inconnues explicites et procédure support/audit privée. |
| `P2-OBS-01` | `feat/p2-obs-01-technical-slo` | Compteurs locaux minimisés avec versions gameplay/progression distinctes, seuils et rétention ; rapport SQL opérateur par moteur/gameplay avec dénominateurs complets et backlog ancien. |
| `P2-DOC-01` | `feat/p2-doc-01-evidence-status` | Inventaire objectif des onze P0, statuts et gates recalculés, contrats DB réels, Node/types 24 et contrôles reproductibles des grants/advisors/cron de la cible. |

L'historique conserve les commits par sous-tâche. Le correctif de dépendance
`c96b888` résout `source-map-js` en `1.2.2` dans le lockfile, sans nouvelle exception
d'audit ni override.

Derniers commits d'implémentation : SEC `bd4c66d`, RUN02 `0a1805a`, RUN03
`0422fd6`, OBS `f4b469b`, DOC `c96b888`. Le commit d'intégration du code testé est
`becaa48f40755fd18b9f5abce42afe78608494fd` ; la clôture documentaire ultérieure
modifie seulement ce compte rendu et le TODO.

## Clone propre et gates de code

Le clone indépendant `/tmp/lolrogue-sprint-f-cleanroom-20261007` utilise Node
`24.19.0` et ses propres dépendances installées par `npm ci`, sans symlink de
`node_modules`. Sur le SHA de code ci-dessus :

- `npm run check` : **224 fichiers et 2 084 tests réussis**, 7 fichiers/43 tests
  ignorés dans cette suite ; les contrats DB ont la preuve séparée ci-dessous.
  Format, lint, CSP, trois typechecks, contrat Node, audit, cohérence documentaire
  de release, couverture, reconstruction des assets, build et smoke du build ont
  réussi. Couverture : lignes 87,05 %, branches 75,89 %.
- `npm run audit:security` : aucun signal élevé ou critique.
- `npm run test:performance-budgets` : **580 059 octets gzip** de JavaScript sur
  650 000, marge **10,76 %** (minimum 10 %) ; entrée initiale 214 524 sur 215 000,
  Auth 218 533 sur 225 000. Les six budgets de chunks et l'isolation Auth passent.
- Build : **227 assets Riot** vérifiés ; deep links, CSP et réponse 404 sur asset
  absent validés par `test:production-build`.

## Preuve PostgreSQL et Data API

`npm run db:validate` a réussi sur `be88c77e` : **14 fichiers, 86 tests réussis**,
après réinitialisation et migrations de la stack Supabase locale jetable. Les
contrôles lint, sécurité des fonctions/vues/grants, advisors, index, dérive des
migrations et types générés ont aussi réussi. Les modifications ultérieures
concernent uniquement les notifications et l'import des métriques sous Node.

Les permissions sont exercées avec de vrais rôles SQL et des sessions Data API
locales anon/authentifiée/administrateur. Les refus attendus doivent être `42501`,
pas simplement une réponse vide. Les contrats repositories, crédit idempotent et
absence de récompense pour une trace rejetée sont vérifiés sur PostgreSQL.
Le rapport SLO est exécuté avec fixtures en transaction annulée, y compris les
seals bloqués/expirés, l'absence de trafic et un backlog dépassant 30 jours.

Les trois exceptions sécurité INFO `rls_enabled_no_policy` restent bornées aux
objets internes documentés et expirent le **31 octobre 2026**. Aucun WARN/ERROR
sécurité n'est accepté par ces exceptions ; ignorer globalement cette famille
fait échouer la politique.

## Parcours navigateur

Les **quatre scénarios Chromium ont réussi**, sans skip, sur le SHA de code
`becaa48f40755fd18b9f5abce42afe78608494fd`.

La commande ciblée est :

```sh
npm run test:e2e -- e2e/run-rejection-recovery.spec.ts \
  e2e/connected-daily.spec.ts --project=chromium --workers=1
```

Le parcours connecté exige `VITE_PUBLIC_SUPABASE_URL` et
`VITE_PUBLIC_SUPABASE_ANON_KEY` de la stack **locale**. Ces paramètres sont fournis
au processus sans être enregistrés dans Git. Les quatre scénarios doivent
s'exécuter, sans skip du Daily connecté.

Le Daily exerce inscription, démarrage et reprise via l'interface contre Supabase
local. Les trois scénarios de rejet/retry exercent l'interface, les stores et la
persistance réels, avec identité synthétique et méthodes distantes
`appendCommands`/`sealAttempt`/`verifyAttempt` remplacées. Ils ne valident pas les
Edge Functions de production. Ils vérifient les deux langues, le terminal sans
récompenses ni retry, le diagnostic copié, refresh/menu et les mêmes arguments
de seal et snapshot au retry.

Sur preview locale du build, `agent-browser` a aussi réhydraté un état terminal
**synthétique** en viewport 390 × 844, en FR et EN : deux portraits chargés,
aucun débordement horizontal, aucune récompense, notification doublonnée ou
action de retry, et aucune erreur JavaScript remontée. Ce contrôle vérifie le
rendu et les assets de production, pas une validation authority distante.
Captures locales : `/tmp/lolrogue-sprint-f-final-fr.png` et
`/tmp/lolrogue-sprint-f-final-en.png`.

La matrice de build a validé **six configurations desktop/mobile** : les quatre
Chromium/WebKit passent avec `npm run test:e2e:production` ; les deux Firefox
passent après correction de l'environnement de lancement. La première commande
conserve ses deux échecs de lancement Firefox dans son journal, avant toute
ouverture de l'application ; ils ne sont pas présentés comme des tests réussis.

Sur ce Mac, la lecture du répertoire app-data Firefox renvoie `EPERM`. Le symptôme
correspond au [problème Playwright macOS 27](https://github.com/microsoft/playwright/issues/42768).
Le même binaire Firefox 155 est relancé avec `--override` vers un INI temporaire
contenant seulement `[App]` et un `Profile` de test unique. La configuration
temporaire importe la configuration production du dépôt, conserve ses scénarios
et ajoute ces arguments aux seuls projets Firefox ; `testDir` et `webServer.cwd`
pointent explicitement vers le clone. Aucun changement de HOME, de version de
navigateur, de package, de profil personnel ou de permissions système.

```sh
node node_modules/playwright/cli.js test \
  --config /private/tmp/lolrogue-sprint-f-firefox-environment.config.ts \
  --project=firefox-production --project=mobile-firefox-production --workers=1
```

Cette répétition a réussi : **2 tests, sans skip**. Le contrôle est reproductible
avec un INI/config équivalent ; il ne prouve pas que le lancement Firefox par
défaut fonctionne sur ce Mac.

## Journaux locaux

Les résultats détaillés sont conservés hors Git :

- `/tmp/lolrogue-sprint-f-final-check.log`
- `/tmp/lolrogue-sprint-f-final-db.log`
- `/tmp/lolrogue-sprint-f-final-e2e.log`
- `/tmp/lolrogue-sprint-f-final-budgets.log`
- `/tmp/lolrogue-sprint-f-final-production.log`
- `/tmp/lolrogue-sprint-f-final-firefox.log`

Les fichiers temporaires et les captures ne sont pas des preuves hébergées
pérennes ; ce compte rendu versionné conserve le SHA, les commandes, résultats
et limites pour les reproduire.

## Décisions et limites

- Aucune migration nouvelle n'est nécessaire pour ce sprint ; les tables internes
  restent dans `public` avec RLS et aucun privilège client.
- Aucune récompense rétroactive sans résultat canonique serveur suffisant. Aucun
  mécanisme de compensation ni réparation de trace n'est activé. Un geste
  indépendant peut être étudié manuellement selon la politique versionnée.
- Les nouveaux compteurs navigateur restent dans l'onglet pendant 15 tranches
  minute, sans pipeline de collecte globale ni notification automatique. Le
  rapport serveur est SELECT uniquement, accessible via connexion opérateur.
- Aucun relevé récent des ACL, cron, migrations, Edge Functions ou settings de
  production n'est attesté ici. Les documents distinguent configuration du dépôt
  et observation de la cible.
- La gate bêta reste **BLOQUÉE**, notamment sur `P0-I18N-01`, la preview candidate,
  les preuves live, les trois CI candidates et les validations humaines/externes.
  `release:readiness:check` contrôle la cohérence de ce blocage ; il n'autorise pas
  la release.
- Intégration Git locale uniquement : aucun push, PR, merge distant ou déploiement
  pour ce sprint. Le report des required checks distants pour raison de coût dans
  `TODO.md` ne supprime aucune condition de sortie bêta.

Les politiques détaillées sont dans [server-only-tables](server-only-tables.md),
[run-incident-policy](run-incident-policy.md), [run-incidents](run-incidents.md),
[observability](observability.md) et [beta-readiness](beta-readiness.md).
