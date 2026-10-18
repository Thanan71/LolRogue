# Validation ADM-S4 — 18 octobre 2026

Parent : `ee3cf5b29567e20d0ab20e4c5e973ab5ecd1a745` (`dev`, PR #225 et #226
fusionnées). Branche : `feat/adm-s4-balance-workspace`, PR destinée à `dev`.
Application **0.2.10**, patch notes FR/EN publication **15**.

**ADM-17, ADM-18, ADM-19 et ADM-21 sont implémentés. ADM-20 reste ouvert en
attente de TREE-10.** Le panneau d’attente est livré ; les achats/reset, nœuds
bloqués, spécialisations et victoires par arbre ne sont pas inventés depuis un
second ledger. La [définition des populations](admin-balance.md) précise ce qui
est réellement mesuré et les limites historiques.

## Périmètre et sources

| Tâche | Résultat |
| --- | --- |
| ADM-17 | Onglet Équilibrage différé, distinct d’Autorité ; réutilisation des trois séries FieldCalibration, de leur panneau et des baselines archivées avec politique, seeds, scénario et sources versionnées |
| ADM-18 | Picks sur tous les départs enregistrés, y compris abandons ; présence finale, survie, victoire, dégâts et soins cumulés des résultats vérifiés ; versions et contextes initiaux séparés |
| ADM-19 | Historique des identifiants équipés, runes et augments conservant les stacks ; fréquences et résultats descriptifs, état partiel/vide et identifiant inconnu explicites |
| ADM-20 | Dépendance TREE-10 indisponible, backlog conservé ouvert ; aucun événement ou agrégat d’arbre parallèle |
| ADM-21 | État effectif des rulesets et du flag économie en lecture seule ; absence et désactivation distinctes, revue/tuning/rollback renvoyés aux procédures autorisées |

Les picks utilisent `started_at`, les résultats `verified_at`. Une fin vérifiée
n’est pas divisée par les départs d’une autre horloge. Les performances ne sont
pas regroupées entre compositions, runes, maîtrises, améliorations et identités
de règles différentes. Les DPS, durées de CC et offres d’objets ne sont pas
collectés ; les valeurs par défaut des anciennes colonnes ne les remplacent pas.
Un objet équipé une fois ne prouve pas une combinaison simultanée.

Le seuil de présentation est de 30 comptes distincts. Les taux restent
descriptifs ; les nouveaux intervalles Wilson sont masqués si plusieurs runs
viennent d’un même compte. Les anciennes vues FieldCalibration ne disposent pas
de ce nombre de comptes et conservent leur avertissement explicite. Aucune de
ces preuves ne clôt le playtest humain **P2-BAL-01**.

## Migration et permissions

Une seule migration est ajoutée, créée avec la CLI :
`20261018073001_admin_balance_workspace.sql`, soit **71 migrations**. Les
**70 migrations historiques**, les **24 bundles authority suivis**, le registre
et les sources de gameplay sont identiques au parent. Le moteur demeure
`run-engine-0.2.5`, gameplay 24, hash
`9009950fe0b1c6944a26486e65b0bb0f1379129b42d7499f2bf1c0a8ce3391fa`.

Les trois entrées publiques sont des fonctions invoker :

| RPC | Arguments | Projection |
| --- | --- | --- |
| `admin_balance_champions` | `p_filters jsonb`, `p_snapshot timestamptz` facultatif | Picks indépendants et équipes finales vérifiées |
| `admin_balance_builds` | mêmes arguments | Historique d’équipement et sélections observées |
| `admin_balance_config` | aucun | Rulesets, économie et dépendances effectifs |

Le seul nouveau definer autorisé est privé et contrôle `auth.uid()`, le rôle
admin actuel dans la base et l’absence d’identité Auth anonyme **avant** les
filtres. Les helpers sont révoqués pour les rôles web et service. Les fonctions
ont un `search_path` vide ; les permissions réelles correspondent au manifest.
Aucune nouvelle table, collecte, policy, clé client, mutation de règles ou
exception advisors n’est introduite.

Les fenêtres couvrent au plus 366 dates UTC inclusives, avec 32 identités exactes
par population, 128 contextes et 1 024 lignes. Tout dépassement échoue sans
top partiel. Les trois vues historiques utilisent les filtres serveur supportés
et une sentinelle de 201 lignes ; au-delà de 200 cellules une ressource est
refusée. Les filtres progression/commandes/champion non représentés dans ces
vues ne lancent pas de lecture plus large. Les parseurs vérifient les types,
bornes, identités, cohortes, dénominateurs et partitions, sans ignorer une ligne
malformée.

## Jeux de données et preuves

