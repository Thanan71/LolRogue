# TODO — audit complet de LolRogue

Audit mis à jour le 23 juillet 2026 après le rebase de `developpement`.

## État actuel vérifié

- [x] TypeScript compile sans erreur avec `npm run typecheck`.
- [x] 503 tests passent; 2 tests Supabase live sont ignorés sans identifiants.
- [x] Le build Vite hors téléchargement Data Dragon réussit.
- [x] Les combats utilisent maintenant les encounters générés et les bonus d'amélioration/objets.
- [x] Les nœuds `Start`, `Exit` et `Treasure` ont un flux applicatif.
- [x] Supabase Auth, repositories, maîtrise, améliorations et panneau admin sont présents.
- [x] Le schéma Supabase possède désormais une migration initiale unique.
- [ ] Le mode invité, la fin de run et plusieurs politiques de sécurité doivent être corrigés.
- [ ] La boucle complète doit encore être validée par des tests d'intégration navigateur.

## P0 — bloquants et sécurité

### Maintenir la migration Supabase unique

- [x] Consolider le schéma utilisé par l'application dans `00000000000000_schema.sql`.
- [x] Supprimer les migrations historiques et les scripts SQL ponctuels de correction.
- [x] Conserver les UUID et les tables attendues par les repositories (`players`, `runs`, `run_team_members`, `daily_runs`).
- [x] Valider toutes les migrations sur une instance locale neuve avec `supabase db reset`.
- [x] Documenter le reset local et les migrations non destructives pour une ancienne base de production.
- [x] Générer `src/types/database.ts` depuis le schéma avec `supabase gen types typescript`.
- [x] Ajouter `supabase db reset` et `supabase db lint` à la validation CI.
- [x] Exécuter les tests live contre le même schéma local que les repositories.

### Fermer l'escalade de privilèges admin

- [x] Empêcher un utilisateur de modifier sa propre colonne `players.is_admin`.
- [x] Retirer `is_admin` de `PlayerInsert` et `PlayerUpdate` côté client.
- [x] Limiter explicitement par privilèges de colonnes les champs `players` modifiables par le client.
- [x] Réserver l'attribution/retrait du rôle admin à la service role ou au SQL administrateur.
- [x] Tester en SQL/RLS qu'un utilisateur normal ne peut ni devenir admin ni lire les vues admin.
- [x] Définir les vues admin en `security_invoker = true` et les filtrer par le contrôle admin serveur.

### Corriger Auth et le mode invité

- [x] Persister explicitement un état `isGuest` et autoriser les routes de jeu pour ce mode.
- [x] Corriger `handleGuestPlay` afin que la navigation vers `/` ne reboucle plus vers `/auth`.
- [x] Ne pas construire le client Supabase avec une clé vide et afficher le mode hors ligne lorsque les variables sont absentes.
- [x] Remplacer les deux variables globales `authCheckInitialized` par une initialisation de session unique dans l'application.
- [x] Tester login, inscription immédiate sans confirmation, restauration de session, logout, mode invité et accès admin.
- [x] Nettoyer les scripts SQL ponctuels de correction d'inscription après intégration dans les migrations officielles.

### Corriger la fin et la sauvegarde des runs

- [x] Appeler `endRun(true, runId)` après la victoire finale et continuer après les boss intermédiaires.
- [x] Attendre la sauvegarde Supabase avant de perdre l'état utile, afficher son statut et permettre une nouvelle tentative en cas d'échec.
- [x] Rendre la sauvegarde d'une run atomique via une RPC/transaction pour la run, l'équipe, les statistiques joueur et la maîtrise.
- [x] Rendre la sauvegarde idempotente avec la contrainte unique `run_uuid` et un traitement contrôlé côté RPC.
- [x] Ne pas marquer tous les champions comme survivants dans `runStore.endRun`; utiliser leurs PV finaux.
- [x] Persister l'heure de départ dans le store afin qu'un rechargement n'empêche plus l'enregistrement.
- [x] Clarifier et tester l'abandon : confirmation obligatoire, `won = false`, récompenses des vagues conservées et navigation annulée si la sauvegarde échoue.

## P1 — fonctionnalités à ajouter

### Daily run et classements

- [x] Ajouter un bouton « Daily Run » au menu.
- [x] Connecter `dailyRunStore` et `SupabaseDailyRunRepository` au lancement et à la fin des runs.
- [x] Afficher `DailyLeaderboard`; le composant existe mais n'est monté nulle part.
- [x] Remplacer le leaderboard localStorage par Supabase pour les joueurs connectés, avec fallback local explicite pour les invités.
- [x] Utiliser une seed unique persistée pour carte, encounters, ennemis, boutiques, événements et drops.
- [x] Empêcher plusieurs scores quotidiens par joueur ou définir une règle « meilleur score » atomique.
- [x] Ajouter protection anti-triche minimale et validation serveur du score si le classement devient public.

