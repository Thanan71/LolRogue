# Revue des exceptions Supabase — 1er octobre 2026

## Périmètre et résultat

La [CI du commit `1107113`](https://github.com/Thanan71/LolRogue/actions/runs/36878761923/job/110424868105)
a reconstruit la base locale à partir des migrations, puis réussi le lint et
l'audit `db:security`. Les advisors ont retourné **29 constats** : sécurité
3 INFO et aucune ERROR ; performance 25 INFO, 1 WARN et aucune ERROR. Les
29 blocages étaient exclusivement des exceptions expirées le 30 septembre.
Ce résultat concerne la base éphémère CI, pas les statistiques ou la configuration
actuelles de LolRogue/LolRogueDev.

Après comparaison avec les migrations, les accès applicatifs et les mesures
versionnées, 29 exceptions sont renouvelées jusqu'au **31 octobre 2026 inclus**.
Le 1er novembre, les constats encore présents bloqueront à nouveau. Une exception
disparue est supprimée ; aucune nouvelle identité d'alerte n'est acceptée.
Cette revue ne modifie ni le schéma, ni les index, ni les droits de la base distante.

## Sécurité : trois tables volontairement internes

| Table | Contrat vérifié | Preuve migrée |
| --- | --- | --- |
| `daily_challenge_rulesets` | catalogue serveur lu par les RPC autoritaires ; aucune lecture Data API client | `20260726090000_authoritative_daily_leaderboard.sql` : RLS activée et droits `PUBLIC`, `anon`, `authenticated` révoqués ; `service_role` en lecture |
| `progression_commands` | journal idempotent des achats d'amélioration, écrit par `unlock_champion_enhancement` ; aucun accès table client | `20260723090000_server_authoritative_progression.sql` : RLS, révocations et clé `(user_id, command_id)` ; `20260809120000_harden_security_definer_privileges.sql` : droits RPC bornés |
| `progression_enhancement_security_baselines` | archive interne de quarantaine/audit des anciens rangs, alimentée par migration, sans consommation runtime actuelle | `20260724190000_harden_verified_attempt_contract.sql` : RLS, révocations et alimentation de l'archive |

Les deux dernières justifications ont été corrigées : le journal d'achat n'est
pas écrit exclusivement par `complete_run_verification`, et l'archive de baseline
n'est pas présentée comme une dépendance runtime des RPC. L'absence de policy client
est intentionnelle ; ouvrir cet accès par des policies et des grants exposerait
des données internes sans besoin applicatif. Une policy seule ne rétablit pas les
droits clients révoqués.

## Performance : six FK de versions, dix-neuf index et une policy

Les six `unindexed_foreign_keys` encore présentes concernent les versions de
`daily_challenge_rulesets`, `daily_runs`, `progression_commands` et `run_attempts`.
Les parcours actuels restent des lookups par PK/tentative, utilisateur et commande,
ou un leaderboard d'abord filtré par date. Les catalogues parents restent
append-only. Les [mesures d'index](database-index-measurements.md) demeurent des
mesures de laboratoire datées d'août, pas une nouvelle mesure de trafic réel.
Le journal de commandes est décrit correctement par `(user_id, command_id)`,
et non par tentative et séquence.

L'exception disparue concerne `run_attempts_gameplay_ruleset_version_fkey`.
La migration `20260906071542_aggregate_verified_field_calibration.sql` ajoute
`run_attempts_verified_field_dimensions` avec cette colonne en tête, mais seulement
pour `status = 'verified' AND result_run_id IS NOT NULL`. Le
[linter Supabase](https://github.com/supabase/splinter/blob/main/lints/0001_unindexed_foreign_keys.sql)
compare les premières colonnes des index valides sans exclure les index partiels.
Cela explique l'absence de l'alerte, sans prouver une couverture FK de toutes les
lignes. `db:indexes:check` attend déjà six alertes et vérifie le prédicat partiel.

Les dix-neuf `unused_index` proviennent d'une base fraîche dont les compteurs
ne représentent pas le trafic. Les chemins documentés de reprise, historique,
classements, repositories, audit, intégrité et rétention restent présents.
Ces alertes seules ne justifient aucune suppression. La décision antérieure de
[supprimer `run_attempts_finished_queue`](database-finished-queue-index.md) reste
inchangée, et la gate interdit son retour. Toute nouvelle suppression exige
des statistiques sur une fenêtre représentative et des plans mesurés.

Le WARN `multiple_permissive_policies` sur la lecture de `run_attempts` reste
borné : accès propriétaire et accès administrateur séparés pour audit, sans
élargissement des droits. Leur combinaison nécessite une mesure et une revue
de sécurité distinctes, pas une modification improvisée pour cette CI.

## Contrôles conservés et prochaine revue

- `security: ERROR` toujours bloquant, même si une exception correspond ;
- identité, nom et niveau exacts ; inconnus, contrat modifié et expiration bloquants ;
- tests de politique couvrant ces refus et la borne d'expiration ;
- CI complète à rejouer après ce renouvellement : advisors, audit de sécurité,
  définitions d'index, migrations, types et intégrations sur base reconstruite.

Avant le 1er novembre, comparer à nouveau les constats réels aux migrations et
aux requêtes ; retirer les exceptions disparues, mesurer avant toute suppression
d'index et documenter toute prolongation. Le preflight `--linked` reste une
vérification distincte, sur le projet explicitement lié avant une release.
