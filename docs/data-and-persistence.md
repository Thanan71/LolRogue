# Données et persistance

Ce document définit la source de vérité de chaque domaine. Une modification de
persistance doit conserver cette séparation et mettre à jour les tests associés.

## Matrice des responsabilités

| Domaine | Pendant l'exécution | Source durable connectée | Mode invité | Écriture |
| --- | --- | --- | --- | --- |
| Session Auth | `authStore` et Supabase Auth | `auth.users` | indicateur `lolrogue-guest-mode` dans `localStorage` | dépôts Auth |
| Profil joueur | `authStore.player` | `public.players` | profil temporaire client | `SupabasePlayerRepository` |
| Partie en cours | `runStore` + journal local | `run_attempts` et `run_attempt_commands` | `lolrogue-run-storage` | RPC d'attempt étroites |
| Résultat de partie | replay du moteur autoritaire | `runs` et `run_team_members` | local uniquement | Edge Function `verify-run` puis RPC service-role |
| Maîtrise | `masteryStore` | `champion_mastery` et `player_unlocks` | `lolrogue-mastery-storage` | crédit atomique d'une run vérifiée |
| Améliorations | `enhancementStore` | `champion_enhancements`; solde dans `players.total_candies` | indisponible sans compte | RPC `unlock_champion_enhancement` |
| Daily run en cours | `dailyRunStore` et `runStore` | attempt serveur avec seed UTC | `lolrogue-daily-run` | même journal vérifié qu'une run normale |
| Classement daily | store après lecture | vue sanitisée `daily_leaderboard` issue des runs vérifiées | `lolrogue-daily-leaderboard` | trigger serveur après replay autoritaire |
| Leaderboard normal | écran après lecture | vue `leaderboard` dérivée de `runs` | lecture éventuelle seulement | aucune écriture directe |
| Diagnostics client | buffer mémoire borné | `logs`, 14 jours maximum | désactivés | RPC `submit_client_logs` authentifiée |
| Réglages audio/UI | stores dédiés | aucune | `localStorage` | stores client |
| Catalogue de jeu | imports TypeScript/JSON | fichiers versionnés dans `src/data` et `public/lol/data` | identique | scripts d'assets ou code |

## Partie locale et synchronisation

Pour un compte connecté, `start_run_attempt` crée d'abord l'attempt. Le serveur
choisit le seed et fige le ruleset de progression, le ruleset de gameplay, la
version du moteur, le hash de contenu, la difficulté, l'équipe, les runes et le
snapshot des améliorations. Une seule tentative ouverte est autorisée par
utilisateur. Le `runStore` hydrate ensuite la partie avec ces valeurs et persiste
localement son état et le journal afin de reprendre après un rafraîchissement.

Le journal ne contient que des intentions sémantiques séquencées : déplacement,
résolution d'une rencontre, achat, recrutement, équipement, choix d'augment,
amélioration de sort ou abandon. Le client ne fournit ni seed, ni résultat de
combat, ni récompense. À la fin :

1. `append_run_attempt_commands` valide les identifiants, la séquence, les limites
   et la chaîne de hash, puis ajoute les commandes de façon immuable ;
2. `seal_run_attempt` fige la dernière séquence attendue ;
3. l'Edge Function `verify-run` authentifie le propriétaire, prend un lease et
   rejoue le moteur déterministe correspondant au ruleset ;
4. `complete_run_verification`, accessible uniquement au `service_role`, insère la
   run `verified`, ses membres, la maîtrise, les candies et les compteurs dans une
   même transaction.

Les identifiants de début, de commandes et de fin rendent chaque étape idempotente.
Le résultat canonique reste attaché à l'attempt : une réponse réseau perdue ou un
rechargement peut relire le statut puis afficher exactement la progression déjà
persistée, sans double crédit. Une trace rejetée ou expirée est terminale et ne
crédite rien.

La finalisation côté application ne dépend pas du cycle de vie de la page de
combat. Elle capture d'abord les PV et PM finaux, fige le résumé et l'équipe dans
`completedRunSnapshot`, puis appelle `endRun`. Les appels simultanés pour le même
`runId` partagent une seule opération. La navigation vers `/game-over` n'a lieu
qu'après une confirmation durable ou après conservation d'une outbox locale
retryable ; le démontage de la page ne peut donc plus annuler l'opération.

La machine d'état exposée est `idle → saving → saved` ou
`idle/saving → failed → retrying`. Chaque requête de finalisation est bornée à
15 secondes. Une erreur réseau ou un timeout conserve la run active, le snapshot
figé et le journal pour un nouvel essai. Lors d'une hydratation, un état
`saving`/`retrying` interrompu devient explicitement `failed` retryable. Game Over
lit en priorité le snapshot persisté et survit ainsi à un rechargement sans
`location.state`.

