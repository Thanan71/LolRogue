# TREE — Arbres d'amélioration des champions (Candies)

**Statut : proposé, non implémenté.** Périmètre initial : `src/data/enhancementTrees.ts`, `src/components/EnhancementTree.tsx`, `src/services/enhancementService.ts`, `src/stores/enhancementStore.ts`, `src/game/rules/CombatRuleRuntime.ts`, RPC/repositories Supabase. [Retour au TODO](../../TODO.md).

## Décisions de cadrage non négociables

- Les **Candies** financent l'amélioration/maîtrise ; les **Éclats** financent l'acquisition de champions (`P3-ECO-01`). **Ne pas ajouter une troisième monnaie et ne pas convertir automatiquement l'une dans l'autre.**
- Le catalogue actuellement contrôlé comporte **6 arbres de rôle / 72 nœuds**. Le précédent audit a signalé **15 nœuds inaccessibles** : Assassin 3, Tank 3, Mage 1, Tireur 1, Combattant 3, Support 4. Ces nombres sont des hypothèses de départ à **recalculer par un test de graphe**, pas des preuves déjà clôturées.
- Base par rôle pour les champions existants, puis extension optionnelle par champion : pas de duplication entière des six arbres. Si un champion possède plusieurs rôles, conserver une règle stable explicite pour la sélection.
- Ne pas confondre progression durable du compte et progression **intra-run** (Veigar `v22`). Les investissements Candies n'accordent jamais de stacks Veigar gratuits ; Daily officiel et replay doivent rester soumis à leurs contrats.
- Aucun bonus purement textuel : descriptions FR/EN, aperçu, calcul UI, combat et replay doivent utiliser la même mécanique réellement supportée.
- Migration SQL uniquement append-only, permissions RPC/RLS côté serveur, transactions et idempotence ; invités sans dépense serveur. Les historiques replays restent figés.

## Ordre de réalisation

**Phase 1 — fiabilité (TREE-01..04)** : corriger tous les arbres existants avant toute spécialisation. **Phase 2 — modèles (TREE-05..07)** : préparer extensions et reset. **Phase 3 — UX/mesure (TREE-08..10)** : progression transparente, économie et analyse. Aucun changement majeur de coûts sans mesures et playtests `P2-BAL-01`.

### TREE-01 — Audit complet des graphes (P1, M)
- [ ] Générer la liste stable des 72 nœuds par rôle : ID, libellé FR/EN, rang, branche, Candies, mastery requis, parents, effet, attribut serveur, visibilité.
- [ ] Vérifier unicité des IDs, références existantes, cycles, racines, chemins atteignables et coûts possibles sous les plafonds actuels.
- [ ] Reproduire/qualifier les 15 blocages signalés (Assassin 3, Tank 3, Mage 1, Tireur 1, Combattant 3, Support 4) ; produire un rapport par ID plutôt que modifier à l'aveugle.
- [ ] Couvrir en tests la sélection de rôle/champion ; comparer le graphe visible aux validations `canUnlockNode` et aux RPC.
- [ ] Documenter les effets « implémenté », « partiel » ou « purement descriptif » avec responsable et correctif prévu.
**DoD :** une matrice exhaustive reproductible, zéro nœud orphelin non documenté, tests échouant sur les cas signalés.

### TREE-02 — Réparer dépendances et déblocages (P1, L ; dépend TREE-01)
- [ ] Réparer la topologie des 15 nœuds ou les prérequis incomplets, sans rebaptiser les IDs déjà sauvegardés ; si changement d'ID nécessaire, prévoir migration explicite.
- [ ] Formaliser verrouillage par niveau de maîtrise, Candies, nœud parent, capacité maximale, branche/rang, choix exclusif et limite de budget.
- [ ] Assurer qu'un nœud acheté est activable uniquement s'il est réellement atteignable et que ses prérequis sont encore satisfaits.
- [ ] Tester graphes complets : déblocages successifs, ordre d'achat alternatif, achats simultanés, catalogue modifié, ID forgé, Candies insuffisants.
- [ ] Protéger les anciennes sauvegardes/droits acquis : pas de retrait silencieux ; définir compensation si un achat historique devient incompatible.
**DoD :** les 72 nœuds ont un chemin atteignable et testable ou sont explicitement et intentionnellement désactivés.