| Cas | Résultat vérifié |
| --- | --- |
| Zéro observation et champion absent | Aucun taux de victoire inventé ; présence nulle conservée avec son dénominateur lorsque le contexte existe |
| Tentatives non terminées et début hors fenêtre | Picks sur départs de tous statuts ; fin du jour comptée séparément si son départ est antérieur |
| Compositions mixtes, versions, runes et snapshots différents | Contextes distincts, aucun classement transversal |
| 1 005 runs d’un joueur | 1 005 départs et résultats complets, un compte distinct ; pas de plafond navigateur à 1 000 |
| Ledger absent, vieux zéro par défaut ou mauvais lien canonique | Moyennes indisponibles ou run exclue ; aucun faux dégât mesuré |
| Équipement vide/partiel, objet inconnu, augment acquis deux fois | États distincts et multiplicité préservée ; aucune disponibilité ou simultanéité inférée |
| Anon, joueur, métadonnées admin forgées, service sans identité, Auth anonyme et admin révoqué | Refus réel PostgreSQL/PostgREST ; le JWT déjà utilisé ne conserve pas le rôle révoqué |
| Lecture et tentative de mutation de règles/flags | Aucun changement canonique après les lectures ; écritures directes refusées aux rôles navigateur |
| Compte A→B→A, filtre différé, lecture obsolète et refus 42501 | Réponses abandonnées ignorées ; les quatre ressources sont purgées ensemble après refus |
| Autre onglet puis retour | Filtres et trois choix de population conservés ; lectures masquées annulées ; choix réinitialisés au changement de compte |

Les fixtures SQL sont locales, bornées et annulées ou nettoyées. Le test connecté
utilise une inscription navigateur réelle, un démarrage RPC réel et une fixture
locale de résultat vérifié persisté ; ce n’est pas une nouvelle preuve de replay
du moteur. Il appelle les trois vraies RPC, passe les parseurs de production,
affiche les données puis vérifie le refus `403/42501` avec le même JWT et la purge.
Il n’injecte ni état Auth ni réponses réseau et conserve les clés privilégiées
dans Node. Il est obligatoire dans le job connecté de CI.

## Requêtes mesurées

Sur 20 000 runs locales dans une transaction annulée, le chemin source sélectionne
24 lignes en **1,477 ms**, avec 319 blocs partagés et les index existants
`run_attempts_analytics_verified_at`, `runs_run_attempt_id_key` et `players_pkey`.
La RPC champions complète mesure **175,812 ms** puis **156,924 ms**. Son plan
externe Function Scan ne montre pas les index internes ; la requête source est
mesurée séparément. Il ne s’agit pas d’une garantie de latence en production.

Le premier test de 1 005 runs dépassait parfois son délai pendant l’insertion :
`(jsonb_populate_record(...)).*` réévaluait la reconstruction pour chaque colonne.
La fixture utilise maintenant un appel latéral unique, et le même cas termine en
**2,61 s**, avec les mêmes assertions et sans augmenter les timeouts. Le manifest
exact des migrations dans `schema.database.test.ts` est aussi complété pour la
nouvelle migration. Le contrôle du commit candidat requiert que cette migration
soit commitée avant la couverture complète.

## Vérifications acquises

| Contrôle | Résultat |
| --- | --- |
| Structure de base fraîche | PASS ; 71 migrations, lint strict `results: []`, ACL/RLS, advisors, 11 index et types générés concordants |
| Suite DB complète | PASS ; **247/247**, 25 fichiers, zéro skip, 52,91 s ; 39 nouveaux cas |
| Rollback applicatif | PASS ; **10/10**, 2,02 s ; checkpoint `968c0b3a` sur migration `20261018073001` |
| Parseurs/statistiques/cellules historiques | PASS ; **125/125** cas ciblés |
| Interface et source de calibration | PASS ; **40/40** cas ciblés, dont les tests historiques du panneau réutilisé |
| Navigateurs ciblés | PASS ; **4/4**, 17,2 s, sans retry ; FR/EN, 320 px, clavier, axe et route forgée |
| Navigateur connecté | PASS ; **1/1**, 18,3 s, sans retry ; Auth/RPC/PostgreSQL/parseur/UI/révocation |
| Statique et sécurité | PASS ; inventaire, frontières, format/lint, styles, types et contenu ; aucune vulnérabilité high/critical |
| Typecheck strict | PASS ; quatre diagnostics upstream exactement autorisés, aucun ajout d’exception |

La couverture complète, le SHA final et les contrôles CI sont consignés dans la
PR de cette branche. Les historiques de gameplay restent figés ; les captures,
logs et sorties Graphify demeurent hors commit. Aucune image ni dépendance n’est
ajoutée.

## Build et livraison

Le parent est installé et construit dans un clone indépendant sans alternates,
avec un cache npm initialement vide et sans configuration privée. Le build local
de l’espace terminé mesure :

| Mesure | Parent `ee3cf5b2` | ADM-S4 local |
| --- | ---: | ---: |
| JS total gzip | 656 280 | 671 430 |
| Plus gros chunk brut | 466 265 | 451 115 |
| Initial gzip | 226 465 | 226 493 |
| Auth gzip | 231 275 | 231 294 |
| Assets déployables | 8 121 484 | 8 174 811 |

Le budget v12 et sa justification mesurée sont décrits dans
[la performance frontend](frontend-performance.md). La marge minimale reste
10 %, les plafonds initial/Auth et les Web Vitals restent inchangés. Le nouveau
chunk lourd `championContent` reçoit le contrôle de 135 000 octets déjà appliqué
à `content`. Les imports Auth excluent toujours Admin, Database, Legal et les
catalogues champions. Les mesures du SHA final sont attachées à la PR ; des
variations de noms/hash de chunks peuvent légèrement modifier les octets gzip.

Le checkpoint de rollback demeure `968c0b3ad3c2dfc3c2edffefe40e10aaebdeba5c` et sa
dernière migration applicative `20261011134126` ; seule la migration courante
requise devient `20261018073001`. Aucun déploiement ou changement de données
distant n’est effectué par ces validations. La fusion et le déploiement des
migrations selon les cibles autorisées restent des opérations distinctes.
