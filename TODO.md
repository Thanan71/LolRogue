# TODO — remise à niveau complète de LolRogue

Audit initial réalisé le 23 juillet 2026, puis état documentaire réaligné le
8 août 2026. Le verdict et les mesures initiales sont archivés dans
[`docs/archive/audit-initial-2026-07-23.md`](docs/archive/audit-initial-2026-07-23.md)
afin de ne plus les présenter comme l'état courant.

> **État courant :** les correctifs fonctionnels P0/P1 et les chantiers P2 jusqu'à
> la performance sont livrés avec des preuves automatisées. La régression de
> dépendances du 8 août est corrigée sans rétrograder de paquet. Les procédures de
> `P2-DOC-02` sont livrées ; la bêta reste bloquée par leur exercice distant, les
> décisions P3 et les exigences légales.
> La matrice maintenue est [`docs/feature-status.md`](docs/feature-status.md).

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

## État de validation courant

- La source de vérité des capacités et preuves est `docs/feature-status.md`.
- Les règles visibles et leurs limites sont dans `docs/gameplay.md`.
- L'état exact des dépendances et blocages est dans `docs/dependency-audit.md`.
- Les validations historiques chiffrées ne sont plus copiées dans le backlog :
  elles restent dans l'archive datée et dans les résultats CI attachés aux commits.

---

## P0 — sécurité et intégrité des données

### P0-SEC-01 — Rendre le serveur autoritaire sur la progression

**Constat initial :** les grants/policies permettaient à un utilisateur authentifié
de modifier ses compteurs `players`, d'écrire sa maîtrise et ses unlocks, ou
d'insérer des runs. `save_completed_run` acceptait des statistiques et candies
calculées par le client. `unlock_champion_enhancement` acceptait le coût, le rang
maximal et l'identité du nœud envoyés par le client.

**État au 24 juillet 2026 : clôturé dans le code.** Une run connectée est créée
par PostgreSQL avec seed, équipe, runes, difficulté, versions et améliorations
figées. Le navigateur ne transmet plus un résultat à créditer : il journalise des
intentions sémantiques, puis l'Edge Function rejoue le moteur déterministe et
PostgreSQL persiste atomiquement le seul résultat `verified`. Les runs invitées
restent locales et ne peuvent pas créditer un compte.

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
- [x] Créer un `run_attempt` côté serveur au démarrage avec seed, ruleset, équipe et
  séquence attendue figés.
- [x] Enregistrer des commandes de partie séquencées et rejouer le moteur
  déterministe dans une Edge Function ou un service de confiance.
- [x] Réserver `progression_source = 'verified'` aux résultats rejoués et décider si
  les runs `client_reported` peuvent encore créditer une progression permanente.
- [x] Auditer ou recalculer la progression historique héritée : les valeurs
  antérieures à la migration ne peuvent pas être distinguées rétroactivement des
  valeurs éventuellement forgées sans règle produit de remise à niveau.

**Décision historique :** les compteurs et runs antérieurs sont conservés sans
remise à zéro rétroactive sous la baseline
`grandfather_legacy_no_retroactive_reset`. Après le cutoff enregistré par la
migration, l'ancien RPC `save_completed_run_v2` est révoqué pour tous les rôles et
aucune run `client_reported` ne peut ajouter de progression. Les anciens rangs
d'amélioration non prouvés par une commande serveur sont archivés pour audit mais
quarantainés des nouveaux attempts ; les snapshots ouverts avant cette décision
expirent.

**Acceptation finale atteinte :** les combats des runs connectées sont automatiques
et rejoués côté serveur ; une séquence impossible, altérée, incomplète ou issue
d'une autre version est rejetée sans récompense. Le scellement, la vérification et
le crédit sont idempotents, y compris après une réponse perdue ou un rechargement.

### P0-SEC-02 — Sécuriser le daily leaderboard

**Constat :** `submit_daily_run` accepte une seed choisie par le client et des
métriques très larges. La date locale du navigateur diverge de `CURRENT_DATE`/UTC,
et le réglage de difficulté local change le combat sans séparer les classements.

**État au 26 juillet 2026 : fermé.** Le daily connecté utilise désormais un
contrat UTC versionné et le même journal rejoué que la progression autoritaire.
Les anciennes entrées restent historiques, mais sont exclues de la vue officielle.

- [x] Définir le jour daily en UTC côté serveur et exposer date, seed et expiration
  depuis une seule source.
- [x] Dériver la seed côté serveur à partir de la date et d'une version de ruleset.
- [x] Fixer difficulté, contenu et version du calcul de score pour tous les joueurs.
- [x] Créer l'attempt côté serveur au lancement et l'associer au résultat soumis.
- [x] Rendre la règle « une tentative » ou « meilleur score » explicite et atomique.
- [x] Rendre atomiques/cohérentes la sauvegarde de run normale et la soumission daily
  afin qu'un échec de la seconde ne laisse pas l'utilisateur dans un état bloqué.
- [x] Ne jamais publier un abandon sauf si cette règle produit est volontaire.
- [x] Valider les métriques par rapport aux limites réelles d'une run et non avec
  des plafonds arbitraires.
- [x] Prévoir une stratégie d'autorité suffisante avant de qualifier le classement
  de compétitif : exécution serveur, journal d'actions vérifiable ou attestation.
- [x] Tester trois fuseaux horaires, minuit UTC, double soumission, seed falsifiée,
  difficulté modifiée et payload extrême.
- [x] Exposer une vue de leaderboard minimale et sanitisée qui restitue réellement
  les noms publics sans contourner la RLS de `players`.
- [x] Encapsuler le fallback `localStorage` invité et traiter quota, mode privé et
  `SecurityError`.

**Acceptation :** deux joueurs au même instant reçoivent la même run et les scores
incompatibles avec son ruleset sont refusés. Une tentative officielle est consommée
dès son lancement ; son score est publié atomiquement après vérification, sauf en
cas d'abandon explicite.

### P0-SEC-03 — Mettre à niveau l'outillage vulnérable

**État au 26 juillet 2026 : fermé à cette date.** Vite 8, Vitest 4, le plugin React, la
couverture V8 et esbuild sont montés conjointement et épinglés. Le seul avis
haut restant concerne exclusivement le mode serveur RSC de React Router, absent
de cette SPA ; son exception automatisée expire le 10 août 2026.

**Régression au 8 août 2026 : corrigée.** La mise à jour groupée de développement a
introduit `nanoid@3.3.16`, remis React Router dans une plage corrigée par 7.18.2 et
aligné les types sur Node 26 malgré le runtime Node 22 alors déclaré. `npm run audit:security`
échouait. React Router a été monté en 7.18.2, `nanoid` en 3.3.18 et le runtime/CI a
été aligné sur le runtime Node 24 compatible Vercel sans diminuer les versions ; voir
`docs/dependency-audit.md`.

- [x] Planifier la montée conjointe Vite/Vitest/coverage vers des versions corrigées.
- [x] Vérifier les breaking changes, Node 24, les plugins Vite et la configuration de
  couverture avant merge.
- [x] Confirmer `npm audit` sans vulnérabilité critique/haute, ou documenter une
  exception bornée avec exposition et échéance.
- [x] Ne jamais exposer le serveur Vite/Vitest de développement sur un réseau non
  maîtrisé tant que les versions vulnérables restent installées.

**Acceptation :** les validations restent vertes après upgrade et aucune alerte
critique/haute non acceptée ne demeure. `npm run audit:security` bloque toute
nouvelle alerte et l'expiration de l'unique exception RSC.

### P0-SEC-04 — Réduire les données publiques et durcir les logs

**État au 26 juillet 2026 : fermé.** Les deux vues de classement exposent un
contrat public minimal. Les diagnostics client passent par une RPC qui impose
`auth.uid()`, sanitize à nouveau le contenu, applique les quotas et conserve les
lignes quatorze jours au maximum. Le logger navigateur est opt-in et borné.

**Constat :** la vue leaderboard publique expose notamment `last_login_at` et les
candies. Un utilisateur peut insérer certains logs sans `user_id`, la sanitation des
détails est superficielle et aucune rétention serveur n'est définie.

- [x] Définir le contrat public minimal des leaderboards et supprimer toute donnée
  non nécessaire, notamment la dernière connexion.
- [x] Forcer l'identité d'un log à `auth.uid()` côté serveur ; ne jamais accepter
  l'identité déclarée par le payload.
- [x] Ajouter quotas/rate limiting, taille maximale et politique de rétention.
- [x] Sanitize récursivement messages, stack et metadata avant envoi.
- [x] Borner le retry des logs et éviter toute réinsertion infinie du même lot.
- [x] Désactiver le logging DB par défaut dans l'exemple d'environnement.
- [x] Tester spam, payload volumineux, secrets imbriqués et usurpation d'identité.

**Acceptation :** seules les données nécessaires sont publiques et un client ne peut
ni usurper/anonymiser son identité de log, ni saturer durablement la table.

