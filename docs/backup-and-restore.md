# Sauvegarde et restauration

## Objectifs et responsabilité

Pour la bêta, l'objectif est **RPO 24 h** et **RTO 4 h**. Une offre Supabase avec
sauvegarde quotidienne doit être active en production ; sinon l'opérateur produit
un dump logique chiffré hors plateforme au moins quotidiennement. Un futur besoin
de RPO inférieur à 24 h impose PITR avant de modifier cet engagement.

L'opérateur vérifie chaque jour qu'un point de restauration récent existe. Une fois
par trimestre et avant toute migration destructive, il restaure la sauvegarde dans
un projet Supabase temporaire dédié. La fiche de preuve contient date UTC, source,
empreintes SHA-256, projet cible, durée, nombre de contrôles réussis et signataire.
Sans cette preuve récente, la release reste bloquée.

Les sauvegardes DB n'incluent pas le contenu Supabase Storage. LolRogue n'en dépend
actuellement pas pour ses assets Riot, versionnés dans Git. Si Storage est ajouté,
son export/restauration devient un prérequis distinct.

## Produire un dump logique

Récupérer la chaîne de connexion depuis **Connect** dans le Dashboard. La fournir
interactivement ou par gestionnaire de secrets, jamais dans Git ni l'historique du
shell. Dans un répertoire chiffré hors du dépôt :

```bash
npx supabase db dump --db-url "CONNECTION_STRING" -f roles.sql --role-only
npx supabase db dump --db-url "CONNECTION_STRING" -f schema.sql
npx supabase db dump --db-url "CONNECTION_STRING" -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"
shasum -a 256 roles.sql schema.sql data.sql > SHA256SUMS
```

Limiter l'accès aux opérateurs, chiffrer au repos, copier hors du compte Supabase et
appliquer la même durée de rétention que les sauvegardes fournisseur (minimum sept
jours glissants pour la bêta). Une sauvegarde n'est valide que si les trois fichiers
sont non vides et si `shasum -a 256 -c SHA256SUMS` réussit.

## Test de restauration isolé

1. Créer un projet Supabase temporaire dans la région de production, sans domaine
   Vercel, utilisateurs réels ni télémétrie sortante.
2. Noter son project ref et confirmer deux fois qu'il ne s'agit pas de production.
3. Suivre la procédure Supabase CLI de restauration des rôles, schéma et données ;
   conserver la sortie complète dans la preuve privée. Les secrets et mots de passe
   de rôles personnalisés ne sont pas couverts par toutes les sauvegardes et doivent
   être recréés depuis le gestionnaire de secrets.
4. Lier une copie de travail jetable au projet restauré, déployer `verify-run`, puis
   exécuter `npm run db:lint` et les contrôles SQL de lecture ci-dessous.
5. Avec deux comptes synthétiques, exécuter les tests Auth/RLS positifs et négatifs,
   une run vérifiée, un retry idempotent et un daily. Comparer les volumes de tables
   critiques à la source au moment du dump.
6. Supprimer le projet temporaire et ses secrets après validation ; conserver
   uniquement la preuve sans données joueur.

Contrôles minimaux, exécutés séparément sur source et restauration :

```sql
SELECT 'players' AS relation, count(*) FROM public.players
UNION ALL SELECT 'runs', count(*) FROM public.runs
UNION ALL SELECT 'run_attempts', count(*) FROM public.run_attempts
UNION ALL SELECT 'run_commands', count(*) FROM public.run_attempt_commands
UNION ALL SELECT 'daily_runs', count(*) FROM public.daily_runs
UNION ALL SELECT 'mastery', count(*) FROM public.champion_mastery;
```

Comparer aussi le dernier timestamp et le nombre de lignes par statut de
`run_attempts`. Une différence non expliquée invalide le test.

### Vérifier la rétention sociale restaurée

Après application des migrations sur le projet restauré, exécuter dans le SQL
Editor avec le rôle opérateur :

```sql
SELECT jobid, jobname, schedule, command, username, active
FROM cron.job
WHERE jobname = 'lolrogue-purge-expired-social-data';

SELECT job_name, last_started_at, last_completed_at, last_deleted_rows,
  total_runs, total_deleted_rows
FROM private.social_retention_metrics;
```

Le premier contrôle doit retourner exactement une ligne active, planifiée avec
`43 4 1 * *`, la commande `SELECT private.purge_expired_social_data()` et
`username = 'postgres'`. L'absence initiale de métrique est normale tant qu'aucune
purge n'a réussi. Sur le projet temporaire uniquement, insérer les trois cas
synthétiques du test de rétention puis exécuter deux fois :

```sql
SELECT private.purge_expired_social_data();
```

Le premier résultat doit compter uniquement les signalements traités depuis plus de
24 mois ; le second doit valoir zéro. La métrique doit ensuite montrer deux passages
supplémentaires et le nombre de suppressions correspondant. Si le job est absent ou
différent, ne pas le recréer manuellement : vérifier que la migration
`20260809180000_automate_social_retention.sql` est appliquée, la rejouer via le
processus de migration, puis reprendre ces contrôles.

## Restauration de production

La restauration est destructive et rend le projet temporairement indisponible.
Elle exige Incident Commander, Opérateur et seconde validation :

1. annoncer maintenance, arrêter promotions et limiter les nouvelles mutations ;
2. fixer en UTC l'instant juste avant l'incident et estimer la perte selon le RPO ;
3. vérifier qu'une restauration isolée comparable a réussi ;
4. utiliser Dashboard **Database > Backups** pour une sauvegarde quotidienne ou
   PITR pour l'instant choisi ; ne pas importer directement un dump non testé dans
   le projet actif ;
5. attendre la fin fournisseur, recréer si nécessaire secrets de rôles, fonctions,
   webhooks et configuration Auth qui ne font pas partie du dump ;
6. vérifier le job et les métriques de rétention sociale avec la procédure ci-dessus ;
7. déployer `verify-run` compatible avant d'exposer le client, puis exécuter le smoke
   test complet ;
8. réouvrir le trafic, surveiller 60 minutes et publier la fenêtre réelle de perte.

Ne jamais supprimer un projet pour tenter une restauration : sa suppression retire
également ses sauvegardes associées. Les sources de référence sont les guides
[Database Backups](https://supabase.com/docs/guides/platform/backups) et
[Backup/Restore CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
