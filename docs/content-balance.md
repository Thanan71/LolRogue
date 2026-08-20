# Contrat de contenu et d'équilibrage

## Version et portée

Le modèle d'analyse `BALANCE_MODEL_VERSION = 1` décrit le contenu publié avec le
`gameplay_ruleset_version = 15` et le Daily `score_version = 14`. Le contenu de
combat par biome introduit en v13 reste inchangé. Le moteur v14 est archivé pour
terminer les runs déjà ouvertes. Toute autre modification d'ennemi, récompense,
prix, drop, effet ou stacking exige une nouvelle version et un nouveau hash autoritaire.

La source machine est `src/game/balance/contentBalance.ts`. Le test
`balanceSimulation.test.ts` rejoue 100 runs complètes par difficulté et mesure tous
les combats générés. Il bloque une courbe non monotone, un catalogue incomplet ou
un contrat de stacking invalide.

La calibration de référence utilise aussi une cohorte figée de 30 runs scriptées
par difficulté. Elle vérifie les bornes d'or/drop et les trois raretés d'augments
sans collecter de donnée personnelle. Elle constitue le playtest automatisé
reproductible ; les données volontaires futures servent à recalibrer, pas à rendre
le ruleset actif valide a posteriori.

## Courbes mesurées

La puissance ennemie simulée est la somme `niveau × statMultiplier` des formations.
L'économie mesure or moyen par combat, probabilité de drop, bornes de prix, nombre
d'augments et stacking. Ces valeurs sont des indicateurs comparatifs, pas une
promesse de taux de victoire : les choix, équipes et actions influencent le résultat.

Les attentes actuelles sont : Easy < Normal < Hard pour puissance et or, drops non
décroissants, prix strictement positifs et inventaire/stacking conformes aux règles.
Le rapport est déterministe pour les mêmes seeds et doit être comparé avant/après
toute calibration.

## Roster maintenu

| Champion | Rôle produit | Forces | Faiblesses | Synergies conseillées |
| --- | --- | --- | --- | --- |
| Garen | frontline autonome / exécution | durabilité, zone, finition | courte portée, peu de contrôle | Lux, Soraka, Ashe |
| Annie | burst / contrôle | magie, stun, zone | fragile, mana, faible sustain DPS | Leona, Malphite, Warwick |
| Ashe | carry distance / contrôle | ralentissement, portée, engage | fragile, peu mobile | Leona, Soraka, Garen |
| Darius | bruiser cumulatif | duel long, soin, exécution | courte portée, stacks | Leona, Lux, Soraka |
| Lux | mage utilitaire | portée, bouclier, contrôle | fragile, cooldowns | Garen, Jinx, Malphite |
| Soraka | support sustain | soins, silence, stabilité | fragile, faible pression seule | Darius, Warwick, Jinx |
| Jinx | hypercarry à resets | DPS, zone, accélération | fragile, démarrage lent | Leona, Lux, Soraka |
| Leona | tank engage | contrôles, initiation, résistances | dégâts seuls faibles | Ashe, Jinx, Annie |
| Malphite | tank anti-physique | armure, engage de zone | mana, moins fort contre magie | Annie, Lux, Jinx |
| Warwick | bruiser sustain | soin, poursuite, contrôle cible | portée, sensible au burst | Lux, Soraka, Ashe |

## Identité des biomes

Les mécaniques actuelles sont des choix de carte réellement générés, pas des effets
de combat annoncés sans handler :

- **Top Lane — duels d'attrition :** difficulté initiale et branches modérées ;
- **Jungle — exploration ramifiée :** carte la plus longue, davantage de branches,
  événements, trésors et recrutements ;
- **Mid Lane — pression arcanique :** trajet court, élites et shops plus présents ;
- **Bot Lane — formations duo :** ennemis carry/protection et routes économiques ;
- **River — risque/récupération :** pression élite compensée par repos et trésors ;
- **Base — siège final :** trajet court, aucun événement aléatoire, forte pression
  élite puis boss.

L'identité visuelle normative (pierre/ardoise, forêt/vert, arcanes/violet-or,
côte/azur, eau/cyan, forteresse/rouge-or) doit guider les futurs backgrounds sans
ajouter d'asset non livré.

## Gouvernance des encounters

Un encounter n'entre dans un pool publié que si tous ses champions existent, ses
effets passent `catalogSupport`, son résultat est géré par le client **et** par
`AuthorityRunEngine`, et un test déterministe couvre succès, capacité et erreur.
Ajouter seulement du texte ou une probabilité sans handler ne constitue pas du
contenu jouable.

Le ruleset v13 ajoute `top_fortified_duel`, `jungle_hunted_camp`,
`mid_arcane_lockdown`, `bot_frozen_vanguard`, `river_guardian_current` et
`base_last_stand`. Ils emploient uniquement les dix champions et le combat déjà
supporté ; leurs formations, récompenses et probabilités sont couvertes par la
simulation client/authority.

## Télémétrie consentie et playtests

La télémétrie DB reste désactivée par défaut. Une calibration ne peut utiliser que
des agrégats consentis : version, difficulté, starter/team anonymisés, biome atteint,
résultat, durée, or gagné/dépensé, drops proposés/acceptés, augments proposés/choisis
et raison d'abandon. Aucun journal d'actions, email ou identifiant public n'est
nécessaire.

Pour chaque cohorte d'au moins 30 runs par difficulté, consigner taux de victoire,
abandon par biome, médiane de durée/or, fréquence de choix et intervalle
d'incertitude. Une modification est proposée avec hypothèse et cible, simulée,
playtestée sur au moins deux compositions, puis versionnée. Sans échantillon
consenti suffisant, le résultat reste une hypothèse et le TODO de calibration reste
ouvert.