### TREE-03 — Corriger les descriptions et les calculs d'effets (P1, L ; dépend TREE-01)
- [ ] « Tir Déchirant »/saignement : comparer le **15 %** annoncé à l'application réelle du DoT (base, durée, cumul, source, mitigation et arrondis) ; aligner contrat et tooltip.
- [ ] « Phénix » : résoudre l'incohérence **60 secondes** contre **une utilisation par combat**. Comme le jeu est au tour par tour, choisir et tester une sémantique explicite en tours/combats ; pas de cooldown temps réel fictif.
- [ ] « Combustion » : distinguer clairement **dégâts additionnels** et **puissance/statistique** ; appliquer exactement le bonus annoncé, sans double application.
- [ ] « Canalisation » : harmoniser unités (% / points / tours), coûts et stacking ; éviter les conversions de taux ambiguës.
- [ ] Vérifier caps, ordre multiplicatif/additif, DoT/HoT, bouclier, effets de résurrection, dégâts physiques/magiques/vrais, multi-cible et effets passifs selon la mécanique disponible.
- [ ] Modifier ensemble calcul, textes FR/EN et tests de l'effet ; ne pas ajouter d'effets inapplicables au moteur actuel.
**DoD :** aucun des quatre cas connus n'annonce un bonus non résolu ; tables avant/après vérifiées.

### TREE-04 — Parité UI/combat/authority et RNG (P1, L ; dépend TREE-02/03)
- [ ] Créer une matrice nœud → règle runtime → effet combat → indicateur UI → sérialisation de run → vérification autoritaire.
- [ ] Comparer déterministiquement combats manuel/autoplay/Edge avec mêmes seed, roster, équipement, arbre et achats.
- [ ] Tester restauration/reload, replays de versions historiques, coexistence buffs, ordre des déclencheurs et exactitude du journal.
- [ ] Interdire qu'une amélioration purement UI injecte dégâts, Candies ou progression non vérifiés par l'Edge.
- [ ] En cas de changement de règles d'authority, utiliser une version future distincte de `run-engine-v22`, sans retoucher les bundles historiques.
**DoD :** zéro divergence documentée sur la matrice d'échantillons; résultats reproductibles, aucun effet fictif.

### TREE-05 — Contrat déclaratif d'arbre extensible (P2, L ; après TREE-01..04)
- [ ] Définir graphe d'arbre versionné : branches, étapes, prérequis simples/composites (`AND`/`OR`), maîtrise requise, nœuds exclusifs et budget.
- [ ] Séparer l'éligibilité pure côté moteur de l'affichage React et de l'écriture Supabase ; API stable pour prévisualiser un achat sans mutation.
- [ ] Conserver les arbres de rôle existants comme base ; surcharges par champion limitées aux nœuds réellement spécialisés.
- [ ] Vérifier compatibilité multi-rôles, ordre déterministe, IDs sauvegardés, migrations et écrans historiques.
- [ ] Côté RPC, rejeter toute combinaison interdite même si un client altéré tente de contourner l'UI ; tracer la version de contrat.
**DoD :** nouveau nœud ajoutable par données + effet moteur + tests, sans modifier plusieurs validateurs divergents.

### TREE-06 — Spécialisations Garen, Annie, Soraka, Jinx (P3, XL ; après TREE-05)
- [ ] Garen : proposer une voie de durabilité et une voie d'exécution/pression cohérentes avec son kit ; pas de nouvelle mécanique de position inexistante.
- [ ] Annie : proposer burst versus contrôle/utilité en utilisant les statuts/états déjà exécutables ; documenter l'interaction avec le passif.
- [ ] Soraka : proposer soin ciblé versus protection d'équipe en respectant les règles de ciblage et les plafonds de soin.
- [ ] Jinx : proposer dégâts soutenus versus élimination/finisher, avec contrôle de snowball et coût d'opportunité.
- [ ] Pour chaque nœud : ID stable, nom/description FR/EN, coût, niveau, formule chiffrée, effet autoritaire, aperçu, tests, mesure de balance et règle de cumul.
- [ ] Prévoir exclusivité et décisions de build sans rendre obligatoire l'achat d'une voie complète ; comparaison contre arbres de rôle.
- [ ] Ne pas dupliquer la mécanique de `Katarina / P3-CHAMP-03` : le sprint Katarina conserve les **resets/actions bonus** ; TREE garantit seulement que son arbre Assassin reflète les effets réellement supportés.
**DoD :** quatre spécialisations entièrement jouables et mesurées, équilibrage validé avant déblocage réel.

