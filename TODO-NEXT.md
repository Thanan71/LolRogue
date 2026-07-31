# TODO NEXT — priorités après stabilisation P0/P1

Dernière mise à jour : **31 juillet 2026**

Ce document complète [`TODO.md`](./TODO.md) sans le remplacer. `TODO.md` reste la
source de vérité détaillée et sa Definition of Done reste obligatoire. Cette liste
ne conserve que les prochains chantiers et les vérifications récentes utiles à leur
enchaînement.

## État vérifié de la dernière livraison

### P1-GAME-05 — parité client / authority

- [x] Les formules déterministes encore dupliquées ont été extraites dans des
  modules de domaine sans React, Zustand ni Supabase.
- [x] Construction des combattants, augments scalés, boutique, revente, repos,
  recrutement, événements et transition post-combat sont partagés.
- [x] Les PV et PM finaux font partie de l'état autoritaire canonique.
- [x] Deux golden traces exécutent la même seed dans le runtime client et le replay
  authority, en manuel puis autoplay, et comparent l'état complet.
- [x] Les règles partagées Shop, Rest, Event, Treasure, Recruit, augment, XP et
  transitions restent couvertes par les suites de domaine/authority/E2E.
- [x] `run-engine-v11` et son content hash sont actifs ; les bundles v9 et v10
  archivés restent chargeables pour les attempts en cours.
- [x] Validation locale : `npm run check` avec **820 tests**, **43 tests DB** et
  **11 parcours E2E**.
- [x] Edge Function et migration v10 publiées ; preflight CORS production `200`.

### Hotfix — démarrage avec plusieurs champions

- [x] Le parseur de `start_run_attempt` accepte désormais une équipe de 1 à
  `MAX_TEAM_SIZE` champions uniques.