`complete_run_verification` écrit déjà la run, l'équipe et ses objets, les runes,
les augments, les statistiques agrégées et la progression dans sa transaction
unique. La migration `20260726210000_atomic_run_finalization.sql` supprime
définitivement l'ancien RPC `save_run_loadout`, afin qu'aucune seconde écriture
« best effort » ne puisse recréer un résultat partiel.

Une partie invitée ne contacte pas la base. Seul le navigateur courant possède
l'état et la progression; aucune fusion automatique n'est faite lors de la
création ultérieure d'un compte.

## Démarrage et remplacement d'une run

`startRun` et `endRun` retournent des résultats discriminés et asynchrones. Le
store ne transforme jamais implicitement une run active en défaite pour en
démarrer une autre. Normal, Daily, logout et changement d'identité passent par la
même confirmation d'abandon ; la transition est annulée si la finalisation reste
retryable.

La phase de cycle de vie (`inactive`, `starting`, `active`, `finalizing`,
`recovery`, `completed`) est dérivée dans un seul module et pilote les
garde-routes. Un accès direct à Starter, Daily ou Game Over ne peut donc ni
contourner une run active, ni rouvrir un encounter terminal.

Les doubles clics sont refusés par un verrou mémoire. Entre onglets, le navigateur
utilise Web Locks puis relit `lolrogue-run-storage` dans la section critique : le
second onglet reprend la run persistée au lieu de la remplacer. Pour un compte
connecté, la base ajoute une seconde frontière : l'index et le trigger
`run_attempts_one_open_per_user` couvrent `started`, `finished` et `verifying`.

L'équipe initiale est validée sans filtrage silencieux : au moins un champion,
aucun doublon, IDs connus et implémentés, et nombre de slots effectivement
débloqués. La même limite est recalculée depuis `champion_mastery.unlocked_ids`
par le trigger serveur ; un payload navigateur ne peut donc inventer un slot.

## Chemin de carte et rencontres

La progression locale ne dérive plus les nœuds accessibles de tous les parents
historiquement terminés. `currentNodeId` représente la position, `frontierNodeIds`
la seule liste sélectionnable et `chosenPathNodeIds` la chaîne ordonnée retenue.
Un déplacement consomme entièrement la frontière. Après résolution, seules les
arêtes sortantes du nœud courant deviennent la nouvelle frontière ; une branche
sœur abandonnée ne peut donc jamais redevenir accessible.

`pendingEncounter` est accepté uniquement si son ID et son type correspondent au
nœud courant canonique, non terminé. Le démarrage d'une rencontre ne reçoit plus
son contenu depuis la page : il relit l'encounter seedé dans `biomeMaps`. Les
routes, claims et résolutions appliquent la même identité. `completedNodeIds`,
`claimedEncounterNodeIds` et les clés de commandes rendent résolution et
collecte idempotentes, y compris après refresh.

Le stock seedé reste dans `biomeMaps`. `shopNodeStates` persiste en plus la visite,
les IDs d'objets achetés et les champions recrutés. La version 3 du stockage
reconstruit ces consommations depuis le journal autoritaire. Pour un ancien shop
invité dont les achats n'étaient pas traçables, la migration ferme
conservativement les offres restantes au lieu de les recréer.

`startNodeId` désigne l'encounter jouable d'entrée des nouvelles cartes ;
`NodeType.Start` est réservé à la reprise d'anciennes cartes structurelles et ne
sélectionne jamais automatiquement son premier enfant. Les nœuds `Exit` terminent
les cinq premiers biomes et les nœuds `Boss` terminent uniquement le biome final.
La légende et les transitions utilisent ces mêmes rôles.

Pour une run connectée, ces protections d'interface ne sont pas la frontière de
confiance : `AuthorityRunEngine` conserve sa propre frontière `expectedNodeIds`,
refuse une seconde sélection, vérifie le nœud pending de chaque commande et
rejoue les claims/achats avec des ensembles idempotents. Une trace de saut, de
sibling farm ou de double claim est rejetée avant tout crédit.

## Versions et historique

`gameplay_rulesets` relie chaque attempt à une version de moteur et à un hash du
bundle autoritaire. `gameplay_content_catalog` borne les champions, runes et
augments autorisés. Une évolution incompatible crée une nouvelle version et une
nouvelle migration append-only ; elle ne modifie pas un ruleset déjà utilisé par
des attempts.

