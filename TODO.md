# TODO — backlog actif de LolRogue

**Dernière consolidation : 10 octobre 2026 (propositions, aucune nouvelle fonctionnalité cochée).** Ce fichier est le **point d'entrée** du backlog : priorités, tâches ouvertes existantes, sprints champions et gates de release. Les **nouveaux plans détaillés** sont répartis par domaine dans `docs/backlog/` pour éviter un fichier illisible.

Le nettoyage historique du **7 octobre 2026** est conservé dans le [snapshot](docs/archive/todo-snapshot-2026-10-07.md) ; le [snapshot du 8 août](docs/archive/todo-snapshot-2026-08-08-1837.md) reste disponible. Les travaux livrés restent documentés dans Git, [la matrice des fonctionnalités](docs/feature-status.md) et les archives. Les cases cochées ne constituent **ni une preuve de déploiement distant ni une autorisation de bêta**.

## 1. Convention du backlog

### Priorités

- **P0 — bloquant** : risque de sécurité, autorité, perte/corruption de progression,
  ou gate de release donnant une fausse assurance. À fermer avant toute bêta publique.
- **P1 — important** : fiabilité, confidentialité, CI, compatibilité runtime ou
  exploitabilité. À fermer avant de considérer le produit stable.
- **P2 — qualité** : performance, dette, couverture, durcissement, maintenabilité.
- **P3 — évolution** : enrichissement produit ou amélioration non nécessaire à la
  sécurité/stabilité immédiate.

### Taille indicative

- **S** : quelques heures ;
- **M** : environ 1–2 jours de travail concentré ;
- **L** : plusieurs jours, migration ou refonte transverse.

### Granularité obligatoire des tâches

