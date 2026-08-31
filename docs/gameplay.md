# Règles de jeu et équilibrage

Ce document décrit les règles actuellement implémentées. Les constantes citées
restent définies dans le code afin que les tests puissent les contrôler.

Le roster, l'identité mécanique des biomes et la méthode de simulation sont
versionnés dans [`docs/content-balance.md`](content-balance.md). Une calibration qui
change le moteur exige une nouvelle version gameplay et Daily.

## Progression d'une run

Une équipe contient au maximum cinq champions. Elle traverse, dans l'ordre,
Top Lane, Jungle, Mid Lane, Bot Lane, River puis Enemy Base. Les biomes comportent
respectivement 6–8, 7–10, 5–7, 6–8, 4–6 et 3–4 nœuds. Leur multiplicateur de
difficulté est 1,0, 1,1, 1,2, 1,25, 1,4 et 1,6.

La première colonne d'une carte est toujours un combat. La dernière est une sortie,
sauf dans la base où elle devient le boss final. L'avant-dernière colonne est un
combat ou un repos à chances égales. Les autres colonnes tirent leur type selon les
poids de `BIOME_MAP_CONFIGS`; tout poids restant produit un combat. Le seed et le
générateur `mulberry32` rendent la carte reproductible.

La génération v20 borne à trois combats et une élite l'écart entre les routes d'une
run. Tous les chemins passent par une boutique avant la fin de Jungle et par un
recrutement avant la fin de Mid. La boutique Jungle contient toujours une potion
d'entrée de gamme ; les cinq premières fins de biome restent des sorties et seule
Enemy Base force un boss.

Les rencontres possibles sont : combat, élite, boutique, repos, événement, trésor,
recrutement et boss. Une rencontre déjà réclamée est mémorisée pour empêcher de
recevoir deux fois sa récompense après un rechargement.

La progression de run suit une cadence unique. `currentWave` est le numéro global
du prochain combat et ne revient jamais à 1 entre deux biomes. Chaque combat gagné
incrémente `totalWavesCompleted`, puis fixe `currentWave` à ce total plus un. Une
sortie complète atomiquement le nœud, passe au biome et au niveau de run suivants,
et bloque la nouvelle carte derrière un choix d'augment :

| Biome jouable | Niveau de run | Choix requis avant son premier nœud |
| --- | ---: | --- |
| Top Lane | 1 | aucun |
| Jungle | 2 | sortie de Top Lane |
| Mid Lane | 3 | sortie de Jungle |
| Bot Lane | 4 | sortie de Mid Lane |
| River | 5 | sortie de Bot Lane |
| Enemy Base | 6 | sortie de River |

Le boss d'Enemy Base termine la run et ne génère aucun choix après la victoire.
Chaque offre contient jusqu'à trois augments légaux, sans doublon dans l'offre.
Elle est dérivée du seed, du biome terminé, du niveau et des augments possédés,
puis persistée telle quelle pour survivre à un rechargement. Les poids de tirage
sont 60 pour Argent, 30 pour Or et 10 pour Prismatique.

## Combat

Le moteur est un combat au tour par tour, jusqu'à cinq contre cinq :

- l'ordre de tour dépend de la vitesse avec un bruit aléatoire maximal de `0,5` ;
- les actions disponibles sont l'attaque de base et les sorts Q/W/E/R prêts, dont
  le coût en mana est payable ;
- les ultimes R restent indisponibles pendant les rounds 1 et 2, puis s'ouvrent au
  round 3 s'ils sont prêts et payables ;
- les contrôles peuvent faire perdre un tour et les effets ont leur propre durée ;
- un hard CC dure au plus un round et ne peut retirer plus de deux actions à une
  même cible dans une fenêtre glissante de quatre rounds ;
- les ralentissements s'additionnent jusqu'à 60 % au maximum, préservant toujours
  40 % de l'initiative de la cible ;
- dégâts physiques, magiques et vrais utilisent leurs calculateurs séparés ;
- une zone exige une cible principale : elle lui inflige 100 % des dégâts et 50 %
  aux quatre cibles secondaires au maximum, soit un plafond de 300 % ;
- les critiques appliquent la formule de `utils/damage.ts` ;
- un combat est limité par défaut à 50 rounds ;
- les PV survivants, l'XP, les niveaux et rangs de sorts sont conservés entre les
  combats.

La difficulté ne multiplie pas toutes les statistiques. Son facteur s'applique aux
PV ennemis et sa racine carrée aux dégâts sortants. Mana, armure, résistance
magique, vitesse, portée, critique et régénérations restent identiques ; les
modificateurs propres au biome et à la rencontre demeurent indépendants.

