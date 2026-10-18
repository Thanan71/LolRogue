# Analytics temporels administrateur

ADM-12 à ADM-16 utilisent exclusivement des agrégats PostgreSQL des données
fonctionnelles existantes. Aucun événement navigateur, cookie, identifiant invité,
adresse IP, empreinte d’appareil ou télémétrie facultative n’est ajouté. Les
administrateurs autorisés consultent ces résultats ; aucune publication publique
n’est créée. Les fiches individuelles restent dans l’explorateur ADM-S2.

## Populations et horloges

| Mesure | Source et unité |
| --- | --- |
| Acquisition | Création du profil connecté, `players.created_at` ; compte conservé |
| Activité | Joueur distinct ayant démarré une tentative autoritaire ; ce n’est pas une connexion |
| Départ | `run_attempts.started_at`, une tentative serveur ; les retries ne créent pas un second événement pour la même tentative |
| Fin vérifiée | Tentative liée à une run persistée avec `progression_source='verified'`, horloge de vérification serveur |
| Victoire | Sous-ensemble des fins vérifiées dont la run porte `won=true` |
| Daily | Départs et fins vérifiées du mode `daily` ; le jour d’événement diffère du jour du défi `daily_date` |

`last_login_at` est une valeur écrasée, pas un journal de connexions. Elle ne sert
ni aux courbes ni à la rétention. Une commande `resolve_combat` acceptée est une
intention journalisée ; elle ne prouve pas l’exécution du combat. Les runs sans
preuve autoritaire ne deviennent pas des fins vérifiées.

Les suppressions de compte retirent aussi leurs données liées : l’interface décrit
les données conservées, sans prétendre reconstituer les comptes supprimés. Les
invités ne sont pas mesurés par ces sources serveur et ne sont pas affichés comme
une population de taille zéro. L’appareil, les bots et les comptes de test ne sont
pas inférés depuis un nom, une adresse ou le navigateur.

## Fenêtres et couverture

Le choix utilisateur comprend un début et une fin **inclusifs**, en dates UTC.
La requête emploie l’intervalle semi-ouvert du début à 00:00 jusqu’au lendemain
de la fin à 00:00. La fenêtre est limitée à 366 jours. Les semaines commencent
le lundi UTC et sont coupées aux bornes sélectionnées ; une période actuelle
incomplète est signalée. Le serveur fournit les périodes sans événement ; le
navigateur ne les reconstitue pas depuis une page de résultats.

La migration ADM-S3 enregistre une seule fois un début d’observation serveur,
sans rétrodatation. Le premier jour complet commence au minuit UTC suivant ce
marqueur. Les événements historiques conservés restent consultables, avec une
couverture non attestée. Un compte observé n’est jamais transformé en preuve de
collecte exhaustive. Le snapshot date la lecture ; il ne constitue pas un export
historique immuable face aux suppressions ultérieures.

## Rétention

D1, D7 et D30 signifient : un nouveau départ autoritaire pendant le jour UTC de
création du compte + 1, 7 ou 30 jours, respectivement. Un retour le jour précédent
ou suivant ne satisfait pas la mesure exacte. Une victoire ou une connexion seule
n’est pas un retour de jeu selon cette définition.

Les cohortes sont celles des créations de compte. Leur attribution repose sur la
première tentative observée, choisie avant tout filtre ; les comptes sans
tentative sont distincts. Pour chaque horizon, le dénominateur de taux exclut les
cohortes dont la journée de création n’est pas entièrement couverte ou dont la
journée de retour n’est pas entièrement écoulée. Les effectifs et les retours
observés des anciennes cohortes restent visibles, mais leur taux et leur
intervalle sont indisponibles. Le retour dans la même identité de règles est
distingué du retour observé dans une autre identité.

## Parcours ordonné

Le funnel suit les comptes créés pendant la fenêtre, avec un suivi fixe de sept
jours UTC après leur jour de création : inscription, première tentative,
première commande de combat acceptée dans cette tentative, fin vérifiée de cette
même tentative, puis autre départ sur un jour UTC ultérieur à la fin. Une seconde
tentative réussie ne remplace pas une première tentative abandonnée. Les étapes
sont ordonnées et comptent des comptes distincts ; les retries et doublons du
journal ne multiplient pas les joueurs.