## P0 — fin de run, sauvegarde et machine d'état

### P0-RUN-01 — Garantir la fin de run en victoire comme en défaite

**Constat :** en défaite, `CombatPage` navigue vers Game Over puis planifie
`endRun`. Le démontage de la page annule ce timeout : la run peut rester active,
sans sauvegarde ni récompense.

- [x] Déplacer l'orchestration de fin hors du cycle de vie de `CombatPage`.
- [x] Finaliser et persister la run avant la navigation vers Game Over.
- [x] Rendre la commande `endRun` idempotente et observable (`idle`, `saving`,
  `saved`, `failed`, `retrying`).
- [x] Sauvegarder run, équipe, loadout, runes, augments, statistiques et progression
  dans une seule transaction ; supprimer le second RPC « best effort » du loadout.
- [x] Toujours recopier les PV/PM finaux, y compris après une défaite.
- [x] Persister un snapshot de résumé ou un identifiant de résultat afin que
  `/game-over` survive à un refresh.
- [x] Ne réinitialiser l'état actif qu'après confirmation durable de sauvegarde, ou
  après mise en file locale d'une outbox récupérable.
- [x] Ajouter une reprise explicite si le navigateur recharge pendant `saving`.
- [x] Tester victoire, défaite, abandon, double appel, navigation immédiate, timeout,
  erreur réseau et retry.

**Acceptation :** chaque run produit exactement un résultat durable ; aucune
navigation ou fermeture de composant ne peut annuler la finalisation.

**Statut : terminé.** L'orchestrateur de fin capture les ressources du combat,
attend le résultat durable ou l'outbox locale avant de naviguer, et les appels
concurrents partagent la même promesse. La transaction de vérification reste la
seule écriture distante et l'ancien RPC séparé de loadout est supprimé.

### P0-RUN-02 — Empêcher l'écrasement d'une run active

**Constat :** `startRun` peut lancer `endRun` sans attendre son résultat, puis
remplacer l'état. Le flux Daily est accessible pendant une run et peut déclencher ce
cas. Le store accepte aussi une équipe vide, des doublons et des IDs inconnus.

- [x] Faire retourner un `Result` typé et asynchrone à `startRun`/`endRun`.
- [x] Refuser une nouvelle run tant que sauvegarde ou abandon n'a pas abouti.
- [x] Demander une confirmation unique avant Normal, Daily, logout ou nouvelle run.
- [x] Annuler la navigation et conserver l'ancienne run si la sauvegarde échoue.
- [x] Valider côté domaine une équipe non vide, unique, connue et conforme au nombre
  de slots débloqués.
- [x] Rendre les garde-routes dépendantes de la machine d'état, pas de conditions
  dispersées dans les pages.
- [x] Tester erreur réseau, double clic, deux onglets et accès direct par URL.

**Acceptation :** aucune commande ou route ne peut remplacer silencieusement une run
active ou créer un état de départ invalide.

**Statut : terminé.** Un départ ne termine plus implicitement la run courante :
l'abandon explicite et sa confirmation précèdent la transition. Les départs sont
sérialisés dans l'onglet et entre onglets, les routes suivent une phase de cycle de
vie unique, et le serveur conserve le verrou jusqu'à la fin de la vérification.

### P0-RUN-03 — Fermer l'exploitation de la carte

**Constat :** dès qu'un parent est complété, ses différents enfants restent
accessibles. Le joueur peut nettoyer plusieurs branches, rejouer le shop après
refresh et accumuler des récompenses hors chemin roguelike.

- [x] Modéliser explicitement la position courante, les arêtes autorisées et le
  frontier choisi.
- [x] Exiger que `moveToNode` suive une arête depuis le nœud courant.
- [x] Verrouiller définitivement les branches sœurs après le choix d'une branche.
- [x] Vérifier que le `pendingEncounter.nodeId` correspond au nœud courant avant
  toute résolution.
- [x] Rendre la résolution et la collecte idempotentes par nœud.
- [x] Persister le stock, les achats et l'état visité d'un shop dans la run.
- [x] Unifier le rôle des nœuds `Start`, `Exit` et `Boss` entre types, générateur,
  légende et transitions de biome.
- [x] Ne pas choisir arbitrairement le « premier nœud accessible » après résolution.
- [x] Ajouter des tests de propriétés : pas de saut, pas de sibling farm, pas de
  replay, pas de double claim, y compris après refresh.

**Acceptation :** une run suit un chemin continu unique et la somme maximale de
récompenses est bornée par ce chemin.

**Statut : terminé.** Le store persiste désormais une frontière exacte et le
chemin choisi. Sélectionner un nœud consomme cette frontière, puis seule la liste
de ses arêtes sortantes peut être ouverte après résolution. Les rencontres,
récompenses et offres de shop sont liées au nœud courant et consommées une seule
fois ; le replay autoritaire applique les mêmes refus aux journaux falsifiés.

### P0-RUN-04 — Corriger les pertes et gains silencieux

**Constats :**

- un `stat_boost` transforme un champion aux PV implicites complets en champion à
  `0 HP` ;
- Shop dépense l'or avant de savoir si l'objet ou le champion peut être ajouté ;
- Treasure, Event et Combat annoncent un objet même si l'inventaire est plein ;
- une run authentifiée à zéro vague peut recevoir des candies côté serveur alors que
  le mode invité n'en reçoit pas.

- [x] Définir un invariant unique : PV absents = PV maximum, ou matérialiser les PV
  dès le début de run.
- [x] Remplacer les retours chaîne vide/booléen par des `Result` typés contenant le
  motif d'échec.
- [x] Valider capacité et invariants avant de débiter, puis effectuer
  dépense+ajout+claim dans une commande atomique.
- [x] Proposer un choix cohérent en capacité maximale : remplacer, vendre,
  convertir en or ou laisser l'objet.
- [x] Afficher une récompense uniquement après confirmation de son ajout.
- [x] Définir une table unique de récompenses pour abandon immédiat, abandon après
  progression, défaite et victoire.
- [x] Appliquer exactement cette table en local, dans l'UI et dans la RPC.
- [x] Tester inventaire/équipe pleins, double clic, refresh, event positif sur
  champion sain/blessé/KO et run à zéro combat.

**Acceptation :** aucun PV, objet, champion, or ou candy ne peut être perdu, dupliqué
ou affiché à tort.

**Statut : terminé.** Les PV absents ont désormais une sémantique unique et testée.
Les mutations d'or, d'inventaire et d'équipe exposent des résultats typés ; les
achats de shop valident puis appliquent journal, débit, ajout et consommation dans
une seule transaction locale persistée. À capacité maximale, les récompenses
gratuites sont explicitement laissées sur place et l'UI ne les annonce plus. Enfin,
la table de candies partagée impose zéro récompense avant le premier combat, avec
un test de parité sur la finalisation PostgreSQL.

## P0 — livraison et accessibilité du parcours d'entrée

### P0-REL-01 — Livrer réellement les assets Riot

**Constat :** `.gitignore` exclut `public/lol/data/`. Le poste local contient environ
17 Mo d'images et JSON, mais Git ne suit essentiellement que
`champions-parsed.json`. Un build ou déploiement depuis un clone propre n'a donc pas
les assets que le README dit versionnés.

- [x] Choisir une stratégie reproductible : assets minimaux versionnés, téléchargement
  vérifié en CI/build, ou CDN explicite avec fallback.
- [x] N'embarquer que les champions, sorts et objets réellement utilisés si le poids
  complet n'est pas justifié.
- [x] Ajouter intégrité/version/checksum au manifeste Data Dragon.
- [x] Corriger les chemins relatifs d'assets pour les routes profondes.
- [x] Déplacer `champions-parsed.json` dans un répertoire importable sous `src`
  (ou le charger par URL) au lieu de l'importer depuis `public`, ce que Vite signale
  à chaque démarrage du serveur de développement.
- [x] Vérifier la CSP pour chaque origine réellement utilisée, y compris la police.
- [x] Ajouter un test depuis un clone propre qui build puis vérifie les URLs
  critiques sans profiter de fichiers ignorés.
- [x] Aligner `.gitignore`, `README.md`, `docs/assets.md` et la réalité du pipeline.

**Acceptation :** le même commit produit les mêmes assets sur une machine vierge et
aucun champion/objet requis n'affiche une image cassée.

**Statut : terminé.** Le dépôt livre désormais un paquet Data Dragon 16.6.1 de
187 PNG : les 172 champions alignés avec le catalogue serveur, dont 10 sont
actuellement jouables, et uniquement les 15 objets utilisés (environ 5,1 Mo).
Tous sont protégés par SHA-256 dans un manifest versionné. Le catalogue de
champions a été déplacé sous `src`. Chaque build contrôle les sources puis `dist`,
et la validation de release reconstruit aussi l'application dans un répertoire
temporaire privé de tout fichier ignoré.

