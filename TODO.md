# TODO — remise à niveau complète de LolRogue

Audit refait le 23 juillet 2026 à partir du code, des migrations, des tests et de
parcours réels sur desktop et mobile.

> **Verdict :** le projet est un prototype avancé avec un socle solide, mais il
> n'est pas prêt pour une bêta publique. Plusieurs éléments visibles dans l'UI
> (passifs, runes, augments, objets, ciblage, maîtrise) ne correspondent pas encore
> aux règles réellement exécutées. La frontière de confiance Supabase permet aussi
> à un client modifié de falsifier la progression et les classements.

## Comment utiliser ce TODO

### Priorités

- **P0 — bloquant :** sécurité, perte de données, parcours inaccessible ou règle
  centrale permettant de tricher. Aucun déploiement public avant clôture.
- **P1 — essentiel :** boucle de jeu, progression, responsive et accessibilité
  nécessaires à une bêta crédible.
- **P2 — qualité :** dette, tests, performance, documentation et exploitation.
- **P3 — enrichissement :** contenu et fonctions produit à faire après stabilisation.

### Définition de Done

Une case ne peut être cochée que si :

- le comportement est implémenté dans le vrai parcours, pas seulement dans une
  classe ou un test isolé ;
- l'UI, le store et la base partagent la même source de vérité ;
- les mutations critiques sont atomiques et idempotentes ;
- les erreurs, doubles clics, refresh, retour navigateur et coupures réseau sont
  couverts lorsque le flux est concerné ;
- au moins un test comportemental échoue sans le correctif et passe avec lui ;
- les états chargement, vide, succès, erreur et capacité maximale sont traités ;
- le clavier, le tactile, le zoom 200 % et les petits écrans restent utilisables ;
- la règle utilisateur et la documentation durable sont mises à jour.

## Résultats vérifiés pendant l'audit

### Socle présent

- React, React Router, TypeScript, Zustand, Vite, Vitest et Playwright sont en place.
- La carte et une partie des tirages utilisent un générateur pseudo-aléatoire seedé.
- Auth, mode invité, repositories Supabase, migrations, profil, daily, maîtrise,
  améliorations, inventaire et panneau admin ont déjà une interface.
- Le code contient 10 champions jouables, 6 biomes et des catalogues d'objets, de
  runes et d'augments.
- Les routes sont chargées paresseusement et un Error Boundary est présent.
- `npm audit --omit=dev` ne remonte aucune vulnérabilité de production.

### Validations et limites constatées

- Formatage, lint et typecheck passent.
- Les 582 tests Vitest passent, avec 3 tests live Supabase ignorés.
- Le build Vite de production passe sur le poste audité.
- `npm run check` échoue néanmoins : la couverture de `src/services/**` est à
  27,98 % pour un seuil de 28 %. La couverture globale des lignes est de 55,77 %.
- Le seul test Playwright passe, mais termine les nœuds en manipulant directement
  les stores ; il ne joue ni les encounters ni les combats.
- L'audit npm complet remonte 6 vulnérabilités d'outillage de développement :
  2 critiques, 1 haute et 3 modérées, liées à Vite/Vitest et leurs dépendances.
- Les parcours 375×667, 390×844 et 1280×720 révèlent des actions coupées ou
  recouvertes sur Auth, Menu, Starter, Combat, Database et Game Over.
- Le build local voit environ 17 Mo d'assets Riot ignorés par Git. Le dépôt ne
  versionne pas ces fichiers alors que la documentation affirme le contraire.
- Les ACL/policies de l'instance Supabase locale et les migrations/RPC ont été lues,
  mais aucun `db reset` destructif n'a été lancé sur cette instance existante.
- Cet audit montre que les résultats envoyés par le navigateur sont encore trop
  largement considérés comme fiables ; les tests live hostiles restent à écrire.

---

## P0 — sécurité et intégrité des données

### P0-SEC-01 — Rendre le serveur autoritaire sur la progression

**Constat initial :** les grants/policies permettaient à un utilisateur authentifié
de modifier ses compteurs `players`, d'écrire sa maîtrise et ses unlocks, ou
d'insérer des runs. `save_completed_run` acceptait des statistiques et candies
calculées par le client. `unlock_champion_enhancement` acceptait le coût, le rang
maximal et l'identité du nœud envoyés par le client.

**État au 23 juillet 2026 :** le durcissement des droits et des commandes est
implémenté. Les nouvelles runs sont volontairement marquées `client_reported` :
leurs récompenses sont calculées par PostgreSQL, mais la réalité du combat n'est pas
encore rejouée côté serveur. Le ticket reste donc ouvert jusqu'à l'attestation du
gameplay.

- [x] Ajouter une migration corrective append-only ; ne jamais réécrire une
  migration déjà potentiellement appliquée en production.
- [x] Révoquer les écritures directes sur les colonnes dérivées de `players`
  (`level`, runs, victoires, vagues, candies et statistiques).
- [x] Révoquer les mutations directes de `champion_mastery`, `player_unlocks`,
  `runs` et `run_team_members` pour les rôles client.
- [x] Révoquer aussi les mutations directes de `champion_enhancements` et les
  anciens RPC de sauvegarde, d'équipement et d'achat pour `anon`/`authenticated`.
- [x] Ne garder que des RPC étroites pour les mutations de progression.
- [x] Retirer des repositories et modèles client les méthodes d'écriture directe
  devenues interdites.
- [x] Calculer côté serveur les candies, statistiques joueur, mastery, survivants et
  compteurs à partir d'un résultat validé.
- [x] Stocker un catalogue serveur versionné des améliorations et y résoudre coût,
  rang maximal, niveau de maîtrise et prérequis.
- [x] Rejeter tout champion, nœud, rang, coût ou identifiant qui n'appartient pas au
  catalogue canonique.
- [x] Ajouter une clé d'idempotence par commande et tester deux appels concurrents.
- [x] Rendre les replays stables après rotation du ruleset et renvoyer les valeurs
  réellement persistées.
- [x] Figer et persister le payload de fin de run avant le premier envoi afin que
  tout retry, y compris après rechargement, rejoue strictement la même commande.
- [x] Réutiliser la même commande d'achat après une réponse perdue et réconcilier
  l'état/solde canonique sans second débit.
- [x] Afficher les récompenses serveur pour les comptes connectés et ne jamais
  présenter un calcul local spéculatif comme une progression enregistrée.
- [x] Propager les types Supabase générés aux repositories et distinguer
  explicitement `auth.users.id` de `players.id` dans leurs contrats.
- [x] Ajouter des tests SQL adversariaux avec les rôles `anon` et `authenticated`.
- [ ] Créer un `run_attempt` côté serveur au démarrage avec seed, ruleset, équipe et
  séquence attendue figés.
- [ ] Enregistrer des commandes de partie séquencées et rejouer le moteur
  déterministe dans une Edge Function ou un service de confiance.
- [ ] Réserver `progression_source = 'verified'` aux résultats rejoués et décider si
  les runs `client_reported` peuvent encore créditer une progression permanente.
- [ ] Auditer ou recalculer la progression historique héritée : les valeurs
  antérieures à la migration ne peuvent pas être distinguées rétroactivement des
  valeurs éventuellement forgées sans règle produit de remise à niveau.

