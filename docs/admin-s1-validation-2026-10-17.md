# Validation ADM-S1 — 17 octobre 2026

## Périmètre

Base `dev` : `53f63629` (ARCH-S5 fusionné). Branche
`feat/adm-s1-data-reliability`, PR vers `dev`. ADM-01 à ADM-06 fiabilisent les
définitions, le registre Candies, les totaux filtrés, les autorisations SQL et les
états indépendants des panneaux. Le [contrat détaillé](admin-metrics.md) couvre
les quinze clés et leurs populations ; ADM-S2 à S7 et TREE-07 restent à réaliser.

L'application et les patch notes FR/EN deviennent **0.2.7**, publication 12.
Le moteur reste `run-engine-0.2.5`, gameplay 24, hash
`9009950fe0b1c6944a26486e65b0bb0f1379129b42d7499f2bf1c0a8ce3391fa`.
Daily/progression/commandes/catalogue restent `15/3/2/2`. Les 24 bundles et les
67 migrations antérieures sont conservés. La nouvelle migration est
`20261017042727_admin_metrics_candy_ledger.sql`.

Le checkpoint applicatif `968c0b3ad3c2dfc3c2edffefe40e10aaebdeba5c` et sa migration
`20261011134126` restent identiques. Seule la migration courante requise devient
`20261017042727` : le rollback doit donc être testé sur cette nouvelle base.
La migration distante, le déploiement et la fusion ne sont pas effectués ici.

## Contrats et preuves ciblées

| Tranche | Résultat attendu | Preuve |
| --- | --- | --- |
| ADM-01 | Connexions enregistrées du jour UTC ; absent/NULL/erreur distinct de zéro | Vue SQL, frontières UTC et composant FR/EN |
| ADM-02 | Solde d'ouverture + gains − dépenses + remboursements + ajustements = solde ; historique inconnu explicite | Écritures atomiques, concurrence, retries, rollback, refus de run et récompense nulle |
| ADM-03 | Quinze définitions visibles : formule, source, unité, période, population et verified | Contrat SQL/UI et dictionnaire FR/EN |
| ADM-04 | Count exact avec les mêmes filtres ; page et export explicitement bornés | 0/100/101/1 000/1 001, compteurs invalides, pagination des équipes |
| ADM-05 | Aucun privilège client supplémentaire ; RLS effective | Quatre rôles, metadata forgées, révocation avec le même JWT et mutations refusées |
| ADM-06 | Sections indépendantes ; données périmées signalées ; réponses obsolètes ignorées | Timeout, retry, filtres, logout et changements de compte |

Avant d'appliquer la migration locale, deux comptes avec soldes 137 et 0 ont été
créés. Après migration, leurs ouvertures restent 137 et 0, les deux historiques
sont incomplets et aucun gain n'est inventé. La preuve temporaire est conservée
dans `/tmp/lolrogue-adm-s1-legacy-migration-proof.json`. Les comptes de test sont
ensuite supprimés et la gate DB recrée la base depuis les migrations finales.

Les tests ciblés réels de base passent : 15 tests de métriques et 15 tests de
permissions (dont sept nouveaux), sans skip. Les requêtes de tableaux ont
29 tests unitaires. Les deux nouveaux parcours Playwright font passer les
requêtes SDK par des réponses HTTP contrôlées pour vérifier counts, états et
définitions desktop FR/mobile EN ; ils ne constituent pas une preuve RLS.
Cette dernière vient des tests contre PostgreSQL/PostgREST locaux.

## Baseline et budgets

Un clone indépendant du parent, sans environnement privé et avec son propre
cache npm, passe `npm ci` et `npm run check:build` sous Node 24.19.0/npm 11.17.0.

| Mesure | Parent `53f63629` | Premier build ADM-S1 |
| --- | ---: | ---: |
| JavaScript gzip | 621 519 octets | 626 457 octets |
| Plus gros chunk JavaScript brut | 466 265 octets | 466 265 octets |
| Chargement initial gzip | 220 434 octets | 220 794 octets |
| Route Auth gzip | 225 215 octets | 225 578 octets |
| Assets déployables | 7 994 061 octets | 8 009 358 octets |
| Entrées npm publiques | 40 | 40 |

Ces builds utilisent `commitSha: local`. Un SHA complet ajoute 70 octets aux
métadonnées de déploiement. Les mesures sont locales, pas un benchmark statistique.
Le budget v10 relève uniquement les assets de 8 000 000 à 8 050 000 octets
(+0,625 %), conformément à la préférence utilisateur de préserver la qualité du
code. Le plafond JavaScript reste 700 000 octets avec 10 % de marge obligatoire ;
les autres budgets et seuils de couverture sont inchangés.

## Gates complètes

| Gate | Résultat local |
| --- | --- |
| Base recréée, ACL, RLS, advisors, index, types et manifeste | PASS ; 68 migrations, dernière `20261017042727` ; 152 tests / 19 fichiers, aucun skip, phase Vitest 80,52 s |
| Contrôles ciblés UI et requêtes | PASS ; 41 tests Admin / 4 fichiers, 29 tests de requêtes ; TypeScript app et E2E verts |
| Nouveaux parcours Admin | PASS ; 2/2 sans retry, desktop FR et mobile EN 320 px ; captures hors dépôt |
| TypeScript strict | PASS ; quatre diagnostics upstream précisément autorisés, inchangés |
| Artefacts | PASS ; 17 familles, 303 fichiers et 24 versions authority ; aucune écriture par le checker |
| Graphify | Rafraîchissement code-only incrémental effectué, sorties ignorées par Git |

Les résultats restants du candidat, du clone neuf et de la CI sont ajoutés après
leur exécution. Ces contrôles ciblés ne les remplacent pas.