### P0-UX-01 — Rendre Auth et Menu utilisables sur petit écran

**Constat :** les deux pages sont en `position: fixed` avec `overflow: hidden` et un
footer superposé. Sur 375×667 et 390×844, le bouton invité/login est recouvert ;
Playwright confirme que le footer intercepte le clic. À 1280×720, plusieurs actions
sortent également du viewport.

- [x] Remplacer les conteneurs bloqués par un shell avec `min-height: 100dvh`,
  scroll vertical et gestion des safe areas.
- [x] Remettre le footer dans le flux du document.
- [x] Compacter/recomposer le menu selon la hauteur disponible.
- [x] Préserver une cible de 44 px sans étirer les boutons sur toute la hauteur.
- [x] Tester connexion, inscription et invité à 320×568, 375×667, 390×844,
  1280×720 et zoom 200 %.

**Acceptation :** toutes les actions sont visibles, focalisables et activables sans
chevauchement à chacun de ces formats.

**Statut : terminé.** Auth et Menu utilisent désormais un shell documentaire
scrollable avec `100dvh`, safe areas et footer dans le flux. Les variantes de
hauteur compactent le logo, les espacements et les actions sans descendre sous
44 px. Le scénario Playwright dédié exerce les modes connexion/inscription,
l'entrée et la sortie invité, le focus, le hit-test, les footers et le débordement
horizontal sur les quatre viewports demandés ainsi qu'à l'équivalent d'un zoom
200 %.

### P0-UX-02 — Réparer la sélection Starter/Runes sur mobile

**Constat :** le `fieldset` de runes et le CTA restent côte à côte sans layout
mobile. À 390 px, les runes occupent environ 123 px de large et le bouton est étiré
sur environ 794 px de haut.

- [x] Concevoir le bloc rune comme un vrai groupe de choix responsive.
- [x] Passer les actions en colonne sous le breakpoint mobile.
- [x] Garder le CTA entre 44 et 56 px de haut et éventuellement sticky sans masquer
  le dernier choix.
- [x] Réduire la longueur de la page : cartes compactes, accordéon/détail ou grille
  adaptée au lieu de splashes géants.
- [x] Styliser et aligner le bouton Retour avec le design du produit.
- [x] Tester sélection, erreur et confirmation au clavier et au tactile dès 320 px.

**Acceptation :** aucune description n'est réduite à une colonne illisible, aucun
bouton n'est étiré ou superposé, et la sélection complète reste réalisable.

**Statut : terminé.** La sélection mobile affiche désormais les champions dans une
grille compacte à deux colonnes avec les portraits locaux, puis un groupe de
cartes-checkbox runes pleine largeur avec compteur et limite explicite. Les actions
restent en colonne, le CTA mesure de 48 à 56 px et le bouton Retour dispose d'une
cible de 44 px cohérente avec le thème. Les scénarios Playwright couvrent le
clavier et le tactile à 320/390 px, y compris sélection, limite, erreur, retour et
confirmation.

---

## P1 — moteur de combat fiable

### P1-GAME-01 — Centraliser validation et ciblage des actions

**Constat :** la cible par défaut `all` transforme des sorts mono-cible en AoE. Les
heals/shields peuvent sélectionner un allié aléatoire et certains effets ignorent
la cible choisie. Le moteur ne rejette pas toujours une action invalide avant son
coût/cooldown.

- [x] Définir un résolveur de cibles canonique pour `self`, `ally`, `allies`,
  `enemy`, `enemies` et `area`.
- [x] Dériver les cibles proposées dans l'UI de ce même résolveur.
- [x] Valider acteur vivant, tour, mana, cooldown, rang, type de cible et cible
  vivante avant toute mutation.
- [x] Ne consommer mana/cooldown que si l'action est acceptée.
- [x] Utiliser coût et cooldown du rang courant, pas systématiquement l'index 0.
- [x] Ajouter l'attaque de base et les actions réellement autorisées à une API de
  commandes unique.
- [x] Couvrir la matrice de ciblage et les payloads falsifiés par des tests.

**Acceptation :** aucune action envoyée manuellement au store/moteur ne peut
contourner les règles visibles dans l'UI.

**Statut : terminé.** `BattleManager` expose désormais une seule description
autoritaire des actions et de leurs cibles. Le moteur rejette tout payload incomplet
ou falsifié avant émission d'événement, avance de tour, coût ou cooldown, puis
résout tous les effets sur les cibles validées. L'UI consomme cette même liste,
inclut l'attaque de base et demande une cible seulement pour les actions
mono-cible. Les combattants dupliqués reçoivent aussi un identifiant de cible
stable afin que chaque portrait reste adressable. La matrice complète, les cibles
mortes, les mauvais camps, `all` détourné, le coût forgé, le mana, le cooldown et
le rang courant sont couverts par des régressions.

### P1-GAME-02 — Connecter réellement effets et passifs

**Constat :** les passifs champions ne sont pas appelés dans le combat. `execute`
n'est pas résolu par `BattleManager`. Buffs/debuffs sont ajoutés à `EffectManager`
mais leurs stats, ticks et expirations ne sont pas consultés. Slow, silence et snare
n'ont pas leur effet annoncé.

- [x] Établir un cycle de tour documenté : début, contrôle, choix, cast/attaque,
  événements, dégâts/soins, mort, fin et tick des durées.
- [x] Brancher `EffectManager` à la lecture des stats, à `canAct`, `canCast`, vitesse,
  ticks, stacks, dispels et expiration.
- [x] Implémenter les types publiés : dégâts, heal, shield, execute, CC, buff,
  debuff, DoT, HoT et revive.
- [x] Brancher chaque passif champion aux événements utiles.
- [x] Normaliser les unités (`0.30` contre `30 %`) avec des types ou helpers dédiés.
- [x] Retirer/masquer temporairement tout contenu dont le handler n'existe pas.
- [x] Écrire un test comportemental par famille d'effet et au moins un test par
  passif champion.

**Acceptation :** aucune description de champion publiée ne promet un effet absent
du moteur.

**Statut : terminé.** Le cycle canonique est documenté dans
`docs/combat-turn-cycle.md` et `BattleManager` consomme désormais réellement les
statistiques, contrôles, boucliers, ticks, stacks et expirations
d'`EffectManager`. Les dix passifs maintenus disposent chacun de leurs triggers et
de leur régression comportementale ; leurs définitions remplacent les versions
générées incomplètes dans la base jouable. Les familles dégâts, soin, bouclier,
execute, CC, buff/debuff, DoT, HoT et revive sont résolues par le combat. Les
durées, pourcentages et seuils passent par des helpers d'unités communs. Pour les
autres champions générés, une capacité ou un passif sans données complètes est
retiré des commandes et sa description est remplacée dans la Database par un état
« temporairement indisponible », afin de ne plus publier de promesse inerte.

### P1-GAME-03 — Faire des runes, augments, objets et améliorations de vraies règles

**Constat :** les runes sont évaluées une seule fois au début avec un contexte
factice. Seuls certains bonus de stats des augments/objets sont lus. Les hooks
`on_hit`, `on_kill`, heal de fin, revive, gold/discount, réduction de dégâts et
consommables sont généralement inertes. Les effets spéciaux des arbres
d'amélioration ne sont qu'affichés.

- [x] Créer un bus d'événements de combat/run commun et typé.
- [x] Lister les triggers officiellement supportés par chaque catalogue.
- [x] Réévaluer conditions, stacks, cooldowns et durées au bon événement.
- [x] Intégrer multiplicateurs de dégâts, réduction, gold, soin post-combat, revive,
  on-hit/on-kill/turn-start et consommables.
- [x] Consommer les potions et autres objets à usage unique.
- [x] Appliquer `unique`, `stackable` et `maxStacks` dans la commande d'inventaire.
- [x] Mapper les clés d'amélioration (`atk`, `def`, `ap`, `spd`, `mr`, etc.) vers un
  modèle de stats unique, validé à la compilation.
- [x] Charger les améliorations au bootstrap du compte, sans imposer une visite à
  la page Database.
- [x] Ajouter une validation de catalogue qui refuse tout effet sans handler.
- [x] Ajouter des tests d'intégration par trigger, durée, stack, consommation et
  revive.

**Acceptation :** une entrée disponible au joueur est soit pleinement appliquée et
testée, soit explicitement marquée indisponible.

### P1-GAME-04 — Corriger l'autoplay et les commandes clavier du combat

**Constat :** l'autoplay démarre actif et peut jouer en 400 ms, ce qui rend le choix
manuel de cible presque impossible. Le hook global intercepte Entrée/Espace même
sur des boutons ; les contrôles Auto et Vitesse ne répondent pas correctement et
une touche peut déclencher deux actions.

- [x] Mettre l'autoplay désactivé par défaut, ou le mettre en pause à chaque décision
  du joueur.
- [x] Afficher clairement qui agit et le délai avant action automatique.
- [x] Ignorer `button`, `a`, contrôles ARIA et `contenteditable` dans les raccourcis
  globaux.
