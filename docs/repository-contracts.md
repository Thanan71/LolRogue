# Repositories et rafraîchissement de compte

Le point de composition de l’application est `src/services/container/applicationRepositories.ts`. Il crée une seule instance de `RepositoryContainer` avec le client déjà exporté par `supabaseClient.ts`. Chaque repository reste initialisé à la demande et réutilise ce client authentifié. Les pages, composants et stores consomment ce point de composition ; les services peuvent recevoir les mêmes interfaces explicitement dans leurs tests ou dans une autre orchestration.

`RepositoryContainerFactory.create` conserve sa capacité à créer une instance isolée pour un client fourni. Ce n’est pas une autorisation de créer un conteneur par page. La façade historique `createRepositories` délègue à cette factory et conserve ses huit propriétés publiques. Le singleton historique d’enhancement, sans consommateur, a été retiré pour ne plus instancier un repository en parallèle au conteneur.

## Interfaces et identifiants

| Entrée du conteneur | Interface | Entrées et contrat serveur |
| --- | --- | --- |
| `auth` | `IAuthRepository` | Session et opérations Auth du client existant ; la session sert à authentifier les requêtes suivantes. |
| `player` | `IPlayerRepository` | Les lectures de profil reçoivent l’UUID `auth.users.id` et filtrent `players.user_id`. Les mises à jour restent limitées aux champs de profil éditables. |
| `run` | `IRunRepository` | Les lectures de l’historique reçoivent le `players.id` public, avec filtres, curseurs ou pagination existants. Les colonnes et relations de runs restent inchangées. |
| `runStats` | `IRunStatsRepository` | Agrégats par `players.id` et détails par identifiant de run en base. |
| `mastery` | `IMasteryRepository` | `getChampionMastery` résout l’UUID Auth vers `players.id` ; `getChampionMasteryByChampion` reçoit directement le `players.id` public. |
| `playerUnlock` | `IPlayerUnlockRepository` | Déblocages par `players.id` public. |
| `dailyRun` | `IDailyRunRepository` | Challenge, classement, préférences et signalements via les méthodes existantes ; date, droits et disponibilité restent validés par le serveur. |
| `leaderboard` | `ILeaderboardRepository` | Classements publics et rang du compte selon les politiques existantes. |
| `enhancement` | `IEnhancementRepository` | UUID Auth pour les états et commandes. Le serveur conserve rang attendu, coût, solde final et idempotence de `commandId`. |
| `championEconomy` | `IChampionEconomyRepository` | Aucun identifiant de propriétaire ni solde envoyé par le navigateur. Les RPC existants déterminent le compte depuis la session ; la commande d’achat fournit champion, prix/catalogue confirmés et identifiant idempotent. |

Les interfaces de repositories réutilisent les modèles métiers existants. Le repository économie rend un payload `unknown` et une erreur serveur ; `championEconomyService` vérifie son schéma et transforme les refus en codes métiers avant toute entrée dans l’état UI. La durée limite de quinze secondes, l’annulation et les arguments RPC restent inchangés. Aucun SQL, modèle de table, règles RLS ou format de sauvegarde n’est modifié.

## Lecture serveur et application dans l’UI

`AccountProgressionService` reçoit les entrées `player`, `mastery` et `enhancement` du conteneur. Il ne lit aucun hook ou store. Il expose les lectures `loadPlayer`, `loadMasteries` et `loadEnhancements` ; cette dernière conserve une `Map` d’états d’enhancement et les lignes de maîtrise DB, sans recalculer de niveau côté client.

Chaque lecture reçoit un scope capturé par l’appelant :

```ts
{
  userId: string | null;
  isCurrent?: () => boolean;
}
```

Le résultat distingue `{ status: 'loaded', data }`, `{ status: 'guest' }` et `{ status: 'stale' }`. Un compte absent retourne `guest` avant tout accès repository. L’adaptateur UI fournit `isCurrent` à partir de l’identité, de la génération de chargement et du propriétaire du cache ; le service le vérifie avant les requêtes et après chaque attente. Une réponse ou erreur d’un scope remplacé retourne `stale`. Les erreurs du scope courant sont propagées, et les valeurs `null` ou listes vides conservent leur sens initial.

Le store reste responsable de ses indicateurs de chargement, messages traduits et mutations Zustand. Il applique seulement les données chargées pour son scope courant. Les générations de `initialize` et `reset` empêchent aussi une première requête du même compte de remplacer une seconde initialisation plus récente. L’unlock refuse un cache appartenant à un autre compte avant I/O et contrôle encore l’identité après la commande et après un éventuel rafraîchissement du solde. Une ancienne opération ne termine pas l’indicateur de chargement d’un nouveau compte.

Le refresh de profil Auth capture aussi les références de session et d’utilisateur, en plus de sa génération. Deux refresh du même compte finissant en ordre inverse conservent le plus récent ; un passage A → B → A avec une nouvelle session invalide le premier scope. La vérification s’applique avant les retries de profil et après chaque attente de l’hydratation des caches, pour empêcher une ancienne réponse de poursuivre ses effets sur l’identité actuelle.

`createRunHistoryService` et `createChampionEconomyService` permettent une injection explicite du conteneur existant. Leurs exports fonctionnels historiques et les signatures publiques des stores restent compatibles. Les façades applicatives utilisent `applicationRepositories` ; elles ne créent aucun client Supabase supplémentaire.

Le mode invité conserve ses données locales et ne démarre aucune run authentifiée hors ligne. Les lectures de compte d’un invité et l’initialisation d’enhancements d’un invité ne contactent pas la DB. Les vues Daily publiques gardent leurs conditions d’accès et leur comportement existants.

## Preuves et vérification

Les tests ciblés couvrent l’injection, la sérialisation existante, le profil absent, les refus serveur, les réponses tardives après changement de compte, deux initialisations du même compte finissant en ordre inverse, les retries réseau et les effets d’un unlock tardif sur le solde et le chargement.

```sh
npm run test -- tests/accountProgressionService.test.ts tests/repositoryContainer.test.ts tests/runService.test.ts tests/championEconomyService.test.ts tests/enhancementStoreRecovery.test.ts
```

`tests/repositoryIntegration.database.test.ts` passe également par le conteneur et le service injecté sur Supabase local migré. Il vérifie les UUID Auth/public, les lignes de maîtrise et la sérialisation des enhancements, puis prouve qu’un compte authentifié B ne lit pas le profil, les maîtrises ou les enhancements du compte A. La CI DB existante exécute ces cas sur sa base locale ; une passe unitaire sans credentials les ignore et ne constitue pas une preuve RLS.

Ces changements ne nécessitent aucune migration ou activation distante. Les tests navigateur Daily, sélection, profil et préférences restent les consommateurs de validation des signatures et du rendu existants.