Les taux de conversion portent uniquement sur des cohortes couvertes dont tout
le suivi est écoulé. Les comptes plus récents restent des observations censurées,
sans faux taux définitif. Une commande de combat acceptée reste explicitement
nommée comme telle. La fin vérifiée est une preuve différente et plus forte.

## Comparabilité et incertitude

Une identité comparable comprend le moteur, le hash du contenu, les versions de
règles gameplay, progression et commandes, le mode et la difficulté. Les séries
et cohortes de règles différentes restent séparées. Une somme de départs au
travers de versions ne devient pas une population comparable. Le résumé rappelle
les filtres réellement appliqués ; une réponse obsolète d’un filtre précédent
ne peut pas remplacer les résultats courants.

Les taux binomiaux par compte présentent numérateur, dénominateur et intervalle
de [Wilson à 95 %](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm).
À N=0, le taux et l’intervalle sont indisponibles. Le seuil
N=30 indique seulement un effectif descriptif minimal ; il ne prouve ni causalité
ni représentativité. À N=1, 0 % ou 100 %, l’incertitude reste visible. Les fins
d’un jour ne sont jamais divisées par les départs du même jour pour fabriquer une
conversion : ces événements peuvent provenir de tentatives différentes. Plusieurs
runs d’un compte ne sont pas des joueurs indépendants.

## Autorisation et exploitation

Chaque lecture vérifie l’identité authentifiée et le droit admin courant en
base. Un utilisateur, des métadonnées Auth forgées ou une clé service sans
identité admin ne suffisent pas. Les contrôles React complètent ces permissions
sans les remplacer. Chaque ressource a son chargement, erreur, relance et état
périmé ; les données sont purgées au changement de compte ou à la révocation du
droit. Les tableaux et les libellés restent utilisables au clavier et sur mobile.

Cette livraison ne lance aucune migration distante et n’active aucune nouvelle
collecte en production. La migration, la fusion et le déploiement suivent leurs
procédures distinctes. Les preuves et le nom exact de migration sont consignés
dans [la validation ADM-S3](admin-s3-validation-2026-10-17.md).

## Contrat des lectures

Les RPC `admin_analytics_series`, `admin_analytics_retention` et
`admin_analytics_funnel` prennent `p_filters` et un `p_snapshot` optionnel.
Chaque réponse fournit son `snapshotAt`, sa fenêtre UTC normalisée, la couverture,
les filtres appliqués et les identités exactes. Les trois requêtes sont
indépendantes ; relancer une section n’efface pas les autres.

Exemple de lecture depuis le client déjà authentifié comme administrateur :

```ts
await supabase.rpc('admin_analytics_series', {
  p_filters: {
    from: '2026-10-01',
    to: '2026-10-07',
    granularity: 'day',
    mode: 'normal',
    difficulty: 'normal',
  },
});
```

La rétention et le funnel reçoivent les mêmes filtres sans `granularity`.
Les dates impossibles, fenêtres inversées ou de plus de 366 jours, snapshots
futurs, valeurs non finies, champs inconnus et filtres invalides sont refusés.
Au-delà de 32 identités exactes, la lecture demande une fenêtre ou un filtre
plus précis ; elle ne tronque jamais silencieusement les groupes.

L’ancienneté signifie « événement pendant le jour UTC de création » ou « jour
UTC ultérieur » dans les séries. Dans les cohortes et le funnel, elle porte sur
le premier départ d’enrôlement. Elle ne modifie pas les sept dimensions d’une
identité de règles : un retour à D1 ne cesse pas de correspondre à son identité
parce que le compte a vieilli. Les acquisitions demeurent globales, indépendantes
des filtres de jeu, ce qui est rappelé près de leur affichage.

Le parseur du navigateur vérifie les nombres, dates, bornes, segments et
populations. Une projection partielle ou incohérente produit une erreur de
section ; une donnée absente ne devient pas zéro. Les points des graphiques et
les statistiques de proportion utilisent ces agrégats complets, jamais une
liste paginée de comptes ou de runs.
