# TREE — Arbres d'amélioration des champions (Candies)

**Statut : TREE-01..10 implémentés en code pour 0.3.0 ; clôture de livraison et gates humaines encore ouvertes.** Les cases techniques décrivent le code et les preuves ciblées acquises ; elles ne déclarent pas la CI complète verte, une fusion ou un déploiement distant. [Audit et reproduction](../enhancement-tree-audit.md), [validation candidate et limites](../enhancement-trees-validation-0.3.0.md), [retour au TODO](../../TODO.md). Les composants sont dans `src/features/enhancements/ui/`, le contrat pur dans `src/game/enhancements/`, avec services/stores, runtime et RPC existants.

## Décisions de cadrage non négociables

- Les **Candies** financent l'amélioration/maîtrise ; les **Éclats** financent l'acquisition de champions (`P3-ECO-01`). **Ne pas ajouter une troisième monnaie et ne pas convertir automatiquement l'une dans l'autre.**
- Le catalogue 4 conserve **6 arbres de rôle / 72 nœuds** et ajoute **16 extensions ciblées**, soit **88 IDs**. Les 15 blocages historiques sont intentionnels et alignés entre client et SQL : **12 désactivations explicites** de mécaniques absentes et **3 descendants** refusés même si leur parent désactivé est déjà possédé. Les IDs et reçus sont conservés pour le remboursement attesté. Aucun cycle, parent absent ou seuil de maîtrise impossible. Les 16 spécialisations restent derrière une gate d’achat fermée ; voir les [rapports par ID](../audits/enhancement-trees.md).
- Base par rôle pour les champions existants, puis extension optionnelle par champion : pas de duplication entière des six arbres. Si un champion possède plusieurs rôles, conserver une règle stable explicite pour la sélection.
- Ne pas confondre progression durable du compte et progression **intra-run** de Veigar. Aucun stack gratuit. Le Daily officiel neutralise le loadout d’améliorations avec `{}` tout en conservant ses gains normaux de progression ; les tests SQL complets de cette transition doivent être verts avant clôture.
- Aucun achat actif pour une mécanique purement textuelle : les cartes indisponibles restent explorables et explicitement désactivées. Les effets achetables partagent descriptions FR/EN, aperçu, combat et replay. Aucun kit maintenu ne possède actuellement Assassin en premier rôle : les fixtures isolées de ce rôle ne prouvent pas un parcours public Assassin.
- Migration SQL uniquement append-only, permissions RPC/RLS côté serveur, transactions et idempotence ; invités sans dépense serveur. Les historiques replays restent figés.

## Ordre de réalisation

**Ordre suivi en code :** fiabilité (TREE-01..04), contrat/extensions/reset (TREE-05..07), puis UX/économie/admin (TREE-08..10). Les prix restent inchangés et tous les resets restent gratuits avec remboursement attesté. L’activation des spécialisations et tout futur changement de prix exigent encore des mesures et playtests humains `P2-BAL-01`.

### TREE-01 — Audit complet des graphes (P1, M)
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Générer la liste stable des 72 nœuds par rôle, puis les 16 extensions séparées : ID, libellé FR/EN, rang, branche, Candies, mastery requis, parents, effet, attribut serveur, visibilité.
  - [x] Vérifier unicité des IDs, références existantes, cycles, racines, chemins atteignables et coûts possibles sous les plafonds actuels.
  - [x] Reproduire/qualifier les 15 blocages signalés (Assassin 3, Tank 3, Mage 1, Tireur 1, Combattant 3, Support 4) ; produire un rapport par ID plutôt que modifier à l'aveugle.
  - [x] Représenter chaque arbre en graphe dirigé (ID stable, prérequis, rôles) et distinguer verrou de maîtrise et inaccessibilité structurelle.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Couvrir en tests la sélection de rôle/champion ; comparer le graphe visible aux validations `canUnlockNode` et aux RPC.
  - [x] Documenter les effets « implémenté », « partiel » ou « purement descriptif » avec responsable et correctif prévu.
  - [x] Générer un rapport JSON/Markdown par nœud et par cause d'inaccessibilité plutôt qu'un simple compteur global.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Tester une branche valide, un cycle volontaire, un parent inconnu, un nœud dupliqué et le seuil de maîtrise maximal.
  - [x] Consigner les tests automatiques à exécuter, leurs résultats et le diff avant/après dans la PR.
  - [x] Vérifier les consommateurs existants, les droits d'accès, les versions et l'absence de régression fonctionnelle.
