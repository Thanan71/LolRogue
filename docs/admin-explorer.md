# Fiches joueurs et explorateur de runs

ADM-S2 accompagne l’application **0.2.8**, publication 13. Le moteur reste
`run-engine-0.2.5` ; aucune règle, ancienne migration ou image ne change.
La migration [`20261017055016_admin_player_run_explorer.sql`](../supabase/migrations/20261017055016_admin_player_run_explorer.sql)
est nécessaire après celle du registre Candies ADM-S1. Une validation locale
ne prouve pas son application sur Dev ou en production.

## Autorisation et données

Les sept RPC publiques `admin_search_players`, `admin_search_runs`,
`admin_search_attempts`, `admin_get_player_detail`, `admin_get_run_detail`,
`admin_get_attempt_detail` et `admin_export_runs` sont en lecture seule.
Elles appellent trois fonctions privées `SECURITY DEFINER`, dont chacune exige
`auth.uid()` et `is_current_user_admin()` à chaque appel, même après révocation
avec le même JWT. Les chemins de recherche sont vides et les droits EXECUTE
sont explicitement bornés. Aucun droit SELECT supplémentaire sur les tables
serveur, aucune promotion et aucune mutation métier ne sont ajoutés.

Les projections sont des listes de champs autorisés : identifiants **publics**,
pseudo/nom d’affichage, progression et données métier nécessaires. Elles excluent
email, Auth UID, jeton de bail, hash, payload brut, trace manuelle et résultat
non vérifié. Les profils ne sont accessibles qu’aux administrateurs courants.
Les filtres et identifiants restent en mémoire dans `/admin`, sans paramètres
personnels dans une URL permanente, ni persistance dans le stockage navigateur.
Une déconnexion, un changement de compte ou de permissions invalide les requêtes
et purge les données ; une réponse d’une ancienne portée ne peut les réintroduire.

## Pagination et recherche

Les recherches acceptent `p_filters` JSON, `p_cursor` opaque, `p_snapshot` et
`p_page_size` de 1 à 100 ; l’interface propose 25/50/100. Une réponse contient
`items`, `total`, `hasMore`, `nextCursor` et `snapshotAt`. Le total est calculé
sur tous les résultats filtrés, indépendamment du curseur. Une métadonnée absente
ou incohérente provoque une erreur, jamais un faux zéro.

Le tri des joueurs est `created_at DESC, id DESC`. Les runs acceptent date de fin,
vagues ou niveau, ascendant/descendant, complétés par date puis ID. Les tentatives
utilisent date de démarrage puis ID descendants. Le curseur inclut population,
filtres, tri et borne temporelle ; sa réutilisation hors de ce périmètre est
refusée. L’interface conserve les curseurs précédents pour revenir en arrière.
Les équipes sont jointes en une requête d’ensemble pour la page sélectionnée,
sans appel par run ni immense liste `.in(...)` côté navigateur.

La première lecture fixe `snapshotAt` ; les lignes créées ensuite sont exclues
jusqu’à Actualiser. **Cette borne ne fige pas les mises à jour, suppressions ou
insertions antidatées.** Les totaux peuvent évoluer pour ces raisons ; aucune
navigation sur plusieurs requêtes n’est présentée comme un snapshot transactionnel.

La recherche joueurs est serveur, littérale et insensible à la casse, normalisée
Unicode NFC, sur pseudo, nom d’affichage et UUID public. `%`, `_`, virgules et
parenthèses n’introduisent aucun opérateur. Longueur maximale : 100 caractères ;
délai contrôlé côté interface : 300 ms. Les filtres couvrent inscription,
dernière connexion, présence de runs vérifiées et compte enregistré/invité.
Les invités ne sont pas persistés comme comptes : le filtre invité retourne
zéro, sans inventer un statut banni ou orphelin.

Les périodes utilisent UTC, borne de début incluse et fin exclue. Le filtre
activité mesure la dernière connexion enregistrée, pas une session de jeu active.
Aucun nouvel index n’est ajouté sans mesure ; les mesures locales ne constituent
pas une garantie de latence sur une base de production.

