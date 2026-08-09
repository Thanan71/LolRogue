# Déploiement et exploitation

Ce document est le point d'entrée opérationnel. Les procédures détaillées sont :

- `docs/incident-runbooks.md` pour migration, rollback, indisponibilité, classement,
  secret exposé et sauvegarde défaillante ;
- `docs/backup-and-restore.md` pour RPO/RTO, dumps, exercice trimestriel et
  restauration de production ;
- `docs/release-and-support.md` pour environnements, rotation, release, smoke test,
  export et suppression de compte ;
- `docs/administration.md` pour promouvoir ou révoquer un administrateur.

Une fiche de release privée doit fournir les project refs et responsables réels.
Les runbooks versionnés ne contiennent volontairement ni secret ni identifiant de
production.

## Environnements

La matrice normative et les contrôles de séparation sont dans
`docs/release-and-support.md`. Development, Preview et Production utilisent trois
bases distinctes ; une preview ne doit jamais cibler les données de production.

Chaque environnement Vercel pointe vers un projet Supabase correspondant. Les
variables navigateur obligatoires sont :

```env
VITE_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=...
```

La clé service-role n'est pas nécessaire au runtime Vercel et ne doit jamais y
être exposée. Supabase l'injecte dans le runtime de l'Edge Function `verify-run`.
Après une modification de variable `VITE_*`, redéployer : Vite injecte ces valeurs
pendant le build.

Dans Supabase Auth, déclarer l'URL publique du site et les URL de redirection de
preview explicitement. La confirmation email reste désactivée puisque le produit
n'envoie pas de mails.

## Déployer

1. Appliquer et valider les migrations sur une base locale.
2. Lancer `npm ci`, `npm run edge:bundle`, `npm run check`,
   `npm run test:db` et `npm run test:e2e`.
3. Sauvegarder la base distante et prévoir une courte fenêtre de déploiement :
   la migration révoque immédiatement l'ancien chemin `client_reported` et fait
   expirer les attempts ouverts antérieurs à la quarantaine des améliorations.
4. Lier la CLI au bon projet et déployer d'abord la fonction encore dormante avec
   `npm run edge:deploy`.
5. Exécuter `npm run migrate`, puis déployer immédiatement le client compatible.
6. Contrôler le déploiement et fermer la fenêtre seulement après le test d'une run
   connectée complète.

Cet ordre rend le vérificateur disponible avant la révocation de l'ancien RPC. Ne
pas déployer le nouveau client avant la migration : il ne trouverait pas les RPC
d'attempt. Ne pas laisser durablement l'ancien client après la migration : ses
sauvegardes connectées seront volontairement refusées.

La migration `20260726090000_authoritative_daily_leaderboard.sql` révoque et
supprime aussi `submit_daily_run`. Le client compatible doit utiliser
`get_daily_challenge`, `start_daily_run_attempt` et la vue
`daily_leaderboard`. Les anciennes lignes daily restent conservées pour audit,
mais seules celles liées à une run vérifiée apparaissent dans le classement
officiel.

La migration `20260726180000_minimize_public_data_and_harden_logs.sql` remplace
également le contrat du leaderboard normal. Déployer migration et client ensemble :
l'ancien client qui attend `player_id` ne peut plus calculer le rang localement et
doit appeler `get_my_leaderboard_rank`.

La migration `20260809090000_harden_leaderboard_views.sql` recrée les deux vues de
classement avec `security_invoker=true`. Elle initialise des projections sanitisées
dans le schéma non exposé `private`, puis les maintient par trigger sans élargir les
droits sur `players` ou `daily_runs`. Après déploiement, exécuter la gate
`npm run db:security`, contrôler que l'advisor Supabase ne signale plus aucun
`security_definer_view`, puis tester les deux vues avec les rôles `anon`,
`authenticated` et `service_role`.

La migration `20260809120000_harden_security_definer_privileges.sql` révoque tous
les grants des fonctions privilégiées avant de réaccorder uniquement le manifest
`config/security-definer-privileges.json`. Elle retire notamment l'accès navigateur
à `handle_new_user`, `expire_stale_run_attempts`, `invalidate_daily_score` et à la
purge sociale. Le démarrage expire les attempts obsolètes du compte ; le worker
expire aussi un attempt scellé avant son claim. Déployer ensemble migration,
fonction Edge et client, puis exécuter `npm run db:security`.

