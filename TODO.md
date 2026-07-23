# TODO — audit complet de LolRogue

Audit réalisé le 23 juillet 2026 sur l'état actuel du dépôt.

## État constaté

- [x] 17 fichiers de tests passent, soit 447 tests.
- [ ] Le typecheck échoue actuellement avec 8 erreurs TypeScript.
- [ ] Le build de production est bloqué par le typecheck.
- [ ] La boucle complète d'une run sur les 6 biomes n'est pas jouable jusqu'au bout.
- [ ] Les systèmes déjà codés (objets, runes, augments, maîtrise, daily run, Phaser) ne sont pas tous reliés à l'interface principale.

## P0 — bloquants à corriger

### Compilation

- [ ] Corriger les imports/variables inutilisés dans `RunMapScreen.tsx`, `CombatPage.tsx` et `runStore.ts`.
- [ ] Faire accepter un `NodeType` à `startEncounter` au lieu d'un `string`, puis supprimer les casts dans `RunMapScreen`.
- [ ] Initialiser `effectManager` pour chaque `CombatantState` créé dans `BattleManager._initCombatants`.
- [ ] Ajouter une commande CI qui exécute au minimum `npm run typecheck`, `npm test` et le build Vite.

### Progression de la carte

- [ ] Implémenter le comportement des nœuds `Treasure` : attribuer une récompense, résoudre le nœud et afficher le résultat.
- [ ] Implémenter le comportement des nœuds `Exit` : terminer le biome courant et charger le suivant.
- [ ] Réserver `Boss` au dernier biome, ou définir clairement un boss par biome. Actuellement les biomes ordinaires terminent par `Exit`, mais seul le boss déclenche `advanceToNextBiome`.
- [ ] Ne terminer la run qu'après le boss final. `CombatPage` envoie actuellement vers Game Over dès qu'un nœud de type `boss` est vaincu.
- [ ] Ajouter un écran/état de victoire distinct d'une fin de run après défaite.
- [ ] Empêcher un retour libre vers la carte pendant un combat non résolu, qui permet de contourner la rencontre.
- [ ] Garantir qu'un encounter correspond au nœud courant et refuser les accès directs incohérents à `/combat`, `/shop`, `/rest`, `/event` et `/recruit`.
- [ ] Dédupliquer `completedNodeIds` et éviter la mutation profonde directe de `biomeMaps` dans `completeCurrentNode`.

### Cohérence du combat

- [ ] Utiliser les ennemis définis par `CombatEncounter.enemies` au lieu de générer une équipe uniquement depuis `runLevel`.
- [ ] Appliquer `statMultiplier`, le niveau et les récompenses définis dans l'encounter.
- [ ] Différencier réellement les combats normaux, élites et boss (difficulté, composition, récompenses).
- [ ] Conserver les PV au bon moment : la fin de combat et `onComplete` peuvent précéder l'effet React qui copie les PV finaux dans `runStore`.
- [ ] Gérer les champions à 0 PV avant le début d'un combat et empêcher une équipe entièrement KO d'entrer en rencontre.
- [ ] Utiliser le mana réel dans l'UI et les actions : `toCombatantInfo` réinitialise actuellement l'affichage au mana maximum.
- [ ] Relier le contrôle de vitesse aux délais d'auto-combat; `battleSpeed` existe mais l'auto-play reste fixé à 400 ms.

## P1 — fonctionnalités à ajouter

### Inventaire et équipement

- [ ] Ajouter un véritable écran/panneau d'inventaire interactif.
- [ ] Permettre d'équiper, déséquiper, vendre et comparer les objets depuis l'interface.
- [ ] Afficher les emplacements utilisés et la limite d'objets par champion.
- [ ] Brancher les bonus d'objets de `runStore.inventory` sur les statistiques des `ChampionInstance` en combat.
- [ ] Brancher les passifs d'objets sur le moteur d'effets.
- [ ] Définir la capacité maximale de l'inventaire global et le comportement lorsque celui-ci est plein.

