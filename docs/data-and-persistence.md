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
| Maîtrise | cache `masteryStore` associé à l'identité active | `champion_mastery.unlocked_ids` | snapshot `guestSnapshot` dans `lolrogue-mastery-storage` | crédit atomique d'une run vérifiée |
| Améliorations | `enhancementStore` | `champion_enhancements`; solde dans `players.total_candies` | indisponible sans compte | RPC `unlock_champion_enhancement` |
| Daily run en cours | `runStore`; `dailyRunStore` ne garde que date/seed/expiration/complétion | attempt serveur avec seed UTC | état de run dans `lolrogue-run-storage`, métadonnées dans `lolrogue-daily-run` | même journal vérifié qu'une run normale |
| Classement daily | store après lecture | vue sanitisée `daily_leaderboard` issue des runs vérifiées | `lolrogue-daily-leaderboard` | trigger serveur après replay autoritaire |
| Leaderboard normal | écran après lecture | vue `leaderboard` dérivée de `runs` | lecture éventuelle seulement | aucune écriture directe |
| Diagnostics client | buffer mémoire borné | `logs`, 14 jours maximum | désactivés | RPC `submit_client_logs` authentifiée |
| Réglages audio/UI | stores dédiés | aucune | `localStorage` | stores client |
| Catalogue de jeu | imports TypeScript/JSON | fichiers versionnés dans `src/data/generated` et paquet minimal `public/assets/riot` | identique | scripts d'assets ou code |

## Propriétaires et commandes de mutation

Une donnée de run n'a qu'un propriétaire observable. Les pages lisent ce
propriétaire et déclenchent ses commandes ; elles ne maintiennent pas de miroir
modifiable.

| Donnée | Propriétaire | Mutation autorisée | Règle canonique appelée |
| --- | --- | --- | --- |
| équipe, carte, encounter, or et niveau | `runStore` | commandes publiques du `runStore` | modules purs de `game/run` et `game/map` |
| inventaire et équipement | `runStore.inventory` | achats, équipement et revente du `runStore` | `inventoryRules` |
| runes et actions de combat | checkpoint du `runStore`, runtime de combat éphémère | commandes de combat journalisées | `CombatRuleRuntime` et `RuneManager` |
| effets temporaires de combat | `BattleManager` | résolution d'une action | `EffectManager` |
| augments acquis | `runStore.augmentIds` | choix d'augment du `runStore` | `createRunAugmentManager` / `AugmentManager` |
| métadonnées Daily et classement invité | `dailyRunStore` | synchronisation du challenge et enregistrement du résultat figé | score Daily pur |

`EncounterManager` a été supprimé : les événements utilisent directement les
règles sans état de `eventOutcome`. L'ancien `InventoryManager` est déprécié et
n'est plus exporté par le module ; il reste uniquement comme compatibilité de
tests isolés. Son compteur d'instances est local à chaque instance, jamais un
singleton de données de run. Le flux de production utilise exclusivement
`runStore` et `inventoryRules`.

Cette propriété client organise l'interface mais ne crée aucune autorité de
sécurité. Un RPC `SECURITY DEFINER` n'est sûr que si ses paramètres, son
propriétaire, son `search_path`, ses grants et ses invariants sont contrôlés. Les
RPC de journal acceptent des intentions bornées ; seul le replay `verify-run` et
la transaction `complete_run_verification` transforment ces intentions en résultat
durable. Les vues et RPC de lecture ne doivent pas être confondus avec une
autorisation d'écriture sur leurs tables sources.

## Partie locale et synchronisation

Pour un compte connecté, `start_run_attempt` crée d'abord l'attempt. Le serveur
choisit le seed et fige le ruleset de progression, le ruleset de gameplay, la
version du moteur, le hash de contenu, la difficulté, l'équipe, les runes et les
snapshots de maîtrise et d'améliorations. Une seule tentative ouverte est autorisée par
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

Il n'existe donc pas de « sauvegarde du loadout » séparée après la run. Le loadout
initial (équipe, runes, difficulté, maîtrise et améliorations) est figé dans
`run_attempts` au démarrage ; le loadout final (membres, PV/PM, objets, augments et
rangs) est dérivé du replay puis inséré dans la même transaction que la run et la
progression. Si cette transaction échoue, aucun sous-ensemble n'est considéré
comme sauvegardé et l'attempt reste réconciliable ou rejeté selon son statut.