**Acceptation intermédiaire atteinte :** un client ne peut plus écrire directement
la progression, choisir ses candies, son coût d'amélioration ou son rang. Les
écritures valides passent une seule fois, y compris sous concurrence.

**Acceptation finale restante :** un client modifié ne peut pas fabriquer une run
plausible pour recevoir des récompenses ; seules les runs rejouées et vérifiées côté
serveur créditent la progression.

### P0-SEC-02 — Sécuriser le daily leaderboard

**Constat :** `submit_daily_run` accepte une seed choisie par le client et des
métriques très larges. La date locale du navigateur diverge de `CURRENT_DATE`/UTC,
et le réglage de difficulté local change le combat sans séparer les classements.

- [ ] Définir le jour daily en UTC côté serveur et exposer date, seed et expiration
  depuis une seule source.
- [ ] Dériver la seed côté serveur à partir de la date et d'une version de ruleset.
- [ ] Fixer difficulté, contenu et version du calcul de score pour tous les joueurs.
- [ ] Créer l'attempt côté serveur au lancement et l'associer au résultat soumis.
- [ ] Rendre la règle « une tentative » ou « meilleur score » explicite et atomique.
- [ ] Rendre atomiques/cohérentes la sauvegarde de run normale et la soumission daily
  afin qu'un échec de la seconde ne laisse pas l'utilisateur dans un état bloqué.
- [ ] Ne jamais publier un abandon sauf si cette règle produit est volontaire.
- [ ] Valider les métriques par rapport aux limites réelles d'une run et non avec
  des plafonds arbitraires.
- [ ] Prévoir une stratégie d'autorité suffisante avant de qualifier le classement
  de compétitif : exécution serveur, journal d'actions vérifiable ou attestation.
- [ ] Tester trois fuseaux horaires, minuit UTC, double soumission, seed falsifiée,
  difficulté modifiée et payload extrême.
- [ ] Exposer une vue de leaderboard minimale et sanitisée qui restitue réellement
  les noms publics sans contourner la RLS de `players`.
- [ ] Encapsuler le fallback `localStorage` invité et traiter quota, mode privé et
  `SecurityError`.

**Acceptation :** deux joueurs au même instant reçoivent la même run et les scores
incompatibles avec son ruleset sont refusés.

### P0-SEC-03 — Mettre à niveau l'outillage vulnérable

- [ ] Planifier la montée conjointe Vite/Vitest/coverage vers des versions corrigées.
- [ ] Vérifier les breaking changes, Node 22, les plugins Vite et la configuration de
  couverture avant merge.
- [ ] Confirmer `npm audit` sans vulnérabilité critique/haute, ou documenter une
  exception bornée avec exposition et échéance.
- [ ] Ne jamais exposer le serveur Vite/Vitest de développement sur un réseau non
  maîtrisé tant que les versions vulnérables restent installées.

**Acceptation :** les validations restent vertes après upgrade et aucune alerte
critique/haute non acceptée ne demeure.

### P0-SEC-04 — Réduire les données publiques et durcir les logs

**Constat :** la vue leaderboard publique expose notamment `last_login_at` et les
candies. Un utilisateur peut insérer certains logs sans `user_id`, la sanitation des
détails est superficielle et aucune rétention serveur n'est définie.

- [ ] Définir le contrat public minimal des leaderboards et supprimer toute donnée
  non nécessaire, notamment la dernière connexion.
- [ ] Forcer l'identité d'un log à `auth.uid()` côté serveur ; ne jamais accepter
  l'identité déclarée par le payload.
- [ ] Ajouter quotas/rate limiting, taille maximale et politique de rétention.
- [ ] Sanitize récursivement messages, stack et metadata avant envoi.
- [ ] Borner le retry des logs et éviter toute réinsertion infinie du même lot.
- [ ] Désactiver le logging DB par défaut dans l'exemple d'environnement.
- [ ] Tester spam, payload volumineux, secrets imbriqués et usurpation d'identité.

**Acceptation :** seules les données nécessaires sont publiques et un client ne peut
ni usurper/anonymiser son identité de log, ni saturer durablement la table.

## P0 — fin de run, sauvegarde et machine d'état

### P0-RUN-01 — Garantir la fin de run en victoire comme en défaite

**Constat :** en défaite, `CombatPage` navigue vers Game Over puis planifie
`endRun`. Le démontage de la page annule ce timeout : la run peut rester active,
sans sauvegarde ni récompense.

- [ ] Déplacer l'orchestration de fin hors du cycle de vie de `CombatPage`.
- [ ] Finaliser et persister la run avant la navigation vers Game Over.
- [ ] Rendre la commande `endRun` idempotente et observable (`idle`, `saving`,
  `saved`, `failed`, `retrying`).
- [ ] Sauvegarder run, équipe, loadout, runes, augments, statistiques et progression
  dans une seule transaction ; supprimer le second RPC « best effort » du loadout.
- [ ] Toujours recopier les PV/PM finaux, y compris après une défaite.
- [ ] Persister un snapshot de résumé ou un identifiant de résultat afin que
  `/game-over` survive à un refresh.
- [ ] Ne réinitialiser l'état actif qu'après confirmation durable de sauvegarde, ou
  après mise en file locale d'une outbox récupérable.
- [ ] Ajouter une reprise explicite si le navigateur recharge pendant `saving`.
- [ ] Tester victoire, défaite, abandon, double appel, navigation immédiate, timeout,
  erreur réseau et retry.

**Acceptation :** chaque run produit exactement un résultat durable ; aucune
navigation ou fermeture de composant ne peut annuler la finalisation.

### P0-RUN-02 — Empêcher l'écrasement d'une run active

**Constat :** `startRun` peut lancer `endRun` sans attendre son résultat, puis
remplacer l'état. Le flux Daily est accessible pendant une run et peut déclencher ce
cas. Le store accepte aussi une équipe vide, des doublons et des IDs inconnus.

- [ ] Faire retourner un `Result` typé et asynchrone à `startRun`/`endRun`.
- [ ] Refuser une nouvelle run tant que sauvegarde ou abandon n'a pas abouti.
- [ ] Demander une confirmation unique avant Normal, Daily, logout ou nouvelle run.
- [ ] Annuler la navigation et conserver l'ancienne run si la sauvegarde échoue.
- [ ] Valider côté domaine une équipe non vide, unique, connue et conforme au nombre
  de slots débloqués.
- [ ] Rendre les garde-routes dépendantes de la machine d'état, pas de conditions
  dispersées dans les pages.
- [ ] Tester erreur réseau, double clic, deux onglets et accès direct par URL.

**Acceptation :** aucune commande ou route ne peut remplacer silencieusement une run
active ou créer un état de départ invalide.

### P0-RUN-03 — Fermer l'exploitation de la carte

**Constat :** dès qu'un parent est complété, ses différents enfants restent
accessibles. Le joueur peut nettoyer plusieurs branches, rejouer le shop après
refresh et accumuler des récompenses hors chemin roguelike.

- [ ] Modéliser explicitement la position courante, les arêtes autorisées et le
  frontier choisi.
