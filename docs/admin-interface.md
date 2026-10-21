# Interface d’administration — ADM-S7

L’application **0.2.13** organise `/admin` en six groupes. Les contrôles d’accès,
les populations et les définitions des indicateurs restent ceux des contrats
existants : [rôles et sécurité](administration.md#modèle-de-sécurité),
[KPI et registre Candies](admin-metrics.md), [joueurs et runs](admin-explorer.md),
[analytics](admin-analytics.md), [équilibrage](admin-balance.md),
[modération](admin-moderation.md) et [diagnostics](admin-diagnostics.md).
Les [preuves S7](admin-s7-validation-2026-10-21.md) distinguent validation locale,
vérification humaine et livraison distante.

## Navigation et contexte

| Groupe | Paramètre `group` | Vues `view` |
| --- | --- | --- |
| Vue globale | `overview` | `dashboard`, `analytics` |
| Joueurs | `players` | `list` |
| Runs | `runs` | `list` |
| Équilibrage | `balance` | `reports`, `calibration` |
| Modération | `moderation` | `queue` |
| Surveillance | `monitoring` | `logs`, `authority`, `service` |

L’URL est la source du contexte appliqué. Un accès direct tel que
`/admin?group=monitoring&view=logs`, un rafraîchissement et Précédent/Suivant
réhydratent le même groupe, la vue et les filtres admis. Les anciens liens `tab`
sont remplacés dans l’historique par leur forme canonique. Une valeur de groupe
ou de vue inconnue revient à une destination autorisée.

Les espaces `players`, `runFilters`, `runOptions`, `analytics`, `balance`,
`moderation` et `diagnostics` contiennent uniquement des champs de formulaire
explicitement autorisés. Les brouillons restent locaux jusqu’à leur application ;
la recherche de joueurs applique ses changements avec un délai de 300 ms. Les
filtres numériques sont convertis puis validés par les contrats de domaine
existants avant une requête. Un contexte invalide revient aux valeurs par défaut.

Les contextes JSON lus sont bornés à 4 096 caractères chacun, les champs texte à
160 caractères et la recherche à 80 ; les tailles de page sont comprises entre
1 et 100. Ces bornes de navigation complètent les contraintes métier, de dates,
de versions et de population des validateurs existants.

`player` et `run` identifient séparément les fiches sélectionnées. Fermer une
fiche conserve le contexte de sa liste. Le passage d’un joueur vers ses runs
applique le filtre joueur sans remplacer la sélection de la fiche joueur. Les
curseurs, snapshots et résultats de requête restent en mémoire, associés au
contexte et à la session ; ils ne sont pas sérialisés dans l’URL. Un changement
de filtres ne réutilise pas le curseur d’un autre périmètre.

L’URL peut contenir une recherche et des identifiants administratifs : ce sont
potentiellement des données personnelles conservées par l’historique du navigateur.
Avant de partager une capture ou un lien, retirer les recherches et identifiants
inutiles. L’URL ne contient ni JWT, ni session, ni secret, ni curseur, ni DTO de
joueur/run. Les autorisations PostgreSQL restent nécessaires pour ouvrir un lien.

## États, actions et accessibilité

Chaque ressource conserve ses propres états de chargement, erreur, absence de
données, données périmées et reprise. Une requête interrompue ou une réponse
d’une ancienne identité ne remplace pas le résultat courant. Le retrait du rôle
est vérifié par la base ; aucune navigation ne confère de permission.

Les tableaux Joueurs et Runs présentent trois colonnes essentielles sur petit
écran. Le contrôle « Afficher toutes les colonnes » révèle le tableau complet
dans une région nommée et parcourable au clavier. Les fiches conservent les
informations détaillées ; les compteurs et pages proviennent du serveur. Les
dialogues d’export annoncent population et périmètre, demandent confirmation et
maintiennent le focus. Les règles d’échappement CSV et la limite de 5 000 lignes
restent celles du [contrat d’exploration](admin-explorer.md).

Les essais automatisés couvrent FR/EN, clavier, focus, 320 px et le zoom natif
Chromium à 200 % et 400 %, avec axe sans violation. **VoiceOver et NVDA n’ont pas
été exécutés.** Leur parcours humain reste requis dans ADM-34 et
[P3-A11Y-01](../TODO.md#p3-a11y-01--validation-humaine-avant-bêta).

## Parcours humain lecteur d’écran restant

Sur le SHA candidat de la PR, utiliser un compte administrateur existant dans
l’environnement de test et consigner appareil, versions du navigateur/lecteur,
langue et résultat. Aucun rôle n’est accordé par ce parcours.

1. Avec VoiceOver/Safari puis NVDA/Firefox, parcourir les six groupes au clavier ;
   vérifier le nom des onglets, la sélection annoncée et l’accès aux sous-vues.
2. Dans Joueurs puis Runs, appliquer une recherche, changer de page, ouvrir une
   fiche et revenir. Vérifier les en-têtes des colonnes, les noms des actions et
   le contexte conservé après rechargement et Précédent/Suivant.
3. Sur petit écran, activer toutes les colonnes et parcourir la région du tableau.
   Vérifier que les informations essentielles et les détails restent accessibles.
4. Ouvrir l’export, vérifier son titre et son périmètre annoncés, annuler avec
   Échap et vérifier le retour du focus sur son bouton d’ouverture.
5. Rejouer les points essentiels en FR et EN, puis consigner les annonces des
   chargements, erreurs et reprises sur une panne réseau de test contrôlée.

Un audit axe ou une inspection de l’arbre d’accessibilité ne valide pas ces
étapes humaines. Reporter les anomalies et leur reproduction dans la PR avant
de cocher la preuve manuelle ADM-34.

## Frontières de code

`src/pages/AdminPage.tsx` est le wrapper de route. L’entrée publique
`src/features/administration/index.ts` expose l’écran et les types de navigation
nécessaires aux consommateurs externes. Les 97 modules historiques ont rejoint
un seul module, selon quatre couches :

| Couche | Responsabilité |
| --- | --- |
| `domain` | Types, contrats, validation, projections et statistiques |
| `infrastructure` | Clients RPC, queries et effets de téléchargement |
| `hooks` | État des ressources, contexte URL, requêtes et annulation |
| `ui` | Écran, tableaux, fiches et panneaux |

Les sous-espaces Équilibrage, Modération et Surveillance restent chargés par
imports différés. La garde `node scripts/check-business-boundaries.mjs` vérifie
les couches, l’entrée publique, l’indépendance du jeu et le conteneur existant.
Il n’existe pas de second système d’injection de dépendances.

## Livraison et restauration

S7 ne crée aucune migration, aucune nouvelle permission ni version de gameplay.
Le moteur `run-engine-0.2.5`, le gameplay 24 et les archives authority restent
inchangés. ADM-20 reste dépendant de TREE-10 ; aucune métrique d’arbre n’est
reconstruite depuis un solde.

La livraison prévue est une PR vers `dev`. Les tests locaux ne prouvent pas une
fusion, une Preview, une activation ou un déploiement distant. Avant promotion,
rattacher au SHA final les jobs, le build candidat et les contrôles de la Preview.
Pour revenir en arrière, restaurer un frontend précédent compatible avec le
schéma courant et les RPC de diagnostic, selon le
[runbook de rollback](incident-runbooks.md#rollback-applicatif). Préserver les
migrations, journaux et bundles historiques ; S7 n’exige pas de restauration SQL.
