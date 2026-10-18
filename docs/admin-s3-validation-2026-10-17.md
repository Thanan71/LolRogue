# Validation ADM-S3 — 17–18 octobre 2026

Parent : `4f765799a67b97104aa0a37b52dd4f058334f126` (`dev`, ADM-S2 fusionné).
Branche : `feat/adm-s3-temporal-analytics`, PR destinée à `dev`.

L’application et les patch notes FR/EN deviennent **0.2.9**, publication 14.
Le [contrat des analytics](admin-analytics.md) définit les horloges, périodes,
populations, limites historiques et dénominateurs. Les règles de gameplay et
les archives authority restent inchangées. Une migration est ajoutée :
`20261017070341_admin_temporal_analytics.sql` (70 au total). Le checkpoint
applicatif reste `968c0b3a`, sa migration `20261011134126` ; la version courante
requise devient `20261017070341`.

## Périmètre

| Tâche | Comportement |
| --- | --- |
| ADM-12 | Agrégats UTC serveur jour/semaine, périodes vides, acquisitions globales, départs, joueurs actifs, fins vérifiées, victoires et Daily séparés |
| ADM-13 | Cohortes de création, retours exacts D1/D7/D30, distinction retour même identité/toute identité, couverture et maturité explicites |
| ADM-14 | Funnel de comptes sur sept jours, première tentative, commande combat acceptée, fin vérifiée puis retour ordonnés ; retries sans doublon |
| ADM-15 | Identités exactes moteur/hash/gameplay/progression/commandes/mode/difficulté, ancienneté explicite, acquisition globale indépendante des filtres |
| ADM-16 | N et numérateur/dénominateur, Wilson 95 %, N=0 indisponible, seuil descriptif N=30 et périodes incomplètes exclues des taux |

Aucune mesure invitée ou appareil n’est inventée. `last_login_at` n’est pas une
série d’activité. Le marqueur d’observation créé par la migration n’est jamais
rétrodaté ; les anciennes cohortes montrent des observations et un taux inconnu.
Une intention de combat acceptée n’est pas nommée combat exécuté. Les comptes
supprimés ne sont pas reconstruits depuis les données survivantes.

## Mesures de référence

Le parent est cloné indépendamment, sans alternates Git, installé avec un cache
npm initialement vide sous Node 24.19.0/npm 11.17.0. Son build et l’isolation Auth
passent avec le budget v11 existant.

| Mesure | Parent `4f765799` |
| --- | ---: |
| JavaScript gzip | 642 756 |
| Plus gros chunk brut | 466 265 |
| Initial gzip | 226 437 |
| Auth gzip | 231 251 |
| Assets déployables | 8 071 596 |

## Jeux de données et résultats attendus

Les fixtures temporelles opèrent dans une transaction locale privilégiée qui est
annulée. Elles peuvent y déplacer le marqueur pour vérifier des jours complets ;
le marqueur installé demeure inchangé après chaque cas. Les comptes éphémères
sont supprimés. Aucun override de date ou de couverture n’est exposé au client.

| Jeu de données | Résultat acquis |
| --- | --- |
| 1 005 tentatives d’un joueur le 1er février 2024, statuts modifiés | 1 005 départs, un joueur actif, aucun total limité par les lignes PostgREST |
| Départ le 31 janvier à 23:59:59 UTC, vérification le 1er février à 00:00 | Le 1er février : zéro départ, une fin vérifiée et une victoire |
| Daily démarré le 31 janvier et vérifié le lendemain | Départs Daily `[1,0]`, fins Daily `[0,1]` ; le jour du défi ne déplace pas la fin |
| Semaines du 28 février au 5 mars 2024, lecture le 5 à midi | Deux périodes coupées aux bornes, fin observée à midi ; année bissextile acceptée |
| Aucun départ et première tentative appartenant à une autre version | Groupe sans tentative explicite ; le filtre ne réattribue pas la première tentative à une version ultérieure |
| Retours D1, D7, D30, jours voisins et changements de règles | Retours exacts, même identité séparée de toute identité, aucun taux pour les cohortes non couvertes ou immatures |
| Première tentative abandonnée, seconde terminée, commandes réessayées | Funnel de la première tentative conservé, étapes ordonnées et joueurs uniques |
| Même requête préparée en UTC puis UTC+14 | Résultats identiques ; les helpers ne figent pas une conversion dépendante du fuseau |

Les permissions utilisent de vrais JWT/PostgREST/PostgreSQL : anon, utilisateur,
métadonnées admin forgées, utilisateur Auth anonyme, service sans identité et
admin révoqué avec le même JWT. Les trois réponses réelles sont également lues
par les parseurs TypeScript de l’interface, avec refus des projections partielles.