- [x] Gérer propagation et `preventDefault` au niveau approprié.
- [x] Documenter les raccourcis et permettre de les désactiver.
- [x] Tester tous les contrôles au clavier sans double action.

**Acceptation :** le mode manuel est réellement jouable et chaque touche produit au
plus une commande attendue.

### P1-GAME-05 — Garantir la parité client / authority

- [x] Inventorier combat, ciblage, effets, récompenses, carte, boutique,
  recrutement, événements, trésors, augments, XP et transitions.
- [x] Partager la construction des combattants et l'application maîtrise,
  améliorations, objets, augments et bonus d'événement.
- [x] Partager prix, revente, repos, recrutement, événements et validation
  d'augment entre UI, store et authority.
- [x] Partager la transition post-combat complète : PV/PM, soin, XP, niveaux et
  choix de sort.
- [x] Comparer l'état canonique client/authority sur une même seed avec des traces
  manuelles et autoplay.
- [x] Couvrir les autres familles déterministes par des golden rules bloquantes en
  CI.
- [x] Versionner le contrat en `run-engine-v10`, content hash
  `e7bb5a3f9a6fbb6c7d7d2338bf7e226fe019299401a2110b61ee4373217aa47e`
  et conserver le bundle v9 pour les attempts en cours.
- [x] Corriger le rejet observé quand l'authority termine un combat avant le
  dernier tick autoplay du client : accepter seulement le suffixe automatique
  sans effet, rejeter tout suffixe manuel et archiver v10 sous `run-engine-v11`.

**Acceptation :** le client et l'authority consomment les mêmes modules de domaine
pour toute règle déterministe de run. Les traces combat manuel/autoplay comparent
exactement équipe, PV/PM, niveaux, or, inventaire, augments, ledger, statistiques,
position et biome ; toute divergence fait échouer la suite Vitest.

**Statut : terminé.** `run-engine-v11` et le ruleset gameplay/daily v11 sont
déployés ; v10 reste archivé pour les attempts en cours. Le bundle Edge reste sous
la limite de déploiement et le preflight CORS de production répond `200`.

## P1 — progression, économie et contenu d'une run

### P1-RUN-01 — Corriger niveaux de run, vagues et choix d'augment

**Constat :** `runLevel` augmente principalement après le boss final. Les cinq
premiers biomes finissent par `Exit`, donc le niveau reste à 1 et l'augment peut être
proposé seulement quand la run est déjà finie.

- [x] Définir la cadence officielle : par combat, étage, sortie de biome ou boss.
- [x] Unifier progression de `runLevel`, `currentWave` et `currentBiome` dans une
  seule transition.
- [x] Réinitialiser ou non la vague entre biomes selon une règle documentée.
- [x] Déclencher le choix d'augment avant le prochain contenu, jamais après la fin.
- [x] Générer des choix seedés, sans doublon illégal et avec poids de rareté.
- [x] Persister un choix en attente et le restaurer après refresh.
- [x] Tester la séquence complète attendue sur les six biomes.

**Acceptation :** un tableau de référence `nœud → vague → niveau → augment` est
identique avant/après reload.

### P1-RUN-02 — Unifier difficulté, ennemis et récompenses

**Constat :** les récompenses Combat sont en partie hardcodées et ignorent celles de
l'encounter. Les élites ressemblent aux combats normaux, les multiplicateurs de
biome ne sont pas tous appliqués et le niveau ennemi reste souvent à 1.

- [x] Créer un résolveur unique de rencontre à partir de seed, biome, type de nœud,
  vague, niveau et difficulté.
- [x] Utiliser `goldReward`, `itemDropChance` et les données de l'encounter.
- [x] Donner aux élites et boss une composition/mécanique/récompense distincte.
- [x] Appliquer une formule versionnée de scaling à toutes les stats concernées.
- [x] Définir si les champions KO reçoivent de l'XP et aligner texte et code.
- [x] Vérifier la capacité avant d'annoncer un drop.
- [x] Construire des simulations seedées de difficulté et de courbe économique.

**Acceptation :** pour une seed donnée, l'UI, le store, le résumé et la base
rapportent exactement les mêmes ennemis et récompenses.

### P1-RUN-03 — Construire un ledger de statistiques fiable

**Constat :** le tracker est remis à zéro après chaque combat et n'est pas persisté.
Les dégâts avant shield et heals avant overheal sont surcomptés. `gold_earned`
correspond à l'or restant et `items_collected` est sauvegardé vide.

- [x] Déplacer les statistiques dans l'état versionné de la run.
- [x] Reset uniquement au vrai début/à la vraie fin de run.
- [x] Enregistrer les deltas effectifs de PV, shields, overheal, kills et assists.
- [x] Séparer gains, dépenses et solde d'or.
- [x] Journaliser objets trouvés, achetés, vendus, équipés et consommés.
- [x] Inclure toute l'équipe dans le résumé, même sans événement de combat.
- [x] Calculer UI, DB, maîtrise et analytics depuis ce ledger unique.
- [x] Ajouter un golden test de trois combats avec refresh et comparer chaque champ
  UI/RPC/tables.

**Acceptation :** le résumé est une somme exacte de toute la run et survit à un
refresh.

### P1-RUN-04 — Renforcer les invariants équipe, inventaire et sorts

- [x] Refuser champion inconnu, doublon illégal et dépassement de taille d'équipe.
- [x] Refuser l'équipement sur un champion hors équipe.
- [x] Centraliser les contraintes unique/stackable/capacité/slots.
- [x] Valider les rangs et niveaux de déblocage avant une amélioration de sort.
- [x] Ne pas consommer un choix d'amélioration sur un sort déjà au rang maximal.
- [x] Mettre en file plusieurs choix si plusieurs niveaux sont gagnés.
- [x] Ajouter des property tests sur les commandes de domaine et la réhydratation.

**Acceptation :** aucune API publique du store ni donnée persistée corrompue ne peut
créer un état interdit.

## P1 — maîtrise et progression permanente

### P1-META-01 — Définir un contrat clair pour la maîtrise

**Constat :** les docs se contredisent sur la progression invité. Le bonus de stats
de maîtrise n'est pas appliqué au combat. Les unlocks `starter_slot`/`chroma` ne
contiennent pas les IDs nécessaires et Starter ignore les unlocks.

- [x] Décider et documenter la persistance invité et la politique lors de la création
  d'un compte : aucune fusion, import explicite ou fusion contrôlée.
- [x] Réinitialiser/namespace correctement les caches au logout et au changement de
  compte.
- [x] Charger profil, maîtrise et améliorations après Auth avant d'autoriser le jeu.
- [x] Appliquer le bonus de maîtrise à travers le calculateur de stats canonique.
- [x] Donner aux unlocks des cibles concrètes (`championId`, `skinId`, nombre de
  slots) et les valider côté serveur.
- [x] Faire respecter les slots/unlocks sur Starter, pas seulement dans l'affichage.
- [x] Ajouter l'UI réellement nécessaire aux skins/chromas ou retirer ces promesses.
- [x] Rendre l'arbre d'amélioration `aria-busy`, attendre la mutation et bloquer le
  double clic jusqu'au résultat.
- [x] Resynchroniser la branche active lors du changement de champion et afficher
  succès/échec sans dépendre uniquement d'un toast fugace.
- [x] Tester gain de niveau, unlock, refresh, logout/login, deux comptes et invité.

**Acceptation :** franchir un seuil produit exactement l'effet annoncé après reload,
sans fuite entre comptes.

### P1-META-02 — Unifier les stats et améliorations

- [x] Remplacer les alias multiples de stats par un schéma canonique partagé entre
  champions, items, runes, augments, maîtrise et arbres.
- [x] Distinguer bonus plat, pourcentage additif et multiplicateur.
- [x] Fixer l'ordre de calcul et les caps dans une spécification testée.
- [x] Afficher une comparaison avant/après lors d'un équipement ou déblocage.
- [x] Ajouter un test par nœud d'amélioration et palier de maîtrise réellement
  disponible.

**Acceptation :** chaque bonus modifie la stat attendue une seule fois et la valeur
affichée égale celle utilisée en combat.

**Statut : terminé.** Le contrat canonique est partagé par l'UI, le combat et
`run-engine-v12`; les anciens alias sont normalisés aux frontières du catalogue.

## P1 — persistance, offline et récupération

### P1-DATA-01 — Versionner et valider l'état local

**Constat :** la réhydratation fait un merge superficiel ; un objet ancien ou
corrompu peut remplacer des defaults. Le combat et le tracker ne sont pas persistés,
et `saveStatus: saving` peut rester bloqué après refresh.

- [x] Ajouter un numéro de schéma à chaque store persisté.
- [x] Valider les payloads avec un schéma runtime avant réhydratation.
- [x] Écrire une migration par version et une quarantaine/reset explicite si
  migration impossible.