La migration `20260726210000_atomic_run_finalization.sql` supprime l'ancien RPC
`save_run_loadout`. Vérifier avant déploiement que le client publié utilise
uniquement la finalisation autoritaire. Une run dont la vérification dépasse
15 secondes reste localement en échec retryable : ne pas effacer le stockage du
navigateur avant que l'utilisateur ait relancé la vérification ou que le statut
serveur soit récupéré.

La migration `20260726220000_protect_active_run_start.sql` étend l'unicité d'une
tentative ouverte au statut `verifying`, rejette les départs concurrents et
calcule les slots de starter depuis la maîtrise serveur. Déployer cette migration
avec le client qui interprète les résultats typés `active_run`,
`active_run_another_tab` et `start_in_progress`.

`vercel.json` réécrit toutes les routes vers `index.html`, ce qui permet d'ouvrir
directement `/auth`, `/run` ou `/admin`. Il définit également CSP, protection
anti-frame, politique de permissions, referrer policy et `nosniff`. Toute nouvelle
API, police ou origine d'image doit être ajoutée explicitement à la CSP.

## Vérifications après déploiement

- ouvrir directement `/auth` et vérifier l'absence de 404 ;
- créer une session ou entrer en invité ;
- démarrer une run connectée et vérifier la présence d'un `run_attempt` possédé par
  l'utilisateur, avec seed et versions définies par le serveur ;
- changer de biome, recharger la page et reprendre le même attempt/journal ;
- terminer une run connectée et vérifier un statut `verified`, une seule ligne
  `runs` avec `progression_source = 'verified'`, puis rejouer la requête de
  vérification pour confirmer l'absence de doublon ;
- terminer une victoire et une défaite, recharger directement `/game-over` et
  confirmer que le même résumé réapparaît depuis le snapshot local ;
- simuler une coupure réseau pendant la fin, confirmer l'état `failed`, puis
  relancer et observer `retrying → saved` sans seconde run ni double récompense ;
- ouvrir deux onglets, lancer simultanément Normal puis Daily et confirmer qu'une
  seule run devient active ; le second onglet doit proposer de reprendre ;
- tenter d'ouvrir directement `/starter-select`, `/daily-run` et `/game-over`
  pendant une run et confirmer le retour vers la run active ;
- soumettre une trace impossible sur un compte de test et confirmer le statut
  `rejected` sans candies, maîtrise ni compteur supplémentaire ;
- ouvrir le daily avec deux comptes et confirmer la même date UTC, la même seed,
  la difficulté `normal`, les mêmes six starters et la même version de score ;
- terminer un daily et vérifier une seule ligne dans `daily_leaderboard`, puis
  confirmer qu'un second départ est refusé ;
- abandonner un daily avec un compte de test et confirmer que la tentative est
  consommée sans publication dans le leaderboard ;
- vérifier qu'un non-admin ne peut ni lire ni insérer directement dans
  `daily_runs` ;
- lire `leaderboard` avec la clé anonyme et confirmer l'absence d'identifiants,
  candies et dates de connexion ;
- confirmer dans les advisors Supabase qu'il ne reste aucun
  `security_definer_view`, puis vérifier dans `pg_class.reloptions` que
  `leaderboard` et `daily_leaderboard` portent `security_invoker=true` ;
- comparer les ACL `SECURITY DEFINER` au manifest avec `npm run db:security` et
  confirmer qu'aucun trigger, helper historique ou purge n'est appelable avec un
  JWT navigateur ;
- si les diagnostics sont activés, confirmer qu'un `INSERT` direct dans `logs`
  échoue, qu'une soumission RPC reçoit l'identité de la session et que le job de
  purge est actif ;
- contrôler le profil, la maîtrise et les classements ;
- vérifier qu'un non-admin reçoit un refus sur les lectures admin ;
- examiner la console et l'onglet réseau : aucun asset 404, aucune erreur CSP et
  aucune clé privée ;
