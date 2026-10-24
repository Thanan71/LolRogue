# Espace d’équilibrage admin

L’onglet **Équilibrage** de `/admin` réunit les observations de gameplay et les
comparaisons terrain existantes. L’onglet Authority conserve le monitoring des
tentatives, les rejets et les alertes techniques. Cette séparation ne change ni
les règles des runs, ni leurs résultats, ni les versions authority historiques.

Les lectures sont réservées à un compte enregistré dont le rôle admin est encore
présent dans PostgreSQL au moment de l’appel. La garde React sert à la navigation ;
elle n’accorde aucun droit. Aucun bouton ne permet de modifier un ruleset, un flag,
un solde ou un résultat. La clé service-role reste hors du navigateur.

## Sources et populations

| Analyse                     | Source de vérité                                                                                                     | Limites                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Sélections initiales        | Équipe initiale des tentatives autoritaires, horloge `started_at`, tous statuts                                      | Mesure les départs des comptes conservés, y compris les tentatives abandonnées ou rejetées, pas une intention locale avant démarrage |
| Champions                   | Runs vérifiées liées à leur tentative autoritaire et membres d’équipe persistés par le vérificateur                  | Les runs abandonnées, non enregistrées, historiques non vérifiées et effacées ne sont pas reconstruites                              |
| Compositions et chargements | Identité initiale figée dans la tentative                                                                            | Une composition initiale n’est pas une composition finale ; les recrutements restent distincts                                       |
| Objets                      | Ensemble distinct des objets ayant été équipés pendant la run                                                        | Aucun ordre, simultanéité, offre de boutique ou exposition n’est attesté par cette projection                                        |
| Runes et augments           | Identifiants conservés avec le résultat vérifié ; multiplicité des augments préservée                                | Une sélection n’indique pas les choix proposés ou refusés                                                                            |
| Calibration terrain         | Agrégats FieldCalibration existants et baselines versionnées du moteur de balance                                    | Une simulation ne constitue pas un playtest humain ; une version incompatible n’est pas comparée                                     |
| Versions et flags           | Configuration lue sur la base interrogée                                                                             | Un flag absent est inconnu ; le code local ne prouve pas son activation distante                                                     |
| Arbres Candies              | Contrat TREE-10 : commandes et reçus de progression, registre Candies existant et snapshots des tentatives vérifiées | Achats et remboursements attestés ; disponibilité courante distincte des builds historiques ; exposition au catalogue non collectée  |

Les comptes supprimés entraînent les suppressions prévues par la politique de
confidentialité. Les résultats décrivent les données conservées, pas toute
l’histoire du jeu. Les agrégats ne contiennent pas d’identifiant de joueur,
d’e-mail, de payload de commande, de jeton ou de lease.

## Comparaisons

La fenêtre utilise les dates UTC inclusives de démarrage pour les sélections et
de vérification pour les résultats, avec une borne de lecture serveur. Ce sont
deux populations distinctes : une fin aujourd’hui peut avoir commencé hier.
Les identités moteur, gameplay, progression, commandes, hash de
contenu, mode et difficulté restent séparées. Les compositions et chargements
initiaux restent également des contextes distincts : l’interface ne produit pas
un classement mélangeant ces populations.

Le taux de sélection initiale a pour dénominateur les départs d’une identité
exacte, tous statuts. Les équipes mixtes comptent chaque champion au plus une
fois par tentative ; la somme des taux peut dépasser 100 % pour une équipe à
plusieurs champions. Cette distribution de départs n’est pas un classement de
performance, et n’est pas conditionnée à la survie jusqu’à la sauvegarde.

La présence finale d’un champion a pour dénominateur les **fins vérifiées du
contexte**, et non tous les départs. Le taux de victoire conditionnel porte sur
les runs auxquelles il participe. La survie correspond au champ final `survived`.
Les dégâts et soins sont des cumuls par membre de run ; ils ne deviennent pas
des dégâts ou soins par seconde. La durée d’activité et la durée des contrôles
ne sont pas effectivement collectées par ce contrat : DPS et CC sont
indisponibles, même si une ancienne colonne contient un zéro par défaut.

Le nombre de runs et le nombre de joueurs distincts sont affichés séparément.
Des runs répétées d’une même personne ne sont pas des participants indépendants.
Les nouveaux intervalles Wilson sont masqués lorsque le nombre de runs dépasse
le nombre de joueurs distincts. Les taux descriptifs ne prouvent ni causalité ni
supériorité d’un champion. Un effectif inférieur à 30 est signalé ; zéro observation n’est jamais
une performance nulle. Un ensemble d’objets équipé n’est pas nommé build
simultané, et sa fréquence n’est pas un taux de choix parmi les offres.

