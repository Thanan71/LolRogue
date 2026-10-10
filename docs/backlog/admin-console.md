# ADM — Administration fiable et exploitable

**Statut : planifié, non implémenté.** 7 sprints, **36 tâches** (`ADM-01` à `ADM-36`). Cible : `src/pages/AdminPage.tsx`, `src/pages/admin/useAdminData.ts` et panneaux existants, vues/RPC PostgreSQL, `docs/administration.md`. [Retour au TODO](../../TODO.md) · [Architecture](architecture-maintenance.md).

## État observé et frontières

- `AdminDashboardPanel.tsx` affiche `active_today` mais transforme une valeur manquante en **0** ; vérifier l'existence/actualisation SQL avant de conclure qu'aucun joueur n'est actif.
- `useAdminData.ts` limite la liste des joueurs à **100**, les runs au paramètre courant (100 par défaut) et les logs/rapports à un nombre fixe ; la limite effective du service peut aussi plafonner les réponses. **Un tableau chargé n'est pas un total global**, et son export n'est pas un export exhaustif.
- `admin_stats`, `admin_player_stats`, `authority_attempt_aggregates` et les cohortes existent déjà : **étendre** ces contrats, ne pas créer un doublon de métriques.
- Les panneaux dashboard, authority/field calibration et modération existent déjà ; l'architecture cible réutilise ces modules.
- Les logs DB sont **désactivés par défaut**, activables explicitement ; ne pas les rendre obligatoires, ne pas stocker de secrets ni introduire une surveillance personnelle.
- L'accès admin réel repose sur **PostgreSQL, permissions, RLS et `is_current_user_admin()`** : le `AdminRoute` React n'est pas une barrière de sécurité. Ne pas exposer `service_role` dans le frontend.
- Les soldes **Candies** et **Éclats** sont distincts ; `P3-ECO-01` livre les Éclats derrière un flag OFF, pas une émission live garantie. Éviter de prétendre que les tableaux financiers sont exacts avant réconciliation ledger/solde.

## ADM-S1 — Fiabilité des données et définitions (P1 ; ADM-01..06)