## Fiche joueur

La fiche réunit profil minimal, dates, statistiques des runs **vérifiées**,
maîtrises, arbres, soldes et historiques. Les Candies et les Shards sont deux
monnaies séparées. Les soldes actuels, profil et progression sont vivants ; la
borne temporelle limite l’appartenance des historiques et ne reconstruit pas
un ancien état de compte.

Les maîtrises et arbres sont bornés à 200 entrées chacun. Achats et mouvements
de chaque monnaie présentent les 50 plus récents, avec total et mention explicite
d’une éventuelle troncature. Un historique incomplet, un solde d’ouverture inconnu,
un portefeuille absent et une réconciliation impossible restent inconnus ;
ils ne deviennent pas zéro. Le registre Candies sépare gains, dépenses,
remboursements et ajustements non attribués. La fiche affiche la provenance
et l’état de réconciliation, sans inférer des gains depuis le seul solde.

## Runs, tentatives et détails

La population **runs enregistrées** vient de `runs`, avec équipe complète et
statut vérifié/legacy explicite. Ses filtres couvrent joueur, période de fin,
difficulté, mode, résultat, vérification, biome, longueur, champion, moteur et
versions gameplay/progression/ledger. Les dimensions legacy non connues restent
indisponibles, sans les reclasser en normal.

La population **tentatives autoritaires** vient de `run_attempts`, avec états
started/finished/verified/rejected/expired, dates et codes de rejet enregistrés.
Elle peut contenir une tentative vérifiée liée à une run ; ce sont deux populations
à ne pas additionner. Ses filtres couvrent joueur, période de démarrage, statut,
difficulté, mode, équipe initiale et versions disponibles. Biome, vagues, résultat,
ledger et tri spécifique aux runs y sont désactivés avec explication ; les RPC
refusent ces filtres au lieu de les ignorer. Aucun progrès ni gain non vérifié
n’est déduit du résultat brut d’une tentative.

Le détail conserve les filtres lors du retour et montre composition/builds,
versions, gains enregistrés et jalons de cycle de vie persistés. Le journal est
paginé par séquence, 1 à 100 actions, borné par date de réception et tentative.
Seuls type canonique et champs scalaires appropriés sont projetés ; un type
inconnu devient `unsupported` sans payload. Une run legacy sans tentative n’a
pas de journal inventé. La timeline ne reconstruit pas un combat depuis ses effets.

## Export exact et borné

L’export **de la page** conserve les lignes affichées et leur ordre. Les 28 colonnes
historiques sont conservées ; les informations de vérification et versions sont
ajoutées. L’export des tentatives possède son propre schéma, sans gains supposés.

L’export **de toute la sélection filtrée** exige une confirmation du volume et de
la population, puis une unique RPC `admin_export_runs` avec les mêmes filtres,
tri et borne. Plafond absolu : **5 000 lignes**, paramètre maximal 1 à 5 000.
Au-delà, la base refuse l’export avant de retourner une collection ; aucun fichier
partiel n’est produit. Le contrôle compare aussi le résultat au volume confirmé,
et un changement de portée ou de sélection annule la préparation.

Les lectures internes sont `STABLE` : count et contenu d’une même invocation
utilisent le snapshot SQL de l’instruction appelante. Cette garantie est plus
forte que celle de la navigation et ne s’étend pas à l’intervalle entre confirmation
et requête. Le CSV contient une marque UTF-8 et neutralise les cellules pouvant
être interprétées comme formules, avec échappement des guillemets et séparateurs.
Les bigint restent des chaînes décimales, sans arrondi JavaScript. Aucun secret
n’est inclus dans le fichier.

## Preuves

Les tests PostgreSQL/PostgREST locaux établissent comptes, keysets, volumes,
projection, permissions et révocation ; les tests UI et HTTP contrôlés établissent
navigation, états, annulation, clavier et confirmation. Les HTTP contrôlés ne
prouvent pas RLS. Résultats et limites :
[validation ADM-S2](admin-s2-validation-2026-10-17.md).
