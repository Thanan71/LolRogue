# Contrat des environnements

Les identités publiques des projets Supabase sont définies dans
[`scripts/lib/environment-config.mjs`](../scripts/lib/environment-config.mjs).
Vite et les outils de déploiement utilisent le même module. Les clés privées et
les identifiants de connexion à la base restent dans les secrets du serveur ou
des workflows ; ils ne sont jamais stockés dans ce module.

## Environnement, branche et projet

| Contexte de build | Branche effective | Projet Supabase | Provenance de la configuration cliente |
| --- | --- | --- | --- |
| Local, hors Vercel | Locale, sans cible distante autorisée par ce seul build | Facultatif ; stack locale ou configuration publique choisie | Fichiers chargés par Vite pour le mode, puis variables du processus |
| Preview Vercel | `dev` | LolRogueDev | Paire publique de `.env.development` |
| Preview Vercel d'une PR | Branche Git valide autre que `main` | LolRogueDev | Paire publique de `.env.development` |
| Production Vercel | `main` | LolRogue | Variables publiques explicites du processus Vercel Production |
| Preview Vercel de `main` | `main` | LolRogue | Variables publiques explicites du processus ; comportement historique conservé |

Une preview `dev` ou de PR utilise LolRogueDev même si les variables Preview
globales ou les fichiers du mode contiennent les valeurs publiques de production.
Seule la paire URL/clé de développement est forcée ; les options publiques de
journalisation conservent la priorité processus puis fichiers du mode.

Un build de production exige `main`. Une branche absente ou une référence Git
malformée/détachée provoque une erreur. `LOLROGUE_DEPLOY_BRANCH` accepte seulement
`dev` ou `main`. Cette indication doit correspondre à
`VERCEL_GIT_COMMIT_REF` lorsqu'il est présent ; son fallback explicite reste
autorisé pour le build lancé par le déploiement backend, qui a déjà vérifié la
branche Git réelle. Une cible de build ne donne aucun droit de mutation DB : les
gardes des commandes distantes vérifient séparément la branche réelle, la ref
liée/explicite et la confirmation.

Hors Vercel, l'absence complète de configuration Supabase conserve le parcours
invité local existant. Une paire partielle est invalide. La PWA reste installable
et en ligne : ce cas de développement n'introduit ni service worker ni cache hors
ligne.

## Variables autorisées au navigateur

Vite utilise `envPrefix: []` et des définitions explicites issues du module.
Les variables ajoutées par Vercel, dont `VITE_VERCEL_GIT_COMMIT_SHA`, et toute
autre variable hors liste restent exclues du code navigateur, même avec un
préfixe `VITE_`. Les champs privés sans ce préfixe restent également exclus.

| Variable | Valeurs et responsabilité |
| --- | --- |
| `VITE_PUBLIC_SUPABASE_URL` | Origine HTTPS du projet ; une origine HTTP locale est autorisée hors Vercel. Aucun identifiant, chemin, query ou fragment dans l'URL. |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | JWT public avec rôle `anon` ou clé `sb_publishable_`. Les JWT distants doivent déclarer la même ref que l'URL. Les rôles privés et les clés `sb_secret_` sont refusés. |
| `VITE_ENABLE_DB_LOGGING` | `true` ou `false` ; journalisation technique publique avec opt-in. |
| `VITE_DB_LOG_LEVEL` | `debug`, `info`, `warn` ou `error`. |
| `VITE_E2E_VICTORY_RUNE` | `0` ou `1` ; conserve le mécanisme utilisé par les parcours Playwright locaux. |

Les clés `sb_publishable_` sont opaques : leur format public est vérifié, tandis
que leur association au projet reste vérifiée par Supabase lors des requêtes.
Le contrôle local du JWT vérifie ses claims publics de rôle et de ref ; il ne
remplace pas la validation de signature côté Supabase.

Les valeurs des cinq champs sont validées avant sélection. Une clé privée placée
dans le champ public anon provoque donc une erreur même si une configuration
Preview dédiée aurait ensuite remplacé ce champ. Les erreurs indiquent le champ
ou la règle en défaut et n'affichent jamais la valeur d'une clé.

## Identité et intégration du build

`APP_COMMIT_SHA` conserve la priorité sur `VERCEL_GIT_COMMIT_SHA`, puis `local`
est utilisé hors Vercel. Un SHA renseigné doit contenir les 40 caractères
hexadécimaux minuscules ; deux valeurs contradictoires provoquent une erreur.
Sur Vercel, `VERCEL_GIT_COMMIT_SHA` est obligatoire : le build et la Function
`/api/deployment-identity` doivent identifier le même commit. Le JSON généré reste
de la forme `{ "commit": "<sha-ou-local>" }`.

Vite fournit au résolveur un snapshot des variables du processus, les fichiers du
mode via `loadEnv(mode, root, '')` et le fichier public `.env.development` via
`readPublicEnvironmentFile`. Le résultat est immuable ; le module ne modifie pas
`process.env`, n'écrit aucun fichier et ne contacte aucun service distant. Une
mise à jour de configuration exige un nouveau build. Les plugins reçoivent
uniquement les données dont ils ont besoin, notamment le SHA validé pour
l'injection d'identité.

