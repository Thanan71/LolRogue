# Contrat des effets TREE-03 et TREE-04

Ce contrat décrit le moteur futur intégré à la release 0.3.0. Les bundles et les
hashes historiques restent figés ; les anciennes runs sont rejouées par leur
version. Les Candies et les rangs du compte ne créent aucun compteur Veigar.

| Nœud stable                      | Observation TREE-01                                                                 | Contrat corrigé                                                                                                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `marksman_dps_3` — Tir Déchirant | Aucun tirage malgré 15 % ; 25 dégâts sur 3 tours donnaient 24 après trois arrondis. | Après une attaque de base infligeant des dégâts HP, un tirage injecté `< 0,15` applique un DoT vrai total `round(PVmax cible × 0,05)` sur 3 tours. Chaque application est indépendante.                                           |
| `assassin_sustain_3` — Phénix    | Émission du bouclier perdue par le combat ; recharge fictive de 60 secondes.        | Si les PV sont déjà strictement sous 20 % avant un coup, bouclier de base 200 PV pendant 2 tours, appliqué avant ce coup, une utilisation par combat. Le simple franchissement du seuil pendant le coup n’est pas le déclencheur. |
| `mage_burst_2` — Combustion      | +15 % de puissance annoncé comme +15 % de dégâts magiques.                          | Le mécanisme reste un bonus de puissance : `(AP de base + bonus plats) × (1 + somme des bonus AP relatifs)`. Aucun multiplicateur direct des dégâts ni seconde application.                                                       |
| `mage_control_2` — Canalisation  | Fraction 0,1 convertie implicitement en 10 points ; aperçu secondaire absent.       | 10 points de hâte plats, additionnés aux autres points. Recharge `× max(0,1 ; 100/(100+hâte) × facteur R)`. Le facteur R vaut `1 - somme(cdr_ultimate)` pour R et 1 sinon.                                                        |

Le total entier d’un DoT d’amélioration est réparti par différences de planchers :
`tick(i) = floor(total × (i+1) / durée) - floor(total × i / durée)`. Par exemple,
25 dégâts sur trois tours donnent 8, 8, 9 ; un total de 1 donne 0, 0, 1. L’option
est propre aux DoT des règles ; les autres DoT conservent leur sémantique.

Les ticks sont des dégâts vrais, sans critique ni pénétration d’armure/résistance.
Ils repassent par les multiplicateurs de dégâts et réductions de règles, puis
les boucliers. Le total annoncé est donc la base avant ces modificateurs. Une
attaque entièrement absorbée ne déclenche aucun saignement. Les réapplications
ne fusionnent pas leurs instances ; leur durée limite leur coexistence.

Les probabilités 0 et 1, ou absentes pour le saignement garanti du Combattant,
ne consomment pas de tirage. Une fraction non finie ou hors de [0,1] est refusée.
Le catalogue et le runtime utilisent le même champ numérique `chance` ; aucune
condition n’est extraite d’un texte traduit.

Les boucliers de règles passent par l’amplification des boucliers une seule fois,
puis absorbent le coup entrant. Phénix n’assure pas une résurrection : un coup
peut épuiser son bouclier et tuer le porteur. Immortel conserve une fois 1 PV,
sans promettre d’immunité.

Les auras de dégâts et de réduction sont non spatiales. Elles incluent le
porteur, s’additionnent entre porteurs vivants et cessent lorsque leur source
est vaincue. Les contrôles de sorts et de règles partagent extension, ténacité,
arrondi supérieur et plafonds par type ; les contrôles durs restent limités à
un tour. Un bonus de durée n’implique donc pas un tour supplémentaire garanti.

Le vol de vie des améliorations soigne sur les dégâts HP d’attaques de base ;
l’omnivampirisme couvre aussi sorts et DoT. Les renvois Épines et Brûlure sont
annoncés en dégâts vrais. Les bonus de type `champion_damage` sont décrits sur
les attaques, sorts et DoT de toute cible, sans prétendre filtrer les champions.

Les douze effets sans consommateur moteur restent indisponibles. Ce contrat
n’ajoute ni dissimulation, ni géométrie de zone, ni interception, ni action bonus.

Les tests numériques couvrent faibles et fortes valeurs, seuils RNG, totalité
des ticks, boucliers, amplification, décès, cumul d’auras, hâte, types de dégâts
et parité FR/EN. La matrice de parité TREE-04 complète ces preuves avec des
identités de combattant distinguant les deux camps et des replays déterministes.

L’identité d’un effet instantané est `(sourceId de formation, sourceSide,
targetId de formation, targetSide)`. Les occurrences `Garen#1` et `Garen#2`
restent distinctes des deux côtés ; une identité de camp absente est refusée.
La même règle s’applique aux renvois, au mana, aux boucliers, aux soins et aux
contrôles. Les ticks conservent le camp de leur source et le journal attribue
l’absorption d’un bouclier à son propre camp. Les requêtes de statistiques,
hâte, ténacité et amplification n’empruntent jamais le loadout du miroir ennemi.

| Fixture                              | Rôles / portée                                             | Preuve                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `enhancementEffectsContract.test.ts` | Formules, probabilités, boucliers, auras, dégâts et unités | Faibles/fortes valeurs, limites et état physique                                                                       |
| `enhancementBattleParity.test.ts`    | Cinq rôles jouables et Veigar                              | Même trace en manuel et autoplay ; métriques, ressources et commandes rejouées identiques après restauration JSON      |
| `enhancementAuthorityParity.test.ts` | Même catalogue de builds légaux                            | Comparaison source/Edge au hash courant, session restaurée et tentative figée malgré un changement ultérieur du compte |
| `enhancementAuthorityParity.test.ts` | Version 0.2.5                                              | SHA-256 des octets archivés et résultat de replay historique figés                                                     |

Aucun des onze kits maintenus ne possède Assassin comme premier rôle. Phénix et
les autres effets Assassin ont donc une preuve de moteur isolée, sans inventer
de champion ni annoncer une run publique Assassin. Les douze effets indisponibles
ne sont pas considérés actifs par ces builds légaux. La campagne source/Edge
doit être exécutée après construction du bundle futur ; une validation du code
source seule ne clôt pas cette gate.

La reprise d’une run historique n’utilise pas le moteur de combat courant. Le
résolveur client est généré à partir des seules entrées `replay-only` du registre
et charge leur bundle figé à la demande. L’écran explique que le combat reprend
depuis son début en automatique avec ses règles d’origine ; les bundles archivés
n’exposent pas de pilotage manuel tour par tour.

Le préfixe entier du journal est rejoué avec la tentative et les améliorations
figées. Les commandes de résolution et le snapshot autoritaire sont publiés
ensemble : PV/PM, XP/niveaux, inventaire, ledger, récompenses et frontière de carte
ne sont pas recalculés avec les formules actuelles. Les choix hors combat restent
journalisés et entrent dans le prochain préfixe. Le terminal utilise ensuite le
parcours de sauvegarde existant, avec son outbox et son résumé issus de ce snapshot.

`historicalCombatReplay.test.ts` restaure réellement le schéma persistant, reprend
plusieurs rencontres jusqu’au terminal et conserve le hash historique de la
première résolution 0.2.5. `historicalCombatScreen.test.tsx` prouve l’absence de
montage des hooks de combat actuels, le message FR/EN, le retry sans mutation,
le rejet d’une autre identité de run et la finalisation d’une défaite figée.