- [ ] Exiger que `moveToNode` suive une arête depuis le nœud courant.
- [ ] Verrouiller définitivement les branches sœurs après le choix d'une branche.
- [ ] Vérifier que le `pendingEncounter.nodeId` correspond au nœud courant avant
  toute résolution.
- [ ] Rendre la résolution et la collecte idempotentes par nœud.
- [ ] Persister le stock, les achats et l'état visité d'un shop dans la run.
- [ ] Unifier le rôle des nœuds `Start`, `Exit` et `Boss` entre types, générateur,
  légende et transitions de biome.
- [ ] Ne pas choisir arbitrairement le « premier nœud accessible » après résolution.
- [ ] Ajouter des tests de propriétés : pas de saut, pas de sibling farm, pas de
  replay, pas de double claim, y compris après refresh.

**Acceptation :** une run suit un chemin continu unique et la somme maximale de
récompenses est bornée par ce chemin.

### P0-RUN-04 — Corriger les pertes et gains silencieux

**Constats :**

- un `stat_boost` transforme un champion aux PV implicites complets en champion à
  `0 HP` ;
- Shop dépense l'or avant de savoir si l'objet ou le champion peut être ajouté ;
- Treasure, Event et Combat annoncent un objet même si l'inventaire est plein ;
- une run authentifiée à zéro vague peut recevoir des candies côté serveur alors que
  le mode invité n'en reçoit pas.

- [ ] Définir un invariant unique : PV absents = PV maximum, ou matérialiser les PV
  dès le début de run.
- [ ] Remplacer les retours chaîne vide/booléen par des `Result` typés contenant le
  motif d'échec.
- [ ] Valider capacité et invariants avant de débiter, puis effectuer
  dépense+ajout+claim dans une commande atomique.
- [ ] Proposer un choix cohérent en capacité maximale : remplacer, vendre,
  convertir en or ou laisser l'objet.
- [ ] Afficher une récompense uniquement après confirmation de son ajout.
- [ ] Définir une table unique de récompenses pour abandon immédiat, abandon après
  progression, défaite et victoire.
- [ ] Appliquer exactement cette table en local, dans l'UI et dans la RPC.
- [ ] Tester inventaire/équipe pleins, double clic, refresh, event positif sur
  champion sain/blessé/KO et run à zéro combat.

**Acceptation :** aucun PV, objet, champion, or ou candy ne peut être perdu, dupliqué
ou affiché à tort.

## P0 — livraison et accessibilité du parcours d'entrée

### P0-REL-01 — Livrer réellement les assets Riot

**Constat :** `.gitignore` exclut `public/lol/data/`. Le poste local contient environ
17 Mo d'images et JSON, mais Git ne suit essentiellement que
`champions-parsed.json`. Un build ou déploiement depuis un clone propre n'a donc pas
les assets que le README dit versionnés.

- [ ] Choisir une stratégie reproductible : assets minimaux versionnés, téléchargement
  vérifié en CI/build, ou CDN explicite avec fallback.
- [ ] N'embarquer que les champions, sorts et objets réellement utilisés si le poids
  complet n'est pas justifié.
- [ ] Ajouter intégrité/version/checksum au manifeste Data Dragon.
- [ ] Corriger les chemins relatifs d'assets pour les routes profondes.
- [ ] Déplacer `champions-parsed.json` dans un répertoire importable sous `src`
  (ou le charger par URL) au lieu de l'importer depuis `public`, ce que Vite signale
  à chaque démarrage du serveur de développement.
- [ ] Vérifier la CSP pour chaque origine réellement utilisée, y compris la police.
- [ ] Ajouter un test depuis un clone propre qui build puis vérifie les URLs
  critiques sans profiter de fichiers ignorés.
- [ ] Aligner `.gitignore`, `README.md`, `docs/assets.md` et la réalité du pipeline.

**Acceptation :** le même commit produit les mêmes assets sur une machine vierge et
aucun champion/objet requis n'affiche une image cassée.

### P0-UX-01 — Rendre Auth et Menu utilisables sur petit écran

**Constat :** les deux pages sont en `position: fixed` avec `overflow: hidden` et un
footer superposé. Sur 375×667 et 390×844, le bouton invité/login est recouvert ;
Playwright confirme que le footer intercepte le clic. À 1280×720, plusieurs actions
sortent également du viewport.

- [ ] Remplacer les conteneurs bloqués par un shell avec `min-height: 100dvh`,
  scroll vertical et gestion des safe areas.
- [ ] Remettre le footer dans le flux du document.
- [ ] Compacter/recomposer le menu selon la hauteur disponible.
- [ ] Préserver une cible de 44 px sans étirer les boutons sur toute la hauteur.
- [ ] Tester connexion, inscription et invité à 320×568, 375×667, 390×844,
  1280×720 et zoom 200 %.

**Acceptation :** toutes les actions sont visibles, focalisables et activables sans
chevauchement à chacun de ces formats.

### P0-UX-02 — Réparer la sélection Starter/Runes sur mobile

**Constat :** le `fieldset` de runes et le CTA restent côte à côte sans layout
mobile. À 390 px, les runes occupent environ 123 px de large et le bouton est étiré
sur environ 794 px de haut.

- [ ] Concevoir le bloc rune comme un vrai groupe de choix responsive.
- [ ] Passer les actions en colonne sous le breakpoint mobile.
- [ ] Garder le CTA entre 44 et 56 px de haut et éventuellement sticky sans masquer
  le dernier choix.
- [ ] Réduire la longueur de la page : cartes compactes, accordéon/détail ou grille
  adaptée au lieu de splashes géants.
- [ ] Styliser et aligner le bouton Retour avec le design du produit.
- [ ] Tester sélection, erreur et confirmation au clavier et au tactile dès 320 px.

**Acceptation :** aucune description n'est réduite à une colonne illisible, aucun
bouton n'est étiré ou superposé, et la sélection complète reste réalisable.

---

## P1 — moteur de combat fiable

### P1-GAME-01 — Centraliser validation et ciblage des actions

**Constat :** la cible par défaut `all` transforme des sorts mono-cible en AoE. Les
heals/shields peuvent sélectionner un allié aléatoire et certains effets ignorent
la cible choisie. Le moteur ne rejette pas toujours une action invalide avant son
coût/cooldown.

- [ ] Définir un résolveur de cibles canonique pour `self`, `ally`, `allies`,
  `enemy`, `enemies` et `area`.
- [ ] Dériver les cibles proposées dans l'UI de ce même résolveur.
- [ ] Valider acteur vivant, tour, mana, cooldown, rang, type de cible et cible
  vivante avant toute mutation.
- [ ] Ne consommer mana/cooldown que si l'action est acceptée.
- [ ] Utiliser coût et cooldown du rang courant, pas systématiquement l'index 0.
- [ ] Ajouter l'attaque de base et les actions réellement autorisées à une API de
  commandes unique.
- [ ] Couvrir la matrice de ciblage et les payloads falsifiés par des tests.

**Acceptation :** aucune action envoyée manuellement au store/moteur ne peut
contourner les règles visibles dans l'UI.

### P1-GAME-02 — Connecter réellement effets et passifs