Le moteur accepte une source aléatoire injectée. Une mécanique aléatoire ajoutée au
combat doit utiliser cette source, jamais appeler directement `Math.random`, afin
de préserver la reproductibilité et les tests.

Dans ce modèle sans position spatiale, la statistique historique `attackSpeed` est
une initiative d'attaque : l'ordre vaut `moveSpeed + 10 × attackSpeed + jitter`.
Elle ne donne jamais d'action supplémentaire, chaque champion agit au plus une fois
par round. `attackRange` classe seulement le profil mêlée/distance et n'autorise ni
n'interdit une cible ; aucun arbre de progression ne vend donc de portée. Les anciens
nœuds de portée ont été remplacés par des bonus réellement résolus par le moteur.

L'autoplay applique une décision contextuelle déterministe. Un soin ou bouclier
n'est choisi que sous 70 % de PV et vise l'allié le plus blessé ; une exécution
respecte son seuil publié ; une zone offensive exige au moins deux cibles vivantes.
Les actions hostiles visent ensuite la cible à plus faible PV effectifs, bouclier
inclus, avec un départage stable par identifiant.

Le combat démarre en mode manuel. Les tours ennemis sont joués automatiquement
après un délai visible de 1,2 s, 0,6 s ou 0,4 s selon la vitesse ×1, ×2 ou ×3.
Activer « Auto » applique le même délai aux tours du joueur. Les rulesets à partir
de `run-engine-v3` journalisent les décisions manuelles sous une forme compacte et
le serveur les rejoue avec la même consommation aléatoire. Les tentatives v1/v2
conservent leur résolution automatique pour préserver leur contrat immuable ; le
ruleset actif est versionné en base et ne doit pas être déduit de ce document.

Les raccourcis de combat sont Q/W/E/R pour les sorts, Espace pour exécuter le tour
manuel et Échap pour revenir à la carte une fois le combat terminé. Tab puis
Entrée/Espace active normalement le contrôle focalisé. Les raccourcis globaux
n'interceptent jamais un bouton, un lien, un champ, un contrôle ARIA ou une zone
éditable. Ils peuvent être désactivés depuis le panneau d'aide du combat ou la page
Settings.

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

Chaque niveau gagné peut ajouter un choix de sort à la file du champion. Si un
gain d'XP traverse plusieurs niveaux, tous les choix actuellement utilisables
sont conservés dans l'ordre. Les sorts de base commencent au rang 1 et leurs
rangs 2 à 5 sont accessibles aux niveaux 3, 5, 7 et 9. L'ultime commence également
au rang 1 dans ce format roguelike ; ses rangs 2 et 3 sont accessibles aux niveaux
6 et 11. Un clic sur un rang maximal ou encore verrouillé ne consomme jamais le
choix. Une fois tous les rangs possibles acquis, les niveaux restants n'ajoutent
plus de choix impossible à résoudre.

## Invariants d'équipe et d'inventaire

Une équipe active contient de un à cinq champions connus et implémentés, sans
doublon. Recrutement, boutique, remplacement complet de l'équipe, reprise locale
et replay autoritaire utilisent le même contrat. Retirer un champion déséquipe
ses objets ; retirer le dernier champion d'une run active est refusé.

L'inventaire contient au maximum 20 instances dont les IDs sont uniques. Les
propriétés d'un objet sont toujours reconstruites depuis `itemDatabase` : une
sauvegarde ne peut pas modifier ses statistiques ou sa valeur. Les règles
`unique`, `stackable` et `maxStacks` sont vérifiées avant le gain ou le débit.
Un champion de l'équipe peut porter au maximum six objets et un objet unique ne
peut être équipé qu'une fois sur le même champion.

À la réhydratation, le normaliseur de domaine retire les champions et objets
inconnus, doublons, équipements orphelins et choix de sorts impossibles, puis
borne les rangs à leur niveau de déblocage. Une équipe connectée absente est
reconstruite depuis l'input immuable de l'attempt ; une run invitée corrompue sans
aucun champion légal est désactivée.

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

