# Déploiement automatisé du backend Supabase

Workflow : [`.github/workflows/database-deployment.yml`](../.github/workflows/database-deployment.yml).

## Routage verrouillé

| Branche GitHub | Projet Supabase | Référence | Environnement GitHub |
| --- | --- | --- | --- |
| `dev` | LolRogueDev | `misdmtpfcbxbhheacehm` | `supabase-dev` |
| `main` | LolRogue | `mmpvmclqdgfnpfgcqnyu` | `main` |

Le workflow est exécuté sur **chaque push** vers ces branches, ou manuellement avec `workflow_dispatch` depuis la branche désirée. Il ne s'exécute **jamais sur une PR** avec des secrets distants. Aucun filtre de chemins n'est appliqué : si un commit de migration est dépassé par un commit applicatif avant son checkout, le nouveau commit doit reprendre les migrations en attente.

Au début de chaque job, le SHA du checkout doit correspondre exactement au SHA de l'événement : un job dont le checkout est déjà dépassé est rejeté. Si la branche avance après ce contrôle, le déploiement en cours peut se terminer ; le dernier commit est ensuite traité dans la même file.

## Configuration nécessaire dans GitHub

Dans **Settings → Environments**, créer deux environnements GitHub :

- `supabase-dev` : autoriser uniquement la branche `dev`.
- `main` : autoriser uniquement la branche `main`.

Ces noms doivent correspondre exactement aux champs `environment` du workflow. Le projet Supabase de production reste LolRogue ; `main` est ici le nom de l'environnement GitHub.

Ajouter **dans chacun** les secrets d'environnement suivants (valeurs distinctes adaptées au projet) :

- `SUPABASE_ACCESS_TOKEN` : jeton Supabase autorisé sur le projet concerné, avec **Project Settings : Read**, **API Keys : Read** et **API Key Secrets : Read** pour le rattachement, ainsi que **Edge Functions : Read-write** pour publier les fonctions. Si un jeton limité ne possède pas ce dernier droit, le recréer avec ces permissions puis remplacer le secret GitHub correspondant. Les permissions d'un jeton limité ne se modifient pas après sa création ; voir la [documentation des jetons Supabase](https://supabase.com/docs/guides/platform/personal-access-tokens).
- `SUPABASE_DB_PASSWORD` : mot de passe de la base Postgres de ce même projet Supabase.

Ne pas stocker les mots de passe dans le dépôt ni dans des variables `VITE_*`. L'absence de secrets fait échouer le job avant le rattachement distant. Ne pas définir ces deux noms au niveau dépôt ou organisation : GitHub peut utiliser ces valeurs si un secret d'environnement manque. Les références de projets (publiques) sont fixées dans le workflow et comparées à `scripts/lib/environment-config.mjs`.

La définition des environnements, de leurs secrets et des restrictions de branche doit précéder le premier déploiement. Des reviewers peuvent être ajoutés à l'environnement `main` si une approbation humaine est souhaitée : le job attendra alors cette approbation avant d'utiliser les secrets.

## Étapes des jobs

1. `validate-migrations` vérifie le SHA et installe le lockfile. `npm run release -- edge bundle` construit et valide les bundles Edge avant de démarrer Supabase local et d'exécuter `npm run check:db` (reset **local uniquement**, RLS, schéma, types et tests). Cette validation précède toute opération sur le projet distant.
2. `deploy-dev` ou `deploy-main` est sélectionné exclusivement d'après la branche de l'événement ; l'autre job est ignoré.
3. Le job vérifie la branche Git effective et le SHA **avant** d'utiliser les secrets.
4. Le routeur `npm run database -- link --project-ref ... --yes` refuse toute référence non autorisée.
5. `scripts/check-database-deploy-plan.mjs` contrôle en lecture seule que l'historique distant est un **préfixe ordonné** des migrations du commit. Les migrations inconnues ou intercalées bloquent le déploiement, sans réparation automatique.
6. `npm run database -- migrate --project-ref ... --preview` affiche les migrations prévues.
7. `npm run database -- migrate --project-ref ... --yes` applique **uniquement les migrations manquantes**. Ni `--include-all`, ni seed, ni reset distant.
8. `npm run database -- migrations check --linked --project-ref ...` vérifie l'historique final.
9. `npm run release -- edge deploy --project-ref ... --yes` construit les bundles puis déploie toutes les Edge Functions du commit sur le même projet, avec le contrôle de branche et de liaison distante et la configuration JWT des fonctions conservés. Le déploiement utilise l'API Supabase (`--use-api`).

Les fonctions sont publiées uniquement après la validation des migrations distantes. La concurrence est sérialisée pour une même branche (`cancel-in-progress: false`), afin de laisser se terminer les migrations et les publications de fonctions en cours. Le workflow ne déploie pas l'application Vercel.

## En cas d'échec

- **Secrets absents** : configurer les deux secrets dans l'environnement GitHub correspondant.
- **Branche ou SHA incorrect** : relancer depuis le dernier commit de `dev` ou `main`, sans modifier manuellement la référence cible.
- **Historique distant divergent** : examiner `supabase_migrations.schema_migrations` et les fichiers versionnés. Ne pas utiliser `migration repair` automatiquement.
- **Erreur SQL pendant `db push`** : conserver le journal, vérifier l'état effectif de la base, créer si nécessaire une nouvelle migration corrective et relancer. Les migrations ne sont pas automatiquement annulées.
- **Échec de publication Edge** : vérifier les journaux et le droit **Edge Functions : Read-write** du jeton du projet. Les migrations déjà appliquées restent en place ; plusieurs fonctions peuvent aussi avoir été publiées avant l'échec. Relancer le workflow sur le dernier commit de la branche : l'historique BDD est de nouveau vérifié, les migrations déjà présentes sont ignorées et les fonctions sont republiées. Il n'y a pas de rollback automatique commun au schéma et aux fonctions.
- **Mise en production à risque** : effectuer une sauvegarde fiable et confirmer la compatibilité ascendante du schéma avant de publier sur `main` ou d'approuver son job si des reviewers sont configurés.

Ces jobs ne remplacent pas la CI générale, les sauvegardes ni le contrôle manuel de l'ordre de publication des modifications applicatives incompatibles. Ils ne doivent pas être utilisés comme mécanisme de restauration ou de rollback destructif.
