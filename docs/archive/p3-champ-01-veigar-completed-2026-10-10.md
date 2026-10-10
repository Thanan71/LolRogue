# Archive du sprint P3-CHAMP-01 — Veigar

**Extrait archivé du backlog actif au 10 octobre 2026** ; les cases et preuves historiques sont conservées telles quelles. La présence de cases cochées ne prouve pas le déploiement distant.

[Retour au backlog actif](../../TODO.md)

## P3-CHAMP-01 — Sprint I : Veigar — scaling permanent pendant la run

**Taille : L**  
**Objectif :** ajouter Veigar comme premier champion centré sur une progression
intra-run persistante et créer une mécanique de stacks générique réutilisable pour
Nasus, Smolder, Senna, Aurelion Sol ou Kindred.

### Fonctionnalité I.1 — État de progression intra-run par champion

- [x] Ajouter un état de progression runtime/serialisable attaché à une instance de
  champion, distinct de la maîtrise permanente du compte.
  - [x] Définir une structure générique de type \`runProgress\` / \`championRunState\`.
  - [x] Stocker les compteurs par clé stable plutôt que par propriété spécifique à Veigar.
  - [x] Garantir qu'un champion absent du système conserve un état vide sans coût métier.
  - [x] Sérialiser cet état dans les snapshots de run.
  - [x] Réhydrater l'état après refresh/reconnexion.
  - [x] Inclure l'état dans le replay authority et la validation de tentative.
  - [x] Vérifier que l'état ne fuit jamais entre deux runs.
  - [x] Ajouter une migration uniquement si une persistance DB supplémentaire est réellement requise.
- [x] Définir des helpers génériques de lecture/écriture.
  - [x] \`getRunCounter(key)\`.
  - [x] \`incrementRunCounter(key, amount)\`.
  - [x] \`setRunCounter(key, value)\`.
  - [x] Refuser les clés/valeurs invalides ou non finies.
  - [x] Centraliser les limites/caps quand un champion en a besoin.

### Fonctionnalité I.2 — Événements de combat exploitables par les passifs de stacking

- [x] Exposer des événements autoritaires assez précis pour attribuer les stacks.
  - [x] Distinguer dégâts, kill, assist si nécessaire, fin de combat et boss.
  - [x] Identifier sans ambiguïté le champion source et la cible.
  - [x] Garantir l'idempotence d'une attribution lors d'un replay.
  - [x] Ne jamais attribuer de stack depuis l'UI ou un compteur client.
- [x] Ajouter un contrat de déclencheur passif générique.
  - [x] Permettre un hook \`onDamage\`.
  - [x] Permettre un hook \`onKill\`.
  - [x] Permettre un hook \`onCombatEnd\` si nécessaire.
  - [x] Interdire qu'un hook fasse diverger client et authority.

### Fonctionnalité I.3 — Passif de Veigar

- [x] Implémenter \`Pouvoir maléfique phénoménal\` dans le format roguelike.
  - [x] Définir précisément les sources de stacks.
  - [x] Appliquer +1 point sur une élimination normale via compétence.
  - [x] Appliquer +3 points sur un élite éliminé par Veigar.
  - [x] Appliquer +10 points sur un boss éliminé par Veigar.
  - [x] Ne pas attribuer de points aux simples touches ni aux assistances.
  - [x] Attribuer une seule fois par cible et combat, avec un plafond de 200 points.
  - [x] Convertir les stacks en AP bonus selon une règle unique et testée.
  - [x] Afficher les stacks dans l'UI de combat et la fiche champion.
  - [x] Afficher le gain de stacks dans le journal de combat.
- [x] Vérifier la persistance.
  - [x] Les stacks survivent entre combats.
  - [x] Les stacks survivent entre biomes.
  - [x] Les stacks survivent à un refresh.
  - [x] Les stacks disparaissent à la fin/abandon de la run.

### Fonctionnalité I.4 — Kit jouable de Veigar

- [x] Ajouter \`Veigar.ts\` au catalogue maintenu.
  - [x] Q : burst monocible ou double cible simplifié.
  - [x] W : dégâts différés simplifiés sans position spatiale.
  - [x] E : stun/control adapté au moteur sans zone spatiale.
  - [x] R : gros burst avec scaling sur PV manquants si retenu.
  - [x] Passif : stacks de puissance intra-run.
- [x] Définir les traductions FR/EN.
  - [x] Nom, titre, sorts, passif.
  - [x] Descriptions exactes du comportement roguelike, pas de copie trompeuse du LoL live.
  - [x] Tooltips de stacks/AP bonus.
- [x] Ajouter assets et icônes versionnés.

### Fonctionnalité I.5 — Tests et balance Veigar

- [x] Tests unitaires.
  - [x] gain de stack correct ;
  - [x] absence de double attribution ;
  - [x] restauration après sérialisation ;
  - [x] reset entre runs ;
  - [x] scaling AP correct ;
  - [x] replay déterministe.
- [x] Tests E2E.
  - [x] démarrer une run avec Veigar ;
  - [x] gagner des stacks ;
  - [x] changer de biome ;
  - [x] reload ;
  - [x] confirmer que les stacks sont identiques.
- [x] Balance.
  - [x] mesurer AP moyen fin Top/Jungle/Mid/Enemy Base ;
  - [x] éviter qu'un Veigar sans stacks soit injouable ;
  - [x] éviter qu'un bon run fasse exploser les limites de dégâts ;
  - [x] comparer victoire/dégâts à Annie et Lux.

### Acceptation Sprint I

- [x] Veigar est jouable de bout en bout.
- [x] Le système de stacks est générique et non codé en dur dans l'UI.
- [x] Les stacks sont persistants dans une run, jamais entre deux runs.
- [x] Client, replay et authority produisent exactement les mêmes stacks.
- [x] Les tests CI, E2E, i18n et balance pertinents passent.

Livraison : compteurs déclaratifs, kit Veigar, interface FR/EN et contrats v22.
Les résultats canoniques conservent les compteurs dans leur JSON existant ; aucune
progression de compte ne provient de ces points. Les anciens runs gardent leur
moteur et leur catalogue figés. Les icônes Riot sont versionnées et le patch note
`2026.10.09.1` décrit cette livraison.

Le [rapport de balance](docs/balance/P3-CHAMP-01-veigar-v22.md) compare 180 runs
appariés source/Edge et distingue les biomes atteints des champions survivants.
L’absence de Veigar vivant après la Base limite les conclusions de fin de run ;
cette campagne automatisée ne clôture pas les playtests humains P2-BAL-01.
Le [contrat de publication](docs/champion-run-progression.md) exige Edge et client
compatibles avant les deux migrations. Aucune migration ni fonction distante
n’est appliquée par cette livraison de code.
