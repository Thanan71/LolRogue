# Déploiement automatisé des migrations Supabase

Workflow : [`.github/workflows/database-deployment.yml`](../.github/workflows/database-deployment.yml).

## Routage verrouillé

| Branche GitHub | Projet Supabase | Référence | Environnement GitHub |
| --- | --- | --- | --- |
| `dev` | LolRogueDev | `misdmtpfcbxbhheacehm` | `supabase-dev` |
| `main` | LolRogue | `mmpvmclqdgfnpfgcqnyu` | `supabase-production` |

Le workflow est exécuté sur un push vers ces branches **si les fichiers de migrations, de configuration ou de déploiement changent**, ou manuellement avec `workflow_dispatch` depuis la branche désirée. Il ne s'exécute **jamais sur une PR** avec des secrets distants. Le SHA actuellement en tête de la branche doit correspondre exactement au SHA de l'événement : un ancien commit n'est pas déployé après un nouveau push.

## Configuration nécessaire dans GitHub

Dans **Settings → Environments**, créer deux environnements GitHub :

- `supabase-dev` : autoriser uniquement la branche `dev`.
- `supabase-production` : autoriser uniquement `main`, **activer la protection par approbation** pour la production.

Ajouter **dans chacun** les secrets d'environnement suivants (valeurs distinctes adaptées au projet) :

- `SUPABASE_ACCESS_TOKEN` : jeton Supabase avec les seules autorisations de gestion nécessaires au projet concerné.
- `SUPABASE_DB_PASSWORD` : mot de passe de la base Postgres de ce même projet Supabase.

Ne pas stocker les mots de passe dans le dépôt ni dans des variables `VITE_*`. L'absence de secrets fait échouer le job avant le rattachement distant. Les références de projets (publiques) sont fixées dans le workflow et comparées à `scripts/lib/environment-config.mjs`.

**Important :** la définition des environnements, de leurs secrets et des approbations GitHub est une étape manuelle, à réaliser avant d'activer les déploiements automatiques. En particulier, créer un environnement sans reviewers ne suffit pas à protéger la production.

## Étapes des jobs

1. `validate-migrations` vérifie le SHA, installe le lockfile et exécute sur Supabase local `npm run check:db` (reset **local uniquement**, RLS, schéma, types et tests).
2. `deploy-dev` ou `deploy-main` est sélectionné exclusivement d'après la branche de l'événement ; l'autre job est ignoré.
3. Le job vérifie la branche Git effective et le SHA **avant** d'utiliser les secrets.
4. Le routeur `npm run database -- link --project-ref ... --yes` refuse toute référence non autorisée.
5. `scripts/check-database-deploy-plan.mjs` contrôle en lecture seule que l'historique distant est un **préfixe ordonné** des migrations du commit. Les migrations inconnues ou intercalées bloquent le déploiement, sans réparation automatique.
6. `npm run database -- migrate --project-ref ... --preview` affiche les migrations prévues.
7. `npm run database -- migrate --project-ref ... --yes` applique **uniquement les migrations manquantes**. Ni `--include-all`, ni seed, ni reset distant.
8. `npm run database -- migrations check --linked --project-ref ...` vérifie l'historique final.

La concurrence est sérialisée pour une même branche (`cancel-in-progress: false`), afin de ne pas interrompre une migration pendant son application. Les jobs de déploiement n'exécutent aucun script Vercel ni Edge : ils déploient uniquement le schéma versionné.

## En cas d'échec

- **Secrets absents** : configurer les deux secrets dans l'environnement GitHub correspondant.
- **Branche ou SHA incorrect** : relancer depuis le dernier commit de `dev` ou `main`, sans modifier manuellement la référence cible.
- **Historique distant divergent** : examiner `supabase_migrations.schema_migrations` et les fichiers versionnés. Ne pas utiliser `migration repair` automatiquement.
- **Erreur SQL pendant `db push`** : conserver le journal, vérifier l'état effectif de la base, créer si nécessaire une nouvelle migration corrective et relancer. Les migrations ne sont pas automatiquement annulées.
- **Mise en production à risque** : effectuer une sauvegarde fiable et confirmer la compatibilité ascendante du schéma avant d'approuver le job `supabase-production`.

Ces jobs ne remplacent pas la CI générale, les sauvegardes ni le contrôle manuel de l'ordre de publication des modifications applicatives incompatibles. Ils ne doivent pas être utilisés comme mécanisme de restauration ou de rollback destructif.