**Constat :** les passifs champions ne sont pas appelés dans le combat. `execute`
n'est pas résolu par `BattleManager`. Buffs/debuffs sont ajoutés à `EffectManager`
mais leurs stats, ticks et expirations ne sont pas consultés. Slow, silence et snare
n'ont pas leur effet annoncé.

- [ ] Établir un cycle de tour documenté : début, contrôle, choix, cast/attaque,
  événements, dégâts/soins, mort, fin et tick des durées.
- [ ] Brancher `EffectManager` à la lecture des stats, à `canAct`, `canCast`, vitesse,
  ticks, stacks, dispels et expiration.
- [ ] Implémenter les types publiés : dégâts, heal, shield, execute, CC, buff,
  debuff, DoT, HoT et revive.
- [ ] Brancher chaque passif champion aux événements utiles.
- [ ] Normaliser les unités (`0.30` contre `30 %`) avec des types ou helpers dédiés.
- [ ] Retirer/masquer temporairement tout contenu dont le handler n'existe pas.
- [ ] Écrire un test comportemental par famille d'effet et au moins un test par
  passif champion.

**Acceptation :** aucune description de champion publiée ne promet un effet absent
du moteur.

### P1-GAME-03 — Faire des runes, augments, objets et améliorations de vraies règles

**Constat :** les runes sont évaluées une seule fois au début avec un contexte
factice. Seuls certains bonus de stats des augments/objets sont lus. Les hooks
`on_hit`, `on_kill`, heal de fin, revive, gold/discount, réduction de dégâts et
consommables sont généralement inertes. Les effets spéciaux des arbres
d'amélioration ne sont qu'affichés.

- [ ] Créer un bus d'événements de combat/run commun et typé.
- [ ] Lister les triggers officiellement supportés par chaque catalogue.
- [ ] Réévaluer conditions, stacks, cooldowns et durées au bon événement.
- [ ] Intégrer multiplicateurs de dégâts, réduction, gold, soin post-combat, revive,
  on-hit/on-kill/turn-start et consommables.
- [ ] Consommer les potions et autres objets à usage unique.
- [ ] Appliquer `unique`, `stackable` et `maxStacks` dans la commande d'inventaire.
- [ ] Mapper les clés d'amélioration (`atk`, `def`, `ap`, `spd`, `mr`, etc.) vers un
  modèle de stats unique, validé à la compilation.
- [ ] Charger les améliorations au bootstrap du compte, sans imposer une visite à
  la page Database.
- [ ] Ajouter une validation de catalogue qui refuse tout effet sans handler.
- [ ] Ajouter des tests d'intégration par trigger, durée, stack, consommation et
  revive.

**Acceptation :** une entrée disponible au joueur est soit pleinement appliquée et
testée, soit explicitement marquée indisponible.

### P1-GAME-04 — Corriger l'autoplay et les commandes clavier du combat

**Constat :** l'autoplay démarre actif et peut jouer en 400 ms, ce qui rend le choix
manuel de cible presque impossible. Le hook global intercepte Entrée/Espace même
sur des boutons ; les contrôles Auto et Vitesse ne répondent pas correctement et
une touche peut déclencher deux actions.

- [ ] Mettre l'autoplay désactivé par défaut, ou le mettre en pause à chaque décision
  du joueur.
- [ ] Afficher clairement qui agit et le délai avant action automatique.
- [ ] Ignorer `button`, `a`, contrôles ARIA et `contenteditable` dans les raccourcis
  globaux.
- [ ] Gérer propagation et `preventDefault` au niveau approprié.
- [ ] Documenter les raccourcis et permettre de les désactiver.
- [ ] Tester tous les contrôles au clavier sans double action.

**Acceptation :** le mode manuel est réellement jouable et chaque touche produit au
plus une commande attendue.

## P1 — progression, économie et contenu d'une run

### P1-RUN-01 — Corriger niveaux de run, vagues et choix d'augment

**Constat :** `runLevel` augmente principalement après le boss final. Les cinq
premiers biomes finissent par `Exit`, donc le niveau reste à 1 et l'augment peut être
proposé seulement quand la run est déjà finie.

- [ ] Définir la cadence officielle : par combat, étage, sortie de biome ou boss.
- [ ] Unifier progression de `runLevel`, `currentWave` et `currentBiome` dans une
  seule transition.
- [ ] Réinitialiser ou non la vague entre biomes selon une règle documentée.
- [ ] Déclencher le choix d'augment avant le prochain contenu, jamais après la fin.
- [ ] Générer des choix seedés, sans doublon illégal et avec poids de rareté.
- [ ] Persister un choix en attente et le restaurer après refresh.
- [ ] Tester la séquence complète attendue sur les six biomes.

**Acceptation :** un tableau de référence `nœud → vague → niveau → augment` est
identique avant/après reload.

### P1-RUN-02 — Unifier difficulté, ennemis et récompenses

**Constat :** les récompenses Combat sont en partie hardcodées et ignorent celles de
l'encounter. Les élites ressemblent aux combats normaux, les multiplicateurs de
biome ne sont pas tous appliqués et le niveau ennemi reste souvent à 1.

- [ ] Créer un résolveur unique de rencontre à partir de seed, biome, type de nœud,
  vague, niveau et difficulté.
- [ ] Utiliser `goldReward`, `itemDropChance` et les données de l'encounter.
- [ ] Donner aux élites et boss une composition/mécanique/récompense distincte.
- [ ] Appliquer une formule versionnée de scaling à toutes les stats concernées.
- [ ] Définir si les champions KO reçoivent de l'XP et aligner texte et code.
- [ ] Vérifier la capacité avant d'annoncer un drop.
- [ ] Construire des simulations seedées de difficulté et de courbe économique.

**Acceptation :** pour une seed donnée, l'UI, le store, le résumé et la base
rapportent exactement les mêmes ennemis et récompenses.

### P1-RUN-03 — Construire un ledger de statistiques fiable

**Constat :** le tracker est remis à zéro après chaque combat et n'est pas persisté.
Les dégâts avant shield et heals avant overheal sont surcomptés. `gold_earned`
correspond à l'or restant et `items_collected` est sauvegardé vide.

- [ ] Déplacer les statistiques dans l'état versionné de la run.
- [ ] Reset uniquement au vrai début/à la vraie fin de run.
- [ ] Enregistrer les deltas effectifs de PV, shields, overheal, kills et assists.
- [ ] Séparer gains, dépenses et solde d'or.
- [ ] Journaliser objets trouvés, achetés, vendus, équipés et consommés.
- [ ] Inclure toute l'équipe dans le résumé, même sans événement de combat.
- [ ] Calculer UI, DB, maîtrise et analytics depuis ce ledger unique.
- [ ] Ajouter un golden test de trois combats avec refresh et comparer chaque champ
  UI/RPC/tables.

**Acceptation :** le résumé est une somme exacte de toute la run et survit à un
refresh.

### P1-RUN-04 — Renforcer les invariants équipe, inventaire et sorts

- [ ] Refuser champion inconnu, doublon illégal et dépassement de taille d'équipe.
- [ ] Refuser l'équipement sur un champion hors équipe.
- [ ] Centraliser les contraintes unique/stackable/capacité/slots.
- [ ] Valider les rangs et niveaux de déblocage avant une amélioration de sort.
- [ ] Ne pas consommer un choix d'amélioration sur un sort déjà au rang maximal.
- [ ] Mettre en file plusieurs choix si plusieurs niveaux sont gagnés.
- [ ] Ajouter des property tests sur les commandes de domaine et la réhydratation.