- [x] Ne pas persister un statut transitoire sans stratégie de récupération.
- [x] Persister un checkpoint de combat déterministe ou définir un abandon/replay
  non exploitable.
- [x] Empêcher qu'un refresh restaure les PV pré-combat et permette de recommencer
  gratuitement la même rencontre.
- [x] Ajouter une outbox idempotente pour les résultats hors ligne si ce cas est
  supporté.
- [x] Tester refresh sur carte, chaque encounter, choix d'augment, tour combat,
  récompense, sauvegarde et Game Over.

**Acceptation :** chaque refresh restaure un état cohérent ou propose une
récupération explicite, jamais un état partiel exploitable.

**Statut : terminé.** Validation runtime avant merge, migrations versionnées,
quarantaine locale, snapshot de finalisation réessayable et checkpoint de combat
avec reprise déterministe sont couverts par les tests de reload.

### P1-DATA-02 — Réduire les sources de vérité concurrentes

- [x] Réduire `dailyRunStore` aux métadonnées daily si `runStore` pilote le gameplay.
- [x] Faire passer le vrai flux par `EffectManager`, `RuneManager`,
  `AugmentManager` et le résolveur d'inventaire, ou supprimer les versions mortes.
- [x] Retirer/déprécier `EncounterManager` et `InventoryManager` si leurs règles sont
  dupliquées ailleurs.
- [x] Éviter les singletons mutables hors Zustand pour les données de run.
- [x] Documenter un propriétaire unique par donnée et une seule commande de mutation.

**Acceptation :** les unités testées sont celles appelées en production ; il
n'existe plus deux implémentations divergentes d'une même règle.

**Statut : terminé.** Le gameplay Daily appartient uniquement à `runStore` ; le
store Daily v4 est limité aux métadonnées et au classement invité. Les règles
d'événement sont pures, `EncounterManager` est supprimé, `InventoryManager` est
déprécié et dépublié, et la boutique partage la fabrique d'augments du runtime.
La matrice des propriétaires et commandes est documentée dans
`docs/data-and-persistence.md`.

### P1-DATA-03 — Fiabiliser Auth, profil et changement d'identité

**Constat :** login/session peuvent déclarer l'utilisateur authentifié alors que le
profil joueur n'a pas pu être chargé, ce qui rend ensuite la sauvegarde impossible.
Le listener Auth vit au niveau module, n'est pas désabonné et ses réponses
asynchrones peuvent arriver après un changement de compte. Le passage en invité
peut commencer avant la fin de sauvegarde de la run courante.

- [x] Modéliser séparément `session`, `profileLoading`, `ready`,
  `profileUnavailable`, `guest` et `signedOut`.
- [x] Ne pas autoriser une run connectée tant que le profil durable n'est pas prêt.
- [x] Récupérer/créer le profil par un flux idempotent et réessayable.
- [x] Monter/démonter l'abonnement Auth dans le bootstrap React.
- [x] Ignorer toute réponse async associée à une session devenue obsolète.
- [x] Attendre la fin/abandon de la run avant logout, changement de compte ou invité.
- [x] Traiter explicitement l'erreur retournée par `signOut`.
- [x] Utiliser l'adapter de stockage sûr pour le drapeau invité.
- [x] Garder les récompenses connectées en attente jusqu'à confirmation serveur,
  puis réhydrater la progression canonique.
- [x] Tester perte réseau, profil absent, logout refusé, changement rapide de compte,
  deux onglets et race Auth/save.

**Acceptation :** aucune sauvegarde n'est attribuée à la mauvaise identité et l'état
« connecté sans profil » ne peut pas entrer dans le jeu.

**Statut : terminé.** `authStore` utilise une génération d'identité, six états
exclusifs et un abonnement possédé par React. Le profil et la progression doivent
être hydratés avant `ready`; les transitions refusées ou obsolètes ne vident ni ne
réattribuent la session. `startRun` refuse explicitement `auth_not_ready`.

## P1 — responsive et cohérence visuelle

### P1-UX-01 — Créer un shell responsive commun

- [x] Créer des primitives partagées : `PageShell`, header, footer, panel, bouton,
  dialogue, tabs, champ, empty/error/loading state.
- [x] Remplacer les layouts `fixed`/`100vh` par `100dvh`, scroll local explicite et
  safe areas.
- [x] Définir breakpoints par besoin du contenu, pas par appareil.
- [x] Réduire les styles inline afin de rendre états et media queries testables.
- [x] Ajouter des tokens communs d'espacement, rayons, typographie, couleurs, focus,
  succès, avertissement et danger.
- [x] Choisir une direction visuelle unique entre l'univers or/serif du menu et les
  écrans slate/sans du jeu.
- [x] Supprimer l'`@import` Google Cinzel bloqué par la CSP, ou auto-héberger une
  police optimisée et licenciée avec fallback système.

**Acceptation :** les pages partagent les mêmes composants et aucune action
principale ne dépend d'un positionnement absolu fragile.

**Statut : terminé.** Le kit `components/ui` fournit shell, header/footer, surfaces,
contrôles, dialogue et états. Settings, Credits, Profil, Daily, 404 et les états de
route l'utilisent réellement. Les tokens et la pile système sans police distante
sont centralisés ; les shells utilisent `100dvh`, safe areas et reflow piloté par
le contenu. Le seul `fixed` restant est le backdrop modal intentionnel.

### P1-UX-02 — Réparer les écrans de jeu mobiles

- [x] Combat : faire reflow du header ; le contrôle Auto est actuellement hors écran
  à 390 px et la page dépasse horizontalement.
- [x] Combat : garder équipes, tour, actions et journal compréhensibles à 320 px.
- [x] Game Over : rendre le contenu scrollable et aligné en haut ; avec cinq
  champions, le titre est actuellement au-dessus du viewport.
- [x] Game Over : utiliser titre, couleur et son selon victoire/défaite ; ne pas jouer
  systématiquement le son de défaite.
- [x] Database : remplacer la sidebar fixe de 260 px par vue empilée/drawer sous
  768 px ; les détails n'ont actuellement qu'environ 130 px à 390 px.
- [x] Daily leaderboard : supprimer la largeur minimale qui crée un overflow.
- [x] Carte : simplifier le header et les informations d'équipe sur petit écran.
- [x] Event/Shop/Rest/Treasure : vérifier scroll, décisions, confirmation et retour
  avec contenu long et hauteur réduite.
- [x] Créer un `EncounterLayout` scrollable commun ; supprimer les conteneurs
  absolus centrés qui coupent Recruit, Rest, Event et Treasure.
- [x] Rest : supprimer le doublon d'actions « Continue »/« Done » après le soin.
- [x] Ajouter des snapshots visuels aux tailles 320×568, 375×667, 390×844,
  768×1024, 1280×720 et 1440×900.

**Acceptation :** aucune page n'a de scroll horizontal involontaire, d'action
masquée ou de texte inutilisable sur la matrice cible.

**Statut : terminé.** Combat, Game Over, Database, Daily et carte ont des reflows
pilotés par le contenu. Les cinq encounters partagent `EncounterLayout`, leurs
actions ne dépendent plus d'un centrage absolu et Rest n'affiche qu'une sortie
après soin. La matrice Playwright attache 18 captures et bloque tout overflow
horizontal sur Database, Game Over et carte.

### P1-UX-03 — Unifier langue et terminologie

**Constat :** français et anglais sont mélangés dans un même parcours (`Play`,
`Gold`, `Empty`, `Équipe`, `Game Over`, etc.), ainsi que HP/PV, MP/PM, run/partie.

- [x] Choisir la langue de lancement ; recommandation : français complet pour la
  première bêta.
- [x] Extraire toutes les chaînes dans un dictionnaire i18n, même avec une seule
  locale initiale.
- [x] Définir un glossaire produit pour PV/PM, or, candies, run, encounter, élite,
  boss, maîtrise et améliorations.
- [x] Uniformiser labels, erreurs, confirmations, raccourcis, sons et aria-labels.
- [x] Prévoir pluriels, nombres et dates via `Intl`.
- [x] Ajouter un test qui repère les chaînes brutes dans les écrans migrés.

**Acceptation :** un parcours complet n'affiche qu'une langue et une terminologie
stable.

**Statut : terminé.** La locale de lancement est `fr-FR`, les textes structurants
sont centralisés dans `src/i18n/fr.ts` et le glossaire fixe partie, rencontre,
PV/PM, or, bonbons et améliorations. Les nombres et pluriels passent par les
formateurs communs. Auth, menu, réglages, sélection, Daily, Database, carte,
combat, rencontres et Game Over utilisent le contrat français. La couverture a
ensuite été étendue à **toutes les pages** (dont Profil, Crédits et Administration),
aux composants textuels de combat et d'amélioration, ainsi qu'aux catalogues
affichés d'objets, de passifs, d'augments et de rencontres. Le test i18n découvre
automatiquement chaque fichier de `src/pages` : ajouter une page sans dictionnaire
fait désormais échouer la CI, sans liste manuelle à maintenir.