### Inventaire, objets, runes et augments

- [ ] Ajouter une interface pour équiper/déséquiper les objets; les méthodes du store existent mais l'inventaire de carte reste principalement consultatif.
- [ ] Ajouter comparaison, vente, tri et limite d'inventaire global.
- [ ] Afficher clairement les objets équipés sur chaque champion.
- [ ] Brancher les passifs d'objets au moteur d'effets, pas uniquement les bonus statistiques.
- [ ] Ajouter un écran de sélection de runes et connecter `RuneManager`.
- [ ] Ajouter les choix d'augments pendant la run et connecter `AugmentManager`.
- [ ] Définir la persistance des runes/augments dans la sauvegarde de run et Supabase.

### Combat et progression

- [ ] Ajouter un choix explicite de cible pour les sorts alliés, ennemis et de zone.
- [ ] Appliquer et afficher le mana courant réel dans toute l'UI.
- [ ] Ajouter les choix d'amélioration de sorts lors des montées de niveau.
- [ ] Ajouter un récapitulatif des XP, niveaux, gold et objets après chaque combat.
- [ ] Vérifier l'équilibrage distinct des combats normaux, élites et boss avec des simulations.
- [ ] Ajouter une gestion claire d'une équipe entièrement KO avant une nouvelle rencontre.
- [x] Empêcher de quitter un combat actif vers la carte pour contourner la rencontre.

### Contenu et expérience utilisateur

- [ ] Ajouter plus de champions jouables et des tests de validation de leurs données.
- [ ] Étendre les rencontres, événements, trésors, objets, runes et augments par biome.
- [ ] Ajouter un tutoriel et une légende interactive de la carte.
- [x] Ajouter une confirmation avant abandon, logout ou démarrage d'une nouvelle run active.
- [x] Ajouter une page 404 et des garde-routes spécifiques aux encounters.
- [ ] Ajouter notifications/toasts pour les erreurs Supabase, sauvegardes et déblocages.
- [ ] Ajouter un historique des runs et un profil joueur accessible hors du panneau admin.
- [ ] Ajouter une interface responsive et tactile pour mobile.

## P1 — comportements à modifier

### Carte et déterminisme

- [x] Supprimer la double génération de carte dans `startRun`.
- [x] Stocker la seed dans `runStore` et dans la sauvegarde en base.
- [x] Remplacer les identifiants et tirages fondés sur `Date.now()`/`Math.random()` par le RNG seedé lorsqu'ils influencent une run.
- [x] Remplacer `.sort(() => rand() - 0.5)` par un mélange Fisher–Yates déterministe.
- [x] Gérer explicitement la sortie du dernier biome et la victoire si la configuration des biomes change.
- [x] Refuser l'accès direct à une page d'encounter qui ne correspond pas à `currentEncounter`.
- [x] Empêcher la double collecte/résolution après refresh ou navigation arrière.

### Événements, repos et recrutement

- [x] Vérifier que tous les `stat_boost` sont persistés, appliqués au combat et sauvegardés.
- [x] Définir le comportement d'un coût d'événement impossible à payer.
- [x] Appliquer le `statMultiplier` des champions recrutés ou supprimer ce champ.
- [x] Documenter si un recrutement raté consomme l'or et tester cette règle.
- [ ] Utiliser partout les PV maximum calculés avec niveau, maîtrise, améliorations, objets et boosts.

### Maîtrise et améliorations

- [ ] Désigner une source de vérité unique pour les candies et la maîtrise : store local, `players.total_candies` et `champion_mastery` peuvent diverger.
- [ ] Mettre à jour la maîtrise avec des incréments atomiques plutôt qu'avec des valeurs calculées côté client.
- [ ] Vérifier que `games_played`, `games_won`, kills et dégâts sont additionnés et non écrasés à chaque run.
- [x] Éviter la double attribution : `masteryStore` calcule les récompenses, la RPC les persiste et l'écran final ne fait que les afficher.
- [ ] Ajouter des tests d'intégration pour le déblocage d'un nœud d'amélioration et la dépense concurrente de candies.
- [ ] Prévoir le comportement des améliorations pour un joueur invité.

### Paramètres, accessibilité et audio

- [ ] Connecter Difficulty et Particles à un store; ils restent décoratifs.
- [ ] Ajouter `textSize` et `battleSpeed` à la page Settings.
- [ ] Ajouter les contrôles mute/unmute déjà présents dans `audioStore`.
- [ ] Implémenter la musique ou retirer temporairement son slider.
- [ ] Corriger le rendu du toggle Particles pour refléter son état réel.
- [ ] Respecter `prefers-reduced-motion` dans les particules, animations SVG et transitions.
- [ ] Ajouter navigation clavier, focus visible et libellés accessibles aux contrôles interactifs.