**Acceptation :** aucune API publique du store ni donnée persistée corrompue ne peut
créer un état interdit.

## P1 — maîtrise et progression permanente

### P1-META-01 — Définir un contrat clair pour la maîtrise

**Constat :** les docs se contredisent sur la progression invité. Le bonus de stats
de maîtrise n'est pas appliqué au combat. Les unlocks `starter_slot`/`chroma` ne
contiennent pas les IDs nécessaires et Starter ignore les unlocks.

- [ ] Décider et documenter la persistance invité et la politique lors de la création
  d'un compte : aucune fusion, import explicite ou fusion contrôlée.
- [ ] Réinitialiser/namespace correctement les caches au logout et au changement de
  compte.
- [ ] Charger profil, maîtrise et améliorations après Auth avant d'autoriser le jeu.
- [ ] Appliquer le bonus de maîtrise à travers le calculateur de stats canonique.
- [ ] Donner aux unlocks des cibles concrètes (`championId`, `skinId`, nombre de
  slots) et les valider côté serveur.
- [ ] Faire respecter les slots/unlocks sur Starter, pas seulement dans l'affichage.
- [ ] Ajouter l'UI réellement nécessaire aux skins/chromas ou retirer ces promesses.
- [ ] Rendre l'arbre d'amélioration `aria-busy`, attendre la mutation et bloquer le
  double clic jusqu'au résultat.
- [ ] Resynchroniser la branche active lors du changement de champion et afficher
  succès/échec sans dépendre uniquement d'un toast fugace.
- [ ] Tester gain de niveau, unlock, refresh, logout/login, deux comptes et invité.

**Acceptation :** franchir un seuil produit exactement l'effet annoncé après reload,
sans fuite entre comptes.

### P1-META-02 — Unifier les stats et améliorations

- [ ] Remplacer les alias multiples de stats par un schéma canonique partagé entre
  champions, items, runes, augments, maîtrise et arbres.
- [ ] Distinguer bonus plat, pourcentage additif et multiplicateur.
- [ ] Fixer l'ordre de calcul et les caps dans une spécification testée.
- [ ] Afficher une comparaison avant/après lors d'un équipement ou déblocage.
- [ ] Ajouter un test par nœud d'amélioration et palier de maîtrise réellement
  disponible.

**Acceptation :** chaque bonus modifie la stat attendue une seule fois et la valeur
affichée égale celle utilisée en combat.

## P1 — persistance, offline et récupération

### P1-DATA-01 — Versionner et valider l'état local

**Constat :** la réhydratation fait un merge superficiel ; un objet ancien ou
corrompu peut remplacer des defaults. Le combat et le tracker ne sont pas persistés,
et `saveStatus: saving` peut rester bloqué après refresh.

- [ ] Ajouter un numéro de schéma à chaque store persisté.
- [ ] Valider les payloads avec un schéma runtime avant réhydratation.
- [ ] Écrire une migration par version et une quarantaine/reset explicite si
  migration impossible.
- [ ] Ne pas persister un statut transitoire sans stratégie de récupération.
- [ ] Persister un checkpoint de combat déterministe ou définir un abandon/replay
  non exploitable.
- [ ] Empêcher qu'un refresh restaure les PV pré-combat et permette de recommencer
  gratuitement la même rencontre.
- [ ] Ajouter une outbox idempotente pour les résultats hors ligne si ce cas est
  supporté.
- [ ] Tester refresh sur carte, chaque encounter, choix d'augment, tour combat,
  récompense, sauvegarde et Game Over.

**Acceptation :** chaque refresh restaure un état cohérent ou propose une
récupération explicite, jamais un état partiel exploitable.

### P1-DATA-02 — Réduire les sources de vérité concurrentes

- [ ] Réduire `dailyRunStore` aux métadonnées daily si `runStore` pilote le gameplay.
- [ ] Faire passer le vrai flux par `EffectManager`, `RuneManager`,
  `AugmentManager` et le résolveur d'inventaire, ou supprimer les versions mortes.
- [ ] Retirer/déprécier `EncounterManager` et `InventoryManager` si leurs règles sont
  dupliquées ailleurs.
- [ ] Éviter les singletons mutables hors Zustand pour les données de run.
- [ ] Documenter un propriétaire unique par donnée et une seule commande de mutation.

**Acceptation :** les unités testées sont celles appelées en production ; il
n'existe plus deux implémentations divergentes d'une même règle.

### P1-DATA-03 — Fiabiliser Auth, profil et changement d'identité

**Constat :** login/session peuvent déclarer l'utilisateur authentifié alors que le
profil joueur n'a pas pu être chargé, ce qui rend ensuite la sauvegarde impossible.
Le listener Auth vit au niveau module, n'est pas désabonné et ses réponses
asynchrones peuvent arriver après un changement de compte. Le passage en invité
peut commencer avant la fin de sauvegarde de la run courante.

- [ ] Modéliser séparément `session`, `profileLoading`, `ready`,
  `profileUnavailable`, `guest` et `signedOut`.
- [ ] Ne pas autoriser une run connectée tant que le profil durable n'est pas prêt.
- [ ] Récupérer/créer le profil par un flux idempotent et réessayable.
- [ ] Monter/démonter l'abonnement Auth dans le bootstrap React.
- [ ] Ignorer toute réponse async associée à une session devenue obsolète.
- [ ] Attendre la fin/abandon de la run avant logout, changement de compte ou invité.
- [ ] Traiter explicitement l'erreur retournée par `signOut`.
- [ ] Utiliser l'adapter de stockage sûr pour le drapeau invité.
- [ ] Garder les récompenses connectées en attente jusqu'à confirmation serveur,
  puis réhydrater la progression canonique.
- [ ] Tester perte réseau, profil absent, logout refusé, changement rapide de compte,
  deux onglets et race Auth/save.

**Acceptation :** aucune sauvegarde n'est attribuée à la mauvaise identité et l'état
« connecté sans profil » ne peut pas entrer dans le jeu.

## P1 — responsive et cohérence visuelle

### P1-UX-01 — Créer un shell responsive commun

- [ ] Créer des primitives partagées : `PageShell`, header, footer, panel, bouton,
  dialogue, tabs, champ, empty/error/loading state.
- [ ] Remplacer les layouts `fixed`/`100vh` par `100dvh`, scroll local explicite et
  safe areas.
- [ ] Définir breakpoints par besoin du contenu, pas par appareil.
- [ ] Réduire les styles inline afin de rendre états et media queries testables.
- [ ] Ajouter des tokens communs d'espacement, rayons, typographie, couleurs, focus,
  succès, avertissement et danger.
- [ ] Choisir une direction visuelle unique entre l'univers or/serif du menu et les
  écrans slate/sans du jeu.
- [ ] Supprimer l'`@import` Google Cinzel bloqué par la CSP, ou auto-héberger une
  police optimisée et licenciée avec fallback système.