- vérifier les en-têtes de réponse de la page.

## Migrations et retour arrière

Les migrations sont progressives et ne doivent pas modifier rétroactivement un
fichier déjà appliqué sur une base partagée. Ajouter une nouvelle migration
horodatée et la tester avec `npm run db:validate`.

Le couple `engine_version`/`content_hash` d'un `gameplay_ruleset` est immuable dès
qu'un attempt l'utilise. `npm run edge:bundle` recalcule le hash du bundle
normalisé et échoue si le moteur, le bundle et le ruleset divergent. Pour changer
les règles ou le contenu autoritaire, ajouter une nouvelle version de ruleset, son
catalogue et la migration correspondante, conserver l'ancien vérificateur dans le
registre pendant au moins la durée maximale d'un attempt, puis seulement activer
la nouvelle version.

Après avoir lié le bon projet Supabase, une évolution qui ne requiert aucune
nouvelle logique frontend peut utiliser `npm run backend:deploy` : la commande
publie `verify-run` avant d'activer les migrations.

Une nouvelle version de moteur comprise par le navigateur doit être livrée en
trois étapes afin qu'aucun ancien frontend ne démarre une ruleset qu'il ne sait pas
journaliser :

1. `npm run edge:deploy` pour publier le vérificateur compatible avec les anciennes
   et nouvelles versions ;
2. déployer le frontend et attendre qu'il soit effectivement en production ;
3. `npm run migrate` pour activer la nouvelle ruleset.

Le moteur v3 accepte les journaux `resolve_combat` v2 sans trace et les rejoue en
auto. Le moteur v4 conserve cette compatibilité et introduit la progression de
biome canonique. Les bundles historiques importés par la fonction restent
immuables et sont contrôlés par `npm run edge:bundle`.

Une migration destructive doit inclure une sauvegarde, une estimation d'impact et
une procédure de restauration. Le retour arrière applicatif se fait en redéployant
un commit précédent compatible avec le schéma courant. Une fois l'ancien RPC
révoqué, ne pas le réactiver pour revenir en arrière : mettre temporairement les
nouveaux départs en maintenance et conserver les attempts/journaux pour reprise.
Ne pas réinitialiser la base de production pour revenir en arrière.

## Observabilité et confidentialité

Analytics et Speed Insights sont désactivés tant qu'une politique de confidentialité
et une base légale ne sont pas définies. Le logging applicatif en base est lui aussi
désactivé par défaut. Pour l'activer explicitement :

```env
VITE_ENABLE_DB_LOGGING=true
VITE_DB_LOG_LEVEL=warn
```

Le navigateur conserve au plus 100 entrées en attente, envoie des lots de 10
maximum et ne retente que deux fois une erreur réseau temporaire. La RPC refuse
les clients anonymes et les écritures directes, impose l'identité de la session,
sanitise récursivement messages, stack et metadata, puis applique :

- 30 lignes par minute et 500 par période de 24 heures et par utilisateur ;
- 1 000 lignes globales par minute ;
- 64 Kio par lot, 32 Kio de metadata avant sanitation et 8 Kio après ;
- 2 000 lignes maximum par utilisateur et une rétention de 14 jours.

Le job PostgreSQL `lolrogue-purge-expired-client-logs` exécute la purge chaque
jour à 03:17 UTC ; une soumission déclenche aussi une purge opportuniste. Les logs
d'un compte sont supprimés avec celui-ci. Les valeurs sensibles sont filtrées
côté client puis à nouveau côté serveur, mais il faut toujours éviter d'y envoyer
un secret, mot de passe, token ou donnée personnelle.

Pour un incident :

1. noter l'heure, l'environnement, la route, le `runId` et l'`attemptId` ;
2. reproduire sans données personnelles si possible ;
3. consulter les logs Vercel/Supabase et les erreurs du navigateur ;
4. vérifier l'état des migrations et les variables publiques ;
5. corriger par migration ou commit testé, jamais directement dans le bundle
   produit ;
6. documenter la cause, l'impact et la prévention.