### Progression roguelike

- [ ] Ajouter un choix d'augmentations pendant la run et connecter `AugmentManager` au combat.
- [ ] Ajouter un choix/équipement de runes et connecter `RuneManager`.
- [ ] Ajouter l'expérience, la montée de niveau et les choix d'amélioration de sorts; les champs existent mais la progression n'est pas alimentée.
- [ ] Afficher la maîtrise des champions, les candies, les paliers et les bonus permanents.
- [ ] Unifier les deux systèmes de récompenses/maîtrise (`masteryStore` et `rewardsStore`) afin d'éviter les doubles récompenses.
- [ ] Appliquer effectivement les bonus de maîtrise aux champions.
- [ ] Ajouter une page de méta-progression et de déblocages.

### Daily run

- [ ] Ajouter une entrée « Daily Run » au menu.
- [ ] Connecter `dailyRunStore` au lancement et à la fin d'une run.
- [ ] Afficher `DailyLeaderboard`; le composant existe mais n'est rendu nulle part.
- [ ] Utiliser une seed de run unique et persistée pour la carte, les combats, boutiques, événements et récompenses.
- [ ] Remplacer tous les `Date.now()` et `Math.random()` du chemin daily par le générateur seedé.
- [ ] Clarifier que le leaderboard actuel est local au navigateur, ou ajouter un backend si un classement partagé est voulu.

### Contenu et UX

- [ ] Ajouter davantage de champions jouables et valider leurs compétences avec des tests de données.
- [ ] Enrichir les rencontres, événements, objets, runes et augments avec une progression par biome.
- [ ] Ajouter les écrans de choix de cible pour les compétences alliées/ennemies et les compétences de zone.
- [ ] Ajouter un récapitulatif de récompenses après chaque rencontre.
- [ ] Ajouter une confirmation avant d'abandonner une run active.
- [ ] Ajouter une page 404 et des garde-routes.
- [ ] Ajouter des états de chargement/erreur explicites pour Data Dragon et les images.
- [ ] Ajouter un tutoriel court et une légende interactive de la carte.
- [ ] Ajouter une interface responsive pour mobile et petits écrans.

## P1 — comportements existants à modifier

### Carte et génération

- [ ] Générer des identifiants d'encounter déterministes; ils utilisent actuellement `Date.now()`.
- [ ] Éviter `.sort(() => rand() - 0.5)` pour les mélanges seedés et utiliser Fisher–Yates/`SeededRNG.shuffle`.
- [ ] S'assurer qu'il n'existe qu'un vrai nœud `Start` et un vrai nœud final par biome.
- [ ] Tester que toute carte générée possède au moins un chemin jouable du départ à la sortie.
- [ ] Tester la progression inter-biomes, les trésors, les sorties et le boss final.

### Événements, repos et recrutement

- [ ] Persister les bonus de statistiques issus des événements `stat_boost`; ils sont actuellement annoncés mais non appliqués.
- [ ] Définir le comportement d'un `gold_cost` impossible à payer au lieu de laisser `spendGold` échouer silencieusement.
- [ ] Initialiser les PV maximum avec les statistiques au niveau courant, bonus compris, dans Rest/Event/RunMap.
- [ ] Appliquer `statMultiplier` au champion recruté.
- [ ] Déterminer si l'échec d'un recrutement consomme l'or; documenter et tester la règle.
- [ ] Empêcher qu'une page de rencontre soit résolue plusieurs fois après rechargement/navigation.

### Paramètres et audio

- [ ] Relier les contrôles Difficulty et Particles à un store; ils sont actuellement décoratifs.
- [ ] Exposer et connecter `textSize` et `battleSpeed` dans la page Settings.
- [ ] Ajouter les boutons mute/unmute déjà prévus dans `audioStore`.
- [ ] Implémenter la musique ou retirer temporairement le volume de musique, qui ne contrôle aucune piste.
- [ ] Corriger le toggle visuel Particles : son curseur ne reflète pas l'état de la checkbox.
- [ ] Respecter `prefers-reduced-motion` pour les particules et animations SVG.