**Acceptation :** les pages partagent les mêmes composants et aucune action
principale ne dépend d'un positionnement absolu fragile.

### P1-UX-02 — Réparer les écrans de jeu mobiles

- [ ] Combat : faire reflow du header ; le contrôle Auto est actuellement hors écran
  à 390 px et la page dépasse horizontalement.
- [ ] Combat : garder équipes, tour, actions et journal compréhensibles à 320 px.
- [ ] Game Over : rendre le contenu scrollable et aligné en haut ; avec cinq
  champions, le titre est actuellement au-dessus du viewport.
- [ ] Game Over : utiliser titre, couleur et son selon victoire/défaite ; ne pas jouer
  systématiquement le son de défaite.
- [ ] Database : remplacer la sidebar fixe de 260 px par vue empilée/drawer sous
  768 px ; les détails n'ont actuellement qu'environ 130 px à 390 px.
- [ ] Daily leaderboard : supprimer la largeur minimale qui crée un overflow.
- [ ] Carte : simplifier le header et les informations d'équipe sur petit écran.
- [ ] Event/Shop/Rest/Treasure : vérifier scroll, décisions, confirmation et retour
  avec contenu long et hauteur réduite.
- [ ] Créer un `EncounterLayout` scrollable commun ; supprimer les conteneurs
  absolus centrés qui coupent Recruit, Rest, Event et Treasure.
- [ ] Rest : supprimer le doublon d'actions « Continue »/« Done » après le soin.
- [ ] Ajouter des snapshots visuels aux tailles 320×568, 375×667, 390×844,
  768×1024, 1280×720 et 1440×900.

**Acceptation :** aucune page n'a de scroll horizontal involontaire, d'action
masquée ou de texte inutilisable sur la matrice cible.

### P1-UX-03 — Unifier langue et terminologie

**Constat :** français et anglais sont mélangés dans un même parcours (`Play`,
`Gold`, `Empty`, `Équipe`, `Game Over`, etc.), ainsi que HP/PV, MP/PM, run/partie.

- [ ] Choisir la langue de lancement ; recommandation : français complet pour la
  première bêta.
- [ ] Extraire toutes les chaînes dans un dictionnaire i18n, même avec une seule
  locale initiale.
- [ ] Définir un glossaire produit pour PV/PM, or, candies, run, encounter, élite,
  boss, maîtrise et améliorations.
- [ ] Uniformiser labels, erreurs, confirmations, raccourcis, sons et aria-labels.
- [ ] Prévoir pluriels, nombres et dates via `Intl`.
- [ ] Ajouter un test qui repère les chaînes brutes dans les écrans migrés.

**Acceptation :** un parcours complet n'affiche qu'une langue et une terminologie
stable.

### P1-UX-04 — Corriger feedback et vérité de l'interface

- [ ] Ne jamais afficher succès/récompense avant confirmation de la commande.
- [ ] Donner aux erreurs une action utile : réessayer, revenir, libérer un slot ou
  se reconnecter.
- [ ] Afficher les états de chargement/synchronisation du profil et des saves.
- [ ] Garder les erreurs critiques persistantes avec `role=alert`, fermeture et
  retry ; ne pas les effacer automatiquement après cinq secondes.
- [ ] Distinguer clairement local invité, connecté, offline et classement officiel.
- [ ] Remplacer les valeurs par défaut trompeuses de Game Over lors d'un accès
  direct par un état « résultat introuvable ».
- [ ] Corriger la barre HP de carte qui affiche full visuellement mais `0/max` dans
  le texte quand `currentHp` est absent.
- [ ] Montrer pourquoi une action est désactivée, son coût et ses conséquences.
- [ ] Afficher noms, rangs, effets avant/après et contraintes pour les upgrades de
  sorts au lieu de `Q/W/E/R` seuls et d'identifiants bruts.
- [ ] Ajouter confirmations non destructives et éviter les dialogues répétés.
- [ ] Donner au profil un vrai loading/skeleton et un CTA de connexion en invité.

**Acceptation :** tout message reflète le résultat réel du domaine et l'utilisateur
sait comment sortir d'un échec.

## P1 — accessibilité

### P1-A11Y-01 — Sémantique, clavier et focus

- [ ] Utiliser de vrais `button`, `a`, `input`, `fieldset/legend` et listes avant
  d'ajouter des rôles à des `div`.
- [ ] Database : rendre les champions sélectionnables au clavier et labelliser la
  recherche.
- [ ] Auth/Database : implémenter `tablist`, `tab`, `aria-selected` et relations de
  panneaux.
- [ ] Settings : remplacer `display:none` du checkbox Particles par un masquage
  visuel qui conserve focus et annonce d'état.
- [ ] Rendre les tooltips d'équipement accessibles au focus et au tactile, ou les
  remplacer par un popover/dialog.
- [ ] Appliquer la même règle aux tooltips de sorts : focus, clic/tap, Échap,
  `aria-describedby` et placement dans le viewport.
- [ ] Ajouter focus initial, piège de focus et restitution du focus aux dialogues.
- [ ] Ajouter `aria-live` aux sauvegardes, erreurs et changements de récompense.
- [ ] Donner aux nœuds de carte un nom qui inclut position, type, état et conséquence.
- [ ] Donner aux barres PV/XP la sémantique `progressbar` et leurs valeurs.
- [ ] Masquer les SVG décoratifs aux technologies d'assistance ; nommer les SVG
  informatifs avec `title`.
- [ ] Mettre à jour le titre du document, déplacer le focus vers `main`/`h1` et
  annoncer chaque changement de route.
- [ ] Lancer un audit axe automatisé sur chaque route principale.

**Acceptation :** Auth → Starter → Map → encounter → Combat → Game Over est
réalisable au clavier seul sans perte de contexte ni double action.

### P1-A11Y-02 — Lisibilité et mouvement

- [ ] Vérifier les contrastes texte, placeholder, bordures, états disabled et focus
  selon WCAG AA.
- [ ] Supporter zoom 200 % et reflow sans perte d'information.
- [ ] Respecter `prefers-reduced-motion` dans CSS, particules canvas, transitions de
  carte, animations SVG/SMIL et animations de combat.
- [ ] Relier réellement les réglages taille de texte, particules, volume et vitesse
  à tous leurs consommateurs.
- [ ] Ne pas transmettre une information uniquement par couleur, animation ou son.
- [ ] Tester Windows High Contrast et navigation avec lecteur d'écran sur les flux
  critiques.

**Acceptation :** les critères WCAG 2.2 AA applicables aux parcours critiques sont
documentés et vérifiés.

## P1 — onboarding et règles compréhensibles

- [ ] Expliquer la boucle : choisir, avancer, résoudre, améliorer, combattre,
  terminer/sauvegarder.
- [ ] Transformer l'aide carte en tutoriel contextuel réouvrable.
- [ ] Expliquer cible, coût, cooldown, ordre des tours, statuts et autoplay au
  premier combat.
- [ ] Afficher avant validation les effets chiffrés d'une rune, d'un objet, d'un
  augment ou d'une amélioration.
- [ ] Clarifier différence Normal/Daily et ce qui est conservé en invité.
- [ ] Ajouter une encyclopédie filtrable seulement pour les mécaniques réellement
  actives.