### TREE-07 — Réinitialisation sécurisée de l'arbre (P2/P3, L ; après TREE-05)
- [ ] Décider/documenter politique produit de reset (proposition : premier gratuit puis coût de 10 %), après simulations ; ne pas considérer ces valeurs comme déjà validées.
- [ ] Prototyper aperçu avant confirmation : état remis à zéro, nœuds retirés, coût éventuel, Candies remboursées, solde final et conséquences sur les builds.
- [ ] Implémenter une **transaction RPC atomique et idempotente** : validation propriétaire, coût/remboursement, historique et conflit de requêtes concurrentes.
- [ ] Garantir conservation de maîtrise, Éclats, achats de champions, progression de run en cours et historique vérifié ; définir politique pour une run active avant d'autoriser reset.
- [ ] Ajouter journal comptable cohérent, anti-double clic, retry réseau, refus RLS et tests de non-création de Candies.
**DoD :** somme comptable exacte, aucun double remboursement, opérations autorisées uniquement au propriétaire.

### TREE-08 — UI/UX lisible, mobile et accessible (P2, L ; dépend TREE-02/05)
- [ ] Représenter connexions/branches/rangs avec distinction visible acheté/disponible/bloqué/exclusif ; navigation clavier, focus, aria et lecture sans couleur.
- [ ] Afficher solde **Candies du compte**, dépenses de cet arbre et niveau de maîtrise séparément ; Éclats uniquement dans l'économie des champions.
- [ ] Au survol/focus/touch : effet actuellement actif, formule exacte, exemple chiffré avant/après sur champion réel, prérequis manquants et provenance des valeurs.
- [ ] Montrer progression de branche, coût du prochain nœud, coût estimé du chemin choisi et chemin conseillé **facultatif**, sans purchase automatique.
- [ ] Prévoir confirmation claire pour dépense irréversible/reset et erreurs d'état (chargement, retry, conflit, connexion indisponible).
- [ ] Tester mobile 320 px, 200/400 % zoom, VoiceOver/NVDA, mode invité et contenus FR/EN ; s'appuyer sur le système UI existant.
**DoD :** un joueur comprend pourquoi il ne peut pas acheter et ce que le nœud changera effectivement.

### TREE-09 — Économie, coûts, plafonds (P2, L ; dépend TREE-01/04)
- [ ] Inventorier les coûts existants : tronc environ **20/30/40**, branches **50/80/150–200 Candies** et total observé d'environ **930–1080** selon l'arbre ; recalculer avec catalogue actuel et chemins exclusifs.
- [ ] Simuler progression joueur casual/régulier, temps réel pour atteindre un rang, variation par difficulté/run, Candies gagnées et dépensées.
- [ ] Séparer recommandations de coûts et implémentation ; aucun nerf silencieux pour joueurs ayant déjà acheté.
- [ ] Préserver `P3-ECO-01` : **Éclats 400 pour l'achat permanent**, Candies pour maîtrise, Daily à roster commun, invités sans wallet.
- [ ] Ajuster uniquement sur cohortes et playtests humains (`P2-BAL-01`), en documentant marge, variance et scénarios défavorables.
**DoD :** coût d'une voie compréhensible, pas de monnaie supplémentaire, résultat de balance reproductible.

### TREE-10 — Statistiques et exploitation admin (P2, M ; dépend TREE-07/09)
- [ ] Définir évènements minimalistes, agrégés et respectueux de la vie privée : nœud acheté, spécialisation choisie, reset, solde, progression, victoire par build.
- [ ] Distinguer achats permanents et récompenses authority ; aucun point de statistiques ne modifie le solde.
- [ ] Mesurer taux d'achat, nœuds bloquants, builds dominants, préférences de branche et corrélations victoire/difficulté avec effectifs et intervalles.
- [ ] Exposer l'analyse dans le périmètre admin **ADM-19..24**, sans inventer un deuxième tableau de bord ou une deuxième table de Candies.
- [ ] Tester droits admin, agrégations serveur, cardinalités et seuil « échantillon insuffisant ».
**DoD :** une source de métriques cohérente, aucun double dashboard.

## Gate de clôture

- [ ] Arbres historiques : 72/72 nœuds intentionnellement accessibles (ou exceptions explicitement justifiées), pas d'orphelins ni d'effets « tooltip only ».
- [ ] Conversions (15 %, Phénix, Combustion, Canalisation) testées ; chaque achat irréversible correspond à un effet réel.
- [ ] Parité client/manual/autoplay/Edge et replays inchangés ; aucune génération de Candies non autorisée.
- [ ] RPC/RLS auditée, double soumission et transactions concurrentes testées, aucune conversion Candies ↔ Éclats.
- [ ] UI FR/EN et accessibilité vérifiées ; playtests humains avant décisions de balance.