## Requêtes et index

Les scans globaux de l’historique ont été remplacés par des départs bornés, des
fins filtrées sur `verified_at`, les inscriptions de la fenêtre puis leur
première tentative par jointure latérale, et des retours bornés par joueur et
jour/horizon. Les filtres s’appliquent après le choix de la première tentative.
Deux index temporels sont ajoutés et contrôlés parmi les 11 index mesurés.

Sur une transaction locale annulée de 20 000 tentatives/fins, une lecture de 24
lignes donne les mesures suivantes. Il s’agit des chemins d’accès, pas d’un
benchmark de la RPC complète ni d’une garantie de production.

| Accès | Avant | Après |
| --- | --- | --- |
| Départs par `started_at` | 228 blocs, 0,551 ms | 31 blocs, 0,083 ms |
| Fins vérifiées par index partiel `verified_at` | 530 blocs, 1,674 ms | 26 blocs, 0,035 ms |

Trois exceptions advisors **exactes et temporaires**, échéance 31 octobre 2026,
couvrent le marqueur privé RLS sans policy (aucun droit web/service) et les deux
index dont les compteurs sont remis à zéro par le reset. Les hard gates restent
inchangés ; ces exceptions ne valent pas validation d’usage en production.

## Vérifications

| Gate | Résultat acquis |
| --- | --- |
| Base fraîche | PASS ; 70 migrations, lint strict vide, ACL, RLS, advisors, 11 index et types générés concordants |
| Suite DB complète | PASS ; 208 tests / 23 fichiers, zéro skip, 45,20 s de tests et 94,60 s de gate ; inclut 34 nouveaux cas |
| Rollback applicatif | PASS ; 10/10, checkpoint `968c0b3a` sur migration `20261017070341` |
| Couverture complète | PASS ; 3 330 tests unitaires, 164 skips DB attendus et couverts par la suite DB ; 288 fichiers verts, 15 skipped, 307,69 s ; statements 86,35 %, branches 78,73 %, fonctions 91,06 %, lignes 88,40 % |
| Parseurs et statistiques | PASS ; 45/45, également sous `TZ=Pacific/Honolulu`, N=0/1/30, 0/100 %, données invalides, bornes et Wilson |
| UI ciblée | PASS ; 22 cas sur trois graines, y compris compte/droits A→B→A, filtre différé et refus 42501 partagé aux trois ressources |
| Build final local | PASS ; JavaScript gzip 656 239, initial 226 444, Auth 231 252, assets 8 121 484 octets ; marge 10,10 % sous budget v11 inchangé |
| Navigateurs ciblés | PASS ; 3/3 contrôlés en 14,6 s, sans retry, dont EN 320 px/clavier/axe ; 1/1 connecté réel en 9,3 s, sans retry, y compris révocation même JWT |
| Statique et strict | PASS ; inventaire, frontières, format/lint, CSS, types app/scripts/E2E et contenu ; quatre diagnostics upstream stricts exactement autorisés |
| Sécurité des dépendances | PASS ; aucun high/critical, dépendances inchangées |
| Invariants historiques | PASS ; 24/24 bundles suivis et registre, 69/69 anciennes migrations identiques au parent |

La première couverture a relevé deux littéraux de présentation (`UTC` et `D`)
à remplacer par les clés existantes du catalogue, ainsi que l’attendu strict du
nouveau marqueur privé dans le test advisors. Le contrôle de dérive des migrations
exigeait aussi que la nouvelle migration soit présente dans le commit candidat.
Ces points sont corrigés sans élargir les règles ni les permissions.

Une exécution suivante a dépassé cinq secondes dans trois simulations historiques
pendant des vérifications concurrentes, puis traversé une suspension du poste
d’environ 22 heures dans une quatrième. La relance du 18 octobre s’exécute seule,
avec protection temporaire contre la veille : elle passe sans modifier les délais,
limites de simulation ni assertions. Les corrections du parcours connecté restent
limitées à sa fixture locale et ses locators : la lecture directe des tentatives
reste interdite, et le vrai parcours utilise les RPC admin contrôlées.

Les résultats CI globaux, le SHA final et l’identité de la preview sont suivis
dans la PR associée à cette branche et ses checks. Graphify est rafraîchi en code-only ; ses sorties, les logs
et captures de test restent hors commit. Aucun asset ni binaire n’est ajouté.

La livraison code, la migration distante, la fusion et le déploiement sont des
étapes distinctes. Aucune donnée de production n’est modifiée par les jeux de
test locaux.