## Calibration et décisions

La calibration réutilise `AdminFieldCalibrationPanel`, les agrégats SQL existants
et `fieldCalibrationComparison.ts`. Les sources sont les baselines de
`src/game/balance/` et leurs manifests de politiques. Une référence comporte sa
version, son hash, sa politique et ses graines reproductibles. La date observée
de la cohorte et la date de génération d’un artefact sont des informations
distinctes ; aucune date de génération manquante n’est inventée.

Avant une décision de tuning, consigner le SHA, les identités exactes, la période,
la composition, les effectifs, la référence, le signal et ses limites. Appliquer
le protocole de **P2-BAL-01** pour les playtests humains. Une éventuelle expérience
A/B nécessite son propre protocole, des populations explicites et une décision
de versionnement. L’espace ne lance pas d’expérience et ne modifie pas les flags.

Toute évolution des règles suit le registre authority, ses générateurs, les
replays et les procédures de déploiement/rollback du dépôt. Elle ne réécrit pas
les anciennes archives et ne contourne pas RLS depuis le navigateur.

## Arbres Candies et spécialisations — ADM-20 / TREE-10

Le panneau **Arbres et Candies**, dans l’espace Équilibrage existant, consomme
`admin_balance_trees`. Cette lecture rejoint les commandes terminées de
`progression_commands` et les transactions `candy_transactions` par leur reçu
d’achat ou de remboursement. Elle présente les achats par nœud et branche, les
acheteurs uniques, les dépenses et les resets remboursés. La date de couverture,
les commandes non classées et une réconciliation incomplète restent visibles.
Les lectures ne modifient ni portefeuille, ni achat, ni résultat.

Les achats suivent la période UTC, la version de progression et le champion.
Les filtres moteur, gameplay, commandes, contenu, mode et difficulté concernent
les runs seulement. La part des acheteurs est masquée sous 30 acheteurs pour
le nœud ou la branche ; elle ne représente pas une conversion, puisque les
expositions au catalogue ne sont pas collectées.

Les builds reposent sur les rangs figés au départ des tentatives liées aux runs
vérifiées, sous leur identité exacte de règles et de composition. Un reset
ultérieur ne réécrit pas cette observation. Les snapshots partiels et les
échantillons de moins de 30 runs ou 30 joueurs n’affichent pas de taux de victoire.
L’intervalle Wilson est également masqué en présence de joueurs répétés. Ces
observations restent descriptives. Au-delà de 200 builds, l’interface annonce
la limite ; la réponse fournit aussi le total et le statut de troncature.
Les autres cardinalités excessives exigent d’affiner les filtres.

Le catalogue courant distingue les nœuds disponibles, désactivés, bloqués par
un prérequis et les spécialisations en attente de validation humaine. Il ne
mesure pas les tentatives d’achat refusées ni les blocages individuels. Les
8 voies spécialisées restent derrière `champion_specializations=false` ; leur
affichage dans l’administration n’autorise pas leur achat.

La RPC publique est `SECURITY INVOKER` et réutilise le dispatcher privé gardé.
Les droits admin sont vérifiés dans la base à chaque appel, y compris après
révocation avec le même JWT. Chargement, état vide, erreur, données anciennes et
réessai sont indépendants ; un refus de permission purge toutes les ressources
d’équilibrage. Voir les [requêtes et preuves ADM-20](admin-20-validation-0.3.0.md).

## États et vérification

Chaque ressource possède son état de chargement, d’erreur et de rechargement.
Les données conservées après une erreur réseau sont identifiées comme anciennes.
Un changement de filtre ne transforme pas une ancienne réponse en résultat de la
nouvelle population. Un refus de permission purge les résultats sensibles de
l’espace ; une réponse retardée d’un compte précédent ne peut les rétablir.

Les filtres et cardinalités sont bornés côté serveur. Une requête trop large
doit être affinée ; elle ne renvoie pas un top partiel présenté comme un total.
Les parseurs refusent les projections partielles ou incohérentes. Les tests de
base migrée vérifient les droits réels, et les parcours navigateur vérifient les
filtres, l’accessibilité et le lien entre RPC, réponse et affichage.

La fusion, l’application de la migration et la livraison distante restent des
étapes séparées de ces preuves locales. Les workflows de déploiement autorisés
conservent les cibles `dev → LolRogueDev` et `main → LolRogue`.