Une partie invitée ne contacte pas la base. Seul le navigateur courant possède
l'état et la progression. Cette progression vit dans un namespace `guestSnapshot`
et n'est jamais fusionnée, importée ou copiée automatiquement lors de la création
ou de la connexion à un compte. À l'inverse, un compte ne persiste jamais sa
maîtrise dans ce snapshot local : chaque changement d'identité vide les caches,
puis attend profil, maîtrise et améliorations Supabase avant d'ouvrir les routes
de jeu.

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

Toutes les mutations ultérieures passent par les règles de domaine communes :
équipe de 1 à 5 champions sans doublon, équipement limité aux membres présents,
20 objets au total, 6 slots par champion et contraintes de catalogue
`unique`/`stackable`/`maxStacks`. Les rangs de sorts viennent du catalogue et sont
bornés par le niveau du champion. Les rangs 2–5 des sorts de base demandent les
niveaux 3/5/7/9 ; les rangs 2–3 de l'ultime demandent les niveaux 6/11.

La version 7 de `lolrogue-run-storage` normalise ces trois domaines avant
d'exposer une sauvegarde réhydratée. Elle canonise les IDs et objets, retire
doublons et références orphelines, borne les rangs, limite la file de choix à la
capacité réellement disponible et avance le compteur d'instances au-delà de tout
ID restauré. La version 4 du stockage Daily ne contient plus de miroir de gameplay
et migre les anciennes sauvegardes en ne conservant que leurs métadonnées. Pour une attempt
connectée, une équipe locale manquante est reconstruite depuis `initialTeam` ;
une run invitée sans membre légal n'est pas reprise comme active.

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

Chaque stockage Zustand possède désormais un numéro de schéma et une validation
runtime avant merge, y compris lorsque le payload annonce déjà la version courante.
Une version future, un type invalide ou une migration qui échoue restaure les
defaults et conserve la copie fautive sous `lolrogue-quarantine:<nom-du-store>`.
Les statuts réseau transitoires `saving` et `retrying` sont réhydratés en échec
réessayable, jamais comme promesse encore active.

L’entrée dans un combat écrit `combatCheckpointNodeId` avant le premier tour. Si
ce checkpoint est retrouvé au chargement, le combat est rejoué en autoplay
déterministe et les choix manuels sont désactivés. Le checkpoint disparaît avec
le claim atomique de la rencontre. Un refresh ne peut donc plus restaurer les PV
pré-combat afin d'offrir une nouvelle tentative manuelle gratuite.

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
- `champion_enhancements` contient les rangs achetés et le coût total par champion.

Après connexion, Supabase remplace les caches locaux pour les données persistantes.
L'authentification suit une machine d'état explicite : `bootstrapping`,
`profileLoading`, `ready`, `profileUnavailable`, `guest` ou `signedOut`. Une session
Supabase seule ne vaut jamais autorisation de jouer : `isAuthenticated` devient
vrai uniquement après récupération du profil durable et hydratation de la maîtrise
et des améliorations. Le trigger de création du profil est relu avec une politique
bornée et réessayable ; un profil toujours absent reste dans
`profileUnavailable` et peut être rechargé sans transformer la session en invité.

`AuthBootstrap` possède l'abonnement Supabase et le désabonne à son démontage.
Chaque transition incrémente une génération d'identité : profil, progression ou
événement arrivé après un login/logout plus récent est ignoré. Un logout refusé
par Supabase conserve l'identité courante et expose l'erreur. Le drapeau invité
utilise l'adapter de stockage tolérant aux erreurs. Une run active bloque les
transitions d'identité au niveau du store ; les écrans doivent d'abord terminer ou
abandonner la run via la finalisation idempotente.

Le niveau de maîtrise servant à autoriser une amélioration vient de la base, pas
d'un calcul client arbitraire. L'achat passe par une RPC qui verrouille le profil,
vérifie le solde et le niveau, puis débite et débloque atomiquement.

Les seuls unlocks de maîtrise livrés sont `starter_slot_2` au niveau 1 et
`starter_slot_3` au niveau 3. Leur cible concrète est respectivement deux et trois
places dans l'équipe initiale. Aucun skin ou chroma n'est promis par le contrat
actuel. Starter affiche et impose la limite, puis le store, le trigger PostgreSQL
et le replay autoritaire la revérifient.