### P1-UX-04 — Corriger feedback et vérité de l'interface

- [x] Ne jamais afficher succès/récompense avant confirmation de la commande.
- [x] Donner aux erreurs une action utile : réessayer, revenir, libérer un slot ou
  se reconnecter.
- [x] Afficher les états de chargement/synchronisation du profil et des saves.
- [x] Garder les erreurs critiques persistantes avec `role=alert`, fermeture et
  retry ; ne pas les effacer automatiquement après cinq secondes.
- [x] Distinguer clairement local invité, connecté, offline et classement officiel.
- [x] Remplacer les valeurs par défaut trompeuses de Game Over lors d'un accès
  direct par un état « résultat introuvable ».
- [x] Corriger la barre HP de carte qui affiche full visuellement mais `0/max` dans
  le texte quand `currentHp` est absent.
- [x] Montrer pourquoi une action est désactivée, son coût et ses conséquences.
- [x] Afficher noms, rangs, effets avant/après et contraintes pour les upgrades de
  sorts au lieu de `Q/W/E/R` seuls et d'identifiants bruts.
- [x] Ajouter confirmations non destructives et éviter les dialogues répétés.
- [x] Donner au profil un vrai loading/skeleton et un CTA de connexion en invité.

**Acceptation :** tout message reflète le résultat réel du domaine et l'utilisateur
sait comment sortir d'un échec.

**Statut : terminé.** Les succès d'achat, de recrutement, de récompense et de
sauvegarde ne sont rendus qu'après le résultat du domaine. Les erreurs critiques
restent visibles avec fermeture et récupération explicites ; le profil expose son
chargement, son origine connectée/hors ligne, un retry et un CTA de connexion.
Game Over refuse désormais d'inventer un résultat lors d'un accès direct. La carte
utilise la même valeur de PV pour la barre et le texte, tandis que les achats,
recrutements et améliorations de sorts expliquent coût, blocage, rang et effet
avant/après. Les confirmations d'abandon sont annulables et protégées contre les
doubles déclenchements.

## P1 — accessibilité

### P1-A11Y-01 — Sémantique, clavier et focus

- [x] Utiliser de vrais `button`, `a`, `input`, `fieldset/legend` et listes avant
  d'ajouter des rôles à des `div`.
- [x] Database : rendre les champions sélectionnables au clavier et labelliser la
  recherche.
- [x] Auth/Database : implémenter `tablist`, `tab`, `aria-selected` et relations de
  panneaux.
- [x] Settings : remplacer `display:none` du checkbox Particles par un masquage
  visuel qui conserve focus et annonce d'état.
- [x] Rendre les tooltips d'équipement accessibles au focus et au tactile, ou les
  remplacer par un popover/dialog.
- [x] Appliquer la même règle aux tooltips de sorts : focus, clic/tap, Échap,
  `aria-describedby` et placement dans le viewport.
- [x] Ajouter focus initial, piège de focus et restitution du focus aux dialogues.
- [x] Ajouter `aria-live` aux sauvegardes, erreurs et changements de récompense.
- [x] Donner aux nœuds de carte un nom qui inclut position, type, état et conséquence.
- [x] Donner aux barres PV/XP la sémantique `progressbar` et leurs valeurs.
- [x] Masquer les SVG décoratifs aux technologies d'assistance ; nommer les SVG
  informatifs avec `title`.
- [x] Mettre à jour le titre du document, déplacer le focus vers `main`/`h1` et
  annoncer chaque changement de route.
- [x] Lancer un audit axe automatisé sur chaque route principale.

**Acceptation :** Auth → Starter → Map → encounter → Combat → Game Over est
réalisable au clavier seul sans perte de contexte ni double action.

**Statut : terminé.** Auth et Database exposent de vrais onglets reliés à leurs
panneaux avec navigation aux flèches ; les champions et la recherche utilisent des
contrôles natifs. Les dialogues gèrent focus initial, boucle, Échap et restitution.
Les détails d'objets et de sorts fonctionnent au survol, au focus et au tactile.
La carte annonce position, état et conséquence de chaque nœud ainsi que les valeurs
PV/XP. Chaque route met à jour le titre, annonce la navigation et déplace le focus
vers son contenu. Un parcours Chromium clavier couvre Auth, Starter, Map, Combat et
Game Over, tandis qu'axe bloque les violations sérieuses/critiques des routes
principales (le contraste reste volontairement suivi par `P1-A11Y-02`).

### P1-A11Y-02 — Lisibilité et mouvement

- [x] Vérifier les contrastes texte, placeholder, bordures, états disabled et focus
  selon WCAG AA.
- [x] Supporter zoom 200 % et reflow sans perte d'information.
- [x] Respecter `prefers-reduced-motion` dans CSS, particules canvas, transitions de
  carte, animations SVG/SMIL et animations de combat.
- [x] Relier réellement les réglages taille de texte, particules, volume et vitesse
  à tous leurs consommateurs.
- [x] Ne pas transmettre une information uniquement par couleur, animation ou son.
- [x] Tester Windows High Contrast et navigation avec lecteur d'écran sur les flux
  critiques.

**Acceptation :** les critères WCAG 2.2 AA applicables aux parcours critiques sont
documentés et vérifiés.

**Statut : terminé.** Axe contrôle désormais les contrastes AA sans exclusion et
a permis de corriger les textes faibles de Database et Daily. Le zoom 200 % est
simulé sur les routes principales sans débordement horizontal. Le mouvement réduit
neutralise CSS, canvas, SMIL et combat ; les réglages taille, particules, volume et
vitesse sont vérifiés jusqu'à leurs consommateurs. Le mode Chromium Forced Colors,
le focus clavier et des instantanés de l'arbre ARIA couvrent le contrat automatisé.
Le référentiel, les preuves et la matrice de validation humaine NVDA/VoiceOver sont
documentés dans `docs/accessibility.md`.

## P1 — onboarding et règles compréhensibles

- [x] Expliquer la boucle : choisir, avancer, résoudre, améliorer, combattre,
  terminer/sauvegarder.
- [x] Transformer l'aide carte en tutoriel contextuel réouvrable.
- [x] Expliquer cible, coût, cooldown, ordre des tours, statuts et autoplay au
  premier combat.
- [x] Afficher avant validation les effets chiffrés d'une rune, d'un objet, d'un
  augment ou d'une amélioration.
- [x] Clarifier différence Normal/Daily et ce qui est conservé en invité.
- [x] Ajouter une encyclopédie filtrable seulement pour les mécaniques réellement
  actives.
- [x] Mesurer le temps jusqu'au premier combat et le taux d'abandon du tutoriel
  uniquement après définition de la politique de télémétrie.

**Acceptation :** un nouveau joueur peut finir son premier combat sans documentation
externe et sans devoir deviner le sens d'une action.

**Statut : terminé.** Le menu expose la boucle complète et mène vers un guide
filtrable limité aux règles exécutées. La carte et le premier combat disposent de
tutoriels automatiques, progressifs et réouvrables. Les choix affichent leurs effets
avant confirmation et les modes Normal, Daily et invité annoncent clairement leur
persistance. Aucune mesure comportementale n'est collectée : conformément au critère,
temps jusqu'au combat et abandon restent désactivés tant qu'une politique de
télémétrie consentie, minimisée et documentée n'existe pas. Les preuves sont décrites
dans `docs/onboarding.md`.

---

## P2 — tests et qualité

### P2-TEST-01 — Remplacer les tests de présence par des tests de comportement

- [x] Réécrire l'E2E « six biomes » pour piloter l'UI sans muter directement les
  stores ni marquer artificiellement les nœuds terminés.
- [x] Ajouter deux parcours verticaux réels : victoire et défaite.
- [x] Couvrir Normal, Daily, invité et compte authentifié.
- [x] Jouer au moins une occurrence de Combat, Elite, Shop, Rest, Event, Treasure,
  Exit et Boss.
- [x] Tester refresh, arrière navigateur, double clic et erreur réseau à chaque
  frontière critique.
- [x] Ajouter des tests RLS/RPC live adversariaux dans l'environnement Supabase CI.
- [x] Ajouter tests de state machine/property sur carte, inventaire et progression.
- [x] Ajouter tests visuels et axe sur les viewports cibles.
- [x] Éviter les assertions qui considèrent une case `[x]` de documentation comme
  preuve d'une fonctionnalité.

**Acceptation :** l'E2E échoue si un encounter, un combat ou une sauvegarde est
contourné et produit une trace lisible du parcours.

**Statut : terminé.** `six-biome-run.spec.ts` pilote exclusivement les contrôles
visibles, impose une vraie défaite et une vraie victoire, traverse les huit types
de nœuds et joint une trace textuelle à chaque exécution. La victoire utilise une
rune de fixture exposée uniquement par le serveur Playwright : elle ne modifie ni
seed, ni store, ni carte, et reste absente des builds normaux. Les matrices Daily,
authentification, reprise, idempotence, erreurs réseau, RLS/RPC, invariants,
responsive et axe sont couvertes par leurs suites comportementales dédiées.