Le pool est un budget de compte fixe : il n'est plus divisé uniformément selon la
taille finale de l'équipe. Le progression ruleset v3 le répartit exactement entre les
champions selon leurs vagues et biomes réellement parcourus, enregistrés dans le
ledger v2. La politique locale canonique est dans `src/game/run/runRewardPolicy.ts` ;
ses coefficients sont dans `src/types/mastery.ts`. PostgreSQL lit les mêmes
coefficients depuis le `progression_ruleset` versionné et garde la même condition
`waves_completed > 0` dans `complete_run_verification`. Chaque niveau de maîtrise
ajoute 2 % aux statistiques de base via le calculateur canonique, jusqu'à 8 %.
Le niveau 1 ouvre le deuxième slot de l'équipe initiale et le niveau 3 le
troisième. Les niveaux 2 et 4 n'annoncent aucun chroma : les cosmétiques ne font
pas partie du contrat tant qu'une sélection de skins réellement livrée n'existe
pas.

Les arbres d'amélioration dépendent du rôle principal. Chaque nœud impose son coût,
son niveau de maîtrise, ses prérequis et son rang maximal, tous définis dans
`src/data/enhancementTrees.ts`. Le serveur revérifie les conditions avant achat.

## Probabilités

Les probabilités ne doivent pas être recopiées dans les composants :

- types de nœuds : `BIOME_MAP_CONFIGS` dans `src/game/map/types.ts` ;
- événements et poids de leurs issues : `generateEventEncounter` ;
- repos : 20 % de soin complet, sinon 25 à 75 % ; le prix ajoute respectivement
  40 ou 20 gold par membre après le premier ;
- boutique : 2 à 4 objets, 1 à 2 recrues et 20 % de chance de multiplicateur de
  prix à `0,8` ; en Jungle, une offre est toujours la potion ;
- trésors et recrutements : générateurs correspondants dans `src/game` ;
- choix d'augments : tirage seedé sans remplacement, avec poids Argent/Or/
  Prismatique de 60/30/10.

Un poids est relatif à la somme des poids de son pool. Toute modification
d'équilibrage doit adapter les tests déterministes et, si elle change le
comportement attendu, ce document.

## Effets réellement exécutés

Le catalogue n'est pas une promesse implicite. Une capacité est jouable uniquement
si ses données passent `combatContentSupport` et si son type possède un handler :

- sorts : dégâts, soin, bouclier, exécution, contrôle, buff, debuff, dégâts ou
  soins périodiques et résurrection, avec les paramètres requis ;
- passifs : uniquement ceux des dix champions maintenus (`Annie`, `Ashe`,
  `Darius`, `Garen`, `Jinx`, `Leona`, `Lux`, `Malphite`, `Soraka`, `Warwick`) et
  composés des effets précédents ;
- objets : statistiques canoniques et passifs `ie`, `rabadons`, `sunfire`,
  `guardian angel`, `bloodthirster`, `spirit visage`, potion de soin et élixir de
  colère ;
- runes : les treize conditions de `RuneConditionType`, leurs modificateurs, le
  soin en pourcentage de PV max et les dégâts magiques déclenchés ;
- augments : statistiques plates/pourcentage/scalées, dégâts, réduction, bonus
  d'or, soin post-combat, résurrection supplémentaire et remise boutique ;
- améliorations : uniquement les types de `SUPPORTED_ENHANCEMENT_EFFECTS` dans
  `catalogSupport.ts`.

Les types `FreeItem`, `CooldownReduction`, `Custom` et les améliorations listées
dans `UNAVAILABLE_ENHANCEMENT_EFFECTS` ne sont pas annoncés comme actifs. Database
affiche « effet temporairement indisponible » pour un sort ou passif incomplet, et
l'arbre bloque les nœuds d'amélioration sans règle exécutable. Les tests
`combatContentSupport.test.ts`, `combatRules.test.ts` et `statContract.test.ts`
font partie du contrat.

## Daily run

Le jour Daily est `(instant serveur AT TIME ZONE 'UTC')::date` et expire à minuit
UTC suivant. Le serveur fige dans l'attempt la date, la seed, la difficulté, le
ruleset Daily, le ruleset gameplay et `score_version`. Pour le ruleset actif v20,
la formule `score_version = 15` donne :

```text
score = 10 000 si victoire
      + 1 000 × vagues terminées
      + 250 × biomes visités
      + 100 × niveau de run atteint
```

Le score n'utilise ni l'or gagné/restant ni le nombre d'objets. Il est calculé par le
trigger PostgreSQL depuis la run `verified`, jamais soumis par le navigateur. Une
tentative connectée officielle est limitée à une par joueur et par jour UTC ; un
abandon la consomme sans publier de score. Le classement local invité n'est pas
officiel. Les snapshots de maîtrise et d'améliorations sont tous deux forcés à `{}`
par PostgreSQL et par le moteur authority pour rendre les comptes comparables. Toute
modification des coefficients crée un nouveau ruleset et une
nouvelle `score_version` au lieu de réécrire l'historique.
