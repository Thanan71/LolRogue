# Contrat de contenu et d'équilibrage

## Version et portée

Le modèle d'analyse `BALANCE_MODEL_VERSION = 1` décrit le contenu publié avec le
`gameplay_ruleset_version = 16` et le Daily `score_version = 14`. Le contenu de
combat par biome introduit en v13 reste inchangé. Le moteur v15 est archivé pour
terminer les runs déjà ouvertes. Toute autre modification d'ennemi, récompense,
prix, drop, effet ou stacking exige une nouvelle version et un nouveau hash autoritaire.

La source machine est `src/game/balance/contentBalance.ts`. Le test
`contentCatalogAnalysis.test.ts` appelle `analyzeContentCatalog()` sur 100 seeds de
carte déterministes. Cette analyse parcourt tous les nœuds de toutes les branches et
résout leurs formations/récompenses avec un inventaire vide. Elle ne choisit aucune
route, ne conserve pas les PV/MP, n'achète et ne recrute rien, et n'exécute pas
`BattleManager` : un seed de carte analysé n'est donc pas une run.

Le contrôle sur 30 seeds de carte vérifie seulement un volume minimal de nœuds, des
bornes larges de récompenses et les trois raretés d'augments. Il ne constitue ni une
cohorte de runs scriptées, ni un playtest. Cette analyse statique ne produit pas la
baseline authority de calibration, construite séparément à partir de cohortes
authority versionnées.

Les vraies runs automatisées passent par `simulateAuthorityCohort()`. Cette fonction
pilote une session authority commande par commande, puis fait rejouer la trace
complète par `verifyAuthorityRun()` avec vérification terminale. Les tests
`authorityCohort.test.ts` et `authorityCohortMatrix.test.ts` couvrent ce chemin et sa
stratification ; ils ne transforment pas pour autant une politique automatisée en
comportement joueur.

## Baselines authority versionnées

La baseline courante v16 est chargée depuis
`config/authority-cohort-baselines-v16.json` et reproduite par la source v16. La
baseline v15 reste une archive immuable dans
`config/authority-cohort-baselines-v15.json` : son identité moteur/hash/modèle/policy
est littérale et sa reproduction emploie exclusivement
`run-authority-v15.bundle.ts`, jamais les constantes du moteur courant.

`npm run balance:baseline:generate` génère v16 sur la sortie standard ; l'option
`-- --output config/authority-cohort-baselines-v16.json` met à jour son artefact
commité. `npm run balance:baseline:generate:v15` sert uniquement à auditer et
reproduire l'archive historique avant comparaison avec le JSON v15 existant. Une
nouvelle publication ajoute son propre couple fixture/loader/JSON sans réécrire les
versions précédentes. `npm run balance:baseline:check`, inclus dans
`npm run balance:check`, exige une reproduction byte-for-byte des deux artefacts.

## Indicateurs de catalogue et de nœuds

Pour chaque nœud de combat généré et chaque difficulté, `meanEncounterPower` agrège
`niveau × statMultiplier`, `meanNodeGoldReward` la récompense d'or et
`meanNodeDropChance` la probabilité de drop. Les prix, le nombre d'augments et leur
stacking proviennent directement des catalogues. Ces valeurs sont des indicateurs
comparatifs non pondérés par un choix de route, pas des métriques de run ni une
promesse de taux de victoire.

Les attentes actuelles sont : Easy < Normal < Hard pour puissance et or, drops non
décroissants, prix strictement positifs et inventaire/stacking conformes aux règles.
Le rapport est déterministe pour les mêmes seeds de carte et doit être comparé
avant/après toute modification de contenu.

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
supporté ; leurs formations, récompenses et probabilités sont couvertes par des
tests déterministes du résolveur de rencontres et du moteur authority.

## Télémétrie consentie et playtests

La télémétrie DB reste désactivée par défaut. Une calibration ne peut utiliser que
des agrégats consentis : version, difficulté, starter/team anonymisés, biome atteint,
résultat, durée, or gagné/dépensé, drops proposés/acceptés, augments proposés/choisis
et raison d'abandon. Aucun journal d'actions, email ou identifiant public n'est
nécessaire.

Pour une future cohorte authority d'au moins 30 runs par difficulté, consigner taux
de victoire, abandon par biome, médiane de durée/or, fréquence de choix et intervalle
d'incertitude. Une modification est proposée avec hypothèse et cible, évaluée via
`simulateAuthorityCohort()`, playtestée sur au moins deux compositions, puis
versionnée. Les taux produits par une politique automatisée restent des hypothèses
jusqu'à leur confrontation à des playtests humains consentis ; sans échantillon
suffisant, le TODO de calibration reste ouvert.
