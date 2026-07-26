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

Une partie invitée ne contacte pas la base. Seul le navigateur courant possède
l'état et la progression; aucune fusion automatique n'est faite lors de la
création ultérieure d'un compte.

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
jamais écrit par le navigateur. Pour un compte connecté, `get_daily_challenge`
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
- la clé anonyme est publique et dépend entièrement des politiques RLS ;
- seule la clé service-role peut contourner ces règles, et elle reste côté CI ou
  runtime Supabase, jamais dans le bundle Vite.

Le schéma SQL et les tests `database.test.ts`,
`verifiedRunAttempts.database.test.ts`, `authoritativeDaily.database.test.ts` et
`authorityRunEngine.test.ts` font autorité si ce document diverge.