**DoD :** une matrice exhaustive reproductible, zéro nœud orphelin non documenté, tests échouant sur les cas signalés.

### TREE-02 — Réparer dépendances et déblocages (P1, L ; dépend TREE-01)
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Justifier les 12 désactivations de mécaniques non supportées et les 3 descendants bloqués ; aligner le refus SQL/client et l’activation des possessions. Conserver tous les IDs et leurs reçus sans modifier artificiellement une topologie déjà valide.
  - [x] Formaliser verrouillage par niveau de maîtrise, Candies, nœud parent, capacité maximale, branche/rang, choix exclusif et limite de budget.
  - [x] Assurer qu'un nœud acheté est activable uniquement s'il est réellement atteignable et que ses prérequis sont encore satisfaits.
  - [x] Définir pour chaque nœud cassé le chemin légal attendu et le sort des comptes ayant déjà acquis ce nœud.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Tester graphes complets : déblocages successifs, ordre d'achat alternatif, achats simultanés, catalogue modifié, ID forgé, Candies insuffisants.
  - [x] Conserver les possessions et leur valeur attestée ; exclure explicitement les chaînes devenues invalides des bonus, avec reset gratuit documenté. La fermeture du gate d’achat ne retire pas les spécialisations déjà attestées.
  - [x] Appliquer les exigences AND/OR et rangs minimaux ; garder les IDs historiques sans alias ou renommage inutile.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Exécuter les probes SQL ciblées de refus, concurrence et possessions historiques, ainsi que les tests du contrat pur ; la nouvelle comparaison exhaustive des 88 lignes reste incluse dans la campagne SQL globale.
  - [x] Consigner les résultats locaux globaux dans la validation 0.3.0 et suivre la CI du dernier SHA dans la [PR #242](https://github.com/Thanan71/LolRogue/pull/242).
  - [x] Validation locale globale des consommateurs, permissions, versions et anciennes fixtures SQL : 4 155 tests unitaires et 371 tests PostgreSQL ; preuves dans la validation 0.3.0.
**DoD :** les 72 nœuds ont un chemin atteignable et testable ou sont explicitement et intentionnellement désactivés.

### TREE-03 — Corriger les descriptions et les calculs d'effets (P1, L ; dépend TREE-01)
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] « Tir Déchirant »/saignement : comparer le **15 %** annoncé à l'application réelle du DoT (base, durée, cumul, source, mitigation et arrondis) ; aligner contrat et tooltip.
  - [x] « Phénix » : résoudre l'incohérence **60 secondes** contre **une utilisation par combat**. Comme le jeu est au tour par tour, choisir et tester une sémantique explicite en tours/combats ; pas de cooldown temps réel fictif.
  - [x] « Combustion » : distinguer clairement **dégâts additionnels** et **puissance/statistique** ; appliquer exactement le bonus annoncé, sans double application.
  - [x] Formaliser formules et unités pour Tir Déchirant, Phénix, Combustion et Canalisation avant de corriger leur texte.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] « Canalisation » : harmoniser unités (% / points / tours), coûts et stacking ; éviter les conversions de taux ambiguës.
  - [x] Vérifier caps, ordre multiplicatif/additif, DoT/HoT, bouclier, effets de résurrection, dégâts physiques/magiques/vrais, multi-cible et effets passifs selon la mécanique disponible.
  - [x] Modifier ensemble calcul, textes FR/EN et tests de l'effet ; ne pas ajouter d'effets inapplicables au moteur actuel.
  - [x] Aligner description, moteur, UI et Edge ; distinguer % dégâts, bonus de statistique, durée en tours et activation par combat.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Tester probabilité 15 %, dégâts vrais et arrondis du saignement, Phénix une fois par combat, Combustion en puissance et Canalisation en points de hâte, avec textes FR/EN et vrais consommateurs de combat.
  - [x] Consigner les résultats locaux globaux dans la validation 0.3.0 et suivre la CI du dernier SHA dans la [PR #242](https://github.com/Thanan71/LolRogue/pull/242).
  - [x] Validation locale globale des consommateurs, permissions, versions et anciennes fixtures SQL : 4 155 tests unitaires et 371 tests PostgreSQL ; preuves dans la validation 0.3.0.
**DoD :** aucun des quatre cas connus n'annonce un bonus non résolu ; tables avant/après vérifiées.

### TREE-04 — Parité UI/combat/authority et RNG (P1, L ; dépend TREE-02/03)
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Créer une matrice nœud → règle runtime → effet combat → indicateur UI → sérialisation de run → vérification autoritaire.
  - [x] Comparer déterministiquement combats manuel/autoplay/Edge avec mêmes seed, roster, équipement, arbre et achats.
  - [x] Tester restauration/reload, replays de versions historiques, coexistence buffs, ordre des déclencheurs et exactitude du journal.
  - [x] Établir une fixture par catégorie d'effet et conserver les versions de moteur auxquelles elle s'applique.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Interdire qu'une amélioration purement UI injecte dégâts, Candies ou progression non vérifiés par l'Edge.
  - [x] Publier `run-engine-0.3.0`, gameplay 25 et progression 4, sans retoucher les octets du bundle 0.2.5 ni les autres moteurs historiques.
  - [x] Brancher les résultats de calcul de bonus sur les mêmes règles côté rendu, validation et replay ; conserver les hashes historiques.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Comparer source, manuel, autoplay, replay et bundle Edge enregistré sur seeds figées ; reprise au milieu du journal, rejeu historique et ressources/ledger exacts. Les 8 voies spécialisées ont leurs 24 probes dédiées.
  - [x] Consigner les résultats locaux globaux dans la validation 0.3.0 et suivre la CI du dernier SHA dans la [PR #242](https://github.com/Thanan71/LolRogue/pull/242).
  - [x] Validation locale globale des consommateurs, permissions, versions et anciennes fixtures SQL : 4 155 tests unitaires et 371 tests PostgreSQL ; preuves dans la validation 0.3.0.
**DoD :** zéro divergence documentée sur la matrice d'échantillons; résultats reproductibles, aucun effet fictif.

### TREE-05 — Contrat déclaratif d'arbre extensible (P2, L ; après TREE-01..04)
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Définir graphe d'arbre versionné : branches, étapes, prérequis simples/composites (`AND`/`OR`), maîtrise requise, nœuds exclusifs et budget.
  - [x] Séparer l'éligibilité pure côté moteur de l'affichage React et de l'écriture Supabase ; API stable pour prévisualiser un achat sans mutation.
  - [x] Conserver les arbres de rôle existants comme base ; surcharges par champion limitées aux nœuds réellement spécialisés.
  - [x] Écrire un schéma d'arbre validable avant rendu (version, parent, conditions, exclusions et effet moteur).
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Vérifier compatibilité multi-rôles, ordre déterministe, IDs sauvegardés, migrations et écrans historiques.
  - [x] Côté RPC, rejeter toute combinaison interdite même si un client altéré tente de contourner l'UI ; tracer la version de contrat.
  - [x] Créer des validateurs purs et des adaptateurs du format actuel sans toucher aux IDs stockés.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Tester schéma portable, AND/OR, rang minimal, exclusivité, budget, ordre déterministe et multi-rôles ; vérifier les cas RPC ciblés. Le validateur authority utilise la maîtrise figée réelle et le même contrat pour les possessions attestées.
  - [x] Consigner les résultats locaux globaux dans la validation 0.3.0 et suivre la CI du dernier SHA dans la [PR #242](https://github.com/Thanan71/LolRogue/pull/242).
  - [x] Validation locale globale des consommateurs, permissions, versions et anciennes fixtures SQL : 4 155 tests unitaires et 371 tests PostgreSQL ; preuves dans la validation 0.3.0.
**DoD :** nouveau nœud ajoutable par données + effet moteur + tests, sans modifier plusieurs validateurs divergents.

### TREE-06 — Spécialisations Garen, Annie, Soraka, Jinx (P3, XL ; après TREE-05)
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Garen : proposer une voie de durabilité et une voie d'exécution/pression cohérentes avec son kit ; pas de nouvelle mécanique de position inexistante.
  - [x] Annie : proposer burst versus contrôle/utilité en utilisant les statuts/états déjà exécutables ; documenter l'interaction avec le passif.
  - [x] Soraka : proposer soin ciblé versus protection d'équipe en respectant les règles de ciblage et les plafonds de soin.
  - [x] Jinx : proposer dégâts soutenus versus élimination/finisher, avec contrôle de snowball et coût d'opportunité.
  - [x] Documenter l'effet concret de chaque spécialisation avant de définir coût, seuil, durée et choix exclusif.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Pour les 16 nœuds : ID stable, textes FR/EN, coût 80/120, maîtrise 2/3, rang unique, formule, aperçu et exclusions symétriques. Les mesures automatiques sont publiées séparément de la validation humaine de balance.
  - [x] Prévoir exclusivité et décisions de build sans rendre obligatoire l'achat d'une voie complète ; comparaison contre arbres de rôle.
  - [x] Ne pas dupliquer la mécanique de `Katarina / P3-CHAMP-03` : le sprint Katarina conserve les **resets/actions bonus** ; TREE garantit seulement que son arbre Assassin reflète les effets réellement supportés.
  - [x] Créer des extensions ciblées pour Garen/Annie/Soraka/Jinx sans dupliquer les arbres entiers par rôle.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [x] Exécuter 24 probes couvrant les 8 voies en vrai BattleManager et source/Edge, plus 48 combats comparatifs (4 champions × 4 builds × 3 seeds) ; mesurer dégâts par tour, soins, survie et durée, avec textes FR/EN. Les 48 issues sont des défaites : ce scénario ne valide pas la balance.
  - [ ] Effectuer et approuver le playtest humain des spécialisations sur une cellule figée avant toute ouverture de leur gate.
  - [x] Consigner les résultats locaux globaux dans la validation 0.3.0 et suivre la CI du dernier SHA dans la [PR #242](https://github.com/Thanan71/LolRogue/pull/242).
  - [x] Validation locale globale des consommateurs, permissions, versions et anciennes fixtures SQL : 4 155 tests unitaires et 371 tests PostgreSQL ; preuves dans la validation 0.3.0.
**DoD code :** quatre champions, huit voies et seize nœuds intégrés et testés derrière gate fermée. **DoD activation non acquise :** équilibrage humain approuvé avant déblocage réel.

### TREE-07 — Réinitialisation sécurisée de l'arbre (P2/P3, L ; après TREE-05)
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Décider/documenter les resets gratuits, y compris les répétitions ; écarter la proposition de frais de 10 %. Le remboursement provient des achats réellement attestés, jamais d’un total fourni par le client.
  - [x] Prototyper aperçu avant confirmation : état remis à zéro, nœuds retirés, coût éventuel, Candies remboursées, solde final et conséquences sur les builds.
  - [x] Implémenter une **transaction RPC atomique et idempotente** : validation propriétaire, coût/remboursement, historique et conflit de requêtes concurrentes.
  - [x] Spécifier le coût/récompense d'un reset et le traitement d'une run active avant l'ajout du bouton.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Garantir conservation de maîtrise, Éclats, achats de champions, progression de run en cours et historique vérifié ; définir politique pour une run active avant d'autoriser reset.
  - [x] Ajouter journal comptable cohérent, anti-double clic, retry réseau, refus RLS et tests de non-création de Candies.
  - [x] Implémenter un unique RPC qui restaure l'état et écrit le journal comptable dans la même transaction.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Tester en SQL ciblé 0/1/N resets, double appel/retry, concurrence achat-reset, devis périmé, conservation de la run active, reçus historiques et absence de création de Candies.
  - [x] Consigner les résultats locaux globaux dans la validation 0.3.0 et suivre la CI du dernier SHA dans la [PR #242](https://github.com/Thanan71/LolRogue/pull/242).
  - [x] Validation locale globale des consommateurs, permissions, versions et anciennes fixtures SQL : 4 155 tests unitaires et 371 tests PostgreSQL ; preuves dans la validation 0.3.0.
**DoD :** somme comptable exacte, aucun double remboursement, opérations autorisées uniquement au propriétaire.

### TREE-08 — UI/UX lisible, mobile et accessible (P2, L ; dépend TREE-02/05)
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Représenter connexions/branches/rangs avec distinction visible acheté/disponible/bloqué/exclusif ; navigation clavier, focus, aria et lecture sans couleur.
  - [x] Afficher solde **Candies du compte**, dépenses de cet arbre et niveau de maîtrise séparément ; Éclats uniquement dans l'économie des champions.
  - [x] Au survol/focus/touch : effet actuellement actif, formule exacte, exemple chiffré avant/après sur champion réel, prérequis manquants et provenance des valeurs.
  - [x] Concevoir les états visuels séparés pour disponible, acheté, bloqué maîtrise, bloqué Candies et exclusivité.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Montrer progression de branche, coût du prochain nœud, coût estimé du chemin choisi et chemin conseillé **facultatif**, sans purchase automatique.
  - [x] Prévoir confirmation claire pour dépense irréversible/reset et erreurs d'état (chargement, retry, conflit, connexion indisponible).
  - [x] Couvrir automatiquement mobile 320 px, zoom navigateur réel 200/400 %, invité, FR/EN et axe ; réutiliser le système UI existant. Le lecteur d’écran humain reste une preuve distincte ci-dessous.
  - [x] Ajouter projection avant/après, aide accessible, coût de chemin, focus et confirmation sur le composant existant.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Exécuter 24 tests UI et 5 E2E : confirmations sans mutation préalable, double clic, comptes/champions remplacés, erreurs/retry, focus/Tab/Escape/restauration, devis de reset et invité. FR/EN, 320 px, zoom réel 200/400 %, axe et focus du titre à 400 % sont vérifiés automatiquement.
  - [x] Parcours VoiceOver validé par l’utilisateur le 22 octobre 2026 sur le candidat `69c31fd` ; Safari/macOS déclarés à jour, numéros et langue non précisés. Attestation et limites consignées dans la validation 0.3.0 ; ADM-34 n’est pas réutilisé.
  - [x] Consigner les résultats locaux globaux dans la validation 0.3.0 et suivre la CI du dernier SHA dans la [PR #242](https://github.com/Thanan71/LolRogue/pull/242).
  - [x] Validation locale globale des consommateurs, permissions, versions et anciennes fixtures SQL : 4 155 tests unitaires et 371 tests PostgreSQL ; preuves dans la validation 0.3.0.
**DoD :** un joueur comprend pourquoi il ne peut pas acheter et ce que le nœud changera effectivement.

### TREE-09 — Économie, coûts, plafonds (P2, L ; dépend TREE-01/04)
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Recalculer les coûts réels : socle 20/30/40, branches 50/80/150–200 ; publier le total du catalogue et les rangs supportés séparément. `supportedRanksMaximumCandies` vaut 650/650/780/780/500/750 par rôle ; `reachableMaximumCandies` reste null pour les six rôles à cause des exceptions. Chaque voie spécialisée coûte 200, les voies opposées ne se cumulent pas.
  - [x] Simuler une épargne casual/régulière avec seeds, cadence et probabilités déclarées ; 35 minutes par run est une durée supposée, pas un temps réel observé ni une mesure de rétention.
  - [x] Séparer recommandations de coûts et implémentation ; aucun nerf silencieux pour joueurs ayant déjà acheté.
  - [x] Définir les métriques de dépense par voie et les populations simulées ; garder acquisition champions en Éclats hors du calcul.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Préserver `P3-ECO-01` : **Éclats 400 pour l'achat permanent**, Candies pour maîtrise, Daily à roster commun, invités sans wallet.
  - [x] Conserver les prix actuels. Documenter scénarios défavorables et limites du modèle ; réserver tout futur ajustement aux cohortes et playtests humains `P2-BAL-01`.
  - [x] Simuler gain/dépense Candies sur cohortes et comparer plafonds selon difficultés sans toucher aux comptes existants.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [ ] **Prouver le résultat avant clôture.**
  - [x] Tester coûts minimaux, scénarios de pire cas, choix exclusifs, arrondis, scénarios d’épargne indépendants et absence de données suffisantes pour modifier les prix.
  - [ ] Recueillir les preuves humaines de balance avant toute future proposition de prix ou ouverture des spécialisations.
  - [x] Consigner les résultats locaux globaux dans la validation 0.3.0 et suivre la CI du dernier SHA dans la [PR #242](https://github.com/Thanan71/LolRogue/pull/242).
  - [x] Validation locale globale des consommateurs, permissions, versions et anciennes fixtures SQL : 4 155 tests unitaires et 371 tests PostgreSQL ; preuves dans la validation 0.3.0.
**DoD :** coût d'une voie compréhensible, pas de monnaie supplémentaire, résultat de balance reproductible.

### TREE-10 — Statistiques et exploitation admin (P2, M ; dépend TREE-07/09)
- [x] **Définir le contrat et les cas à couvrir.**
  - [x] Définir évènements minimalistes, agrégés et respectueux de la vie privée : nœud acheté, spécialisation choisie, reset, solde, progression, victoire par build.
  - [x] Distinguer achats permanents et récompenses authority ; aucun point de statistiques ne modifie le solde.
  - [x] Afficher parts d’acheteurs, dépenses/remboursements, choix de voie et cohortes de builds figés avec effectifs et intervalles admissibles. L’exposition au catalogue n’est pas collectée : aucune conversion d’achat ou causalité victoire/build n’est inventée ; petits échantillons, répétitions et troncature sont signalés.
  - [x] Fixer un schéma minimal d'événement agrégé sans données personnelles et réutilisable par `ADM-20`.
  - [x] Identifier les données d'entrée, les préconditions et la responsabilité de chaque module concerné.
- [x] **Réaliser les changements et conserver les compatibilités.**
  - [x] Exposer l'analyse dans le périmètre admin **ADM-20**, sans inventer un deuxième tableau de bord ou une deuxième table de Candies.
  - [x] Tester droits admin, agrégations serveur, cardinalités et seuil « échantillon insuffisant ».
  - [x] Faire consommer les mêmes agrégats validés par SQL au module admin ; aucun double ledger Candies.
  - [x] Traiter explicitement erreurs, valeurs absentes et mises à jour concurrentes lorsque pertinentes.
- [x] **Prouver le résultat avant clôture.**
  - [x] Exécuter les probes ciblées de confidentialité admin, achats/reset attestés, cohortes figées, petits effectifs, répétitions et données incomplètes ; les agrégats ne réécrivent aucun solde.
  - [x] Consigner les résultats locaux globaux dans la validation 0.3.0 et suivre la CI du dernier SHA dans la [PR #242](https://github.com/Thanan71/LolRogue/pull/242).
  - [x] Validation locale globale des consommateurs, permissions, versions et anciennes fixtures SQL : 4 155 tests unitaires et 371 tests PostgreSQL ; preuves dans la validation 0.3.0.
**DoD :** une source de métriques cohérente, aucun double dashboard.

## Gate de clôture

- [x] Les 72 nœuds de rôle sont classés par ID : 57 atteignables, 12 désactivés et 3 descendants bloqués avec justification ; les 16 extensions sont séparées et gated. Aucun orphelin ni achat actif pour une mécanique absente.
- [x] Les quatre corrections connues, le contrat déclaratif et les chemins manuels/autoplay/source/Edge sont couverts par les preuves automatiques ciblées ; les octets historiques sont conservés.
- [x] Les RPC d’achat/reset et les agrégats admin ont leurs contrôles SQL ciblés de permissions, idempotence, concurrence et conservation des dépenses ; aucune conversion Candies ↔ Éclats.
- [x] UI FR/EN : 24 tests UI et 5 E2E locaux, 320 px, zoom réel 200/400 %, axe et navigation/focus automatiques.
- [x] Nouvelle UI validée avec VoiceOver par l’utilisateur le 22 octobre 2026 ; attestation distincte de ADM-34, versions déclarées à jour sans numéros précis.
- [ ] Balance humaine des 8 voies approuvée avant activation ; conserver la gate fermée jusque-là. Les 48 défaites simulées ne constituent pas cette approbation.
- [x] Campagne SQL complète et anciennes fixtures remises au vert : 371/371, y compris Daily neutre et gains normaux ; contrôles locaux et artefacts vérifiés.
Contrôle CI obligatoire : consulter les checks du dernier SHA sur la [PR #242](https://github.com/Thanan71/LolRogue/pull/242/checks). Les résultats locaux ne présument pas leur succès.
- [ ] PR, fusion éventuelle et déploiement migrations/Edge/frontend vérifiés séparément sur la cible autorisée ; aucun état distant attesté à ce stade.

Preuves, dimensions moteur/hash et comptages finaux : [validation 0.3.0](../enhancement-trees-validation-0.3.0.md). Les preuves techniques et VoiceOver sont consignées ; TREE-06/09 conservent la validation humaine de balance ouverte avant activation. Fusion et déploiement restent des étapes distinctes.