Toute **tâche à réaliser** (contrairement aux cases « critères d'acceptation ») doit suivre le modèle de `P3-CHAMP-02 / J.1` :

- **au moins deux actions principales cochables** : spécification/contrat puis implémentation/intégration ; une troisième consacrée aux preuves est recommandée ;
- **des sous-tâches cochables concrètes** pour chaque action : modèle ou fichier concerné, règles exactes, cas limites, impact UI/DB/Edge, compatibilité et erreurs pertinentes ;
- **une validation explicite** : tests nominaux/négatifs, sérialisation/replay/déploiement si concernés, et preuve sur le SHA candidat ;
- **une dépendance claire** vers les autres tickets responsables des mêmes mécanismes ; ne pas recréer une fonctionnalité sous un nouvel identifiant.

Les plans détaillés `ARCH`, `TREE`, `AI` et `ADM` adoptent tous ce format. Les critères de release/acceptation restent des **gates**, pas des tâches d'implémentation à dupliquer.

### Définition de Done obligatoire

Une tâche n'est terminée que lorsque :

- le comportement réel est corrigé, pas uniquement le mock ;
- la migration est append-only si la base est concernée ;
- les permissions finales sont testées avec les rôles concernés ;
- un test échoue sans le correctif et passe avec lui ;
- les erreurs / doubles appels / refresh / retry sont testés quand pertinents ;
- les types générés et le schéma appliqué restent synchronisés ;
- la documentation qui prétend un statut est mise à jour ;
- les CI pertinentes passent sur un clone propre ;
- une preuve de validation est conservée dans la PR/commit ou la fiche de release.

## Vue d'ensemble — où trouver chaque chantier ?

| Chantier | Statut | Priorité de départ | Détail et critères |
| --- | --- | --- | --- |
| **Validation bêta, sécurité, cohérence** | Ouvert selon cases ci-dessous | P0/P1/P2 | `P0-I18N-01`, `P1-SEC-01`, `P2-BAL-01`, `P2-CI-01`, `P2-OPS-01`, `P3-A11Y-01`, `P3-LEGAL-01` et gate de bêta |
| **Nettoyage technique / scripts npm** | À faire ; audit statique réalisé | P2, déploiement P1 | [ARCH — 18 tâches / 5 sprints](docs/backlog/architecture-maintenance.md) |
| **Arbres Candies** | À auditer puis corriger avant extension | P1 puis P2/P3 | [TREE — 10 lots très détaillés](docs/backlog/champion-enhancement-trees.md) |
| **Bot tactique selon champion/équipe** | À concevoir derrière flag ; legacy conservé | P1 puis P2 | [AI — 49 tâches / 9 sprints](docs/backlog/tactical-bot.md) |
| **Administration** | À fiabiliser, puis étendre | P1 puis P2 | [ADM — 36 tâches / 7 sprints](docs/backlog/admin-console.md) |
| **Économie des champions** | Code livré, flag OFF, rollout distant distinct | P3 | `P3-ECO-01` + [procédure](docs/champion-economy.md) |
| **Nouveaux champions** | Veigar réalisé en code ; cinq sprints en attente | P3 | `P3-CHAMP-01..06` ci-dessous ; [archive Veigar](docs/archive/p3-champ-01-veigar-completed-2026-10-10.md) |

**Mode de lecture :** conserver ici les *identifiants historiques* `P0-*`, `P1-*`, `P2-*`, `P3-*` ; les séries `ARCH-*`, `TREE-*`, `AI-*` et `ADM-*` décrivent les tâches nouvelles dans des dossiers. Les **décisions de produit proposées** (reset Candies, pondérations du bot, politique de modération) restent des cases à valider, pas des fonctions existantes.

### Dépendances et incompatibilités évitées

1. **Candies ≠ Éclats.** `TREE` améliore les nœuds et l'économie des améliorations ; `P3-ECO-01` garde achats/rotation champions à 400 Éclats. `ADM-02/20` ne créent pas de seconde monnaie ou de deuxième ledger.
2. **Version authority.** `run-engine-v22` actif et bundles historiques restent figés. `AI-038` prévoit une nouvelle version *uniquement* si la politique autoritaire change ; `ARCH` ne réécrit aucun ancien hash. `P0-RUN-01` (registre de versions) reste livré, pas rouvert en doublon.
3. **Arbre Assassin / Katarina.** `TREE-01..04` réparent tous les arbres actuels ; `P3-CHAMP-03 / K.5` possède toujours le travail de support des resets et actions bonus pour Katarina. Les deux lots doivent mutualiser les tests/catalogues, jamais développer deux mécanismes.
4. **UX/architecture.** `ARCH-12..15` fournit la structure partagée ; `ADM-32` et `AI-036` réutilisent leurs composants/hook et ne lancent pas de deuxième refonte transversale.
5. **Mesure et équilibrage.** `P2-BAL-01` conserve la validation par **playtests humains** ; `AI-042/047`, `TREE-09/10` et `ADM-17..21` fournissent simulations/affichage/analyses sans cocher le playtest à sa place.
6. **Données admin.** `ADM-01` traite la métrique `active_today` absente/fictive ; `ADM-02` traite l'intégrité Candies ; `ADM-07/11` résout pagination/export au lieu d'inventer de faux totaux à partir des listes tronquées.
7. **Sécurité et déploiement.** `ARCH-05/06` préserve `main → LolRogue`, `dev → LolRogueDev` et interdit les autres branches. Pas de clé `service_role` en frontend ; migrations append-only + tests RLS pour TREE/ADM.
8. **Bêta.** Aucun nouveau code d'initiative n'est marqué « livré » ou intégré artificiellement au registre des **11 invariants P0** suivi par `release:preflight`. Les régressions réellement bloquantes feront l'objet d'un arbitrage explicite et de la mise à jour simultanée de la gate.

### Séquençage recommandé des nouveaux dossiers

- **Vague A — sécuriser la base :** `ADM-01..06` et `TREE-01..04` ; en parallèle `ARCH-01..07` sans modification du gameplay.
- **Vague B — modulariser :** `ARCH-08..15`, puis `TREE-05..07`, `ADM-07..16` ; chaque PR conserve contrats client/DB et sauvegardes.
- **Vague C — intelligence tactique :** `AI-001..034` sur `dev`, tests et comparaisons contre `legacy` ; ne publier la politique dans l'authority qu'après `AI-035..044` et validation de version.
- **Vague D — produit et exploitation :** `TREE-08..10`, `ADM-17..36`, `AI-045..049` ; rollout et activation seulement après gates, playtests et vérification de cible.
- **En parallèle selon capacité :** `P3-CHAMP-02..06` dans l'ordre documenté ; aucune spécialisation ne suppose des mécaniques non encore implémentées.

---

# Travail restant

## P0-I18N-01 — Internationalisation 100 % du projet (FR/EN)

**Taille : L**  
**Risque : élevé — une locale partielle rend le produit incohérent et invalide la promesse de traduction complète.**

### Périmètre obligatoire

La couverture doit porter sur **tout contenu visible ou annoncé à l'utilisateur**, pas
seulement les pages et boutons React :

- interface complète : navigation, menus, formulaires, paramètres, admin, erreurs,
  notifications, tutoriels, ARIA, titres de page et textes de chargement ;
- champions : titres, rôles, descriptions, textes de présentation, maîtrise,
  améliorations et tout contenu affiché dans la base des champions ;
- compétences : noms, descriptions, coûts, cooldowns/recharges, effets, ciblage,
  rangs, améliorations, tooltips, messages de combat et textes générés ;
- runes, augments, objets, passifs, raretés, statistiques et descriptions ;
- carte, biomes, encounters, combats, boutique, recrutement, repos, événements,
  trésors, récompenses, résultats de run et Daily ;
- contenus dynamiques issus des catalogues, Data Dragon, données persistées ou
  templates générés ;
- crédits, légal/confidentialité, patch notes et toute future fonctionnalité joueur ;
- formats dépendants de la locale : nombres, dates, pourcentages, pluriels et unités.

Les noms propres officiels qui ne se traduisent pas peuvent rester identiques entre
locales, mais aucun texte français ne doit servir de fallback silencieux dans la locale
anglaise.

### Actions

- [ ] **Cadrer Audit humain i18n.**
  - [ ] Auditer manuellement desktop/mobile + lecteur d'écran pour les textes que le scan
      statique ne peut pas garantir.
  - [ ] Établir une matrice pages, dialogues, messages d'erreur, ARIA, tooltip, contenu dynamique et écran mobile par locale.
  - [ ] Tester une run complète FR puis EN avec un lecteur d'écran réel et navigation clavier sans recours à une simple capture.
- [ ] **Exécuter les opérations et traiter les cas limites.**
  - [ ] Documenter l'appareil, navigateur, version candidate et chaque texte/fallback incorrect avec chemin de reproduction.
  - [ ] Corriger l'origine des textes manquants via les catalogues existants et revoir les outils de détection statique.
- [ ] **Tester et justifier la clôture.**
  - [ ] Rejouer les parcours FR/EN après correction en vérifiant zéro texte résiduel hors noms propres autorisés.
  - [ ] Parcours FR/EN, zoom et lecteur d'écran vérifiés par un testeur humain sur le SHA candidat.
  - [ ] Conserver une preuve datée et lier les anomalies au correctif puis à la vérification finale.

Les travaux automatisés sont archivés dans le [snapshot du 7 octobre](docs/archive/todo-snapshot-2026-10-07.md) et documentés dans [la validation i18n Sprint G](docs/sprint-g-i18n.md).

La clôture du P0 reste conditionnée à l'audit humain avec lecteur d'écran et à une
preuve sur la preview du SHA candidat. Les tests automatisés et les captures du
navigateur ne constituent pas un audit humain de lecteur d'écran.

### Acceptation

- en locale anglaise : **0 texte français utilisateur**, y compris descriptions de
  champions, compétences, tooltips, contenus dynamiques, ARIA et messages d'erreur ;
- en locale française : **0 texte anglais accidentel** hors noms propres/termes
  explicitement conservés ;
- parité de clés et de catalogues FR/EN à 100 % ;
- aucun fallback silencieux vers le français lorsque `en` est sélectionné ;
- les gates i18n sont bloquantes en CI et échouent dès qu'un nouveau contenu joueur
  n'est pas traduit ;
- une vérification manuelle représentative confirme le résultat sur la preview du SHA
  candidat.

---

## P1-SEC-01 — Activer la protection contre les mots de passe compromis

**Taille : S**

**Option Supabase Pro non bloquante pour la bêta à budget zéro :** ne pas activer Leaked Password Protection sans décision de dépense explicite. La mesure gratuite de remplacement est une longueur minimale robuste configurée dans Supabase Auth, avec validation des parcours d'inscription, de changement et de récupération de mot de passe. Elle ne détecte pas les mots de passe déjà compromis. Voir [la politique bêta sans abonnement](docs/beta-zero-budget.md).

- [ ] **Cadrer Politique de mot de passe Supabase.**
  - [ ] Activer **Leaked Password Protection** dans Supabase Auth.
  - [ ] Vérifier la politique minimale de longueur/complexité et les messages UI.
  - [ ] Tester inscription et changement de mot de passe avec un mot de passe refusé.
  - [ ] Vérifier le coût, la disponibilité de l'option par environnement et la décision explicite d'activation avant tout changement payant.
  - [ ] Comparer règles de rejet côté Auth avec messages d'inscription/changement de mot de passe de l'application.
- [ ] **Exécuter les opérations et traiter les cas limites.**
  - [ ] Documenter le réglage dans les runbooks d'environnement.
  - [ ] Ajouter ce paramètre à la checklist de création/restauration d'un projet Supabase.
  - [ ] Configurer d'abord LolRogueDev et tester un mot de passe compromis, un mot de passe valide et la récupération de compte.
  - [ ] Prévoir une procédure de retour arrière et vérifier que les erreurs Auth ne divulguent pas d'information sur les comptes.
- [ ] **Tester et justifier la clôture.**
  - [ ] Documenter précisément les réglages production distincts de dev, sans afficher les secrets.
  - [ ] Advisor Supabase vérifié uniquement après activation approuvée.
  - [ ] Ne pas cocher ni activer la protection tant que la décision de coût demeure différée.

**Acceptation P1 optionnelle (si offre Pro approuvée) :** l'advisor `auth_leaked_password_protection` ne doit plus apparaître. **Ce ticket n'est pas une gate obligatoire de bêta gratuite** et ne doit pas être coché sans activation réelle.

---

## P2-BAL-01 — Confronter les cohortes autoritaires aux playtests et au terrain

**Taille : M/L**

- [ ] **Cadrer Protocole de playtests.**
  - [ ] Organiser des playtests humains par difficulté, taille d'équipe et expérience ;
      fixer ensuite les bandes de victoire Easy/Normal/Hard au lieu de les déduire de
      l'autoplay seul.
  - [ ] Recruter des profils débutant/intermédiaire/expérimenté et définir consentement, jeu testé et taille d'échantillon avant mesure.
  - [ ] Attribuer seeds, difficulté, tailles d'équipe et version d'engine afin de comparer des parties dans les mêmes conditions.
- [ ] **Exécuter les opérations et traiter les cas limites.**
  - [ ] Consigner victoires/défaites, progression par biome, composition, durée, points de blocage et retours qualitatifs.
  - [ ] Comparer aux cohortes authority appariées sans considérer l'autoplay comme un substitut aux décisions humaines.
- [ ] **Tester et justifier la clôture.**
  - [ ] Proposer ensuite des intervalles/bandes Easy/Normal/Hard, avec N et biais documentés ; exiger revue avant tuning.
  - [ ] Ne pas déduire d'équilibre sur un échantillon trop faible.
  - [ ] Conserver protocole, résultats humains, limites et décisions liées au moteur/version testés.

Les critères automatisés sont conservés dans le [snapshot du 7 octobre](docs/archive/todo-snapshot-2026-10-07.md).

### Acceptation

Une décision de tuning doit citer une cohorte autoritaire reproductible et un signal
de playtest/terrain compatible, avec taille d'échantillon et intervalle affichés.

**État au 4 septembre 2026 :** les sept critères automatisables sont livrés et testés.
Le playtest humain reste volontairement non coché et bloque l'acceptation : aucune
bande Easy/Normal/Hard ni fermeture de `P2-BAL-01` n'est déduite des bots ou des
agrégats terrain seuls.

---

## P2-CI-01 — Ajouter protection de branche et required checks vérifiables

**Taille : S/M**

Les protections de `main` et `dev` sont actives : le
[ruleset CI](https://github.com/Thanan71/LolRogue/rules/21537896) exige `validate`,
`e2e`, `database` et `clean-room`, avec branche à jour obligatoire. Les alias
stricts du sprint G conservent ces checks ; les actions sont épinglées par SHA et
leurs mises à jour sont proposées par Dependabot. Preuve :
[PR #197](https://github.com/Thanan71/LolRogue/pull/197), checks verts et état `CLEAN`.

Il reste à consigner le scénario négatif et à gérer les runs concurrents :

- [ ] **Cadrer Protection effective des merges.**
  - [ ] Interdire le merge avec check annulé/neutralisé.
  - [ ] Identifier les quatre checks requis et les jobs agrégateurs `validate`, `e2e`, `database`, `clean-room` sans changer leur nom.
  - [ ] Sur PR de contrôle, simuler un job annulé et un job neutralisé, puis constater l'interdiction effective du merge.
- [ ] **Exécuter les opérations et traiter les cas limites.**
  - [ ] Ajouter `concurrency` pour annuler les anciens runs d'une même PR sans annuler
      une release en cours.
  - [ ] Définir `concurrency.group` par PR/ref et `cancel-in-progress` approprié sans interrompre les releases en cours.
  - [ ] Vérifier que les alias `needs: ...` sont évalués sur success seulement, y compris skipped/cancelled.
- [ ] **Tester et justifier la clôture.**
  - [ ] Consigner liens vers workflows, commits, configuration rulesets et captures/preuves de refus côté GitHub.
  - [ ] Un scénario négatif prouve que le merge est réellement bloqué.
  - [ ] Tests des runs concurrents sans annulation d'une publication production déjà engagée.

Les alias exigent déjà la réussite de toutes leurs dépendances ; l'exercice
d'annulation ou de neutralisation sur une PR de contrôle reste à documenter.

---

## P2-OPS-01 — Tester les runbooks sur une vraie restauration isolée

**Taille : L**

Le dépôt documente les procédures, mais la preuve distante reste requise.

- [ ] **Cadrer Restauration distante isolée.**
  - [ ] Restaurer un backup sur un projet Supabase isolé distant. La répétition locale
      jetable est réussie ; la cible hébergée dédiée reste à fournir.
  - [ ] Préparer une cible Supabase hébergée jetable et confirmer qu'elle n'est ni LolRogue ni LolRogueDev.
  - [ ] Identifier le backup chiffré/versionné, les migrations et variables nécessaires sans recopier de secrets dans la PR.
- [ ] **Exécuter les opérations et traiter les cas limites.**
  - [ ] Restaurer la base, vérifier intégrité référentielle, permissions RLS/RPC et comptes de test anonymisés.
  - [ ] Tester une run sauvegardée/reprise, historique, Candies, Éclats et contrôles admin sur la cible restaurée.
- [ ] **Tester et justifier la clôture.**
  - [ ] Mesurer RTO/RPO, noter écarts du runbook puis détruire la cible jetable selon procédure.
  - [ ] La répétition locale précédente ne suffit pas : preuve distante avec date et projet isolé.
  - [ ] Toute anomalie RLS, perte de données ou version manquante bloque la clôture.

La répétition locale et les incidents simulés sont archivés dans le [snapshot du
7 octobre](docs/archive/todo-snapshot-2026-10-07.md). La preuve locale se trouve dans
[`docs/restore-drills/2026-08-12-local.json`](docs/restore-drills/2026-08-12-local.json) ;
elle ne clôture pas la restauration distante.

---


## P3-ECO-01 — Économie des champions livrée derrière flag OFF

Implémentation et validation locales terminées : trois gratuits permanents,
cinq de rotation UTC, Éclats serveur, achats à 400, ledger idempotent,
maîtrise conservée et accès legacy. Le Daily garde son offre commune.

Le [checklist complet](docs/archive/p3-eco-01-completed-2026-10-08.md) et
[les preuves](docs/champion-economy-validation-2026-10-08.md) sont archivés.
La migration, le déploiement `verify-run` et l’activation sur une cible distante
restent des opérations de rollout selon [la procédure](docs/champion-economy.md).
Aucune production active ni fermeture des blockers bêta n’est annoncée.

---


## P3-CHAMP-01 — Sprint I : Veigar — **livré en code, archivé**

- [x] Kit Veigar, états intra-run, stacking autoritaire, tests de parité et preuves de balance v22 livrés en code ; **pas de preuve d'activation distante**.
- [x] Sous-tâches et critères complets conservés dans [l'archive du sprint I](docs/archive/p3-champ-01-veigar-completed-2026-10-10.md).
- [ ] Suivre séparément la publication des migrations/Edge et les vérifications distantes selon [le contrat de progression](docs/champion-run-progression.md) ; **ne pas considérer le rollout comme déjà effectué**.

---


## P3-CHAMP-02 — Sprint J : Renekton — moteur de ressources Fury/Energy/etc.

**Taille : L/XL**  
**Objectif :** sortir du modèle implicite \`currentMp/maxMp\` et introduire un système
de ressource générique capable de supporter Mana, Fury, Energy, None et futures
ressources spéciales.

### Fonctionnalité J.1 — Abstraction de ressource de combat

- [ ] Remplacer la dépendance métier directe à \`currentMp/maxMp\`.
  - [ ] Introduire un \`CombatResourceState\` générique.
  - [ ] Définir \`type\`, \`current\`, \`max\`, règles de gain et règles de dépense.
  - [ ] Conserver un adaptateur de compatibilité pour les champions Mana existants.
  - [ ] Traiter explicitement \`None\`/sans ressource.
  - [ ] Mettre à jour les snapshots et sérialisations.
  - [ ] Mettre à jour les métriques de combat.
- [ ] Modifier la validation d'action.
  - [ ] Vérifier la ressource canonique du champion.
  - [ ] Débiter atomiquement au lancement du sort.
  - [ ] Refuser un coût impossible.
  - [ ] Ne pas faire confiance à \`action.cost\`.
  - [ ] Gérer les sorts gratuits et coûts variables.

### Fonctionnalité J.2 — Génération et consommation de Fury

- [ ] Ajouter un profil Fury générique.
  - [ ] Max 100.
  - [ ] Valeur initiale configurable.
  - [ ] Gain sur attaque de base.
  - [ ] Gain sur sorts selon configuration.
  - [ ] Aucun regen passif de Mana.
  - [ ] Clamp strict 0–100.
- [ ] Gérer les coûts conditionnels.
  - [ ] Sort normal sous 50 Fury.
  - [ ] Sort renforcé à partir de 50 Fury.
  - [ ] Consommer 50 Fury uniquement si version renforcée effectivement utilisée.
  - [ ] Journaliser gain et dépense.
  - [ ] Afficher la Fury avant/après action.

### Fonctionnalité J.3 — Variantes de sort renforcées

- [ ] Étendre le modèle \`Spell\` pour les variantes conditionnelles.
  - [ ] Définir une condition de variante.
  - [ ] Définir effets normaux.
  - [ ] Définir effets renforcés.
  - [ ] Garder un seul slot/cooldown.
  - [ ] Exposer au joueur la variante qui sera lancée avant confirmation.
- [ ] Garantir la parité authority.
  - [ ] Même décision normal/empowered sur client et serveur.
  - [ ] Snapshot de ressource suffisant pour replay.
  - [ ] Aucun choix caché dépendant d'une horloge ou d'un état UI.

### Fonctionnalité J.4 — Kit jouable de Renekton

- [ ] Ajouter \`Renekton.ts\`.
  - [ ] Q : dégâts + soin, version renforcée plus forte.
  - [ ] W : dégâts/CC, version renforcée améliorée.
  - [ ] E : dégâts/debuff ou double utilisation simplifiée si retenue.
  - [ ] R : buff de survie/dégâts sur plusieurs tours.
  - [ ] Passif : génération/interaction Fury.
- [ ] Définir le comportement sans position spatiale.
  - [ ] Pas de dash purement cosmétique qui prétend modifier une position inexistante.
  - [ ] Convertir la mobilité en initiative, ciblage ou effet réellement résolu.
- [ ] Traductions FR/EN et assets versionnés.

### Fonctionnalité J.5 — Préparation des futures ressources

- [ ] Ajouter au moins des contrats/test fixtures pour :
  - [ ] Energy ;
  - [ ] Fury ;
  - [ ] None ;
  - [ ] Mana.
- [ ] Documenter comment ajouter une nouvelle ressource.
  - [ ] récupération ;
  - [ ] coût ;
  - [ ] cap ;
  - [ ] persistance ;
  - [ ] UI ;
  - [ ] replay.
- [ ] Prévoir sans implémenter complètement :
  - [ ] Ferocity ;
  - [ ] Grit ;
  - [ ] Flow.

### Fonctionnalité J.6 — Tests et balance Renekton

- [ ] **Cadrer Batterie Fury / ressources.**
  - [ ] Tests unitaires de gain/dépense/clamp.
  - [ ] Tests de variante renforcée à 49/50/51 Fury.
  - [ ] Tests de retry/replay sans double gain.
  - [ ] Créer fixtures `CombatResourceState` Mana, Fury, Energy et None, y compris 0/max et coût variable.
  - [ ] Tester que le moteur calcule et débite atomiquement le coût depuis la règle canonique, jamais depuis `action.cost` falsifié.
- [ ] **Exécuter les opérations et traiter les cas limites.**
  - [ ] Tests E2E d'une séquence attaque → gain Fury → sort renforcé.
  - [ ] Régression complète des 10 champions Mana/sans Mana existants.
  - [ ] Balance du rythme d'accès aux sorts renforcés.
  - [ ] Vérifier que les variantes 49/50/51 Fury produisent le bon effet, une seule dépense et la même trace en replay.
  - [ ] Comparer les snapshots du roster historique avant/après adaptateur Mana, y compris champions sans ressource.
- [ ] **Tester et justifier la clôture.**
  - [ ] Associer mesure de fréquence des empowered skills, victoire et consommation de Fury à chaque difficulté et version.
  - [ ] Tests client/Edge et E2E sur démarrage, run sauvegardée et attaque améliorée.
  - [ ] Aucune régression du comportement ancien ni dérive du RNG autoritaire.

### Acceptation Sprint J

- [ ] Aucun système critique de combat n'est encore dépendant uniquement de Mana.
- [ ] Renekton est jouable et sa Fury est déterministe.
- [ ] Les champions existants conservent leur comportement.
- [ ] L'UI affiche clairement type, montant et variation de ressource.
- [ ] Les tests authority/E2E couvrent ressource et variantes renforcées.

---

## P3-CHAMP-03 — Sprint K : Katarina — Assassin, resets et actions bonus

**Taille : XL**  
**Objectif :** ajouter le premier vrai Assassin jouable et introduire un moteur
contrôlé de cooldown resets / actions bonus déclenchées par élimination.

### Fonctionnalité K.1 — Événements d'élimination et attribution du killer

- [ ] Normaliser l'événement de kill.
  - [ ] Identifier le killer par \`combatantId\`, pas seulement par nom de champion.
  - [ ] Identifier la victime.
  - [ ] Émettre l'événement exactement une fois.
  - [ ] Conserver l'ordre déterministe si plusieurs effets tuent dans la même résolution.
- [ ] Ajouter un hook de règles \`onKill\`.
  - [ ] Déclencher après confirmation de la mort.
  - [ ] Interdire le déclenchement sur overkill déjà résolu.
  - [ ] Supporter les kills causés par DoT.
  - [ ] Définir le comportement d'un kill causé par summon pour plus tard.

### Fonctionnalité K.2 — API de modification de cooldown

- [ ] Ajouter une API contrôlée sur \`ChampionInstance\`.
  - [ ] réduire un cooldown ;
  - [ ] remettre un cooldown à zéro ;
  - [ ] réduire plusieurs slots ;
  - [ ] clamp à 0 ;
  - [ ] journaliser les changements significatifs.
- [ ] Ajouter des règles de sécurité.
  - [ ] pas de cooldown négatif ;
  - [ ] pas de mutation de slot inexistant ;
  - [ ] replay identique ;
  - [ ] aucune mutation directe depuis l'UI.

### Fonctionnalité K.3 — Actions bonus

- [ ] Introduire un quota d'actions supplémentaires explicite.
  - [ ] \`bonusActionsRemaining\` ou contrat équivalent.
  - [ ] Distinguer action normale et action bonus.
  - [ ] Définir quand une action bonus est insérée dans la turn queue.
  - [ ] Empêcher les boucles infinies.
  - [ ] Limiter initialement à **1 action bonus par round** pour Katarina.
  - [ ] Décider si le bonus est perdu en fin de round.
- [ ] Mettre à jour UI et autoplay.
  - [ ] Afficher qu'une action bonus est disponible.
  - [ ] Ne pas avancer au champion suivant trop tôt.
  - [ ] Permettre à l'IA d'utiliser l'action bonus.
  - [ ] Respecter les délais ×1/×2/×3.
- [ ] Mettre à jour l'authority.
  - [ ] journal de décision inclut l'action bonus ;
  - [ ] replay reproduit exactement son insertion ;
  - [ ] seed aléatoire consommé dans le même ordre.

### Fonctionnalité K.4 — Kit jouable de Katarina

- [ ] Ajouter \`Katarina.ts\`.
  - [ ] Q : dégâts ciblés avec rebond simplifié si retenu.
  - [ ] W : buff/attaque de zone compatible avec le moteur.
  - [ ] E : déplacement adapté en effet d'initiative ou action tactique réelle.
  - [ ] R : canalisation/rafale multi-cibles adaptée au tour par tour.
  - [ ] Passif : réduction/reset sur kill.
- [ ] Définir précisément le reset.
  - [ ] quels slots sont réduits ;
  - [ ] de combien ;
  - [ ] quand l'action bonus est donnée ;
  - [ ] interaction avec un kill pendant l'action bonus.
- [ ] Traductions FR/EN, assets et tooltips.

### Fonctionnalité K.5 — Arbre Assassin réellement supporté

- [ ] Auditer \`ASSASSIN_TREE\`.
  - [ ] Identifier les effets actuellement purement déclaratifs/non résolus.
  - [ ] Désactiver ou implémenter chaque nœud affiché à Katarina.
  - [ ] Ne pas annoncer furtivité/broussailles/position si le moteur ne les supporte pas.
  - [ ] Remplacer les effets incompatibles par des effets réellement résolus si nécessaire.
- [ ] Ajouter tests de cohérence catalogue ↔ moteur.

### Fonctionnalité K.6 — Tests et balance Katarina

- [ ] **Cadrer Batterie resets et éliminations.**
  - [ ] kill simple → cooldown reset attendu ;
  - [ ] kill par DoT → comportement documenté ;
  - [ ] action bonus disponible une seule fois par round ;
  - [ ] aucun chain infini ;
  - [ ] Construire fixtures de kills directs, DoT, exécutions simultanées et cible déjà morte pour identifier le killer.
  - [ ] Tester réduction/reset exact des cooldowns, clamp 0 et interdiction d'un slot non existant.
- [ ] **Exécuter les opérations et traiter les cas limites.**
  - [ ] autoplay et manuel cohérents ;
  - [ ] replay authority identique ;
  - [ ] test 1v5 pour prévenir snowball incontrôlé ;
  - [ ] comparer burst/survie à Jinx, Darius et Annie.
  - [ ] Vérifier au plus une action bonus par round avec file de tours stable et prévention de boucle infinie.
  - [ ] Mesurer éliminations en chaîne 1v5, durée des rounds, dégâts et taux de victoire par seed appariée.
- [ ] **Tester et justifier la clôture.**
  - [ ] Vérifier lecture/écriture du journal et parité manuel/autoplay/Edge avec les mêmes commandes.
  - [ ] Inclure tests des anciennes runs sans événement onKill ou action bonus.
  - [ ] Les seuils de snowball sont documentés avant activation du nouveau champion.

### Acceptation Sprint K

- [ ] Katarina est le premier champion taggé Assassin réellement jouable.
- [ ] Le moteur supporte les cooldown resets sans hack spécifique.
- [ ] Les actions bonus sont bornées et déterministes.
- [ ] L'arbre Assassin affiché ne contient aucun effet mensonger/non résolu.
- [ ] Les métriques montrent qu'un reset fort ne transforme pas systématiquement un kill en wipe.

---

## P3-CHAMP-04 — Sprint L : Heimerdinger — summons et entités de combat temporaires

**Taille : XL**  
**Objectif :** permettre à un champion de créer des unités contrôlées par le moteur,
sans les confondre avec les champions permanents de l'équipe.

### Fonctionnalité L.1 — Modèle générique de summon

- [ ] Introduire une entité \`SummonedCombatant\` ou abstraction équivalente.
  - [ ] owner stable ;
  - [ ] side ;
  - [ ] HP/maxHP ;
  - [ ] stats offensives ;
  - [ ] durée éventuelle ;
  - [ ] type de summon ;
  - [ ] règle d'action ;
  - [ ] état sérialisable.
- [ ] Séparer summon et champion.
  - [ ] ne compte pas dans la limite de 5 champions de run ;
  - [ ] pas d'XP ;
  - [ ] pas de mastery ;
  - [ ] pas d'items sauf futur contrat explicite ;
  - [ ] pas de recrutement/persistance hors combat sauf règle dédiée.
- [ ] Définir la limite globale et par propriétaire.
  - [ ] nombre maximal de summons ;
  - [ ] comportement à la limite : refuser/remplacer le plus ancien ;
  - [ ] nettoyage à la fin du combat.

### Fonctionnalité L.2 — Turn queue des summons

- [ ] Décider le modèle d'action.
  - [ ] Recommandation Heimer : attaque automatique en fin de round.
  - [ ] Pas de sélection manuelle initialement.
  - [ ] Ordre stable entre plusieurs summons.
- [ ] Intégrer au moteur.
  - [ ] cible valide ;
  - [ ] dégâts ;
  - [ ] shields/CC si futur summon le demande ;
  - [ ] mort/destruction ;
  - [ ] journal de combat.
- [ ] Définir l'interaction avec les AoE.
  - [ ] les summons sont-ils ciblables comme unités normales ?
  - [ ] les AoE peuvent-elles les toucher ?
  - [ ] règle documentée et testée.

### Fonctionnalité L.3 — Attribution des dégâts et kills de summon

- [ ] Attribuer le summon à son owner pour les métriques.
  - [ ] dégâts séparés et agrégés ;
  - [ ] kill par summon ;
  - [ ] interactions avec passifs \`onKill\` ;
  - [ ] pas de double comptage.
- [ ] Préparer la compatibilité avec stacks futurs.
  - [ ] un kill de tourelle compte-t-il comme kill de Heimer ?
  - [ ] fixer la règle avant implémentation.

### Fonctionnalité L.4 — Kit jouable de Heimerdinger

- [ ] Ajouter \`Heimerdinger.ts\`.
  - [ ] Q : invoque une tourelle.
  - [ ] W : burst monocible/multi-hit simplifié.
  - [ ] E : dégâts + CC.
  - [ ] R : améliore le prochain Q/W/E ou version simplifiée documentée.
  - [ ] Passif adapté au moteur sans faux positionnement.
- [ ] Tourelles.
  - [ ] max 3 ;
  - [ ] stats dérivées du niveau/AP de Heimer selon formule versionnée ;
  - [ ] cible automatique déterministe ;
  - [ ] dégâts journalisés ;
  - [ ] destruction visible dans l'UI.
- [ ] Traductions FR/EN, assets et icônes de summons.

### Fonctionnalité L.5 — UI summons

- [ ] Afficher les summons sans casser la grille 5v5.
  - [ ] zone secondaire ou compteur ;
  - [ ] HP visible si ciblable ;
  - [ ] owner identifiable ;
  - [ ] focus clavier/ARIA si interaction.
- [ ] Journal.
  - [ ] summon créé ;
  - [ ] summon attaque ;
  - [ ] summon détruit/expire.

### Fonctionnalité L.6 — Tests et balance Heimerdinger

- [ ] **Cadrer Batterie invocations.**
  - [ ] création de 1/2/3 summons ;
  - [ ] limite max ;
  - [ ] refresh/replay ;
  - [ ] ordre d'action stable ;
  - [ ] destruction ;
  - [ ] Valider nombre, quota, identité stable, ownership et nettoyage des summons à fin de combat.
  - [ ] Vérifier l'ordre de tour quand summon créée/détruite, et l'attribution des dégâts/éliminations au propriétaire.
- [ ] **Exécuter les opérations et traiter les cas limites.**
  - [ ] AoE ;
  - [ ] attribution dégâts/kills ;
  - [ ] fin de combat nettoie les summons ;
  - [ ] autoplay et authority identiques ;
  - [ ] balance du snowball à 3 tourelles.
  - [ ] Tester une AoE sur unités invoquées et le refus de cibler un summon déjà supprimé.
  - [ ] Comparer snapshot, refresh et replay avec 0, 1, 2 et 3 tourelles sans changement de seed.
- [ ] **Tester et justifier la clôture.**
  - [ ] Mesurer DPS soutenu et snowball dans combats longs avec le même roster/équipement.
  - [ ] Comparer manuel/autoplay/Edge et éviter tout summon fantôme après reprise.
  - [ ] Les métriques comptent séparément champion et summons sans double récompense.

### Acceptation Sprint L

- [ ] Le moteur supporte des unités temporaires génériques.
- [ ] Heimer peut invoquer et perdre ses tourelles sans corruption de turn queue.
- [ ] Les summons ne comptent pas comme champions de roster.
- [ ] Les métriques et kills sont correctement attribués.
- [ ] Le système est réutilisable pour Tibbers, goules, voidlings, plantes, Daisy, clones.

---

## P3-CHAMP-05 — Sprint M : Kayn — formes et transformation intra-run

**Taille : XL**  
**Objectif :** permettre à un même champion de changer de forme pendant une run tout
en conservant identité, niveau, progression, items, mastery et historique.

### Fonctionnalité M.1 — Modèle de forme de champion

- [ ] Ajouter un contrat \`ChampionForm\`.
  - [ ] identifiant stable de forme ;
  - [ ] overrides de stats ;
  - [ ] overrides de sorts ;
  - [ ] override de passif ;
  - [ ] asset/icon optionnel ;
  - [ ] tags optionnels.
- [ ] Ajouter \`activeForm\` au runtime de champion.
  - [ ] forme de base par défaut ;
  - [ ] changement atomique ;
  - [ ] sérialisation ;
  - [ ] réhydratation ;
  - [ ] replay authority.
- [ ] Garantir les invariants lors d'une transformation.
  - [ ] même championId racine ;
  - [ ] même ownership ;
  - [ ] même mastery ;
  - [ ] même niveau/XP ;
  - [ ] mêmes items ;
  - [ ] HP courant recalculé selon règle explicite ;
  - [ ] ressource recalculée selon règle explicite ;
  - [ ] cooldowns migrés ou reset selon décision documentée.

### Fonctionnalité M.2 — Progression Rouge/Bleue de Kayn

- [ ] Ajouter deux compteurs intra-run.
  - [ ] essence rouge ;
  - [ ] essence bleue.
- [ ] Définir les sources.
  - [ ] Rouge contre Fighter/Tank.
  - [ ] Bleu contre Mage/Marksman/Support.
  - [ ] Décider dégâts, kill ou combat gagné comme unité d'attribution.
- [ ] Empêcher l'exploitation.
  - [ ] cap par combat ;
  - [ ] pas de double gain sur replay ;
  - [ ] pas de gain depuis summons/effets non voulus.
- [ ] Afficher la progression dans l'UI.

### Fonctionnalité M.3 — Choix de transformation

- [ ] Définir le seuil de transformation.
  - [ ] seuil versionné ;
  - [ ] possibilité ou non de choisir la forme minoritaire ;
  - [ ] moment du choix : après combat / nœud dédié / écran de progression.
- [ ] Créer l'UI de choix.
  - [ ] aperçu Rhaast ;
  - [ ] aperçu Assassin de l'Ombre ;
  - [ ] différences de stats/sorts/passif ;
  - [ ] confirmation ;
  - [ ] clavier/mobile/ARIA.
- [ ] Le choix est irréversible pour la run.
  - [ ] pas de double transformation ;
  - [ ] refresh garde la forme ;
  - [ ] authority vérifie l'éligibilité.

### Fonctionnalité M.4 — Kit base/Rhaast/Assassin

- [ ] Ajouter \`Kayn.ts\` avec définition multi-formes.
- [ ] Forme de base.
  - [ ] kit volontairement inférieur mais viable ;
  - [ ] accumulation d'essence claire.
- [ ] Rhaast.
  - [ ] sustain ;
  - [ ] dégâts selon PV max si retenu ;
  - [ ] meilleure survie.
- [ ] Assassin de l'Ombre.
  - [ ] burst ;
  - [ ] pénétration/initiative ;
  - [ ] bonus contre cibles fragiles si retenu.
- [ ] Adapter les mobilités au moteur sans position spatiale fictive.
- [ ] FR/EN et assets pour les trois formes.

### Fonctionnalité M.5 — Compatibilité avec progression et économie

- [ ] **Cadrer Identité Kayn et formes.**
  - [ ] Ownership porte sur Kayn, pas sur chaque forme.
  - [ ] Candies/mastery portent sur Kayn.
  - [ ] La rotation gratuite rend toutes les formes accessibles via Kayn.
  - [ ] Spécifier une identité de champion racine stable pour achat, rotation, Candies et maîtrise, distincte de la forme en combat.
  - [ ] Conserver le catalogue et les accès existants en considérant Rouge/Bleue comme états internes, jamais des champions achetables.
- [ ] **Exécuter les opérations et traiter les cas limites.**
  - [ ] Les métriques stockent champion racine + forme utilisée.
  - [ ] L'historique de run affiche la forme finale.
  - [ ] Les Daily/replays snapshotent la forme et le moment du choix.
  - [ ] Stocker explicitement forme courante, date/étape de choix et version de règles dans le snapshot sérialisé.
  - [ ] Mettre à jour l'historique pour afficher le nom de forme finale avec son champion racine d'origine.
- [ ] **Tester et justifier la clôture.**
  - [ ] Tester changements de forme sur Daily/guest/compte connecté sans multiplier le wallet ni les récompenses.
  - [ ] Réouverture d'un ancien snapshot sans forme ne crée aucun achat ou bonus.
  - [ ] Logs et statistiques restent corrélables par champion racine et forme sans ambiguïté.

### Fonctionnalité M.6 — Tests et balance Kayn

- [ ] **Cadrer Batterie transformation.**
  - [ ] transformation Rouge ;
  - [ ] transformation Bleue ;
  - [ ] refresh avant/après choix ;
  - [ ] migration HP/ressource/cooldown ;
  - [ ] items/mastery conservés ;
  - [ ] Tester choix Rouge et Bleu à leurs conditions exactes, y compris choix refusé avant seuil.
  - [ ] Comparer HP, max HP, ressource canonique, effets, cooldowns et passifs lors du basculement.
- [ ] **Exécuter les opérations et traiter les cas limites.**
  - [ ] impossible de transformer deux fois ;
  - [ ] replay authority identique ;
  - [ ] balance base vs formes ;
  - [ ] délai moyen avant transformation mesuré.
  - [ ] Vérifier qu'un refresh juste avant/après choix n'ajoute ni transformation ni ressource ni bonus d'objet.
  - [ ] Empêcher second choix ou forme hybride ; tester sauvegarde/replay et retours d'erreur.
- [ ] **Tester et justifier la clôture.**
  - [ ] Mesurer délai moyen, puissance avant/après transformation et victoires par seed/difficulté.
  - [ ] Inclure migrations/snapshots anciens avec champion racine sans forme choisie.
  - [ ] Comparer parité autoritaire avec file de tours identique.

### Acceptation Sprint M

- [ ] Le système de formes est générique et sérialisé.
- [ ] Kayn peut finir une run dans l'une des deux formes.
- [ ] Aucun état permanent n'est dupliqué par forme.
- [ ] Les replays historiques restent reproductibles.
- [ ] Le système peut accueillir Gnar, Shyvana, Nidalee, Elise, Jayce ou K'Sante.

---

## P3-CHAMP-06 — Sprint N : Sylas — vol temporaire et override de compétences

**Taille : XL**  
**Objectif :** rendre le système de sorts suffisamment générique pour qu'un champion
puisse utiliser temporairement une compétence provenant d'un autre champion.

### Fonctionnalité N.1 — Overrides temporaires de spell slots

- [ ] Ajouter un niveau d'override au-dessus des sorts de base.
  - [ ] \`temporarySpellOverrides: Partial<Record<SpellSlot, Spell>>\` ou équivalent.
  - [ ] \`getSpell(slot)\` résout override puis sort de base.
  - [ ] le sort de base reste immuable.
  - [ ] override sérialisable si nécessaire.
  - [ ] clear explicite après usage/expiration.
- [ ] Définir les métadonnées d'override.
  - [ ] source champion ;
  - [ ] source spell ;
  - [ ] date/round d'acquisition ;
  - [ ] nombre d'utilisations ;
  - [ ] règle d'expiration.

### Fonctionnalité N.2 — Compatibilité cross-champion des sorts

- [ ] Auditer chaque type de \`SpellEffect\`.
  - [ ] damage ;
  - [ ] heal ;
  - [ ] shield ;
  - [ ] cc ;
  - [ ] buff/debuff ;
  - [ ] execute ;
  - [ ] dot/hot ;
  - [ ] revive.
- [ ] Garantir qu'un sort ne suppose pas implicitement son champion d'origine.
  - [ ] ratios lus depuis le caster actuel ;
  - [ ] sourceId = Sylas lorsqu'il caste ;
  - [ ] cooldown porté par le slot override ;
  - [ ] coût adapté à Sylas selon règle documentée.
- [ ] Identifier les sorts non génériques.
  - [ ] créer une capability \`stealable\`/support matrix ;
  - [ ] refuser proprement un sort non supporté ;
  - [ ] ne jamais produire de no-op silencieux.

### Fonctionnalité N.3 — Sélection de l'ultime à voler

- [ ] R de Sylas cible un champion ennemi.
  - [ ] lire son ultime canonique ;
  - [ ] vérifier \`stealable\` ;
  - [ ] créer l'override R ;
  - [ ] journaliser le vol.
- [ ] Définir les règles.
  - [ ] un seul ultime stocké ;
  - [ ] nouveau vol remplace ou refuse selon décision ;
  - [ ] utilisation consomme l'override ;
  - [ ] cooldown du R de Sylas reste cohérent ;
  - [ ] pas de vol sur cible invalide/défaite si non voulu.
- [ ] UI.
  - [ ] afficher portrait/nom de l'ultime volé ;
  - [ ] tooltip du comportement adapté ;
  - [ ] rendre clair qu'il s'agit du R actuellement disponible.

### Fonctionnalité N.4 — Conversion des ratios/coûts

- [ ] Définir comment Sylas utilise un R AD.
  - [ ] conserver ratio AD brut ;
  - [ ] ou conversion officielle simplifiée en AP ;
  - [ ] choisir une règle stable et documentée.
- [ ] Définir la ressource.
  - [ ] coût du R volé ;
  - [ ] interaction avec Mana de Sylas ;
  - [ ] aucun coût impossible dû à un autre resourceType.
- [ ] Ajouter tests sur ultimes physiques, magiques, utilitaires et sans coût.

### Fonctionnalité N.5 — Kit jouable de Sylas

- [ ] Ajouter \`Sylas.ts\`.
  - [ ] Q : dégâts.
  - [ ] W : dégâts + soin.
  - [ ] E : CC/dégâts adapté sans position spatiale.
  - [ ] R : vol d'ultime.
  - [ ] Passif : effet après cast si compatible avec le moteur.
- [ ] Définir traductions FR/EN.
- [ ] Ajouter assets.

### Fonctionnalité N.6 — Matrice de compatibilité des ultimes existants

- [ ] Tester au minimum :
  - [ ] Annie R ;
  - [ ] Ashe R ;
  - [ ] Darius R ;
  - [ ] Garen R ;
  - [ ] Jinx R ;
  - [ ] Leona R ;
  - [ ] Lux R ;
  - [ ] Malphite R ;
  - [ ] Soraka R ;
  - [ ] Warwick R ;
  - [ ] Veigar R ;
  - [ ] Renekton R ;
  - [ ] Katarina R ;
  - [ ] Heimerdinger R ;
  - [ ] Kayn R / forme active.
- [ ] Pour chaque ultime :
  - [ ] marquer supporté/non supporté ;
  - [ ] expliquer toute adaptation ;
  - [ ] test unitaire ;
  - [ ] test authority si supporté.
- [ ] Aucun nouvel ultime ne doit entrer dans le roster sans statut explicite dans
  la matrice Sylas.

### Fonctionnalité N.7 — Tests et balance Sylas

- [ ] **Cadrer Batterie ultimes volés.**
  - [ ] vol réussi ;
  - [ ] vol refusé proprement ;
  - [ ] remplacement/expiration ;
  - [ ] utilisation puis retour au R normal ;
  - [ ] refresh/replay ;
  - [ ] Définir tableau de compatibilité pour chaque R disponible, incluant refus de mécanique non supportée.
  - [ ] Tester vol réussi/refusé, durée, expiration, coût canonique et cooldown restant après remplacement.
- [ ] **Exécuter les opérations et traiter les cas limites.**
  - [ ] source des dégâts correcte ;
  - [ ] métriques attribuées à Sylas ;
  - [ ] coût/cooldown correct ;
  - [ ] autoplay sait utiliser un R volé ;
  - [ ] aucun ultime volé ne casse les invariants d'équipe ou de combat.
  - [ ] Vérifier ownership et source des dégâts attribués à Sylas sans modifier la définition du champion donneur.
  - [ ] Comparer ultimes consommables, ciblage allié/ennemi, ressources et retour au R normal après expiration.
- [ ] **Tester et justifier la clôture.**
  - [ ] Tester reload, auto et replay Edge sur séquence vol → lancement → expiration.
  - [ ] Les sorts incompatibles échouent proprement avec motif et aucune mutation d'état.
  - [ ] Aucune duplication d'effet, monnaie ou récompense lors d'un replay.

### Acceptation Sprint N

- [ ] Sylas est jouable de bout en bout.
- [ ] Les sorts temporaires ne mutent jamais les définitions de base partagées.
- [ ] Au moins tous les ultimes du roster jouable ont un statut de compatibilité explicite.
- [ ] Les ultimes marqués supportés fonctionnent en manuel, autoplay et authority.
- [ ] Le mécanisme est réutilisable pour de futurs systèmes de copie/remplacement.

---

## Ordre de développement recommandé des nouveaux champions

1. **Sprint I — Veigar** : fondation légère et immédiatement utile du state intra-run.
2. **Sprint J — Renekton** : généralisation des ressources avant d'ajouter Energy/Fury ailleurs.
3. **Sprint K — Katarina** : premier Assassin + resets/actions bonus.
4. **Sprint L — Heimerdinger** : summons, grosse extension structurante du combat.
5. **Sprint M — Kayn** : formes et transformation intra-run.
6. **Sprint N — Sylas** : stress-test final de la généricité des sorts.

Règle : un sprint champion n'est considéré Done que si sa nouvelle mécanique est
documentée comme **générique et réutilisable**, couverte en authority/replay, et
qu'aucun comportement affiché dans l'UI n'est purement cosmétique ou non résolu par
le moteur.

---

## P3-A11Y-01 — Validation humaine avant bêta

**Taille : M**

- [ ] **Cadrer Parcours accessibilité réel.**
  - [ ] NVDA + Firefox : parcours Auth → Starter → Map → Combat → Game Over.
  - [ ] VoiceOver + Safari macOS.
  - [ ] VoiceOver + Safari iOS sur petit écran.
  - [ ] Définir parcours représentatifs Auth → sélection → carte → combat → récompenses et au moins un message d'erreur.
  - [ ] Exécuter NVDA+Firefox, VoiceOver+Safari macOS et VoiceOver+Safari iOS avec appareil/navigateur documentés.
- [ ] **Exécuter les opérations et traiter les cas limites.**
  - [ ] Zoom 200/400 % et navigation clavier réelle.
  - [ ] Consigner les défauts dans des issues dédiées et bloquer la release sur tout
      défaut empêchant le parcours.
  - [ ] Vérifier navigation clavier complète, focus après dialogues, annonces dynamiques et sortie de modale.
  - [ ] Tester 320 px, zoom 200/400 %, contrastes, réduction d'animation et textes FR/EN.
- [ ] **Tester et justifier la clôture.**
  - [ ] Créer pour chaque anomalie issue avec sévérité, étapes de reproduction et preuve de correction sur preview candidate.
  - [ ] Un parcours inaccessible est un bloqueur de bêta, pas seulement une remarque d'audit.
  - [ ] Conserver les résultats humains datés indépendamment des tests E2E automatisés.

---

## P3-LEGAL-01 — Fermer les blockers externes de diffusion

**Taille : externe / non estimable**

- [ ] **Cadrer Conformité diffusion publique.**
  - [ ] Compléter identité/adresse éditeur et directeur de publication.
  - [ ] Publier/tester un canal privé pour les demandes de droits.
  - [ ] Vérifier région Supabase, DPA, transferts et sous-traitants.
  - [ ] Identifier responsables de publication, identité et coordonnées obligatoires, canal de demande de droits.
  - [ ] Examiner localisation Supabase, sous-traitants, transferts éventuels, DPA et politique de conservation des données.
- [ ] **Exécuter les opérations et traiter les cas limites.**
  - [ ] Obtenir une revue RGPD/ePrivacy professionnelle.
  - [ ] Obtenir une analyse écrite de compatibilité avec la propriété intellectuelle Riot.
  - [ ] Interdire monétisation/publicité/sponsoring tant que ces points ne sont pas clos.
  - [ ] Obtenir revue spécialisée RGPD/ePrivacy et statut des recommandations avant communication publique.
  - [ ] Obtenir analyse écrite de compatibilité des actifs Riot et des usages permis pour LolRogue.
- [ ] **Tester et justifier la clôture.**
  - [ ] Maintenir blocage publicité, sponsoring et monétisation tant qu'une incompatibilité ou autorisation manquante persiste.
  - [ ] Conserver avis, dates, responsables et actions correctives sans publier de données privées.
  - [ ] Aucun statut « prêt à diffuser » attribué sans preuves externes suffisantes.

# Inventaire des invariants P0 livrés

Ces dix identifiants restent visibles pour que `release:preflight` conserve son
inventaire de onze P0, avec `P0-I18N-01` encore ouvert ci-dessus. Les titres ne
prouvent ni la validation du SHA candidat ni l'état live : la fiche
`config/beta-release.json` et ses contrôles restent obligatoires.

## P0-SEC-01 — Corriger les vues leaderboard `SECURITY DEFINER`

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-SEC-02 — Réduire et formaliser la surface `SECURITY DEFINER`

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-RUN-01 — Supprimer la duplication manuelle des versions authority

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-DATA-01 — Tester les repositories contre une vraie base

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-REL-01 — Réparer la gate bêta pour qu'elle reflète l'état réel

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-BAL-01 — Corriger les incohérences fondamentales du moteur de combat

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-BAL-02 — Remplacer la fausse simulation de balance par de vraies runs

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-BAL-03 — Garantir l'égalité des règles Daily et des départs comparables

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-BAL-04 — Rétablir la hiérarchie augments/drops et couper le snowball économique

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

## P0-BAL-05 — Débloquer l'early Top avant le tuning structurel

Invariant livré ; [preuve et critères archivés](docs/archive/todo-snapshot-2026-10-07.md).

# 2. Ordre d'exécution recommandé

### Gate de bêta et décisions en cours (inchangées)

1. `P0-I18N-01` : audit humain FR/EN avec lecteur d'écran sur la preview du SHA candidat.
2. `P2-BAL-01` : playtests humains et calibration des bandes Easy/Normal/Hard, distincts des simulations bot.
3. `P2-OPS-01` : exercice hébergé différé (amélioration opérationnelle, non gate de la bêta sans abonnement) ; revalider localement une restauration isolée depuis un dump vérifié, sans toucher aux projets `LolRogue` et `LolRogueDev`.
4. `P3-A11Y-01` : validation humaine lecteurs d'écran, zoom et clavier.
5. `P3-LEGAL-01` : fermeture des blockers externes avant diffusion publique.

### Travaux d'ingénierie proposés (non déclarés livrés)

1. **Fiabilité avant fonctionnalités** : `ADM-S1` + `TREE-01..04`, avec correctifs SQL/RLS et parité combat.
2. **Nettoyage sans risque de gameplay** : `ARCH-S1` et `ARCH-S2` ; alias CI conservés et blocage des déploiements hors `main`/`dev`.
3. **Interfaces métier** : `ARCH-S3/S4`, `ADM-S2/S3` et `TREE-05..07` ; une seule couche de repositories/services.
4. **Bot stratégique** : `AI-S1..S9`, en conservant `legacy` ; pas de nouvelle version authority tant que parité/vérification non acquises.
5. **Mesure / UI / exploitation** : `TREE-08..10`, `ADM-S4..S7` et `ARCH-S5`.
6. **Champions supplémentaires** : `P3-CHAMP-02..06`, dans l'ordre Renekton → Katarina → Heimerdinger → Kayn → Sylas, avec prérequis moteur mutualisés.

Le chantier `P3-ECO-01` est livré derrière un flag OFF ; son rollout distant suit `docs/champion-economy.md` avant tout élargissement du roster. `P1-SEC-01` reste différé pour raison de coût (mesures gratuites d'Auth à valider séparément), `P2-OPS-01` garde son exercice hébergé non bloquant et `P2-CI-01` reste ouvert sur les exercices de runs annulés/concurrents ; aucune activation de ces fonctionnalités n'est implicite.

## Décisions et travaux différés

- `P1-SEC-01` reste visible mais ne doit pas activer Leaked Password Protection
  tant que cette option payante n'est pas souhaitée.
- `P2-CI-01` conserve l'exercice d'annulation/neutralisation et la gestion des
  runs concurrents. Les protections et les required checks distants sont actifs.
- Les autres tâches utilisent `npm run check`, `npm run db:validate` et les gates
  locales spécialisées comme preuves. Les checks requis de la branche cible
  conditionnent le merge des PR.

---

# 3. Nouvelle gate de bêta proposée

**Budget maximal pour les services additionnels : 0 €** ; détail, limites et distinction entre alpha privée et bêta publique dans [docs/beta-zero-budget.md](docs/beta-zero-budget.md). Les options payantes (`P1-SEC-01`, troisième projet Supabase hébergé, audit juridique professionnel) ne peuvent pas être exigées uniquement par confort. Les obligations de sécurité, RGPD et propriété intellectuelle restent à traiter ; la gate objective `config/beta-release.json` n'est pas contournée.

La bêta technique ne redevient candidate que lorsque :

- [ ] aucun `P0-*` n'est ouvert ;
- [ ] internationalisation FR/EN à 100 %, y compris champions, compétences et contenus dynamiques ;
- [ ] advisors sécurité live : aucune `ERROR` non acceptée ;
- [ ] aucune fonction de trigger/maintenance inutile n'est client-callable ;
- [ ] repository integration tests passent contre une vraie base migrée ;
- [ ] dernière migration live = migration attendue par le SHA candidat ;
- [ ] trois CI complètes consécutives **après** le dernier P0 ;
- [ ] preview du SHA candidat validée, pas une ancienne prod ;
- [ ] taux de rejet authority vérifié après déploiement du correctif ;
- [x] `balance:check` rejoue de vraies runs authority et vérifie le bundle/version/hash
  candidats, au lieu de parcourir synthétiquement tous les nœuds ;
- [ ] Daily officiel déterministe et identique entre un compte neuf et un compte maxé ;
- [ ] aucun starter à 0 % sur les premiers combats de la cohorte de release ;
- [ ] la cohorte de release n'est plus bloquée à 0 % de victoire par l'early Top ;
- [ ] distributions augments/drops et rendements économiques dans les tolérances
  versionnées de la baseline ;
- [x] règles cooldown/MP/ciblage/Electrocute couvertes en parité UI + authority ;
- [ ] cron de rétention vérifiés ;
- [ ] configuration gratuite de sécurité Auth vérifiée sur `LolRogueDev` puis production (longueur minimale >= 12 caractères, parcours inscription/modification/récupération et limites anti-abus contrôlés) ; **Leaked Password Protection Pro hors gate** ;
- [ ] restauration isolée locale du backup le plus récent, vérification des empreintes, de la confidentialité, des flux Auth/RLS et du RPO/RTO documentés ; exercice hébergé `P2-OPS-01` optionnel pour ce jalon ;
- [ ] revue accessibilité humaine effectuée ;
- [ ] blockers juridiques externes fermés pour toute diffusion publique.

---

# 4. Règle de maintenance de ce fichier

- Ne pas ajouter de compte rendu historique détaillé ici.
- Lorsqu'un item est terminé, le cocher et ajouter au maximum une ligne de preuve.
- À chaque gros jalon, déplacer les items terminés dans une archive datée et garder
  `TODO.md` concentré sur le travail restant.
- Toute régression observée en production peut rouvrir un sujet ancien avec un nouvel ID.
- Les statuts « livré », « sécurisé », « prêt bêta » doivent toujours pouvoir être
  recalculés depuis des preuves exécutables et l'état live, jamais depuis une case
  cochée seule.
