# Règles de jeu et équilibrage

Ce document décrit les règles actuellement implémentées. Les constantes citées
restent définies dans le code afin que les tests puissent les contrôler.

## Progression d'une run

Une équipe contient au maximum cinq champions. Elle traverse, dans l'ordre,
Top Lane, Jungle, Mid Lane, Bot Lane, River puis Enemy Base. Les biomes comportent
respectivement 6–8, 7–10, 5–7, 6–8, 4–6 et 3–4 nœuds. Leur multiplicateur de
difficulté est 1,0, 1,1, 1,2, 1,1, 1,3 et 1,5.

La première colonne d'une carte est toujours un combat. La dernière est une sortie,
sauf dans la base où elle devient le boss final. L'avant-dernière colonne est un
combat ou un repos à chances égales. Les autres colonnes tirent leur type selon les
poids de `BIOME_MAP_CONFIGS`; tout poids restant produit un combat. Le seed et le
générateur `mulberry32` rendent la carte reproductible.

Les rencontres possibles sont : combat, élite, boutique, repos, événement, trésor,
recrutement et boss. Une rencontre déjà réclamée est mémorisée pour empêcher de
recevoir deux fois sa récompense après un rechargement.

## Combat

Le moteur est un combat au tour par tour, jusqu'à cinq contre cinq :

- l'ordre de tour dépend de la vitesse avec un bruit aléatoire maximal de `0,5` ;
- les actions disponibles sont l'attaque de base et les sorts Q/W/E/R prêts, dont
  le coût en mana est payable ;
- les contrôles peuvent faire perdre un tour et les effets ont leur propre durée ;
- dégâts physiques, magiques et vrais utilisent leurs calculateurs séparés ;
- les critiques appliquent la formule de `utils/damage.ts` ;
- un combat est limité par défaut à 50 rounds ;
- les PV survivants, l'XP, les niveaux et rangs de sorts sont conservés entre les
  combats.

Le moteur accepte une source aléatoire injectée. Une mécanique aléatoire ajoutée au
combat doit utiliser cette source, jamais appeler directement `Math.random`, afin
de préserver la reproductibilité et les tests.

## XP et niveaux

Une victoire donne `60 + 15 × niveau de run` XP à chaque champion concerné. Une
élite multiplie ce montant par `1,5` avec arrondi inférieur; un boss le double.
L'XP excédentaire est conservée et plusieurs niveaux peuvent être gagnés à la fois.
Le niveau maximum est 18.

XP nécessaire pour chaque passage de niveau :

| Passage | XP | Passage | XP | Passage | XP |
| --- | ---: | --- | ---: | --- | ---: |
| 1 → 2 | 100 | 7 → 8 | 490 | 13 → 14 | 1240 |
| 2 → 3 | 140 | 8 → 9 | 590 | 14 → 15 | 1400 |
| 3 → 4 | 190 | 9 → 10 | 700 | 15 → 16 | 1570 |
| 4 → 5 | 250 | 10 → 11 | 820 | 16 → 17 | 1750 |
| 5 → 6 | 320 | 11 → 12 | 950 | 17 → 18 | 1940 |
| 6 → 7 | 400 | 12 → 13 | 1090 |  |  |

## Récompenses et maîtrise

Après un combat, l'écran applique l'or, l'objet éventuel et l'XP une seule fois.
La source exacte des récompenses de rencontre se trouve dans la définition de
l'encounter et dans `CombatPage`; les objets utilisent leur valeur de
`itemDatabase`. Revendre un objet rend la moitié de sa valeur, arrondie à
l'inférieur, avec un minimum de 1 or.

Les mutations économiques renvoient un résultat explicite. En boutique, la
capacité, les doublons et le solde sont validés avant qu'une transaction unique
journalise l'achat, débite l'or, ajoute la récompense et consomme l'offre. Un achat
refusé ne change donc aucun de ces états. Pour une récompense gratuite de Treasure,
Event ou Combat, la règle de capacité est « laisser sur place » : l'or éventuel
reste acquis, mais un objet ou champion qui ne tient pas n'est ni ajouté ni annoncé
comme reçu.

Les PV absents dans l'état sérialisé signifient toujours « PV maximum ». Un soin
positif peut relever un champion KO, tandis qu'un bonus de statistiques matérialise
les PV implicites au nouveau maximum sans effacer une blessure ou un KO explicite.

À la fin d'une run, le pool de candies vaut :

```text
base + vagues × candiesParVague + biomes × candiesParBiome
     + bonusDeVictoire éventuel
```

Cette formule ne s'applique qu'après au moins une vague terminée :

| Fin de run | Vague terminée requise | Bonus victoire |
| --- | --- | --- |
| abandon immédiat | oui, donc 0 candy | non |
| abandon après progression | oui | non |
| défaite | oui | non |
| victoire | oui | oui |

Le pool est partagé équitablement entre les champions, avec un minimum d'une candy
par champion une fois la run éligible. La politique locale canonique est dans
`src/game/run/runRewardPolicy.ts`; ses coefficients sont dans
`src/types/mastery.ts`. PostgreSQL lit les mêmes coefficients depuis le
`progression_ruleset` versionné et garde la même condition
`waves_completed > 0` dans `complete_run_verification`. Chaque niveau de maîtrise
ajoute le bonus de statistiques défini par `STAT_BONUS_PER_LEVEL` et peut ouvrir un
starter ou un chroma.

Les arbres d'amélioration dépendent du rôle principal. Chaque nœud impose son coût,
son niveau de maîtrise, ses prérequis et son rang maximal, tous définis dans
`src/data/enhancementTrees.ts`. Le serveur revérifie les conditions avant achat.

## Probabilités

Les probabilités ne doivent pas être recopiées dans les composants :

- types de nœuds : `BIOME_MAP_CONFIGS` dans `src/game/map/types.ts` ;
- événements et poids de leurs issues : `generateEventEncounter` ;
- repos : 20 % de soin complet, sinon 25 à 75 % ;
- boutique : 2 à 4 objets, 1 à 2 recrues et 20 % de chance de multiplicateur de
  prix à `0,8` ;
- trésors, recrutements et choix d'augments : générateurs correspondants dans
  `src/game`.

Un poids est relatif à la somme des poids de son pool. Toute modification
d'équilibrage doit adapter les tests déterministes et, si elle change le
comportement attendu, ce document.

## Daily run

Le seed quotidien est partagé pour une date donnée. Le score vaut :

```text
100 × vagues + 500 × niveau de run + or restant + 50 × objets
```

Une soumission connectée est atomique et limitée à une par joueur et par jour. Le
classement local du mode invité n'est pas officiel.
