# Progression des champions pendant un run — P3-CHAMP-01

Veigar est le premier utilisateur des compteurs de run. Ils sont distincts de la
maîtrise, des Candies, des éclats et de la propriété des champions. Ils ne donnent
aucun avantage à un nouveau run.

## Règles de Veigar — version 0.2.0

Le compteur `veigar.phenomenal_power` commence à zéro. Une élimination normale par
compétence rapporte 1 point ; un élite éliminé par Veigar rapporte 3 points et un
boss 10, même avec une attaque de base. Une assistance attribuée par les règles
de combat existantes rapporte également 1 point sur un ennemi normal, 3 sur un
élite ou 10 sur un boss, sans exiger une compétence. Les tiers sont exclusifs :
un boss rapporte 10 points, jamais 10 + 3 + 1.

Le gain d'assistance suit l'attribution du moteur après l'élimination de la cible
par un allié. La contribution doit avoir infligé des dégâts effectifs aux PV ou à
un bouclier ; un contrôle seul ne suffit pas. Les simples touches sans élimination
attribuée ne donnent aucun point. L'interface n'attribue aucune assistance et ne
convertit jamais un journal de dégâts en points elle-même.

Chaque point ajoute 1 AP, après le calcul des niveaux, de la maîtrise et des bonus
d'équipement/amélioration. Le bonus est plafonné à 200 AP. Il ne modifie pas les PV
ou le mana maximum. Une réanimation de la même cible dans le même combat ne
rapporte pas de nouveaux points.

Q inflige des dégâts magiques à une cible. W prépare une seule frappe au début du
prochain tour de la cible ; les augmentations des dégâts sur la durée ne prolongent
pas cette frappe. E étourdit une cible pendant un tour. R multiplie ses dégâts de
×1 à ×2 selon les PV manquants de la cible, sans exécution automatique.

## Contrat générique

`Passive.runProgression` déclare des compteurs avec une clé stable, un plafond,
des bonus de statistiques et les hooks `onDamage`, `onKill`, `onAssist` ou
`onCombatEnd`.
L'évaluation des déclencheurs et le calcul des statistiques sont des fonctions
pures. `ChampionInstance` fournit lecture, définition, incrément, restauration et
copie du snapshot. Une clé inconnue ou dangereuse, une fraction, une valeur
négative ou non finie ne peut pas alimenter un compteur.

Les bonus autorisés sont AP, AD, armure et résistance magique. Ajouter un bonus de
PV/mana nécessiterait une règle explicite de transfert des ressources en combat.
Les champions qui ne déclarent aucun compteur conservent un snapshot vide et
n'ajoutent aucun champ aux replays historiques.

Le moteur attribue les gains à partir de l'identité et du camp des combattants.
Le tier provient du nœud d'encounter, jamais du nom du champion. Une frappe
différée ou un effet périodique conserve aussi le camp de sa source, y compris
quand deux Veigar s'affrontent. L'événement `run_counter_gain` contient la source,
la cible, leurs identifiants/camps, la clé, le gain effectif et la valeur finale.
L'interface affiche cet événement et les snapshots ; elle n'attribue aucun point.
Les descriptions et les règles de tooltip utilisent les hooks du kit effectif.
Un ancien kit sans `onAssist` garde ainsi ses trois règles d'élimination et sa
description historique, même lorsque le client connaît la version 0.2.0.

## Sauvegarde et autorité

`TeamMember.runProgress` est conservé entre les combats, les biomes et les
sauvegardes. La restauration valide les clés et plafonds du kit maintenu.
Une nouvelle équipe ou un nouveau recrutement commence sans compteur.
Le snapshot terminal peut conserver une copie historique des points gagnés.
Cette copie ne sert jamais de racine à un nouveau run.

Les commandes et l'attempt initial n'acceptent aucune graine de compteur. Le replay
recalcule les gains et les inclut dans les snapshots/ressources des combats. Edge
valide le résultat avec le même kit gelé, puis transmet `team_members.run_progress`
au finalizer réservé à `service_role`. La base conserve ce JSON dans le résultat
canonique sans convertir les points en progression permanente.

## Publication historique v22

La publication initiale utilisait `run-engine-v22` et gardait v21 en `replay-only`,
avec son bundle gelé byte-for-byte. Les versions des commandes (2), du ledger (2), de
la progression de compte (3) et du score quotidien (15) restent identiques.
Les catalogues de champions sont versionnés pour que la régénération d'une carte,
les offres de recrutement et les événements d'un ancien run gardent leur population.

Les migrations locales sont :

1. `20261009173939_gameplay_ruleset_v22_veigar_run_progression.sql` : publication
   du contrat v22 inactif, catalogue gameplay étendu et finalizer compatible.
2. `20261009174447_champion_catalog_v2_veigar.sql` : catalogue économique v2,
   Veigar à 400 éclats, puis activation atomique du gameplay/quotidien v22 et de la
   configuration économique. Le flag activé/désactivé et la date d'activation sont
   conservés. Le catalogue des anciennes dotations est gelé ; les rotations et
   snapshots d'accès existants ne sont pas réécrits.

Déployer d'abord la fonction Edge compatible, puis le client compatible, et enfin
appliquer les deux migrations dans leur ordre. La livraison de code ne déploie
pas automatiquement la fonction et n'applique aucune migration distante.

## Extension 0.2.0 et versions des règles

Les nouvelles publications utilisent `major.minor.patch`, avec une date de
publication distincte. Le jeu, la note de mise à jour et le code des règles de
gameplay portent `0.2.0` ; le moteur porte `run-engine-0.2.0`. L'ordinal SQL 23
reste une clé de compatibilité interne, indépendante de la version affichée.
Les identifiants historiques restent inchangés. Les notes sont ordonnées par leur
séquence de publication, jamais par la version ou la date.
Le [contrat de versionnement](versioning.md) décrit les versions du jeu, du moteur,
des règles et du défi quotidien, ainsi que les clés techniques qui restent numériques.

La capacité versionnée `runProgressionAssists` autorise le nouveau hook pour les
nouvelles parties. Les replays et les reprises v22 conservent leur moteur et leurs
gains limités aux éliminations. Une partie ne reçoit pas les nouvelles règles au
milieu de son parcours. Le nouveau contrat doit être disponible côté Edge et
client avant son activation SQL ; aucune commande distante n'est appliquée par
la simple modification du code.

Le rapport et la commande de reproduction de balance se trouvent dans
`docs/balance/P3-CHAMP-01-veigar-v22.md`. Ce rapport mesure les règles historiques
sans gains d'assistance ; ses statistiques ne mesurent pas la version 0.2.0.
La campagne courante utilise un
[artefact 0.2.0 séparé](../config/veigar-run-progression-balance-0.2.0.json),
avec l'identité du moteur et du bundle Edge effectivement mesurés.
Les cohortes automatisées servent aux régressions et aux bornes de dégâts ; elles
ne remplacent pas des playtests humains.
