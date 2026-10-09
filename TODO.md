# TODO — backlog actif de LolRogue

Nettoyage du backlog : **7 octobre 2026**. Les travaux terminés et les anciens
sprints sont conservés intégralement dans le [snapshot du 7 octobre](docs/archive/todo-snapshot-2026-10-07.md).
Le [snapshot avant réaudit du 8 août](docs/archive/todo-snapshot-2026-08-08-1837.md)
reste également disponible.

Ce fichier conserve les quatorze tâches ouvertes, leurs critères d'acceptation et les
gates de release. Les travaux livrés restent documentés dans Git,
[`docs/feature-status.md`](docs/feature-status.md) et les archives. L'archivage ne
constitue aucune preuve de déploiement ni de préparation à la bêta.

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

- [ ] Auditer manuellement desktop/mobile + lecteur d'écran pour les textes que le scan
  statique ne peut pas garantir.

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

**Différé par décision de coût :** ne pas activer cette option payante tant qu'elle
n'est pas souhaitée.

- [ ] Activer **Leaked Password Protection** dans Supabase Auth.
- [ ] Vérifier la politique minimale de longueur/complexité et les messages UI.
- [ ] Tester inscription et changement de mot de passe avec un mot de passe refusé.
- [ ] Documenter le réglage dans les runbooks d'environnement.
- [ ] Ajouter ce paramètre à la checklist de création/restauration d'un projet Supabase.

**Acceptation :** l'advisor `auth_leaked_password_protection` ne doit plus apparaître.

---

## P2-BAL-01 — Confronter les cohortes autoritaires aux playtests et au terrain

**Taille : M/L**

- [ ] Organiser des playtests humains par difficulté, taille d'équipe et expérience ;
  fixer ensuite les bandes de victoire Easy/Normal/Hard au lieu de les déduire de
  l'autoplay seul.

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

- [ ] Interdire le merge avec check annulé/neutralisé.
- [ ] Ajouter `concurrency` pour annuler les anciens runs d'une même PR sans annuler
  une release en cours.

Les alias exigent déjà la réussite de toutes leurs dépendances ; l'exercice
d'annulation ou de neutralisation sur une PR de contrôle reste à documenter.

---

## P2-OPS-01 — Tester les runbooks sur une vraie restauration isolée

**Taille : L**

Le dépôt documente les procédures, mais la preuve distante reste requise.

- [ ] Restaurer un backup sur un projet Supabase isolé distant. La répétition locale
  jetable est réussie ; la cible hébergée dédiée reste à fournir.

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


## P3-CHAMP-01 — Sprint I : Veigar — scaling permanent pendant la run

**Taille : L**  
**Objectif :** ajouter Veigar comme premier champion centré sur une progression
intra-run persistante et créer une mécanique de stacks générique réutilisable pour
Nasus, Smolder, Senna, Aurelion Sol ou Kindred.

### Fonctionnalité I.1 — État de progression intra-run par champion