Pendant une run connectée, les snapshots de maîtrise et d'améliorations figés au
démarrage sont utilisés par le client et par le replay. Le niveau de maîtrise
ajoute 2 % aux statistiques de base par niveau acquis, jusqu'à 8 %, via le
calculateur canonique. Une progression ou un achat effectué dans un autre onglet
ne peut donc pas modifier rétroactivement les règles d'un attempt déjà ouvert.
Les récompenses d'une run connectée restent dans le snapshot de finalisation tant
que l'authority n'a pas confirmé sa transaction ; elles ne sont jamais appliquées
au namespace invité. Après confirmation, les caches profil, maîtrise et
améliorations sont réhydratés depuis les valeurs canoniques du serveur.

## Classements

Le leaderboard normal est une vue calculée à partir d'une projection serveur
sanitisée ; il n'est jamais écrit par le navigateur. La projection vit dans le
schéma non exposé `private`, est synchronisée par des triggers internes et ne
contient aucune donnée de compte. La vue publique s'exécute avec
`security_invoker=true` ; elle ne contourne donc pas la RLS de `players`. Son
contrat public se limite à `rank`,
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
la tentative sans publier de ligne. Un trigger interne copie uniquement le contrat
publiable vers la projection sanitisée du schéma `private`. La vue
`daily_leaderboard`, elle aussi en `security_invoker=true`, ne restitue que le rang,
le nom public et les métriques nécessaires ; la table brute `daily_runs` reste
inaccessible aux non-administrateurs.

La journée canonique est calculée par PostgreSQL en UTC et expire au minuit UTC
suivant. Le calcul versionné est :

```text
bonus victoire
+ vagues terminées × wave_points
+ biomes visités × biome_points
+ niveau atteint × run_level_points
+ or total gagné × gold_points
```

Dans le ruleset Daily v16 actif, ces coefficients valent respectivement 10 000,
1 000, 250, 100 et 1. Ils sont hérités du ruleset v14, liés à `score_version = 14`
et ne peuvent pas être remplacés par un score déclaré par le client. Une version de
score identifie la formule : plusieurs rulesets Daily peuvent donc partager la même
version lorsque les coefficients restent identiques. La valeur demeure strictement
positive, sans servir de clé étrangère ; les relations utilisent la version du
ruleset Daily.

Le trigger de création et le moteur authority v16 imposent tous deux
`mastery_snapshot = {}` et `enhancement_snapshot = {}` aux tentatives Daily.

En mode invité, le classement daily local sert uniquement de retour d'interface.
Il ne constitue pas un score officiel et peut être effacé avec le stockage du
navigateur.

## RLS et frontières de confiance

Les contrôles d'interface ne sont pas des contrôles de sécurité. Toutes les tables
publiques ont la RLS activée :

- un joueur lit les lignes qui lui appartiennent, mais ne peut pas écrire les
  compteurs dérivés, runs, membres, maîtrise, unlocks ou attempts directement ;
- les mutations autorisées passent par des RPC `SECURITY DEFINER` à surface
  restreinte ; leur matrice rôle/signature et leur justification sont versionnées
  dans `config/security-definer-privileges.json` ;
- le navigateur peut démarrer, journaliser, sceller et consulter son propre
  attempt, jamais le vérifier ni créditer son résultat ;
- la fonction `verify-run` est la seule à utiliser le `service_role` pour réclamer
  puis finaliser un journal scellé ;
- les vues admin vérifient `is_current_user_admin()` ;
- les fonctions de trigger, de compatibilité historique et de maintenance n'ont
  aucun droit `EXECUTE` navigateur ; `purge_expired_social_data` est réservée au
  `service_role` et l'expiration des attempts est intégrée aux commandes serveur ;
- l'écriture directe de `logs` est révoquée : `submit_client_logs` déduit
  `user_id` et `player_id` de la session et ignore les identités déclarées ;
- la clé anonyme est publique et dépend entièrement des politiques RLS ;
- seule la clé service-role peut contourner ces règles, et elle reste côté CI ou
  runtime Supabase, jamais dans le bundle Vite.

Le schéma SQL et les tests `schema.database.test.ts`,
`verifiedRunAttempts.database.test.ts`, `authoritativeDaily.database.test.ts`,
`logSecurity.database.test.ts`, `securityDefinerPrivileges.database.test.ts` et
`authorityRunEngine.test.ts` font autorité si ce document diverge.
