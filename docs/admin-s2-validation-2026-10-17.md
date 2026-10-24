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

| Tâche  | Contrat                                                                              | Preuves ciblées                                                                                          |
| ------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| ADM-07 | Pages 1–100, compte complet, keyset date/ID, équipes jointes pour la page            | PostgreSQL >100 joueurs, 1 005 runs, six tris, insertions, dernière page ; retour UI                     |
| ADM-08 | Recherche serveur NFC littérale, 300 ms, filtres UTC et compte réel                  | Casse, Unicode composé/décomposé, `%`/`_`/ponctuation, recherche hors page, filtres invalides            |
| ADM-09 | Profil minimal, progression, monnaies distinctes, provenances et inconnus explicites | Comptes sans runs, historiques incomplets, wallet absent, grands nombres, permissions                    |
| ADM-10 | Populations runs/tentatives séparées, filtres serveur, détails en mémoire            | Filtres combinés et refus de filtres non applicables, journal sûr, rejet, retour, aucune URL personnelle |
| ADM-11 | Page CSV ou export complet atomique confirmé, plafond 5 000                          | >1 000 lignes, anti-formule/UTF-8, précision bigint, drift, annulation et refus de cap                   |

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


| Mesure               | Parent `ae51c452` | Candidat code |
| -------------------- | ----------------: | ------------: |
| JavaScript gzip      |           627 036 |       642 756 |
| Plus gros chunk brut |           466 265 |       466 265 |
| Initial gzip         |           220 859 |       226 437 |
| Auth gzip            |           225 648 |       231 251 |
| Assets déployables   |         8 011 051 |     8 071 596 |

Marge JavaScript finale locale : **11,95 %**. Les 40 entrées npm publiques sont conservées.

## Résultats locaux et clôture

| Gate                         | Résultat acquis                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base recréée                 | PASS ; 69 migrations, lint, ACL, RLS, advisors, neuf index mesurés et types générés concordants                                                                                      |
| Suite DB complète            | PASS ; 174 tests / 21 fichiers, zéro skip, phase Vitest finale 46,17 s ; inclut 22 tests ADM-S2 et parseurs UI sur réponses réelles                                                  |
| Rollback applicatif          | PASS ; 10/10 tests, checkpoint `968c0b3a` sur migration courante `20261017055016`                                                                                                    |
| Couverture complète          | PASS ; 3 260 tests, 130 skips liés à la base (suite DB séparée obligatoire) ; 285 fichiers verts, 377,96 s ; statements 86,35 %, branches 78,73 %, fonctions 91,06 %, lignes 88,40 % |
| Frontend ciblé               | PASS ; 18 tests pagination/projection commune, 17 joueurs, 22 runs/export ; contrat de langues 7/7 après ajout des invariants exacts                                                 |
| Nouveaux navigateurs         | PASS ; 4/4 sans retry, FR desktop et EN 320 px/clavier/axe ; export 1 001 lignes, détail/retour, pagination joueurs 123                                                              |
| Statique / sécurité / strict | PASS ; inventaire, frontières, format/lint, CSS, types app/scripts/E2E, contenu et aucun high/critical ; quatre diagnostics upstream stricts exactement autorisés                    |
| Clone indépendant du code    | PASS sur `2e6722b6` ; installation 4,63 s, artefacts 0,79 s, build 8,28 s ; aucun cache/npm privé ni Git alternate, Git propre avant/après                                           |
| Invariants                   | PASS ; 24 bundles identiques et empreintes vérifiées, 68 migrations historiques identiques, dépendances inchangées, aucun asset/binaire ajouté                                       |
| Preview du code              | HTML, entrée JS et identité HTTP 200 ; commit `2e6722b6`, hostname public du backend conforme à la cible Dev approuvée                                                               |

La première exécution DB a dépassé cinq secondes sur deux tests existants de
l’économie pendant d’autres vérifications locales. La relance passe les 174 cas
sans modifier leurs délais ni leur code. La première couverture complète a aussi
signalé 13 nouveaux libellés volontairement identiques FR/EN (Page, Candies,
Champion, Type, Date UTC, Biome, Mode, Normal, Runes) ; l’allowlist exacte a été
complétée, sans assouplir la détection des traductions manquantes. La relance complète passe les 3 260 tests unitaires et tous les seuils de couverture.

La revue finale du lint PostgreSQL a corrigé quatre déclarations de volatilité :
les helpers qui convertissent des dates utilisent `STABLE`, tandis que la projection
d’équipe, limitée aux entiers/booléens/textes, reste `IMMUTABLE`. Une variable morte
est retirée. Le lint strict public/private n’émet plus aucun avertissement. Les
22 cas DB passent après ce changement ; la même requête préparée est relue en UTC
puis Pacific/Kiritimati (UTC+14), sans conversion de date figée. Cette correction
est limitée à la nouvelle migration et ne change aucune ACL ni règle de gameplay.

La CI à ordre variable `890373536` a révélé une attente trop précoce dans le
test admin de timeout de modération : l’erreur disparaît dès le début du refresh,
avant que la lecture soit terminée. Le test attend maintenant aussi le retour
du bouton disponible. Une seconde graine, `1218617903`, a révélé le même défaut
d’attente dans le scénario de détail joueur : l’appel au mock ne garantit pas
que sa réponse soit appliquée. Les tests joueurs et runs attendent maintenant
l’état prêt et l’identité des données avant chaque action gardée. Le scénario
joueur utilise aussi une réponse filtrée différée et une autre identité pour
vérifier le refus pendant chargement, puis la bonne ouverture après réponse.
Les assertions métier et de sécurité, ainsi que le code de l’application,
restent inchangés. Les trois graines concernées sont rejouées sur les fichiers
ciblés avant la relance complète de CI. Une matrice supplémentaire des trois
fichiers asynchrones passe sur dix graines (48 cas par graine, **480 exécutions**),
sans modifier les délais ni retirer d’assertion métier.

Les deux parcours admin historiques adaptés à la nouvelle pagination passent
également : 2/2, sans retry, FR/EN dont 320 px.

Les mesures EXPLAIN sur 1 005 runs/page 100 donnent 174,6 ms à froid, puis 46,6 et
36,8 ms selon tri, en transactions annulées. Ces trois échantillons locaux
n’établissent pas de garantie de production et ne justifient aucun nouvel index.

Les résultats globaux (couverture complète, ordre variable, cohortes, navigateurs
source/connectés et six projets production), les durées, éventuels retries et le
SHA final sont consignés dans la [PR #224](https://github.com/Thanan71/LolRogue/pull/224)
et ses checks. Le candidat code du clone et de la preview est suivi uniquement
d’assertions de tests, de cette clôture documentaire et du marquage de volatilité
SQL décrit ci-dessus, sans modification de l’application frontend. Graphify est rafraîchi en code-only ; ses sorties et les captures
restent hors commit.

Aucune fusion, migration distante ni déploiement manuel ne découle de ces preuves.
La preview automatique n’atteste pas que les nouvelles RPC sont installées sur
la base Dev ; son application exige la procédure d’exploitation sur cible explicite.