## Vérification

[`tests/environmentConfig.test.mjs`](../tests/environmentConfig.test.mjs)
couvre les builds locaux, dev, PR, main, les priorités contradictoires, les
champs manquants, les refs/rôles incorrects, les SHA, les variables privées et les
erreurs de lecture du fichier public. Ces tests utilisent des fixtures créées
localement et n'accèdent à aucun projet Supabase.

La validation d'intégration ajoute le build réel et le contrôle de `dist/` avec
des sentinelles privées injectées hors allowlist. Les parcours navigateur et les
tests existants vérifient l'identité du build, les assets, la PWA et les options
E2E. Aucun déploiement ou changement de base n'est nécessaire pour ces contrôles.

## Provenance Vercel et responsabilités

Dans Vercel, les variables du processus proviennent des scopes Development,
Preview ou Production. Une valeur Preview propre à une branche prend la priorité
sur la valeur Preview globale ; la paire publique Dev du dépôt reste prioritaire
pour les previews de ce projet. Les variables système Git doivent être exposées
pour fournir le SHA. Le déploiement backend transmet `LOLROGUE_DEPLOY_BRANCH`
après validation de la branche réelle. Aucun secret Vercel n'est lu ou modifié
par la configuration commune.

| Module | Entrées et préconditions | Responsabilité |
| --- | --- | --- |
| `environment-config.mjs` | Snapshot processus, champs publics des fichiers, branche/SHA valides | Cibles approuvées, sélection publique et validation sans mutation |
| `vite.config.ts` | Mode Vite et configuration résolue | Injecter uniquement les cinq champs publics et composer les plugins |
| Plugins `tooling/vite/plugins/` | Racine du dépôt et SHA validé | Catalogue client, identité HTML, fichiers PWA et assets Riot contrôlés |
| `vitest.config.ts` / `testPolicy.ts` | Suites et politique de couverture existantes | Exécuter les tests sans politique de déploiement |
| `remote-operation.mjs` | Branche Git réelle, ref explicite, lien local et confirmation | Refuser toute cible distante non approuvée avant exécution |
| `deploy-backend.mjs` | Branche/ref/confirmation vérifiées, CLI épinglés accessibles | Prévisualiser puis publier Edge/frontend, migrer et contrôler avant promotion |

La [documentation Vercel](https://vercel.com/docs/environment-variables) décrit
les scopes et la priorité des variables de branche. La
[documentation Vite](https://vite.dev/guide/env-and-mode) décrit le chargement des
fichiers par mode ; ici `envPrefix: []` empêche leur exposition automatique.

## Commandes opérateur

Exemple pour LolRogueDev depuis la branche réelle `dev` :

```bash
LOLROGUE_PROJECT_REF=misdmtpfcbxbhheacehm
npm run database -- link --project-ref "$LOLROGUE_PROJECT_REF" --yes
npm run database -- migrate --project-ref "$LOLROGUE_PROJECT_REF" --preview
npm run database -- migrations check --linked --project-ref "$LOLROGUE_PROJECT_REF"
npm run backend:deploy -- --project-ref "$LOLROGUE_PROJECT_REF" --dry-run
npm run backend:deploy -- --project-ref "$LOLROGUE_PROJECT_REF" --yes
```

Pour la production, choisir explicitement `mmpvmclqdgfnpfgcqnyu` depuis `main`.
Les refs sont publiques. Les identifiants restent dans le gestionnaire de secrets,
jamais dans ces commandes ou leurs logs. Les branches de travail et detached HEAD
sont refusés ; un `--branch` ne remplace pas la branche réelle. Une ref liée
incorrecte impose de relier explicitement le bon projet. `--dry-run` affiche le
plan sans opération distante ; `--preview` consulte réellement les migrations
sans les appliquer. La commande locale `database reset` n'a aucun mode distant.

L'ordre backend reste validation authority, liaison, preview migrations, Edge,
frontend compatible, migrations, contrôle du manifeste et promotion Production.
Un échec interrompt les étapes suivantes ; la promotion ne peut pas précéder le
contrôle des migrations. Les procédures de retour arrière restent dans
[operations.md](operations.md) et les exercices locaux de rollback dans
[testing.md](testing.md).

Les gardes refusent aussi les redirections de dépôt Git, `SUPABASE_WORKDIR`,
`SUPABASE_PROJECT_ID`, les profils Supabase autres que le profil cloud `supabase`,
les hôtes de services/Docker distants, les contextes Docker distants et les
redirections explicites Podman ou libpq
`PGHOSTADDR`/`PGSERVICE`/`PGSERVICEFILE`. Les enfants Supabase exécutent le profil
cloud fixé et reçoivent la ref explicite même avec `--linked`. Le lien est revérifié
avant chaque étape liée pour détecter un changement entre deux opérations.
Les tests DB et les wrappers locaux appliquent ces gardes avant leur premier
effet ; les tests de liste et les vérifications documentaires restent sans effet.

La stack locale conserve son prérequis Docker. Les contextes Desktop/Colima
locaux sont acceptés ; ce sprint n'introduit pas de support Podman.