### P2-TEST-02 — Rendre la couverture utile et stable

- [x] Corriger l'échec actuel à 27,98 % au lieu d'abaisser le seuil.
- [x] Ajouter des tests d'orchestration à `runService`, `runStore`, `authStore`,
  `enhancementStore`, repositories et calculateur de stats.
- [x] Inclure progressivement pages, composants et hooks critiques dans la mesure.
- [x] Retirer les barrels/types sans logique des métriques si leur présence brouille
  le signal.
- [x] Fixer des seuils par risque métier et les augmenter par paliers documentés.
- [x] Garantir que la couverture ne varie pas selon l'ordre ou le parallélisme.
- [x] Afficher un résumé court et conserver le rapport détaillé comme artefact CI.

**Acceptation :** `npm run check` passe de façon répétable et les modules de
sauvegarde/sécurité ont les seuils les plus élevés.

**Statut : terminé.** La mesure atteint 77,16 % de statements, 68,18 % de branches,
81,84 % de fonctions et 79,63 % de lignes sur le périmètre exécutable. Les tests
d'orchestration couvrent services, containers, Auth/Run repositories, stores et
calculateur de statistiques. Le premier anneau UI critique est inclus. Deux runs
successifs produisent un `coverage-summary.json` strictement identique ; la console
reste concise et le rapport HTML/LCOV est archivé par la CI.

### P2-TEST-03 — Tester depuis un environnement propre

- [x] Ajouter une job CI sans cache applicatif ni assets ignorés.
- [x] Exécuter installation verrouillée, génération/téléchargement d'assets selon la
  stratégie retenue, format, lint, types, tests, build et E2E.
- [x] Démarrer Supabase local, appliquer toutes les migrations append-only, lint le
  schéma et générer/vérifier les types.
- [x] Tester upgrade depuis un snapshot de schéma antérieur, pas seulement un reset.
- [x] Vérifier les headers/CSP, deep links SPA et 404 d'assets sur le build servi.

**Acceptation :** un clone vierge passe toute la pipeline sans fichier local caché.

**Statut : terminé.** La job `clean-room`, sans cache npm, refuse tout état généré
préexistant, installe le lockfile, vérifie les 187 assets Riot versionnés, rejoue un
upgrade v9→v12 puis un reset complet, lint le schéma, compare les types générés et
exécute les tests RLS/RPC, la validation source/build et les E2E. Le smoke test du
build sert cinq deep links avec les headers Vercel, valide les assets d'entrée et
exige un vrai 404 pour un asset absent. Cette mise en place a aussi détecté et corrigé
les types Supabase obsolètes des RPC v7 à v11.

## P2 — architecture et maintenabilité

### P2-ARCH-01 — Découper par responsabilités

Les fichiers les plus risqués sont notamment `CombatPage` (~928 lignes),
`BattleManager` (~764), `RunMapScreen` (~738), `runStore` (~710) et `AdminPage`
(~641), hors catalogues générés.

- [x] Extraire de `CombatPage` l'orchestrateur, le presenter, les commandes,
  récompenses et transitions de fin.
- [x] Séparer dans `BattleManager` validation, sélection de cible, résolution
  d'effet, événements et résultat.
- [x] Découper `runStore` en machine d'état et slices sans multiplier les sources de
  vérité.
- [x] Extraire de `RunMapScreen` le modèle de vue, le SVG, la sidebar et les dialogues.
- [x] Découper Admin/Database en routes ou panneaux autonomes.
- [x] Remplacer les styles inline répétés par composants et styles testables.
- [x] Garder les données de catalogue hors des métriques de complexité du code
  applicatif.

**Acceptation :** chaque module a une responsabilité et des dépendances explicites ;
les transitions métier peuvent être testées sans rendre une page React.

**Livré :** `runStore` est réduit à la composition/persistance de trois slices et
s'appuie sur des services de cycle de vie et d'autorité. Le moteur autoritaire,
`BattleManager`, `CombatPage` et `RunMapScreen` délèguent désormais validation,
effets, événements, présentation, complétion et modèle de vue à des modules dédiés.
Les panneaux Admin/Database et le fallback d'image sont autonomes. Les contrats purs
du validateur, du journal d'autorité et du journal de combat disposent de tests de
comportement sans rendu React.

### P2-ARCH-02 — Renforcer types, erreurs et observabilité

- [x] Utiliser des unions discriminées pour commandes, résultats et erreurs domaine.
- [x] Éliminer les casts qui transforment un `Exit` en faux encounter.
- [x] Générer et vérifier les types Supabase depuis le schéma appliqué.
- [x] Supprimer les modèles DB manuels concurrents et typer `SupabaseClient` avec les
  types générés dans tous les repositories.
- [x] Faire passer les pages/services par les repositories ou assumer et documenter
  les exceptions ; supprimer le container d'injection/caching s'il reste décoratif.
- [x] Casser le couplage circulaire `runStore` ↔ `runService`.
- [x] Centraliser logs structurés sans données personnelles ni bruit en production.
- [x] Ajouter capture des erreurs front et corrélation avec `runId`/commande, après
  validation de la politique de confidentialité.
- [x] Définir budgets de log, rétention et accès admin.
- [x] Ajouter des métriques techniques : échecs de save, retries, assets cassés,
  erreurs de réhydratation et durée des transitions.

**Acceptation :** une erreur critique est actionnable sans exposer de secret ni
nécessiter de reproduire manuellement toute la run.

**Livré :** les modèles persistés sont dérivés de `Database`, dont la dérive est
bloquée par `db:types:check`. Les encounters utilisent un garde discriminé qui exclut
explicitement `Start`/`Exit`, et `runService` reçoit désormais le joueur en entrée au
lieu d'importer le store. Le singleton et les options de cache inactives du container
ont été supprimés ; les exceptions d'accès direct sont documentées. L'observabilité
opt-in nettoie et borne les événements, capture les erreurs front et mesure save,
retry, asset, réhydratation et transitions avec corrélation technique.

### P2-SEC-01 — Durcir les outils d'administration

- [x] Neutraliser l'injection de formule CSV pour les cellules commençant, après
  espaces, par `=`, `+`, `-` ou `@`.
- [x] Tester guillemets, virgules, retours à la ligne et préfixes de formule dans les
  champs utilisateur exportés.
- [x] Attendre toutes les requêtes Admin avant de retirer l'état loading.
- [x] Afficher erreurs et retries dans l'UI au lieu de les limiter à la console.
- [x] Associer labels et filtres, rendre onglets/détails utilisables au clavier et au
  tactile.
- [x] Calculer le rang côté base plutôt que télécharger tout le leaderboard.

**Acceptation :** ouvrir un export dans Excel/LibreOffice n'exécute aucune formule
issue d'une valeur utilisateur et l'admin ne présente pas de données partielles
comme chargées.

**Livré :** le sérialiseur CSV force les préfixes de formule en texte puis applique
l'échappement RFC 4180. Le chargement initial attend les quatre sources Admin et une
erreur de détail invalide toute la lecture concernée ; chaque panneau affiche un
retry. Onglets, filtres et détails ont leurs rôles, relations, focus clavier et cibles
tactiles. Le rang privé utilise exclusivement `get_my_leaderboard_rank()` et un test
prouve qu'aucune lecture du leaderboard n'est effectuée.

## P2 — performance et production

- [x] Mesurer le bundle, le LCP, le CLS et l'INP sur mobile avant optimisation.
- [x] Précharger seulement les assets du starter, de l'équipe et du prochain nœud.
- [x] Redimensionner/convertir les images et définir largeur/hauteur pour éviter CLS.
- [x] Mettre cache immutable sur les assets versionnés.
- [x] Vérifier que canvas/particules s'arrêtent lorsque la page est masquée.
- [x] Profiler les re-renders Zustand/Combat/Map et sélectionner des slices stables.
- [x] Ajouter budgets CI pour bundle et assets.
- [x] Tester le build sur Chromium, Firefox et WebKit, desktop et mobile.
- [x] Vérifier mode offline/perte de réseau selon le contrat finalement retenu.
- [x] Mesurer le coût réel de `/auth` et des routes : le petit chunk d'entrée masque
  le chargement indirect du catalogue champions.
- [x] Vérifier les headers sur les réponses déployées, ajouter HSTS lorsque le
  domaine HTTPS est stabilisé et tester la CSP en production.
- [x] Épingler les GitHub Actions par SHA avec politique de mise à jour.
- [x] Aligner runtime et CI sur Node 24 compatible Vercel après la montée Dependabot et conserver
  uniquement les dépendances dont l'usage est confirmé
  (`@types/jest`, `user-event`, Tailwind) si l'audit d'usage les confirme.