### ADM-01 — Corriger « joueurs actifs aujourd'hui »
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Examiner la définition de `active_today` dans les vues SQL, l'actualisation et la lecture `admin_stats` ; distinguer métrique absente, valeur nulle et zéro légitime.
  - [ ] Choisir activité vérifiable (dernière activité ou action validée) avec fenêtre UTC/date métier explicite, déduplication de comptes et exclusion bots/tests si applicable.
  - [ ] Définir ce qui constitue une activité quotidienne, la fenêtre UTC et la différence valeur absente/0.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Afficher « indisponible »/« données insuffisantes » à la place de `0` en cas de clé absente/erreur ; documenter le calcul.
  - [ ] Ajouter test SQL + test composant pour aucun actif, actif réel, métrique absente, erreur et fuseau.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester utilisateur actif, métrique absente, journée vide, erreur SQL et fuseau.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-02 — Distinguer Candies en circulation/gagnés/dépensés
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Définir clairement *gagnés à vie*, *dépensés*, *remboursés* et *solde en circulation*, avec conservation des montants ; distinguer la maîtrise des Candies.
  - [ ] Auditer tables de progression, achats et ledger actuellement disponibles ; si nécessaire ajouter une migration **append-only** avec événements atomiques/idempotents (pas d'inférence fragile depuis le solde).
  - [ ] Spécifier un ledger Candies avec earned/spent/refunded/balance et réconciliation, distinct des Éclats.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Réconcilier par compte les soldes avant/après, refunds `TREE-07`, anciennes récompenses et cas historique non renseigné ; exposer valeur inconnue quand non calculable.
  - [ ] Tester achat répété, deux écritures concurrentes, reward retry, run rejetée, RLS et migration de comptes existants.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester dépenses concurrentes, refund, run rejetée, historique sans ledger et RLS.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-03 — Définir le dictionnaire des indicateurs
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Pour chaque carte, écrire formule, source, période, timezone, population incluse/exclue, filtre `verified` et stratégie d'agrégation.
  - [ ] Garder les mesures « runs » / « attempts » / « Daily » / « comptes » distinctes ; pas de comparaisons trompeuses.
  - [ ] Documenter numérateur/dénominateur, date, source SQL, filtre et population de chaque KPI.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Associer contract test à chaque clef de `admin_stats` et documentation visible dans un tooltip admin.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester toutes les clés métriques attendues, unité, valeur null et fenêtres de dates.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-04 — Distinguer totaux réels et lignes affichées
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Utiliser requêtes `count: exact`/agrégats serveur pour total joueurs/runs/victoires ; ne jamais sommer les 100/1000 premières lignes.
  - [ ] Indiquer nombre affiché, total correspondant aux filtres, chargement/erreur et période ; éviter statistiques calculées depuis un échantillon tronqué.
  - [ ] Définir counts exacts serveur et taille de page indépendants pour runs, joueurs et logs.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Tester 0, 101, 1001 lignes, pages vides, filtre changé et incohérence de count.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester 0/100/101/1000/1001 enregistrements et changement de filtre.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-05 — Vérifier les accès aux nouvelles métriques
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Tester toutes les nouvelles vues et RPC en `anon`, `authenticated` non-admin, admin et service role dans un environnement isolé.
  - [ ] Garder `security_invoker`/RLS réels, aucune fuite de PII, désactivation du write client sur les colonnes admin.
  - [ ] Établir matrice d'autorisations anon, connecté normal, admin, service-role sur nouvelles vues.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Ne pas élargir les privilèges existants simplement pour satisfaire le dashboard.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester accès refusé sans fuite, accès autorisé, RPC usurpée et rôle révoqué.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-06 — États de chargement et erreurs fiables
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Vérifier états indépendants stats/joueurs/runs/logs/authority/modération ; aucune panne d'une section ne doit faire disparaître les autres.
  - [ ] Ajouter retry par onglet, données périmées indiquées, annulation des requêtes obsolètes, état vide et messages FR/EN.
  - [ ] Définir états idle/loading/stale/error/empty par section et invalidation des réponses obsolètes.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Tester déconnexion, session expirée, réseau hors ligne et course entre deux recherches.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester déconnexion pendant chargement, deux filtres successifs, timeout et retry.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.
**Gate ADM-S1 :** les chiffres affichés ont une définition et une source testées ; clé absente ≠ zéro ; aucune fuite RLS.

## ADM-S2 — Fiches joueurs et historiques de runs (P1/P2 ; ADM-07..11)

### ADM-07 — Pagination réelle côté serveur
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Remplacer `.limit(100)` joueurs et limite bornée des runs par une pagination serveur par curseur ou `range` + count.
  - [ ] Garantir ordre stable (date + ID), filtres/sort persistants et récupération des membres d'équipe par pages.
  - [ ] Choisir curseur stable ou range + count et double tri date/ID ; pageSize borné.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Éviter `N+1` et requêtes `.in(...)` démesurées ; tester pagination concurrente avec insertions.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester insertion concurrente, dernière page partielle, retour arrière et grands volumes.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-08 — Recherche et filtres joueurs
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Rechercher par identifiant/nom/pseudo selon permissions ; filtres inscription, activité, runs vérifiées et état du compte.
  - [ ] Faire rechercher côté serveur, protéger chaînes utilisateur, valider limites et prévoir debounce contrôlé.
  - [ ] Définir champs de recherche autorisés, index compatibles et traitement des caractères spéciaux.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Résultats complets paginés, jamais recherche uniquement parmi les 100 lignes locales.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester casse, Unicode, entrée vide, recherche hors page courante et injection de filtre.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-09 — Fiche joueur opérationnelle
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Afficher profil minimal utile, dates, activité, statistiques vérifiées, maîtrise, arbres et soldes Candies/Éclats séparés.
  - [ ] Rendre visible provenance des données, valeurs absentes, historique d'achats et raisons des écarts de ledger.
  - [ ] Lister les champs non sensibles d'une fiche joueur et les sources vérifiées de soldes/maîtrise.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Mettre données sensibles derrière permission explicite, masquer emails/identifiants non nécessaires.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester compte sans runs, ancien utilisateur, invité, données partiellement absentes et permission.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-10 — Explorateur de runs
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Étendre filtres existants : joueur, date, difficulté, mode, résultat, biome, longueur, champion et moteur/versions.
  - [ ] Utiliser filtrage/count serveur ; distinguer `runs` persistées et `attempts` authority non finalisés.
  - [ ] Définir schéma de filtres serveur réutilisable et frontière runs sauvegardées versus attempts.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Préserver les filtres après détail/retour et fournir lien permanent seulement si politique de confidentialité l'autorise.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester filtres combinés, tri stable, run rejetée, intervalle date et URL de retour.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-11 — Détail run et exports exacts
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Afficher timeline et journal sûr : composition, builds, actions, progression, gains vérifiés, codes de rejet et version de moteur.
  - [ ] Conserver les exports CSV existants et leur anti-injection formule ; proposer export **de tous les résultats filtrés** par pagination serveur ou export borné annoncé.
  - [ ] Définir périmètre exporté (page ou totalité filtrée), plafond et confirmation de volume.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Tester UTF-8, tri, nombre total, idempotence, anonymisation et gros volumes ; aucune élévation de droits.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester export >100 lignes, caractères CSV dangereux, UTF-8, consentement et autorisations.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.
**Gate ADM-S2 :** au-delà de 100 joueurs/1000 runs les comptes et exports restent exacts ; chaque fiche est accessible uniquement selon permissions.

## ADM-S3 — Analytics temporels et rétention (P2 ; ADM-12..16)

### ADM-12 — Courbes temporelles
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Ajouter acquisitions, activité, démarrages, fins vérifiées, victoires et Daily par jour/semaine sur plage choisie.
  - [ ] Définir granulation jour/semaine, bornes inclusives, UTC et traitement des périodes vides.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Agréger côté PostgreSQL, fuseau explicite, périodes sans données, limites de requêtes et tests de bornes de date.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester passage minuit, changement de fuseau, absence de données et fenêtre inversée.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-13 — Rétention
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Définir D1/D7/D30 et dénominateurs de cohorte de création, sans confondre connexion, action de jeu et victoire.
  - [ ] Définir cohorte D1/D7/D30 et exclusion des cohortes dont la période est incomplète.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Écarter les cohortes trop récentes/incomplètes ; afficher N, date et éventuelle incertitude.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester N nul, cohorte récente, retour le jour exact et absence de rétention.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-14 — Funnel de jeu
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Instrumenter, à partir d'événements autorisés, inscription → début run → premier combat → fin run → retour.
  - [ ] Documenter les événements utiles du parcours sans instrumentation invasive ni double comptage.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Éviter double comptage à cause des retries et distinguer invités des comptes connectés.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester abandon avant combat, multi-retry, invité et doublon d'événement.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-15 — Filtres comparables
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Segmenter difficulté, mode, période, appareil si mesure autorisée, jeu nouveau/ancien et version de moteur.
  - [ ] Fixer segments autorisés et comparabilité d'un même engine/ruleset et d'un même mode.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Ne pas comparer deux règles autoritaires différentes comme une seule population ; indiquer changements de version et effectif.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester changement de version en période, série incomplète et mélange Daily/classique.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-16 — Qualité statistique
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Afficher tailles d'échantillon, taux et intervalles (Wilson si pertinent) ; état « données insuffisantes ».
  - [ ] Définir seuils d'effectif et intervalle statistique selon numérateur/dénominateur.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Tester données vides, dates invalides, valeurs manquantes, agrégats partiels et changements de filtre.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester N=0, N=1, 100 % de succès, cohortes partielles et variance élevée.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.
**Gate ADM-S3 :** aucun chiffre analytique déduit du seul ensemble des lignes chargées ; cohortes et périodes explicites.

## ADM-S4 — Équilibrage séparé de l'exploitation (P2 ; ADM-17..21)

### ADM-17 — Espace « Équilibrage »
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Séparer écrans d'équilibrage et monitoring technique, tout en réutilisant `AdminFieldCalibrationPanel` et métriques existantes.
  - [ ] Lister panneaux et séries FieldCalibration déjà disponibles, leurs responsables et données sources.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Lier baseline de cohorte, version, seed, profil et date ; n'exposer que résultats vérifiables.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester liens vers baseline, version, seed, état chargé et absence de doublon d'onglet.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-18 — Performance par champion
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Afficher pick-rate, survivabilité, DPS/heal/CC réellement supportés, win-rate et incertitudes par difficulté/version.
  - [ ] Définir les indicateurs champion mesurables, avec population comparable et version d'autorité.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Permettre comparaison des champions **à composition et version comparables** ; pas de classement sur 2 runs.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester pick-rate avec un champion absent, compositions mixtes et petites cohortes.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-19 — Builds, items, runes et augments
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Explorer combinaisons et effets majeurs avec métriques de fréquence et performance ; éviter biais d'exposition des items.
  - [ ] Définir identité de build item/rune/augment et biais de disponibilité par run.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Renvoyer vers `P2-BAL-01` pour validation humaine des conclusions.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester build partiel, objet non trouvé, données manquantes et échantillon trop faible.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-20 — Arbres Candies et spécialisations
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Réutiliser **TREE-10** comme source des événements/agrégats : achats, nœuds bloqués, spécialisations et victoire par build.
  - [ ] Consommer une seule source d'événements et agrégats des arbres issue de TREE-10.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Ne pas créer un second ledger, second achat ou second dashboard économique indépendant.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester achat double, reset remboursé, build historique et permission sur agrégation.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-21 — Politique de calibration et flags
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Afficher statut des versions et flags avec autorisation **lecture** par défaut ; aucune mutation de règles d'authority depuis le navigateur.
  - [ ] Définir les états lisibles des flags/version et réserver toute écriture aux procédures autorisées.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Traçabilité décision tuning, protocole A/B éventuel et rollback côté procédures de déploiement, pas bypass RLS.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester URL d'administration forgée, flag absent et tentative de mutation directe.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.
**Gate ADM-S4 :** analyses balisées par version, N et preuve ; aucune édition silencieuse des paramètres de production.

## ADM-S5 — Modération auditée (P1/P2 ; ADM-22..26)

### ADM-22 — File de modération complète
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Étendre `AdminModerationPanel` et `daily_score_reports` : pagination réelle, motifs, date, statut et historique.
  - [ ] Formaliser statuts open/resolved/dismissed, motifs et ordre stable de la file de modération.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Séparer signalements en attente, traités et rejetés ; ne pas masquer anciens dossiers sans justification.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester dossier ancien, 101e signalement, double rapport et file vide.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-23 — Flux d'action sûr
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Confirmer motif, portée, conséquences et action définitive avant `invalidate_daily_score`.
  - [ ] Définir confirmation de l'identifiant cible, motif, portée et conséquence d'une invalidation.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Tester refus d'accès, action concurrente, réessai, doublon, déjà invalidé, score d'une autre période.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester clic double, score déjà annulé, délai réseau et statut concurrent.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-24 — Traçabilité des décisions
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Définir audit append-only de `qui/quand/quoi/pourquoi`, action idempotente et intégrité des preuves.
  - [ ] Définir événement d'audit immuable lié à acteur, action, cible, motif et date.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Ne jamais réécrire une run autoritaire ou son résultat historique pour masquer un incident.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester rollback DB, auteur absent, altération de log et conservation de la run originale.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-25 — Permissions et séparation des rôles
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Contrôler permissions admin réelles dans PostgreSQL ; tout ajout éventuel de rôle supérieur `dev` suit une initiative **distincte** et une migration auditable.
  - [ ] Documenter permissions serveur admin/dev futur sans auto-promotion, role claim client ou second canal parallèle.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Prévoir droits lecture versus action de modération sans auto-promotion client ; tests `anon`/joueur/admin.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester anon, joueur normal, admin retiré et tentative de mise à jour is_admin.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-26 — Anti-abus et limites
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Limiter les opérations sensibles et auditer rejet/abus, sans exposer de données privées inutiles.
  - [ ] Fixer règles de limitation, secrets masqués et délai de conservation par type d'événement.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Réviser la politique de conservation, RGPD et suppression effective des journaux concernés.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester requêtes répétées, rejet correct, suppression et absence de données privées dans l'export.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.
**Gate ADM-S5 :** chaque action a une justification, une trace et une vérification d'autorisation serveur.

## ADM-S6 — Surveillance technique et diagnostics (P2 ; ADM-27..31)

### ADM-27 — Explorer les logs utiles
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Ajouter recherche/filtres d'opération, niveau, période, correlation ID et curseur serveur ; pas de recherche uniquement dans un échantillon chargé.
  - [ ] Définir filtres serveur exacts pour opérations, sévérité, plage, corrélation et page.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Garder diagnostic DB **OFF par défaut**, opt-in, sanitisé et rétention existante de 14 jours.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester log hors page, logging OFF, date limite et absence de permission.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-28 — Rejets authority exploitables
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Réutiliser `AdminAuthorityPanel`/`authority_attempt_aggregates`, statut started/verified/rejected/expired, code de rejet, versions et période.
  - [ ] Distinguer rejected/expired/pending/verified et erreur technique sans conclure à un abus joueur.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Mettre en évidence les erreurs serveur, les tentatives invalides et les incidents d'infrastructure sans accuser automatiquement le joueur.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester moteur unsupported, échec RPC, code absent et fenêtre d'agrégation vide.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-29 — Indicateurs de service
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Définir taux d'erreur, latences et disponibilité des flux de sauvegarde/vérification selon télémétrie réellement existante.
  - [ ] Choisir des SLI réellement instrumentés plutôt que déduire disponibilité d'une courbe vide.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Relier les objectifs aux runbooks/`docs/observability.md` ; rendre les trous de données visibles.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester service sans signal, latence extrême, périodes manquantes et granularité.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-30 — Corrélations de diagnostic
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Lier des événements d'une même tentative avec identifiants de corrélation et contrôle des permissions.
  - [ ] Spécifier correlation IDs et minimisation des informations dans chaque log/requête.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Ne jamais exposer JWT, secrets, adresse IP brute ou contenu de commande sensible aux exports non nécessaires.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester jeton/secret absent, changement de session et accès transverse refusé.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-31 — Alertes et incidents
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Réutiliser seuils `AUTHORITY_REJECTION_ALERT_POLICY`, anti-bruit, périodes et niveau de sévérité.
  - [ ] Définir déclencheur, fenêtre, silence/retour normal et priorité depuis la politique authority existante.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Tester détection, suppression d'alerte redondante et lien vers procédure de remédiation ; ne pas promettre de notification en temps réel sans service opérationnel.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester pic de rejets, faux positif, alerte répétée et retour à l'état stable.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.
**Gate ADM-S6 :** une panne est diagnostiquable sans surveillance indiscriminée ni fausse précision statistique.

## ADM-S7 — UI, architecture et preuves (P2 ; ADM-32..36)

### ADM-32 — Isoler le domaine administration
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Migrer progressivement `src/pages/admin/` et `useAdminData.ts` vers `src/features/administration` selon `ARCH-12`, sans refaire en parallèle un deuxième refactor.
  - [ ] Définir frontière entre UI admin, hooks, DTO et repositories selon ARCH-12 sans deuxième système DI.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Séparer « queries/dto/état/panneaux », mutualiser erreurs/chargements et conserver `RepositoryContainer` ou interfaces de service existantes.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester import interdit de couche, action admin non autorisée et rendu existant.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-33 — Navigation et expériences
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Prévoir sous-onglets « Vue globale / Joueurs / Runs / Équilibrage / Modération / Surveillance », filtres visibles et états de chargement individuels.
  - [ ] Concevoir navigation par URL/onglet, conservation de filtres et retour depuis fiche run.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Conserver l'URL et le contexte lors des navigations ; confirmations pour actions sensibles et export indiquant périmètre/période.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester rafraîchissement deep link, historique navigateur et interruption d'une requête.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-34 — Responsive et accessibilité
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Tester tables larges mobile, colonnes essentielles, vues détails et pagination à 320 px / zoom 200–400 %.
  - [ ] Définir table responsive à colonnes essentielles, légendes, focus et alternatives aux icônes couleur.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Navigation clavier, focus, tableaux avec en-têtes, lecteur d'écran, contrastes et messages FR/EN cohérents avec `P0-I18N-01`.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester 320px, zoom 400 %, NVDA/VoiceOver, keyboard-only et FR/EN.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-35 — Couverture de tests et non-régression
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Contrats SQL/permissions, 0/100/101/1000/1001 lignes, imports de données incomplètes, agrégations, filtres, exports et actions de modération.
  - [ ] Tests composants et Playwright connecté : rôle non-admin interdit, admin autorisé, refresh, pagination, erreurs et mobile.
  - [ ] Établir matrice SQL/Auth/component/E2E et jeux de données volumineux déterministes.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Préserver tests et vues existants ; rapport de validation sur environnement local migré.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Tester RLS positive/négative, pagination 1001 lignes, retry réseau et export CSV.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-36 — Documentation et livraison progressive
- [ ] **Définir les données, permissions et comportements attendus.**
  - [ ] Mettre à jour `docs/administration.md`, dictionnaire métriques, modèles de rôles, runbooks incidents et release notes.
  - [ ] Fixer modèle de preuves de PR, dictionnaire KPI, instructions de restauration et plan d'archivage.
  - [ ] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [ ] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [ ] Diviser en PR logiques (fiabilité → pagination → analytics → modération → refactor) et enregistrer preuve SQL, UI et E2E pour chaque lot.
  - [ ] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [ ] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [ ] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [ ] Vérifier documentation, commandes CI, lien vers release et statut non livré si déploiement absent.
  - [ ] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [ ] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.
**Gate générale :** tous les indicateurs ont une définition et une population, nombres globaux indépendants des plafonds de pagination, sécurité PostgreSQL/RLS prouvée, aucun faux 0, aucune action administrative non auditée.

## Doublons délibérément évités

- `ADM-20` **consomme** les événements de `TREE-10` ; TREE garde la propriété du contrat des arbres et du ledger Candies.
- `ADM-17..21` **consomment** la simulation/les baselines de `P2-BAL-01`, sans redévelopper le moteur de balance.
- `ADM-32` suit la migration `ARCH-12` ; pas de double architecture `features/admin` et `features/administration`.
- `ADM-28/31` réutilisent l'observabilité authority existante ; ne pas dupliquer son pipeline.
- Les futures suggestions/boîte à idées réservées au rôle dev, si programmées, constituent une fonctionnalité distincte et ne doivent pas être confondues avec la modération de scores Daily.