- [x] Le même contrat est appliqué lors de la récupération d'un attempt existant.
- [x] Trois runes de départ uniques et connues sont acceptées.
- [x] Les équipes vides, dupliquées ou hors limite restent rejetées.
- [x] Un test de régression couvre exactement **2 champions + 3 runes**.
- [x] Correctif publié sur `main` : `a617c29`.
- [x] CI complète validée :
  [run 30614262641](https://github.com/Thanan71/LolRogue/actions/runs/30614262641).

### Hotfix — autoplay piloté par le joueur

- [x] L'autoplay démarre à `OFF` pour un combat invité comme pour une run
  authentifiée courante.
- [x] `run-engine-v9` utilise le combat manuel et ne force plus le bouton désactivé
  `Auto serveur`.
- [x] Le joueur peut activer puis désactiver l'autoplay avec le bouton
  `Auto : OFF/ON`.
- [x] Les tours ennemis continuent automatiquement lorsque l'autoplay du joueur est
  désactivé.
- [x] Les actions manuelles restent journalisées dans la trace autoritaire.
- [x] La capacité n'est plus une liste figée oubliable : tout moteur autoritaire au
  format `run-engine-vN` depuis `v3` conserve le combat manuel.
- [x] Les tests couvrent `v3` à `v10`, l'état initial, le bouton activable, le clic et
  le nom accessible après activation.
- [x] `npm run check` validé : format, lint, typage, audit, **811 tests**, assets et
  build de production.
- [x] Tests navigateur validés : **11 parcours E2E**.
- [x] Tests de schéma et d'intégration Supabase validés.
- [x] Correctif publié sur `main` : `f1abb3c`.
- [x] CI complète validée :
  [run 30614562780](https://github.com/Thanan71/LolRogue/actions/runs/30614562780).
- [x] Production contrôlée après déploiement : le bundle Vercel servi contient la
  détection `run-engine-v3+` et le contrôle `Auto : ON/OFF`.

### Hotfix — suffixe autoplay après fin autoritaire

- [x] Reproduire le rejet production `invalid_combat_action_trace` à la commande
  31 avec les 121 commandes originales.
- [x] Identifier la divergence : l'authority termine le combat à l'action 22 alors
  qu'un client chargé pendant le déploiement journalise une 23e action automatique.
- [x] Accepter uniquement les actions automatiques restantes lorsque le replay
  autoritaire a déjà terminé le combat.
- [x] Continuer à rejeter une action manuelle supplémentaire ou toute divergence
  dans le préfixe effectivement rejoué.
- [x] Versionner le correctif en `run-engine-v11` et archiver le bundle v10.
- [x] Edge Function et migration v11 publiées ; preflight CORS production `200`.

## Chantiers clôturés et retirés de NEXT

Les tickets suivants sont désormais cochés dans `TODO.md` et ne doivent plus être
présentés comme des travaux à démarrer :

- [x] `P0-SEC-01` à `P0-SEC-04`
- [x] `P0-RUN-01` à `P0-RUN-04`
- [x] `P0-REL-01`
- [x] `P0-UX-01` et `P0-UX-02`
- [x] `P1-GAME-01` à `P1-GAME-05`
- [x] `P1-RUN-01` à `P1-RUN-04`
- [x] `P1-META-01`

Une réouverture exige un bug reproductible ou une preuve invalidant la Definition
of Done actuelle.

## Ordre d'exécution immédiat

1. **P1-META-02 — Stats et améliorations** : définir le schéma canonique, l'ordre
   des bonus et les caps.
2. **P1-DATA-01 — État local versionné** : valider et migrer chaque store persisté,
   notamment pendant un combat.
3. **P1-DATA-02 — Sources de vérité** : réduire les gestionnaires concurrents et
   documenter un propriétaire par donnée.
4. **P1-DATA-03 — Auth et changement d'identité** : rendre le bootstrap, le logout
   et les réponses asynchrones robustes.
5. **P1-UX-01 / P1-UX-02 — Shell et écrans de jeu responsive** : traiter en premier
   Combat et Game Over sur les petits viewports.
6. **P1-A11Y-01 / P1-A11Y-02 — Accessibilité** : intégrer focus, sémantique,
   reflow, contraste et réduction de mouvement dans le chantier responsive.
7. **P2-TEST-01 — Parcours verticaux réels** : victoire, défaite, Normal, Daily,
   invité et authentifié sans mutation directe des stores.
8. **P2-ARCH-01 — Découpage des orchestrateurs** : seulement après les preuves de
   parité et les parcours E2E bloquants.

---

## P1-GAME-05 — Garantir la parité client / authority

### Objectif

Le client et le replay autoritaire ne doivent jamais implémenter deux variantes
d'une même règle. Toute règle déterministe utilisée dans une run authentifiée doit
provenir d'un module de domaine partagé ou être couverte par une preuve automatique
de parité.

- [x] Inventorier les règles utilisées à la fois par le gameplay visible et
  `AuthorityRunEngine` : combat, ciblage, effets, récompenses, carte, shop,
  recrutement, event, treasure, augments, XP et transitions de biome.
- [x] Extraire les règles communes dans des modules de domaine purs, sans dépendance
  React, Zustand ou Supabase.
- [x] Éviter toute duplication de formules ou de tables entre `CombatPage`,
  `BattleManager`, `runStore` et `AuthorityRunEngine`.
- [x] Ajouter des golden traces déterministes couvrant Combat, Elite, Shop, Rest,
  Event, Treasure, Recruit, augment et changement de biome.
- [x] Exécuter une même seed et les mêmes commandes via le runtime client et le
  replay autoritaire.
- [x] Comparer exactement PV/PM, niveaux, or, inventaire, équipe, augments,
  statistiques, récompenses, position, biome et état terminal.
- [x] Ajouter une golden trace de combat manuel et autoplay afin de prouver que les
  deux modes restent rejouables et produisent une trace valide.
- [x] Faire échouer la CI à la moindre divergence déterministe.
- [x] Versionner toute évolution incompatible avec `engine_version` et content hash
  afin de préserver les attempts en cours.

**Acceptation :** une trace valide produit exactement le même état canonique côté
client et côté authority, et cette propriété est bloquante en CI.

**Statut : terminé.** `run-engine-v11` centralise les règles restantes, conserve les
replays v9/v10, ajoute les preuves de parité manuel/autoplay et tolère uniquement un
suffixe autoplay devenu sans effet après la fin autoritaire du combat.

---

## P1-META-02 — Unifier les stats et améliorations

- [ ] Remplacer les alias multiples par un schéma canonique partagé entre combat,
  objets, améliorations, maîtrise et authority.
- [ ] Distinguer bonus plat, pourcentage additif et multiplicateur.
- [ ] Fixer l'ordre de calcul et les caps dans une spécification testée.
- [ ] Afficher une comparaison avant/après lors d'un équipement ou déblocage.
- [ ] Ajouter un test par nœud d'amélioration et palier de maîtrise réellement
  disponible.

**Acceptation :** une stat a une seule clé, une seule unité et un seul ordre de
calcul dans l'UI comme dans le replay serveur.

---

## P1-DATA — Persistance et propriétaires de données

### P1-DATA-01 — Versionner et valider l'état local

- [ ] Ajouter un numéro de schéma à chaque store persisté.
- [ ] Valider les payloads avec un schéma runtime avant réhydratation.
- [ ] Écrire une migration par version et une quarantaine/reset explicite si
  migration impossible.
- [ ] Ne pas persister un statut transitoire sans stratégie de récupération.
- [ ] Définir un checkpoint déterministe de combat ou une règle explicite
  d'abandon/replay après refresh.
- [ ] Tester refresh sur carte, chaque encounter, augment, tour de combat,
  finalisation et vérification.

### P1-DATA-02 — Réduire les sources de vérité concurrentes

- [ ] Réduire `dailyRunStore` aux métadonnées Daily si `runStore` pilote le gameplay.
- [ ] Faire passer le flux réel par les gestionnaires et règles canoniques déjà
  créés.
- [ ] Retirer ou déprécier les gestionnaires dont les règles sont dupliquées.
- [ ] Éviter les singletons mutables hors Zustand pour les données de run.
- [ ] Documenter un propriétaire unique et une seule commande de mutation par
  donnée.

### P1-DATA-03 — Fiabiliser Auth, profil et changement d'identité

- [ ] Séparer `session`, `profileLoading`, `ready`, `guest` et `error`.
- [ ] Interdire une run connectée tant que le profil durable n'est pas prêt.
- [ ] Récupérer ou créer le profil par un flux idempotent et réessayable.
- [ ] Ignorer toute réponse async liée à une session devenue obsolète.
- [ ] Attendre la fin ou l'abandon de la run avant logout/changement de compte.
- [ ] Tester perte réseau, profil absent, logout refusé et changement rapide de
  compte.

---

## P2-ARCH-01 — Découper les orchestrateurs à risque

Ce chantier vient après `P1-GAME-05` et `P2-TEST-01` afin de disposer de preuves de
non-régression avant le découpage.

### `runStore.ts`

- [ ] Garder Zustand comme état observable/orchestrateur d'interface.
- [ ] Extraire `RunLifecycleService` : start, resume, end, abandon et recovery.
- [ ] Extraire `RunAuthorityService` : attempt, journal, synchronisation, seal,
  verify et recovery.
- [ ] Extraire les commandes/invariants dans des modules de domaine purs.
- [ ] Conserver une seule source de vérité pendant chaque étape du découpage.

### `AuthorityRunEngine.ts`

- [ ] Garder le moteur comme orchestrateur déterministe.
- [ ] Extraire `RunCommandValidator` pour parsing, schéma et validation.
- [ ] Extraire les résolveurs dont la responsabilité est devenue autonome.
- [ ] Réutiliser les mêmes règles de domaine que le runtime client.
- [ ] Conserver engine version et content hash comme frontière de compatibilité.

**Acceptation :** les orchestrateurs deviennent lisibles et testables sans créer
de divergence entre client et serveur.

---

## Règle de maintenance du backlog

- [ ] Après chaque correctif important, mettre à jour `TODO.md` et `TODO-NEXT.md`
  dans le même commit.
- [ ] Retirer de l'ordre immédiat tout ticket clôturé.
- [ ] Réouvrir un ticket uniquement avec une reproduction, un test rouge ou une
  preuve de production.
- [ ] Ne jamais considérer une case documentaire comme preuve suffisante.
- [ ] Garder l'ordre immédiat à dix chantiers maximum.
