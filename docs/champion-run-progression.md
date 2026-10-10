# Progression des champions pendant un run — P3-CHAMP-01

Veigar est le premier utilisateur des compteurs de run. Ils sont distincts de la
maîtrise, des Candies, des éclats et de la propriété des champions. Ils ne donnent
aucun avantage à un nouveau run.

## Règles de Veigar

Le compteur `veigar.phenomenal_power` commence à zéro. Une élimination normale par
compétence rapporte 1 point ; un élite éliminé par Veigar rapporte 3 points et un
boss 10, même avec une attaque de base. Les tiers sont exclusifs : un boss rapporte
10 points, jamais 10 + 3 + 1. Les touches et les assistances ne rapportent rien.

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
des bonus de statistiques et les hooks `onDamage`, `onKill` ou `onCombatEnd`.
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

## Publication v22

Le registre authority publie `run-engine-v22` et garde v21 en `replay-only`, avec
son bundle gelé byte-for-byte. Les versions des commandes (2), du ledger (2), de
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
appliquer les deux migrations dans leur ordre. Cette livraison de code ne déploie
pas automatiquement la fonction et n'applique aucune migration distante.

Le rapport et la commande de reproduction de balance se trouvent dans
`docs/balance/P3-CHAMP-01-veigar-v22.md`. Les cohortes automatisées servent aux
régressions et aux bornes de dégâts ; elles ne remplacent pas des playtests humains.