- [ ] Mesurer le temps jusqu'au premier combat et le taux d'abandon du tutoriel
  uniquement après définition de la politique de télémétrie.

**Acceptation :** un nouveau joueur peut finir son premier combat sans documentation
externe et sans devoir deviner le sens d'une action.

---

## P2 — tests et qualité

### P2-TEST-01 — Remplacer les tests de présence par des tests de comportement

- [ ] Réécrire l'E2E « six biomes » pour piloter l'UI sans muter directement les
  stores ni marquer artificiellement les nœuds terminés.
- [ ] Ajouter deux parcours verticaux réels : victoire et défaite.
- [ ] Couvrir Normal, Daily, invité et compte authentifié.
- [ ] Jouer au moins une occurrence de Combat, Elite, Shop, Rest, Event, Treasure,
  Exit et Boss.
- [ ] Tester refresh, arrière navigateur, double clic et erreur réseau à chaque
  frontière critique.
- [ ] Ajouter des tests RLS/RPC live adversariaux dans l'environnement Supabase CI.
- [ ] Ajouter tests de state machine/property sur carte, inventaire et progression.
- [ ] Ajouter tests visuels et axe sur les viewports cibles.
- [ ] Éviter les assertions qui considèrent une case `[x]` de documentation comme
  preuve d'une fonctionnalité.

**Acceptation :** l'E2E échoue si un encounter, un combat ou une sauvegarde est
contourné et produit une trace lisible du parcours.

### P2-TEST-02 — Rendre la couverture utile et stable

- [ ] Corriger l'échec actuel à 27,98 % au lieu d'abaisser le seuil.
- [ ] Ajouter des tests d'orchestration à `runService`, `runStore`, `authStore`,
  `enhancementStore`, repositories et calculateur de stats.
- [ ] Inclure progressivement pages, composants et hooks critiques dans la mesure.
- [ ] Retirer les barrels/types sans logique des métriques si leur présence brouille
  le signal.
- [ ] Fixer des seuils par risque métier et les augmenter par paliers documentés.
- [ ] Garantir que la couverture ne varie pas selon l'ordre ou le parallélisme.
- [ ] Afficher un résumé court et conserver le rapport détaillé comme artefact CI.

**Acceptation :** `npm run check` passe de façon répétable et les modules de
sauvegarde/sécurité ont les seuils les plus élevés.

### P2-TEST-03 — Tester depuis un environnement propre

- [ ] Ajouter une job CI sans cache applicatif ni assets ignorés.
- [ ] Exécuter installation verrouillée, génération/téléchargement d'assets selon la
  stratégie retenue, format, lint, types, tests, build et E2E.
- [ ] Démarrer Supabase local, appliquer toutes les migrations append-only, lint le
  schéma et générer/vérifier les types.
- [ ] Tester upgrade depuis un snapshot de schéma antérieur, pas seulement un reset.
- [ ] Vérifier les headers/CSP, deep links SPA et 404 d'assets sur le build servi.

**Acceptation :** un clone vierge passe toute la pipeline sans fichier local caché.

## P2 — architecture et maintenabilité

### P2-ARCH-01 — Découper par responsabilités

Les fichiers les plus risqués sont notamment `CombatPage` (~928 lignes),
`BattleManager` (~764), `RunMapScreen` (~738), `runStore` (~710) et `AdminPage`
(~641), hors catalogues générés.

- [ ] Extraire de `CombatPage` l'orchestrateur, le presenter, les commandes,
  récompenses et transitions de fin.
- [ ] Séparer dans `BattleManager` validation, sélection de cible, résolution
  d'effet, événements et résultat.
- [ ] Découper `runStore` en machine d'état et slices sans multiplier les sources de
  vérité.
- [ ] Extraire de `RunMapScreen` le modèle de vue, le SVG, la sidebar et les dialogues.
- [ ] Découper Admin/Database en routes ou panneaux autonomes.
- [ ] Remplacer les styles inline répétés par composants et styles testables.
- [ ] Garder les données de catalogue hors des métriques de complexité du code
  applicatif.

**Acceptation :** chaque module a une responsabilité et des dépendances explicites ;
les transitions métier peuvent être testées sans rendre une page React.

### P2-ARCH-02 — Renforcer types, erreurs et observabilité

- [ ] Utiliser des unions discriminées pour commandes, résultats et erreurs domaine.
- [ ] Éliminer les casts qui transforment un `Exit` en faux encounter.
- [ ] Générer et vérifier les types Supabase depuis le schéma appliqué.
- [ ] Supprimer les modèles DB manuels concurrents et typer `SupabaseClient` avec les
  types générés dans tous les repositories.
- [ ] Faire passer les pages/services par les repositories ou assumer et documenter
  les exceptions ; supprimer le container d'injection/caching s'il reste décoratif.
- [ ] Casser le couplage circulaire `runStore` ↔ `runService`.
- [ ] Centraliser logs structurés sans données personnelles ni bruit en production.
- [ ] Ajouter capture des erreurs front et corrélation avec `runId`/commande, après
  validation de la politique de confidentialité.
- [ ] Définir budgets de log, rétention et accès admin.
- [ ] Ajouter des métriques techniques : échecs de save, retries, assets cassés,
  erreurs de réhydratation et durée des transitions.

**Acceptation :** une erreur critique est actionnable sans exposer de secret ni
nécessiter de reproduire manuellement toute la run.

### P2-SEC-01 — Durcir les outils d'administration

- [ ] Neutraliser l'injection de formule CSV pour les cellules commençant, après
  espaces, par `=`, `+`, `-` ou `@`.
- [ ] Tester guillemets, virgules, retours à la ligne et préfixes de formule dans les
  champs utilisateur exportés.
- [ ] Attendre toutes les requêtes Admin avant de retirer l'état loading.
- [ ] Afficher erreurs et retries dans l'UI au lieu de les limiter à la console.
- [ ] Associer labels et filtres, rendre onglets/détails utilisables au clavier et au
  tactile.
- [ ] Calculer le rang côté base plutôt que télécharger tout le leaderboard.

**Acceptation :** ouvrir un export dans Excel/LibreOffice n'exécute aucune formule
issue d'une valeur utilisateur et l'admin ne présente pas de données partielles
comme chargées.

## P2 — performance et production

- [ ] Mesurer le bundle, le LCP, le CLS et l'INP sur mobile avant optimisation.
- [ ] Précharger seulement les assets du starter, de l'équipe et du prochain nœud.
- [ ] Redimensionner/convertir les images et définir largeur/hauteur pour éviter CLS.
- [ ] Mettre cache immutable sur les assets versionnés.
- [ ] Vérifier que canvas/particules s'arrêtent lorsque la page est masquée.
- [ ] Profiler les re-renders Zustand/Combat/Map et sélectionner des slices stables.
- [ ] Ajouter budgets CI pour bundle et assets.
- [ ] Tester le build sur Chromium, Firefox et WebKit, desktop et mobile.
- [ ] Vérifier mode offline/perte de réseau selon le contrat finalement retenu.
- [ ] Mesurer le coût réel de `/auth` et des routes : le petit chunk d'entrée masque
  le chargement indirect du catalogue champions.
