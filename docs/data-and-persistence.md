# Données et persistance

Ce document définit la source de vérité de chaque domaine. Une modification de
persistance doit conserver cette séparation et mettre à jour les tests associés.

## Matrice des responsabilités

| Domaine | Pendant l'exécution | Source durable connectée | Mode invité | Écriture |
| --- | --- | --- | --- | --- |
| Session Auth | `authStore` et Supabase Auth | `auth.users` | indicateur `lolrogue-guest-mode` dans `localStorage` | dépôts Auth |
| Profil joueur | `authStore.player` | `public.players` | profil temporaire client | `SupabasePlayerRepository` |
| Partie en cours | `runStore` | aucune sauvegarde serveur avant la fin | `lolrogue-run-storage` | actions du store |
| Résultat de partie | résumé construit par `runStore` | `runs` et `run_team_members` | local uniquement | RPC `save_completed_run` |
| Maîtrise | `masteryStore` | `champion_mastery` et `player_unlocks` | `lolrogue-mastery-storage` | sauvegarde atomique de fin de run |
| Améliorations | `enhancementStore` | `champion_enhancements`; solde dans `players.total_candies` | indisponible sans compte | RPC `unlock_champion_enhancement` |
| Daily run en cours | `dailyRunStore` | aucune avant soumission | `lolrogue-daily-run` | actions du store |
| Classement daily | store après lecture | `daily_runs` via la vue/RPC autorisée | `lolrogue-daily-leaderboard` | RPC `submit_daily_run` |
| Leaderboard normal | écran après lecture | vue `leaderboard` dérivée de `runs` | lecture éventuelle seulement | aucune écriture directe |
| Réglages audio/UI | stores dédiés | aucune | `localStorage` | stores client |
| Catalogue de jeu | imports TypeScript/JSON | fichiers versionnés dans `src/data` et `public/lol/data` | identique | scripts d'assets ou code |

## Partie locale et synchronisation

`runStore` est la source de vérité tant qu'une partie est active. Il persiste le
seed, l'équipe, les PV, l'XP, l'inventaire, les runes, les augments, les cartes et
les rencontres déjà consommées. Cette copie permet de reprendre après un
rafraîchissement, mais ce n'est pas une sauvegarde multiappareil.

À la fin, le store construit un résumé immuable et appelle
`save_completed_run`. La fonction PostgreSQL vérifie l'utilisateur courant,
normalise les mesures numériques, insère le run et ses membres, puis applique
maîtrise et récompenses dans une transaction. Le `runId` rend une nouvelle
tentative idempotente. En cas d'erreur réseau, `saveStatus` reste en erreur et le
résumé demeure disponible pour réessayer sans redonner les récompenses.

Une partie invitée ne contacte pas la base. Seul le navigateur courant possède
l'état et la progression; aucune fusion automatique n'est faite lors de la
création ultérieure d'un compte.

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

## Classements

Le leaderboard normal est une vue calculée à partir des runs enregistrés; il n'est
jamais écrit par le navigateur. Le daily leaderboard est public en lecture pour le
jour concerné, mais une soumission nécessite un utilisateur authentifié et passe
par `submit_daily_run`, qui applique la règle d'une participation par joueur et par
date.

En mode invité, le classement daily local sert uniquement de retour d'interface.
Il ne constitue pas un score officiel et peut être effacé avec le stockage du
navigateur.

## RLS et frontières de confiance

Les contrôles d'interface ne sont pas des contrôles de sécurité. Toutes les tables
publiques ont la RLS activée :

- un joueur lit et modifie ses propres données ;
- les écritures sensibles passent par des RPC `SECURITY DEFINER` à surface
  restreinte ;
- les vues admin vérifient `is_current_user_admin()` ;
- la clé anonyme est publique et dépend entièrement des politiques RLS ;
- seule la clé service-role peut contourner ces règles, et elle reste côté CI ou
  administration.

Le schéma SQL et les tests `database.test.ts` et
`supabaseRepositories.test.ts` font autorité si ce document diverge.