La baseline `verified-run-cutoff-v1` documente la décision produit pour
l'historique : les compteurs et anciennes runs `legacy`/`client_reported` sont
conservés sans remise à zéro, car leur authenticité ne peut pas être reconstruite
rétroactivement. Après ce cutoff, l'ancien RPC `save_completed_run_v2` est révoqué
et seules les runs `verified` ajoutent de la progression permanente.

Les anciens rangs de `champion_enhancements` suivent une règle plus stricte : cette
colonne ayant été autrefois modifiable par le client, seuls les achats prouvés par
une commande de progression serveur terminée sont conservés comme bonus actif. La
valeur historique exacte est archivée dans
`progression_enhancement_security_baselines`; les rangs non attestés sont
quarantainés au lieu d'être injectés dans un nouvel attempt. Les attempts encore
ouverts au moment de cette quarantaine expirent, car leur snapshot déjà figé ne
peut pas être rendu fiable rétroactivement.

## Profil, maîtrise et améliorations

- `players` contient l'identité publique, les totaux globaux, le solde de candies
  et le rôle admin.
- `champion_mastery` contient les candies, le niveau calculé et les déblocages par
  champion.
- `player_unlocks` conserve les récompenses permanentes normalisées.
- `champion_enhancements` contient les rangs achetés et le coût total par champion.

Après connexion, Supabase remplace les caches locaux pour les données persistantes.
Le niveau de maîtrise servant à autoriser une amélioration vient de la base, pas
d'un calcul client arbitraire. L'achat passe par une RPC qui verrouille le profil,
vérifie le solde et le niveau, puis débite et débloque atomiquement.

Pendant une run connectée, le snapshot d'améliorations figé au démarrage est utilisé
par le client et par le replay. Un achat effectué dans un autre onglet ne peut donc
pas modifier rétroactivement les règles d'un attempt déjà ouvert.

## Classements

Le leaderboard normal est une vue calculée à partir des runs enregistrés; il n'est
jamais écrit par le navigateur. Son contrat public se limite à `rank`,
`player_name`, `avatar_url`, `level`, `total_wins`, `total_runs_completed`,
`win_rate` et `total_waves_completed`. Il n'expose aucun identifiant interne,
login, solde de candies ou date de connexion. Le rang du compte courant est lu par
`get_my_leaderboard_rank` sans télécharger les identifiants des autres joueurs.

Pour un compte connecté, `get_daily_challenge`
expose la date et l'expiration UTC, la seed, la difficulté, les six starters et les
versions de ruleset et de score. `start_daily_run_attempt` crée la seule tentative
officielle du joueur pour cette date et le trigger de départ recalcule toujours ces
valeurs côté serveur, même si un ancien client appelle le RPC générique.

Le navigateur ne soumet aucun score daily. Après le replay autoritaire,
`complete_run_verification` insère la run vérifiée et un trigger calcule le score
versionné dans la même transaction. Les métriques proviennent donc du moteur
rejoué, et non d'un payload déclaratif. Une commande finale `abandon_run` consomme
la tentative sans publier de ligne. La vue publique `daily_leaderboard` ne restitue
que le rang, le nom public et les métriques nécessaires ; la table brute
`daily_runs` reste inaccessible aux non-administrateurs.

En mode invité, le classement daily local sert uniquement de retour d'interface.
Il ne constitue pas un score officiel et peut être effacé avec le stockage du
navigateur.

## RLS et frontières de confiance

Les contrôles d'interface ne sont pas des contrôles de sécurité. Toutes les tables
publiques ont la RLS activée :

- un joueur lit les lignes qui lui appartiennent, mais ne peut pas écrire les
  compteurs dérivés, runs, membres, maîtrise, unlocks ou attempts directement ;
- les mutations autorisées passent par des RPC `SECURITY DEFINER` à surface
  restreinte ;
- le navigateur peut démarrer, journaliser, sceller et consulter son propre
  attempt, jamais le vérifier ni créditer son résultat ;
- la fonction `verify-run` est la seule à utiliser le `service_role` pour réclamer
  puis finaliser un journal scellé ;
- les vues admin vérifient `is_current_user_admin()` ;
- l'écriture directe de `logs` est révoquée : `submit_client_logs` déduit
  `user_id` et `player_id` de la session et ignore les identités déclarées ;
- la clé anonyme est publique et dépend entièrement des politiques RLS ;
- seule la clé service-role peut contourner ces règles, et elle reste côté CI ou
  runtime Supabase, jamais dans le bundle Vite.

Le schéma SQL et les tests `database.test.ts`,
`verifiedRunAttempts.database.test.ts`, `authoritativeDaily.database.test.ts`,
`logSecurity.database.test.ts` et `authorityRunEngine.test.ts` font autorité si
ce document diverge.
