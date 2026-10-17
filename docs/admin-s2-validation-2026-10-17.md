# Validation ADM-S2 — 17 octobre 2026

Parent : `ae51c452e088e42cd36d33d5d35a5b8780e528e2` (`dev`, PR #223 fusionnée).
Branche : `feat/adm-s2-player-run-explorer`, PR destinée à `dev`.

L’application et les patch notes FR/EN deviennent **0.2.8**, publication 13.
ADM-07 à ADM-11 ajoutent pagination serveur, recherche littérale, fiche joueur,
explorateur runs/tentatives, détail sûr et export exact borné. Le
[contrat détaillé](admin-explorer.md) donne les populations, droits, filtres,
limites de snapshot et historiques partiels. ADM-S3 à S7 restent à réaliser.

Le moteur reste `run-engine-0.2.5`, gameplay 24, hash
`9009950fe0b1c6944a26486e65b0bb0f1379129b42d7499f2bf1c0a8ce3391fa`.
Les 24 archives authority et les anciennes migrations sont préservées. Une seule
migration est ajoutée : `20261017055016_admin_player_run_explorer.sql` (69 au total).
Le checkpoint applicatif reste `968c0b3a`, migration applicative `20261011134126` ;
sa validation exige désormais la migration courante `20261017055016`.
Aucune image, dépendance ou action métier publique n’est ajoutée.

## Données et sécurité

| Tâche | Contrat | Preuves ciblées |
| --- | --- | --- |
| ADM-07 | Pages 1–100, compte complet, keyset date/ID, équipes jointes pour la page | PostgreSQL >100 joueurs, 1 005 runs, six tris, insertions, dernière page ; retour UI |
| ADM-08 | Recherche serveur NFC littérale, 300 ms, filtres UTC et compte réel | Casse, Unicode composé/décomposé, `%`/`_`/ponctuation, recherche hors page, filtres invalides |
| ADM-09 | Profil minimal, progression, monnaies distinctes, provenances et inconnus explicites | Comptes sans runs, historiques incomplets, wallet absent, grands nombres, permissions |
| ADM-10 | Populations runs/tentatives séparées, filtres serveur, détails en mémoire | Filtres combinés et refus de filtres non applicables, journal sûr, rejet, retour, aucune URL personnelle |
| ADM-11 | Page CSV ou export complet atomique confirmé, plafond 5 000 | >1 000 lignes, anti-formule/UTF-8, précision bigint, drift, annulation et refus de cap |

Les tests de permissions utilisent PostgreSQL/PostgREST locaux : anon, utilisateur,
metadata forgées, service sans identité et révocation d’un admin avec le même JWT.
Les RPC publiques sont invoker ; seuls trois points d’entrée privés sont definer,
avec garde admin, `search_path` vide et ACL explicites. Les tables serveur gardent
leurs droits et RLS antérieurs, vérifiés avec un vrai journal étranger.

Les tests navigateur HTTP contrôlés vérifient rendu, SDK, pagination, filtres,
clavier, retour et export ; ils ne constituent pas une preuve RLS. Les données,
identifiants et captures de test restent hors assets/commit.

## Mesures et budgets

Les mesures du parent proviennent d’un clone indépendant sans environnement privé,
sans alternate Git ni cache npm préexistant, installé sous Node 24.19.0/npm 11.17.0.
Les mesures sont locales, pas un benchmark statistique de production.

Le premier build ADM-S2 mesure 226 373 octets gzip au chargement initial,
231 177 pour Auth et 8 070 267 octets d’assets ; sa marge JavaScript sous le
plafond v10 est 8,22 %, inférieure aux 10 % exigés. Le budget **v11** accompagne
ce lot fonctionnel : JS total 700 000 → 730 000, initial 225 000 → 230 000,
Auth 230 000 → 235 000, assets 8 050 000 → 8 150 000 octets.
Le minimum de 10 % de marge, les plafonds des chunks et les seuils de couverture
restent inchangés. L’augmentation respecte la préférence explicite de préserver
la qualité du code ; elle ne neutralise aucun contrôle d’accès ou de correction.
Les catalogues FR/EN expliquent l’augmentation initiale ; le code des écrans admin
reste différé et l’isolation de la route Auth est vérifiée par manifest.


| Mesure | Parent `ae51c452` | Candidat code |
| --- | ---: | ---: |
| JavaScript gzip | 627 036 | 642 756 |
| Plus gros chunk brut | 466 265 | 466 265 |
| Initial gzip | 220 859 | 226 437 |
| Auth gzip | 225 648 | 231 251 |
| Assets déployables | 8 011 051 | 8 071 596 |

Marge JavaScript finale locale : **11,95 %**. Les 40 entrées npm publiques sont conservées.

## Résultats

La clôture de cette tranche distingue preuves locales, état de CI, fusion et
application distante. Les résultats définitifs seront consignés dans la PR et
ce rapport après les gates finales. Aucune migration distante ni déploiement
manuel ne découle des tests locaux.