- [ ] Ajouter un état de progression runtime/serialisable attaché à une instance de
  champion, distinct de la maîtrise permanente du compte.
  - [ ] Définir une structure générique de type \`runProgress\` / \`championRunState\`.
  - [ ] Stocker les compteurs par clé stable plutôt que par propriété spécifique à Veigar.
  - [ ] Garantir qu'un champion absent du système conserve un état vide sans coût métier.
  - [ ] Sérialiser cet état dans les snapshots de run.
  - [ ] Réhydrater l'état après refresh/reconnexion.
  - [ ] Inclure l'état dans le replay authority et la validation de tentative.
  - [ ] Vérifier que l'état ne fuit jamais entre deux runs.
  - [ ] Ajouter une migration uniquement si une persistance DB supplémentaire est réellement requise.
- [ ] Définir des helpers génériques de lecture/écriture.
  - [ ] \`getRunCounter(key)\`.
  - [ ] \`incrementRunCounter(key, amount)\`.
  - [ ] \`setRunCounter(key, value)\`.
  - [ ] Refuser les clés/valeurs invalides ou non finies.
  - [ ] Centraliser les limites/caps quand un champion en a besoin.

### Fonctionnalité I.2 — Événements de combat exploitables par les passifs de stacking

- [ ] Exposer des événements autoritaires assez précis pour attribuer les stacks.
  - [ ] Distinguer dégâts, kill, assist si nécessaire, fin de combat et boss.
  - [ ] Identifier sans ambiguïté le champion source et la cible.
  - [ ] Garantir l'idempotence d'une attribution lors d'un replay.
  - [ ] Ne jamais attribuer de stack depuis l'UI ou un compteur client.
- [ ] Ajouter un contrat de déclencheur passif générique.
  - [ ] Permettre un hook \`onDamage\`.
  - [ ] Permettre un hook \`onKill\`.
  - [ ] Permettre un hook \`onCombatEnd\` si nécessaire.
  - [ ] Interdire qu'un hook fasse diverger client et authority.

### Fonctionnalité I.3 — Passif de Veigar

- [ ] Implémenter \`Pouvoir maléfique phénoménal\` dans le format roguelike.
  - [ ] Définir précisément les sources de stacks.
  - [ ] Recommandation initiale : +1 stack sur kill via compétence.
  - [ ] Recommandation initiale : +3 sur élite tuée par Veigar.
  - [ ] Recommandation initiale : +10 sur boss tué par Veigar.
  - [ ] Décider si un simple hit de compétence donne aussi des stacks.
  - [ ] Si oui, limiter par cible/combat pour éviter le farm infini.
  - [ ] Convertir les stacks en AP bonus selon une règle unique et testée.
  - [ ] Afficher les stacks dans l'UI de combat et la fiche champion.
  - [ ] Afficher le gain de stacks dans le journal de combat.
- [ ] Vérifier la persistance.
  - [ ] Les stacks survivent entre combats.
  - [ ] Les stacks survivent entre biomes.
  - [ ] Les stacks survivent à un refresh.
  - [ ] Les stacks disparaissent à la fin/abandon de la run.

### Fonctionnalité I.4 — Kit jouable de Veigar

- [ ] Ajouter \`Veigar.ts\` au catalogue maintenu.
  - [ ] Q : burst monocible ou double cible simplifié.
  - [ ] W : dégâts différés simplifiés sans position spatiale.
  - [ ] E : stun/control adapté au moteur sans zone spatiale.
  - [ ] R : gros burst avec scaling sur PV manquants si retenu.
  - [ ] Passif : stacks de puissance intra-run.
- [ ] Définir les traductions FR/EN.
  - [ ] Nom, titre, sorts, passif.
  - [ ] Descriptions exactes du comportement roguelike, pas de copie trompeuse du LoL live.
  - [ ] Tooltips de stacks/AP bonus.
- [ ] Ajouter assets et icônes versionnés.

### Fonctionnalité I.5 — Tests et balance Veigar

- [ ] Tests unitaires.
  - [ ] gain de stack correct ;
  - [ ] absence de double attribution ;
  - [ ] restauration après sérialisation ;
  - [ ] reset entre runs ;
  - [ ] scaling AP correct ;
  - [ ] replay déterministe.
- [ ] Tests E2E.
  - [ ] démarrer une run avec Veigar ;
  - [ ] gagner des stacks ;
  - [ ] changer de biome ;
  - [ ] reload ;
  - [ ] confirmer que les stacks sont identiques.
- [ ] Balance.
  - [ ] mesurer AP moyen fin Top/Jungle/Mid/Enemy Base ;
  - [ ] éviter qu'un Veigar sans stacks soit injouable ;
  - [ ] éviter qu'un bon run fasse exploser les limites de dégâts ;
  - [ ] comparer victoire/dégâts à Annie et Lux.

### Acceptation Sprint I

- [ ] Veigar est jouable de bout en bout.
- [ ] Le système de stacks est générique et non codé en dur dans l'UI.
- [ ] Les stacks sont persistants dans une run, jamais entre deux runs.
- [ ] Client, replay et authority produisent exactement les mêmes stacks.
- [ ] Les tests CI, E2E, i18n et balance pertinents passent.

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

- [ ] Tests unitaires de gain/dépense/clamp.
- [ ] Tests de variante renforcée à 49/50/51 Fury.
- [ ] Tests de retry/replay sans double gain.
- [ ] Tests E2E d'une séquence attaque → gain Fury → sort renforcé.
- [ ] Régression complète des 10 champions Mana/sans Mana existants.
- [ ] Balance du rythme d'accès aux sorts renforcés.

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

- [ ] kill simple → cooldown reset attendu ;
- [ ] kill par DoT → comportement documenté ;
- [ ] action bonus disponible une seule fois par round ;
- [ ] aucun chain infini ;
- [ ] autoplay et manuel cohérents ;
- [ ] replay authority identique ;
- [ ] test 1v5 pour prévenir snowball incontrôlé ;
- [ ] comparer burst/survie à Jinx, Darius et Annie.

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

- [ ] création de 1/2/3 summons ;
- [ ] limite max ;
- [ ] refresh/replay ;
- [ ] ordre d'action stable ;
- [ ] destruction ;
- [ ] AoE ;
- [ ] attribution dégâts/kills ;
- [ ] fin de combat nettoie les summons ;
- [ ] autoplay et authority identiques ;
- [ ] balance du snowball à 3 tourelles.

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

- [ ] Ownership porte sur Kayn, pas sur chaque forme.
- [ ] Candies/mastery portent sur Kayn.
- [ ] La rotation gratuite rend toutes les formes accessibles via Kayn.
- [ ] Les métriques stockent champion racine + forme utilisée.
- [ ] L'historique de run affiche la forme finale.
- [ ] Les Daily/replays snapshotent la forme et le moment du choix.

### Fonctionnalité M.6 — Tests et balance Kayn

- [ ] transformation Rouge ;
- [ ] transformation Bleue ;
- [ ] refresh avant/après choix ;
- [ ] migration HP/ressource/cooldown ;
- [ ] items/mastery conservés ;
- [ ] impossible de transformer deux fois ;
- [ ] replay authority identique ;
- [ ] balance base vs formes ;
- [ ] délai moyen avant transformation mesuré.

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

- [ ] vol réussi ;
- [ ] vol refusé proprement ;
- [ ] remplacement/expiration ;
- [ ] utilisation puis retour au R normal ;
- [ ] refresh/replay ;
- [ ] source des dégâts correcte ;
- [ ] métriques attribuées à Sylas ;
- [ ] coût/cooldown correct ;
- [ ] autoplay sait utiliser un R volé ;
- [ ] aucun ultime volé ne casse les invariants d'équipe ou de combat.

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

- [ ] NVDA + Firefox : parcours Auth → Starter → Map → Combat → Game Over.
- [ ] VoiceOver + Safari macOS.
- [ ] VoiceOver + Safari iOS sur petit écran.
- [ ] Zoom 200/400 % et navigation clavier réelle.
- [ ] Consigner les défauts dans des issues dédiées et bloquer la release sur tout
  défaut empêchant le parcours.

---

## P3-LEGAL-01 — Fermer les blockers externes de diffusion

**Taille : externe / non estimable**

- [ ] Compléter identité/adresse éditeur et directeur de publication.
- [ ] Publier/tester un canal privé pour les demandes de droits.
- [ ] Vérifier région Supabase, DPA, transferts et sous-traitants.
- [ ] Obtenir une revue RGPD/ePrivacy professionnelle.
- [ ] Obtenir une analyse écrite de compatibilité avec la propriété intellectuelle Riot.
- [ ] Interdire monétisation/publicité/sponsoring tant que ces points ne sont pas clos.

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

1. `P0-I18N-01` : audit humain FR/EN avec lecteur d'écran sur la preview du SHA candidat.
2. `P2-BAL-01` : playtests humains et calibration des bandes Easy/Normal/Hard.
3. `P2-OPS-01` : restauration d'un backup sur un projet Supabase hébergé isolé.
4. `P3-A11Y-01` : validation humaine multi-lecteurs d'écran, zoom et clavier.
5. `P3-LEGAL-01` : fermeture des blockers externes de diffusion.

Le chantier `P3-ECO-01` est livré derrière un flag OFF ; son rollout distant suit `docs/champion-economy.md` avant tout élargissement du roster. Les sprints `P3-CHAMP-01` à `P3-CHAMP-06` détaillent ensuite l'extension du roster dans l'ordre Veigar → Renekton → Katarina → Heimerdinger → Kayn → Sylas. Les travaux différés `P1-SEC-01` et les deux actions restantes de `P2-CI-01` restent
ouverts selon les décisions ci-dessous. Les sprints déjà livrés
sont archivés ; l'internationalisation n'apparaît qu'une fois dans cet ordre.

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
- [ ] audit mots de passe compromis activé ;
- [ ] runbook restauration testé sur environnement isolé ;
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