**Acceptation :** les budgets sont chiffrés, versionnés et bloquent une régression
significative.

**Statut : terminé.** Les budgets v1 bloquent à 390 Ko gzip de JavaScript total,
205 Ko au démarrage, 225 Ko pour `/auth`, 560 Ko par chunk et 7,2 Mo déployés ; la
mesure du 8 août 2026 est respectivement de 389,6 Ko, 171,5 Ko, 175,5 Ko, 542,6 Ko
et 6,50 Mo. Le budget JavaScript total ne conserve plus que 0,4 Ko de marge après
la montée React 19. Le laboratoire mobile bloque LCP à 2,5 s, CLS à 0,1 et INP à 300 ms. Le
cache de travail Data Dragon de 16 Mo n'est plus publié, les animations s'arrêtent
en arrière-plan et la matrice de production couvre les trois moteurs en desktop et
mobile. Le contrat offline garantit la session invitée déjà chargée, sans promettre
les routes jamais chargées en l'absence de service worker.

## P2 — documentation et exploitation

### P2-DOC-01 — Aligner les documents sur le produit réel

- [x] Corriger `README.md` avec le périmètre exact des E2E et des 187 assets Riot
  réellement versionnés.
- [x] Corriger `docs/roadmap.md` pour distinguer capacités livrées, jalon qualité en
  cours et blocages de release.
- [x] Corriger `docs/gameplay.md` pour ne documenter que les effets réellement
  exécutés.
- [x] Corriger `docs/data-and-persistence.md` sur la frontière de confiance RPC, le
  mode invité et l'atomicité du loadout.
- [x] Mettre `docs/dependency-audit.md` à jour avec les versions et vulnérabilités
  actuelles.
- [x] Documenter la machine d'état de run et les invariants équipe/inventaire.
- [x] Documenter la formule de score daily, la date UTC et le ruleset versionné.
- [x] Ajouter une matrice « feature → implémentation → tests → statut ».
- [x] Archiver les anciens claims au lieu de les conserver cochés dans le backlog.

**Acceptation :** aucune documentation ne qualifie de terminée une fonction absente
du vrai parcours ou non prouvée par un test comportemental.

**Statut : terminé.** Les claims initiaux sont archivés, les limites d'effets et du
mode invité sont explicites, le score Daily v12 est relié à ses coefficients SQL et
la matrice de capacités sépare désormais Livré, Bloqué et À faire. L'audit rouge des
dépendances est documenté comme blocage réel, pas maquillé en validation.

### P2-DOC-02 — Préparer l'exploitation

- [x] Écrire runbooks de migration, rollback, incident de sauvegarde, classement
  compromis et indisponibilité Supabase.
- [x] Définir sauvegarde/restauration DB, RPO, RTO et test de restauration.
- [x] Documenter rotation des clés, gestion des environnements et promotion admin.
- [x] Séparer clairement développement, preview et production.
- [x] Ajouter checklist de release, smoke test et critères de rollback.
- [x] Définir support utilisateur et procédure d'export/suppression de compte.

**Statut : procédures livrées.** `docs/operations.md` indexe les runbooks incidents,
sauvegarde/restauration et release/support. La preuve d'un exercice sur projet
Supabase isolé reste un critère de chaque release bêta, pas une réussite simulée en
local.

**Acceptation :** un déploiement ou incident courant peut être géré à partir des
runbooks sans connaissance orale du projet.

---

## P3 — produit et enrichissement après stabilisation

### P3-PROD-01 — Contenu et équilibrage

- [x] Simuler les courbes de difficulté et d'économie après correction du moteur.
- [x] Définir rôles, forces/faiblesses et synergies des 10 champions.
- [x] Donner à chaque biome une mécanique, une identité visuelle et des choix propres.
- [x] Ajouter davantage d'encounters seulement avec effets supportés et testés.
- [x] Équilibrer rareté, prix, drops, stacking et choix d'augments par télémétrie
  consentie et playtests.
- [x] Versionner les règles pour préserver la comparabilité des daily runs.

**Statut : terminé pour le baseline v13.** Le modèle de balance v1 décrit les 10 champions et
les six biomes, mesure 100 runs complètes par difficulté et verrouille contenu,
économie et stacking. Six encounters supportés sont livrés sous gameplay/Daily v13,
avec v12 conservé pour les runs ouvertes. La cohorte reproductible compte 30 runs
scriptées par difficulté et n'expose aucune donnée personnelle. Toute télémétrie
réelle reste opt-in et agrégée selon `docs/content-balance.md`.

### P3-PROD-02 — Progression et personnalisation

- [x] Décider si les slots de starter supplémentaires font partie de l'équilibrage.
- [x] Concevoir skins/chromas sans avantage compétitif.
- [x] Ajouter achievements/quêtes seulement après fiabilisation des métriques.
- [x] Afficher un historique détaillé et comparable des runs.
- [x] Prévoir reset/saison/migration de progression avant toute économie durable.

**Statut : terminé.** Les slots 2/3 restent un avantage serveur explicite ; dix
concepts de chroma sans modificateur sont définis mais non annoncés comme livrés.
Achievements et quêtes restent désactivés derrière un contrat de métriques
`verified`. Le profil affiche l'attempt, le ruleset, l'équipe, l'économie et les
statistiques détaillées, en marquant les runs legacy non comparables. La politique
de saison conserve maîtrise, améliorations, cosmétiques et historique via migrations
additives ; voir `docs/progression-personalization.md`.

### P3-PROD-03 — Social et classement

- [x] Définir noms publics, anonymisation, modération et opt-out.
- [x] Ajouter filtres/saisons/rulesets au classement.
- [x] Prévoir signalement et invalidation d'un score.
- [x] Ne pas ajouter partage, amis ou spectateur avant le modèle de confidentialité.

**Statut : terminé.** Le nom de compte n'est plus une donnée de classement : alias
public validé ou pseudonyme anonyme, avec opt-out depuis les réglages. Les rangs sont
partitionnés par date et versions, rattachés à une saison serveur et filtrables dans
le Daily. Les signalements alimentent une file privée et l'invalidation admin retire
le score public tout en conservant sa piste d'audit. Aucun graphe social, partage ou
spectateur n'est introduit ; voir `docs/social-leaderboard.md`.

### P3-PROD-04 — Légal et confidentialité

- [x] Remplacer le texte « Terms of Service » du footer par un vrai lien ou le
  retirer tant que la page n'existe pas.
- [x] Rédiger mentions légales, confidentialité, cookies/télémétrie et suppression
  de compte selon les régions visées.
- [x] Vérifier les exigences Riot/Legal Jibber Jabber pour l'usage des assets et la
  présentation non affiliée.
- [x] Documenter les données publiques du leaderboard et leur durée de conservation.
- [ ] Obtenir un audit juridique avant monétisation.

**Statut produit : implémenté, validation externe bloquante.** `/legal` est public et
relié depuis Auth/Menu ; il couvre conditions, données, stockage local, télémétrie,
droits et suppression pour une cible France/UE. Le Daily public est limité à 13 mois
et les signalements traités deviennent purgeables après 24 mois. La vérification de
la politique Riot révèle qu'un disclaimer et la gratuité ne suffisent pas à lever le
risque d'un jeu utilisant leur PI. Toute bêta publique présentée comme validée et
toute monétisation restent interdites jusqu'à l'audit externe et l'analyse Riot ; voir
`docs/legal-and-privacy.md`.

---

## Décisions produit transverses — figées pour la bêta

- [x] **Langue de lancement :** français cohérent partout, puis anglais via un
  dictionnaire i18n complet.
- [x] **Mode invité :** progression locale explicitement séparée, sans fusion
  automatique lors du login.
- [x] **Daily :** date UTC, difficulté serveur fixe, une tentative créée au
  lancement, abandon consommé mais non classé.
- [x] **Autoplay :** OFF par défaut, contrôlable par le joueur et en pause à chaque
  décision joueur.
- [x] **Branches :** un chemin irréversible par biome.
- [x] **Défaite/abandon :** zéro candy sans vague terminée ; candies acquises
  conservées ensuite, sans bonus de victoire. Or et objets ne persistent pas.
- [x] **Inventaire plein :** achat refusé sans dépense ; récompense gratuite laissée
  sur place avec feedback explicite. Aucune perte silencieuse.
- [x] **XP des KO :** XP de victoire donnée à toute l'équipe, KO inclus ; aucun bonus
  d'XP séparé par kill.
- [x] **Offline :** invité officiellement local ; autorité en ligne obligatoire pour
  démarrer/vérifier une run connectée, avec état préservé et retry après coupure.
- [x] **Télémétrie :** analytics produit désactivées ; diagnostics opt-in, bornés et
  supprimés après 14 jours. Finalité et contrôles utilisateur requis avant activation.

Le contrat détaillé, ses raisons et ses limites sont dans
`docs/product-decisions.md` et `src/product/productDecisions.ts`.

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
