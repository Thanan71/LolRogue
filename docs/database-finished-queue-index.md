# Décision sur `run_attempts_finished_queue`

Mesure réalisée le **13 août 2026** pour `P2-DB-02`. L'avertissement
`unused_index` n'est pas utilisé seul pour décider : la requête applicative, la
fenêtre des statistiques et un volume synthétique sont vérifiés séparément.

## Requête réelle du verifier

`supabase/functions/verify-run/index.ts` appelle
`claim_run_verification(p_attempt_id, p_worker_id)` avec l'identifiant de
l'attempt reçu par l'Edge Function. La fonction SQL suit exclusivement ce chemin
pour revendiquer la ligne :

```sql
SELECT *
FROM public.run_attempts
WHERE id = p_attempt_id
FOR UPDATE;
```

Les contrôles d'expiration et le rechargement du snapshot utilisent le même
prédicat `id = p_attempt_id`. Il n'existe ni worker qui dépile globalement les
attempts `finished`, ni requête applicative
`WHERE status = 'finished' ORDER BY finished_at`.

L'index équivalent qui couvre le verifier est donc la clé primaire
`run_attempts_pkey (id)`. L'index partiel
`run_attempts_finished_queue (finished_at) WHERE status = 'finished'` ne peut pas
servir ce lookup par identifiant.

Les vues d'exploitation ne changent pas ce constat :

- `authority_attempt_aggregates` agrège toutes les tentatives par `started_at` ;
- `authority_recent_rejections` filtre `status = 'rejected'` ;
- le SLI sur 30 jours filtre des états terminaux `verified`/`rejected`.

## Statistiques d'usage

Les statistiques ont été lues sans écriture avec :

```bash
npm run db:finished-queue:stats
npm run db:finished-queue:stats -- --linked
```

| Base | Dernier reset | Âge à la mesure | `finished_queue` | clé primaire |
| --- | --- | ---: | ---: | ---: |
| locale | 12 août 2026 17:50 UTC | 8 h 53 | 0 scan | 275 scans |
| liée | 15 juillet 2026 13:16 UTC | 28 j 13 h | 0 scan | 5 569 scans |

Le reset local est récent et ne permet pas de conclure. En revanche, la base liée
n'a pas été remise à zéro pendant les 28 jours précédant la mesure : sur la même
fenêtre, la clé primaire a été utilisée 5 569 fois et l'index de file jamais. Les
deux index occupaient 16 kB chacun au moment de l'inspection.

## Charge synthétique

La commande suivante crée 200 000 attempts dans une table temporaire, dont
10 000 (5 %) au statut `finished`, puis annule entièrement la transaction :

```bash
npm run db:finished-queue:measure
```

Elle mesure deux formes distinctes :

1. le vrai claim `WHERE id = p_attempt_id FOR UPDATE` ;
2. une file globale hypothétique `WHERE status = 'finished' ORDER BY finished_at`
   qui permet de vérifier que l'index testé fonctionne, sans la confondre avec le
   comportement applicatif.

Résultat local du 13 août 2026 :

| Requête | Avec l'index partiel | Sans l'index partiel |
| --- | --- | --- |
| claim réel par `id` | `run_attempts_pkey`, 0,038 ms | `run_attempts_pkey`, 0,028 ms |
| file globale hypothétique | index partiel, 0,049 ms | scan séquentiel + tri, 13,832 ms |

Le vrai claim conserve exactement son plan par clé primaire après suppression de
l'index partiel. La faible variation de temps est du bruit de laboratoire. La
requête hypothétique prouve en parallèle que le jeu synthétique est assez grand
pour rendre l'index visible au planner : il occupe 240 kB et évite bien le scan de
200 000 lignes lorsqu'une file globale existe.

## Décision

À compléter après les mesures. L'index reste présent tant que les deux contrôles
ci-dessus ne sont pas terminés.