### Architecture

- [ ] Choisir entre React et les scènes Phaser non montées (`BootScene`, `BattleScene`, `GameOverScene`).
- [ ] Retirer Phaser du bundle si ces scènes restent inutilisées.
- [ ] Supprimer ou intégrer les composants dupliqués `MainMenu`/`MenuPage` et `StarterSelect`/`StarterSelectPage`.
- [ ] Simplifier la navigation : React Router, `routerStore` et `gameStore.phase` se chevauchent encore.
- [ ] Découper `AdminPage` (~747 lignes), `CombatPage` (~735), `BattleManager` (~698), `runStore` (~508) et `RunMapScreen` (~488).
- [ ] Remplacer les `any` des repositories, logs et fixtures par des types Supabase générés/builders typés.
- [ ] Ajouter des migrations de version aux stores Zustand persistés.
- [ ] Ajouter une récupération sûre des données localStorage incompatibles ou corrompues.
- [ ] Centraliser la journalisation et désactiver les logs de debug verbeux en production.

## P2 — qualité et livraison

### Tests

- [ ] Ajouter des tests React avec Testing Library pour Auth, Menu, Map, Shop, Rest, Event, Treasure et Game Over.
- [ ] Ajouter un test Playwright/Cypress d'une run complète sur les six biomes.
- [ ] Ajouter un test E2E Supabase : inscription, trigger player, RLS, run, maîtrise, amélioration et suppression.
- [ ] Tester la reprise après rechargement pendant une run et pendant un encounter.
- [ ] Tester les erreurs réseau et la reprise d'une sauvegarde partielle.
- [ ] Ajouter la couverture avec seuils par module.
- [ ] Exécuter réellement les 2 tests Supabase live en CI sur un projet local éphémère.

### Outillage et CI

- [x] Ajouter une CI Node 22 exécutant formatage, lint, `typecheck`, tests et build Vite.
- [ ] Ajouter `supabase db reset` et `supabase db lint` à la CI avec une instance locale.
- [x] Ajouter Biome comme outil unique de lint et de formatage pour TypeScript/React.
- [x] Configurer les règles Biome utiles, les imports organisés et les commandes `lint`, `format` et `format:check`.
- [x] Ajouter une commande `check` regroupant toutes les validations.
- [x] Séparer le téléchargement Data Dragon du build normal; utiliser `assets:update` pour sa mise à jour.
- [ ] Épingler la version Data Dragon et documenter sa mise à jour.
- [ ] Installer/pinner Supabase CLI au lieu de dépendre implicitement de `npx`.
- [ ] Auditer les 9 vulnérabilités npm signalées (1 low, 3 moderate, 4 high, 1 critical) sans appliquer de mise à jour forcée non vérifiée.
- [x] Utiliser Node 22 LTS via `.nvmrc`, `package.json` et la CI.

### Performance et production

- [ ] Découper le bundle principal, actuellement autour de 1,17 Mo minifié (environ 290 Ko gzip).
- [ ] Charger paresseusement Admin, Database, Auth et les pages d'encounter.
- [ ] Isoler ou retirer Phaser du chunk principal.
- [ ] Corriger les polices Beaufort manquantes sous `public/fonts`.
- [ ] Ajouter un Error Boundary React et des fallbacks de chargement par route.
- [ ] Optimiser le préchargement des images aux champions/objets nécessaires.
- [ ] Ajouter les en-têtes de sécurité, CSP et une configuration SPA de réécriture vers `index.html`.
- [ ] Ajouter une politique de confidentialité ou désactiver Analytics/Speed Insights tant que la télémétrie n'est pas documentée.

### Documentation

- [ ] Réécrire le README : structure des assets, Auth, mode invité, Supabase local, migrations, tests et déploiement.
- [ ] Fusionner les nombreux guides ponctuels (`*_FIX*`, `*_COMPLETE*`) en documentation maintenue.
- [ ] Documenter la source de vérité de chaque donnée : run locale, profil, maîtrise, améliorations et leaderboard.
- [ ] Documenter les règles de combat, XP, récompenses, probabilités et progression.
- [ ] Documenter la procédure de promotion admin sécurisée.
- [ ] Ajouter une roadmap par jalons et une checklist de release.

## Ordre de réalisation recommandé

1. Consolider les migrations Supabase et fermer l'escalade admin.
2. Corriger mode invité, configuration Supabase et victoire enregistrée comme défaite.
3. Rendre la sauvegarde de run atomique, idempotente et restaurable.
4. Ajouter les tests E2E Auth/RLS et run complète.
5. Finaliser inventaire, runes, augments et daily run.
6. Unifier navigation, stores de progression et architecture React/Phaser.
7. Ajouter CI, lint, formatage, code splitting et documentation de release.