### Architecture

- [ ] Choisir une seule interface de jeu principale : React est utilisée, tandis que `BootScene`, `BattleScene` et `GameOverScene` Phaser ne sont jamais montées.
- [ ] Supprimer ou intégrer les composants dupliqués non utilisés (`MainMenu`/`MenuPage`, `StarterSelect`/`StarterSelectPage`).
- [ ] Simplifier la navigation : React Router, `routerStore` et `gameStore.phase` se chevauchent et peuvent diverger.
- [ ] Supprimer les casts `as any` applicatifs, notamment pour `biomesVisited`, en alignant `Biome` et les types de résumé.
- [ ] Ajouter une version de schéma et des migrations aux stores Zustand persistés.
- [ ] Ajouter une récupération sûre des données `localStorage` corrompues ou devenues incompatibles.
- [ ] Réinitialiser explicitement tous les stores temporaires lors d'une nouvelle run.
- [ ] Découper `CombatPage` et `BattleManager`, devenus des points de concentration de logique.

## P2 — qualité, livraison et maintenance

### Tests

- [ ] Ajouter des tests d'intégration React avec navigation réelle entre menu, carte, rencontres et Game Over.
- [ ] Ajouter un test end-to-end d'une run complète sur les 6 biomes.
- [ ] Ajouter des tests de persistance/reprise après rechargement.
- [ ] Ajouter des tests pour les pages Shop, Recruit, Rest et Event.
- [ ] Réduire les `any` dans les fixtures de tests avec des builders typés.
- [ ] Ajouter une couverture de code avec des seuils CI.

### Outillage

- [ ] Ajouter ESLint avec règles React Hooks, TypeScript et accessibilité.
- [ ] Ajouter Prettier ou Biome et une commande `format:check`.
- [ ] Séparer le téléchargement Data Dragon du build normal : un build ne devrait pas dépendre du réseau ni modifier les assets.
- [ ] Épingler une version Data Dragon reproductible avec une commande explicite de mise à jour.
- [ ] Ajouter des scripts `check` et `build:offline`.
- [ ] Ajouter Dependabot/Renovate et un audit périodique des dépendances.

### Performance et production

- [ ] Charger les pages lourdes en lazy loading.
- [ ] Vérifier le poids du bundle Phaser; le retirer du bundle principal s'il reste inutilisé.
- [ ] Optimiser/précharger uniquement les images nécessaires à la rencontre courante.
- [ ] Ajouter un Error Boundary React.
- [ ] Ajouter les métadonnées SEO/PWA utiles (favicon, manifest, thème, partage social) si le jeu doit être publié.
- [ ] Ajouter une politique de confidentialité ou désactiver Analytics/Speed Insights si le déploiement ne doit pas collecter de télémétrie.
- [ ] Documenter le déploiement SPA et la réécriture de toutes les routes vers `index.html`.

### Documentation

- [ ] Corriger le README : les dossiers `data/` décrits n'existent pas dans l'état suivi, et les assets réels sont sous `public/lol`.
- [ ] Documenter l'architecture retenue, la boucle de jeu et la source de vérité de chaque store.
- [ ] Documenter les règles de combat, formules, probabilités et progression.
- [ ] Ajouter les instructions de mise à jour Data Dragon et les contraintes de licence des assets Riot.
- [ ] Ajouter une roadmap par jalons et une checklist de release.

## Ordre de réalisation conseillé

1. Rétablir le typecheck et le build.
2. Réparer `Exit`/`Treasure` et terminer correctement les 6 biomes.
3. Aligner les encounters générés avec les combats réellement joués.
4. Fiabiliser la persistance des PV, rencontres et sauvegardes.
5. Brancher inventaire, objets, progression et maîtrise au moteur.
6. Intégrer daily run, paramètres et écrans de méta-progression.
7. Ajouter tests d'intégration, CI, lint et optimisation de production.