- [ ] Vérifier les headers sur les réponses déployées, ajouter HSTS lorsque le
  domaine HTTPS est stabilisé et tester la CSP en production.
- [ ] Épingler les GitHub Actions par SHA avec politique de mise à jour.
- [ ] Aligner `@types/node` sur Node 22 et retirer les dépendances inutilisées
  (`@types/jest`, `user-event`, Tailwind) si l'audit d'usage les confirme.

**Acceptation :** les budgets sont chiffrés, versionnés et bloquent une régression
significative.

## P2 — documentation et exploitation

### P2-DOC-01 — Aligner les documents sur le produit réel

- [ ] Corriger `README.md` : le test Playwright actuel n'est pas une run UI complète
  et les assets Riot ne sont pas tous versionnés.
- [ ] Corriger `docs/roadmap.md`, qui marque les jalons sécurité/gameplay terminés
  alors que les P0 de cet audit restent ouverts.
- [ ] Corriger `docs/gameplay.md` pour ne documenter que les effets réellement
  exécutés.
- [ ] Corriger `docs/data-and-persistence.md` sur la frontière de confiance RPC, le
  mode invité et l'atomicité du loadout.
- [ ] Mettre `docs/dependency-audit.md` à jour avec les versions et vulnérabilités
  actuelles.
- [ ] Documenter la machine d'état de run et les invariants équipe/inventaire.
- [ ] Documenter la formule de score daily, la date UTC et le ruleset versionné.
- [ ] Ajouter une matrice « feature → implémentation → tests → statut ».
- [ ] Archiver les anciens claims au lieu de les conserver cochés dans le backlog.

**Acceptation :** aucune documentation ne qualifie de terminée une fonction absente
du vrai parcours ou non prouvée par un test comportemental.

### P2-DOC-02 — Préparer l'exploitation

- [ ] Écrire runbooks de migration, rollback, incident de sauvegarde, classement
  compromis et indisponibilité Supabase.
- [ ] Définir sauvegarde/restauration DB, RPO, RTO et test de restauration.
- [ ] Documenter rotation des clés, gestion des environnements et promotion admin.
- [ ] Séparer clairement développement, preview et production.
- [ ] Ajouter checklist de release, smoke test et critères de rollback.
- [ ] Définir support utilisateur et procédure d'export/suppression de compte.

**Acceptation :** un déploiement ou incident courant peut être géré à partir des
runbooks sans connaissance orale du projet.

---

## P3 — produit et enrichissement après stabilisation

### P3-PROD-01 — Contenu et équilibrage

- [ ] Simuler les courbes de difficulté et d'économie après correction du moteur.
- [ ] Définir rôles, forces/faiblesses et synergies des 10 champions.
- [ ] Donner à chaque biome une mécanique, une identité visuelle et des choix propres.
- [ ] Ajouter davantage d'encounters seulement avec effets supportés et testés.
- [ ] Équilibrer rareté, prix, drops, stacking et choix d'augments par télémétrie
  consentie et playtests.
- [ ] Versionner les règles pour préserver la comparabilité des daily runs.

### P3-PROD-02 — Progression et personnalisation

- [ ] Décider si les slots de starter supplémentaires font partie de l'équilibrage.
- [ ] Concevoir skins/chromas sans avantage compétitif.
- [ ] Ajouter achievements/quêtes seulement après fiabilisation des métriques.
- [ ] Afficher un historique détaillé et comparable des runs.
- [ ] Prévoir reset/saison/migration de progression avant toute économie durable.

### P3-PROD-03 — Social et classement

- [ ] Définir noms publics, anonymisation, modération et opt-out.
- [ ] Ajouter filtres/saisons/rulesets au classement.
- [ ] Prévoir signalement et invalidation d'un score.
- [ ] Ne pas ajouter partage, amis ou spectateur avant le modèle de confidentialité.

### P3-PROD-04 — Légal et confidentialité

- [ ] Remplacer le texte « Terms of Service » du footer par un vrai lien ou le
  retirer tant que la page n'existe pas.
- [ ] Rédiger mentions légales, confidentialité, cookies/télémétrie et suppression
  de compte selon les régions visées.
- [ ] Vérifier les exigences Riot/Legal Jibber Jabber pour l'usage des assets et la
  présentation non affiliée.
- [ ] Documenter les données publiques du leaderboard et leur durée de conservation.
- [ ] Obtenir un audit juridique avant monétisation.

---

## Décisions produit à prendre avant les chantiers concernés

- [ ] **Langue de lancement :** recommandation, français cohérent partout puis
  anglais via i18n.
- [ ] **Mode invité :** recommandation, progression locale explicitement séparée,
  sans fusion automatique lors du login.
- [ ] **Daily :** recommandation, date UTC, difficulté fixe, une tentative créée au
  lancement, abandon non classé.
- [ ] **Autoplay :** recommandation, OFF par défaut et pause à chaque décision joueur.
- [ ] **Branches :** recommandation, un chemin irréversible par biome.
- [ ] **Défaite/abandon :** définir progression minimale et récompenses conservées.
- [ ] **Inventaire plein :** recommandation, proposer remplacement/vente ; ne jamais
  supprimer automatiquement une récompense.
- [ ] **XP des KO :** choisir la règle et l'afficher avant équilibrage.
- [ ] **Offline :** choisir entre reprise locale officielle ou erreur bloquante avec
  retry ; ne pas laisser un entre-deux implicite.
- [ ] **Télémétrie :** définir finalités, consentement, rétention et opt-out avant
  activation.

## Ordre de réalisation recommandé

1. **Jalon 0 — sécurité :** P0-SEC, assets reproductibles et blocage des écritures
   client.
2. **Jalon 1 — intégrité verticale :** fin de run atomique, machine d'état, chemin de
   carte, transactions de récompense et persistance.
3. **Jalon 2 — un biome honnête :** ciblage, passifs/effets, progression,
   inventaire/runes/augments et statistiques exactes sur un biome.
4. **Jalon 3 — expérience bêta :** responsive, accessibilité, langue, onboarding et
   vraie E2E victoire/défaite.
5. **Jalon 4 — boucle complète :** six biomes équilibrés, mastery et recovery validés.
6. **Jalon 5 — online compétitif :** daily autoritaire, exploitation, confidentialité
   et release checklist.
7. **Ensuite seulement :** contenu supplémentaire, skins, social, saisons et
   monétisation éventuelle.

## Critères de sortie bêta

- [ ] Aucun P0 ouvert.
- [ ] `npm run check` et la CI Supabase passent sur trois exécutions consécutives.
- [ ] Les vraies E2E victoire/défaite/daily passent sans accès direct aux stores.
- [ ] Aucun problème bloquant axe/WCAG AA sur le parcours critique.
- [ ] Aucun overflow ou contrôle inaccessible sur la matrice de viewports.
- [ ] Clone propre, build et déploiement contiennent tous les assets requis.
- [ ] Les tests adversariaux ne permettent aucune falsification de progression.
- [ ] Une sauvegarde est atomique, idempotente et récupérable après coupure.
- [ ] Les règles affichées correspondent aux handlers réellement exécutés.
- [ ] Documentation, runbooks, confidentialité et checklist de release sont à jour.
