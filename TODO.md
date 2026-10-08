# TODO — backlog actif de LolRogue

Nettoyage du backlog : **7 octobre 2026**. Les travaux terminés et les anciens
sprints sont conservés intégralement dans le [snapshot du 7 octobre](docs/archive/todo-snapshot-2026-10-07.md).
Le [snapshot avant réaudit du 8 août](docs/archive/todo-snapshot-2026-08-08-1837.md)
reste également disponible.

Ce fichier conserve les huit tâches ouvertes, leurs critères d'acceptation et les
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

Le chantier `P3-ECO-01` est livré derrière un flag OFF ; son rollout distant suit `docs/champion-economy.md` avant tout élargissement du roster. Les travaux différés `P1-SEC-01` et les deux actions restantes de `P2-CI-01` restent
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
