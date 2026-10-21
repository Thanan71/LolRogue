# ADM — Administration fiable et exploitable

**Statut : ADM-S1 à S3 implémentés ; ADM-S4 implémenté hors ADM-20, en attente de TREE-10 ; ADM-S5 et ADM-S6 implémentés ; ADM-S7 est implémenté en code et automatisation locale ; validation humaine ADM-34 confirmée par l’utilisateur le 21 octobre.** 7 sprints, **36 tâches** (`ADM-01` à `ADM-36`). Cible : wrapper `src/pages/AdminPage.tsx`, module `src/features/administration`, vues/RPC PostgreSQL et `docs/administration.md`. [Retour au TODO](../../TODO.md) · [Architecture](architecture-maintenance.md).

## État initial et frontières

- `AdminDashboardPanel.tsx` affiche `active_today` mais transforme une valeur manquante en **0** ; vérifier l'existence/actualisation SQL avant de conclure qu'aucun joueur n'est actif.
- `useAdminData.ts` limite la liste des joueurs à **100**, les runs au paramètre courant (100 par défaut) et les logs/rapports à un nombre fixe ; la limite effective du service peut aussi plafonner les réponses. **Un tableau chargé n'est pas un total global**, et son export n'est pas un export exhaustif.
- `admin_stats`, `admin_player_stats`, `authority_attempt_aggregates` et les cohortes existent déjà : **étendre** ces contrats, ne pas créer un doublon de métriques.
- Les panneaux dashboard, authority/field calibration et modération existent déjà ; l'architecture cible réutilise ces modules.
- Les logs DB sont **désactivés par défaut**, activables explicitement ; ne pas les rendre obligatoires, ne pas stocker de secrets ni introduire une surveillance personnelle.
- L'accès admin réel repose sur **PostgreSQL, permissions, RLS et `is_current_user_admin()`** : le `AdminRoute` React n'est pas une barrière de sécurité. Ne pas exposer `service_role` dans le frontend.
- Les soldes **Candies** et **Éclats** sont distincts ; `P3-ECO-01` livre les Éclats derrière un flag OFF, pas une émission live garantie. Éviter de prétendre que les tableaux financiers sont exacts avant réconciliation ledger/solde.

## ADM-S1 — Fiabilité des données et définitions (P1 ; ADM-01..06)

**Implémenté dans l'application 0.2.7.** [Contrat des quinze métriques](../admin-metrics.md) et [validation](../admin-s1-validation-2026-10-17.md). Les preuves locales, la CI et l'application distante de la migration restent distinctes. Les refunds internes sont testés ; le parcours public TREE-07 reste à réaliser.

### ADM-01 — Corriger « joueurs actifs aujourd'hui »
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Examiner la définition de `active_today` dans les vues SQL, l'actualisation et la lecture `admin_stats` ; distinguer métrique absente, valeur nulle et zéro légitime.
  - [x] Choisir activité vérifiable (dernière activité ou action validée) avec fenêtre UTC/date métier explicite, déduplication de comptes et exclusion bots/tests si applicable.
  - [x] Définir ce qui constitue une activité quotidienne, la fenêtre UTC et la différence valeur absente/0.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Afficher « indisponible »/« données insuffisantes » à la place de `0` en cas de clé absente/erreur ; documenter le calcul.
  - [x] Ajouter test SQL + test composant pour aucun actif, actif réel, métrique absente, erreur et fuseau.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester utilisateur actif, métrique absente, journée vide, erreur SQL et fuseau.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-02 — Distinguer Candies en circulation/gagnés/dépensés
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Définir clairement *gagnés à vie*, *dépensés*, *remboursés* et *solde en circulation*, avec conservation des montants ; distinguer la maîtrise des Candies.
  - [x] Auditer tables de progression, achats et ledger actuellement disponibles ; si nécessaire ajouter une migration **append-only** avec événements atomiques/idempotents (pas d'inférence fragile depuis le solde).
  - [x] Spécifier un ledger Candies avec earned/spent/refunded/balance et réconciliation, distinct des Éclats.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Réconcilier par compte les soldes avant/après, refunds `TREE-07`, anciennes récompenses et cas historique non renseigné ; exposer valeur inconnue quand non calculable.
  - [x] Tester achat répété, deux écritures concurrentes, reward retry, run rejetée, RLS et migration de comptes existants.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester dépenses concurrentes, refund, run rejetée, historique sans ledger et RLS.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-03 — Définir le dictionnaire des indicateurs
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Pour chaque carte, écrire formule, source, période, timezone, population incluse/exclue, filtre `verified` et stratégie d'agrégation.
  - [x] Garder les mesures « runs » / « attempts » / « Daily » / « comptes » distinctes ; pas de comparaisons trompeuses.
  - [x] Documenter numérateur/dénominateur, date, source SQL, filtre et population de chaque KPI.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Associer contract test à chaque clef de `admin_stats` et documentation visible dans un tooltip admin.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester toutes les clés métriques attendues, unité, valeur null et fenêtres de dates.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-04 — Distinguer totaux réels et lignes affichées
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Utiliser requêtes `count: exact`/agrégats serveur pour total joueurs/runs/victoires ; ne jamais sommer les 100/1000 premières lignes.
  - [x] Indiquer nombre affiché, total correspondant aux filtres, chargement/erreur et période ; éviter statistiques calculées depuis un échantillon tronqué.
  - [x] Définir counts exacts serveur et taille de page indépendants pour runs, joueurs et logs.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Tester 0, 101, 1001 lignes, pages vides, filtre changé et incohérence de count.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester 0/100/101/1000/1001 enregistrements et changement de filtre.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-05 — Vérifier les accès aux nouvelles métriques
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Tester toutes les nouvelles vues et RPC en `anon`, `authenticated` non-admin, admin et service role dans un environnement isolé.
  - [x] Garder `security_invoker`/RLS réels, aucune fuite de PII, désactivation du write client sur les colonnes admin.
  - [x] Établir matrice d'autorisations anon, connecté normal, admin, service-role sur nouvelles vues.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Ne pas élargir les privilèges existants simplement pour satisfaire le dashboard.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester accès refusé sans fuite, accès autorisé, RPC usurpée et rôle révoqué.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-06 — États de chargement et erreurs fiables
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Vérifier états indépendants stats/joueurs/runs/logs/authority/modération ; aucune panne d'une section ne doit faire disparaître les autres.
  - [x] Ajouter retry par onglet, données périmées indiquées, annulation des requêtes obsolètes, état vide et messages FR/EN.
  - [x] Définir états idle/loading/stale/error/empty par section et invalidation des réponses obsolètes.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Tester déconnexion, session expirée, réseau hors ligne et course entre deux recherches.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester déconnexion pendant chargement, deux filtres successifs, timeout et retry.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.
**Gate ADM-S1 :** les chiffres affichés ont une définition et une source testées ; clé absente ≠ zéro ; aucune fuite RLS.

## ADM-S2 — Fiches joueurs et historiques de runs (P1/P2 ; ADM-07..11)

### ADM-07 — Pagination réelle côté serveur
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Remplacer `.limit(100)` joueurs et limite bornée des runs par une pagination serveur par curseur ou `range` + count.
  - [x] Garantir ordre stable (date + ID), filtres/sort persistants et récupération des membres d'équipe par pages.
  - [x] Choisir curseur stable ou range + count et double tri date/ID ; pageSize borné.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Éviter `N+1` et requêtes `.in(...)` démesurées ; tester pagination concurrente avec insertions.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester insertion concurrente, dernière page partielle, retour arrière et grands volumes.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-08 — Recherche et filtres joueurs
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Rechercher par identifiant/nom/pseudo selon permissions ; filtres inscription, activité, runs vérifiées et état du compte.
  - [x] Faire rechercher côté serveur, protéger chaînes utilisateur, valider limites et prévoir debounce contrôlé.
  - [x] Définir champs de recherche autorisés, index compatibles et traitement des caractères spéciaux.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Résultats complets paginés, jamais recherche uniquement parmi les 100 lignes locales.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester casse, Unicode, entrée vide, recherche hors page courante et injection de filtre.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-09 — Fiche joueur opérationnelle
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Afficher profil minimal utile, dates, activité, statistiques vérifiées, maîtrise, arbres et soldes Candies/Éclats séparés.
  - [x] Rendre visible provenance des données, valeurs absentes, historique d'achats et raisons des écarts de ledger.
  - [x] Lister les champs non sensibles d'une fiche joueur et les sources vérifiées de soldes/maîtrise.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Mettre données sensibles derrière permission explicite, masquer emails/identifiants non nécessaires.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester compte sans runs, ancien utilisateur, invité, données partiellement absentes et permission.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-10 — Explorateur de runs
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Étendre filtres existants : joueur, date, difficulté, mode, résultat, biome, longueur, champion et moteur/versions.
  - [x] Utiliser filtrage/count serveur ; distinguer `runs` persistées et `attempts` authority non finalisés.
  - [x] Définir schéma de filtres serveur réutilisable et frontière runs sauvegardées versus attempts.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Préserver les filtres après détail/retour et fournir lien permanent seulement si politique de confidentialité l'autorise.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester filtres combinés, tri stable, run rejetée, intervalle date et URL de retour.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-11 — Détail run et exports exacts
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Afficher timeline et journal sûr : composition, builds, actions, progression, gains vérifiés, codes de rejet et version de moteur.
  - [x] Conserver les exports CSV existants et leur anti-injection formule ; proposer export **de tous les résultats filtrés** par pagination serveur ou export borné annoncé.
  - [x] Définir périmètre exporté (page ou totalité filtrée), plafond et confirmation de volume.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Tester UTF-8, tri, nombre total, idempotence, anonymisation et gros volumes ; aucune élévation de droits.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester export >100 lignes, caractères CSV dangereux, UTF-8, consentement et autorisations.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.
**Gate ADM-S2 :** au-delà de 100 joueurs/1000 runs les comptes et exports restent exacts ; chaque fiche est accessible uniquement selon permissions.


Contrat : [fiches et explorateur](../admin-explorer.md). Preuves locales et limites :
[validation ADM-S2](../admin-s2-validation-2026-10-17.md). Migration distante, fusion
et déploiement sont des étapes distinctes de cette clôture code.

## ADM-S3 — Analytics temporels et rétention (P2 ; ADM-12..16)

### ADM-12 — Courbes temporelles
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Ajouter acquisitions, activité, démarrages, fins vérifiées, victoires et Daily par jour/semaine sur plage choisie.
  - [x] Définir granulation jour/semaine, bornes inclusives, UTC et traitement des périodes vides.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Agréger côté PostgreSQL, fuseau explicite, périodes sans données, limites de requêtes et tests de bornes de date.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester passage minuit, changement de fuseau, absence de données et fenêtre inversée.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-13 — Rétention
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Définir D1/D7/D30 et dénominateurs de cohorte de création, sans confondre connexion, action de jeu et victoire.
  - [x] Définir cohorte D1/D7/D30 et exclusion des cohortes dont la période est incomplète.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Écarter les cohortes trop récentes/incomplètes ; afficher N, date et éventuelle incertitude.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester N nul, cohorte récente, retour le jour exact et absence de rétention.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-14 — Funnel de jeu
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Instrumenter, à partir d'événements autorisés, inscription → début run → premier combat → fin run → retour.
  - [x] Documenter les événements utiles du parcours sans instrumentation invasive ni double comptage.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Éviter double comptage à cause des retries et distinguer invités des comptes connectés.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester abandon avant combat, multi-retry, invité et doublon d'événement.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-15 — Filtres comparables
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Segmenter difficulté, mode, période, appareil si mesure autorisée, jeu nouveau/ancien et version de moteur.
  - [x] Fixer segments autorisés et comparabilité d'un même engine/ruleset et d'un même mode.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Ne pas comparer deux règles autoritaires différentes comme une seule population ; indiquer changements de version et effectif.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester changement de version en période, série incomplète et mélange Daily/classique.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-16 — Qualité statistique
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Afficher tailles d'échantillon, taux et intervalles (Wilson si pertinent) ; état « données insuffisantes ».
  - [x] Définir seuils d'effectif et intervalle statistique selon numérateur/dénominateur.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Tester données vides, dates invalides, valeurs manquantes, agrégats partiels et changements de filtre.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester N=0, N=1, 100 % de succès, cohortes partielles et variance élevée.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.
**Gate ADM-S3 :** aucun chiffre analytique déduit du seul ensemble des lignes chargées ; cohortes et périodes explicites.


Contrat : [analytics temporels](../admin-analytics.md). Preuves et limites :
[validation ADM-S3](../admin-s3-validation-2026-10-17.md). Les données
historiques conservent leurs observations, sans taux lorsque la couverture
n’est pas attestée ; invités et appareils restent non mesurés. Migration distante,
fusion et déploiement restent distincts de cette clôture code.

## ADM-S4 — Équilibrage séparé de l'exploitation (P2 ; ADM-17..21)

**Application 0.2.10 : ADM-17, 18, 19 et 21 implémentés.** [Contrat des populations et limites](../admin-balance.md) · [validation](../admin-s4-validation-2026-10-18.md). **ADM-20 reste ouvert : TREE-10 ne fournit pas encore sa source commune.** Son panneau affiche cette dépendance ; aucun achat/reset ni indicateur d’arbre n’est inventé. Les picks utilisent tous les départs ; les performances finales ont une population distincte et les métriques non collectées restent indisponibles.

### ADM-17 — Espace « Équilibrage »
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Séparer écrans d'équilibrage et monitoring technique, tout en réutilisant `AdminFieldCalibrationPanel` et métriques existantes.
  - [x] Lister panneaux et séries FieldCalibration déjà disponibles, leurs responsables et données sources.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Lier baseline de cohorte, version, seed, profil et date ; n'exposer que résultats vérifiables.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester liens vers baseline, version, seed, état chargé et absence de doublon d'onglet.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-18 — Performance par champion
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Afficher pick-rate, survivabilité, DPS/heal/CC réellement supportés, win-rate et incertitudes par difficulté/version.
  - [x] Définir les indicateurs champion mesurables, avec population comparable et version d'autorité.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Permettre comparaison des champions **à composition et version comparables** ; pas de classement sur 2 runs.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester pick-rate avec un champion absent, compositions mixtes et petites cohortes.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-19 — Builds, items, runes et augments
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Explorer combinaisons et effets majeurs avec métriques de fréquence et performance ; éviter biais d'exposition des items.
  - [x] Définir identité de build item/rune/augment et biais de disponibilité par run.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Renvoyer vers `P2-BAL-01` pour validation humaine des conclusions.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester build partiel, objet non trouvé, données manquantes et échantillon trop faible.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

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
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Afficher statut des versions et flags avec autorisation **lecture** par défaut ; aucune mutation de règles d'authority depuis le navigateur.
  - [x] Définir les états lisibles des flags/version et réserver toute écriture aux procédures autorisées.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Traçabilité décision tuning, protocole A/B éventuel et rollback côté procédures de déploiement, pas bypass RLS.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester URL d'administration forgée, flag absent et tentative de mutation directe.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.
**Gate ADM-S4 :** analyses balisées par version, N et preuve ; aucune édition silencieuse des paramètres de production.

## ADM-S5 — Modération auditée (P1/P2 ; ADM-22..26)

### ADM-22 — File de modération complète
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Étendre `AdminModerationPanel` et `daily_score_reports` : pagination réelle, motifs, date, statut et historique.
  - [x] Formaliser statuts open/resolved/dismissed, motifs et ordre stable de la file de modération.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Séparer signalements en attente, traités et rejetés ; ne pas masquer anciens dossiers sans justification.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester dossier ancien, 101e signalement, double rapport et file vide.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-23 — Flux d'action sûr
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Confirmer motif, portée, conséquences et action définitive avant l’invalidation (ancien `invalidate_daily_score` remplacé par `admin_moderation_decide`).
  - [x] Définir confirmation de l'identifiant cible, motif, portée et conséquence d'une invalidation.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Tester refus d'accès, action concurrente, réessai, doublon, déjà invalidé, score d'une autre période.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester clic double, score déjà annulé, délai réseau et statut concurrent.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-24 — Traçabilité des décisions
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Définir audit append-only de `qui/quand/quoi/pourquoi`, action idempotente et intégrité des preuves.
  - [x] Définir événement d'audit immuable lié à acteur, action, cible, motif et date.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Ne jamais réécrire une run autoritaire ou son résultat historique pour masquer un incident.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester rollback DB, auteur absent, altération de log et conservation de la run originale.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-25 — Permissions et séparation des rôles
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Contrôler permissions admin réelles dans PostgreSQL ; tout ajout éventuel de rôle supérieur `dev` suit une initiative **distincte** et une migration auditable.
  - [x] Documenter permissions serveur admin/dev futur sans auto-promotion, role claim client ou second canal parallèle.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Prévoir droits lecture versus action de modération sans auto-promotion client ; tests `anon`/joueur/admin.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester anon, joueur normal, admin retiré et tentative de mise à jour is_admin.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-26 — Anti-abus et limites
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Limiter les opérations sensibles et auditer rejet/abus, sans exposer de données privées inutiles.
  - [x] Fixer règles de limitation, secrets masqués et délai de conservation par type d'événement.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Réviser la politique de conservation, RGPD et suppression effective des journaux concernés.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester requêtes répétées, rejet correct, suppression et absence de données privées dans l'export.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.
**Gate ADM-S5 :** chaque action a une justification, une trace et une vérification d'autorisation serveur.

**Clôture code ADM-S5 — 18 octobre 2026 :** ADM-22 à 26 implémentés. [Contrat](../admin-moderation.md) et [preuves](../admin-s5-validation-2026-10-18.md). Migration `20261018082740`, fusion et opérations distantes distinctes ; aucun rôle supérieur `dev` ni action de production ajouté.

## ADM-S6 — Surveillance technique et diagnostics (P2 ; ADM-27..31)

### ADM-27 — Explorer les logs utiles
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Ajouter recherche/filtres d'opération, niveau, période, correlation ID et curseur serveur ; pas de recherche uniquement dans un échantillon chargé.
  - [x] Définir filtres serveur exacts pour opérations, sévérité, plage, corrélation et page.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Garder diagnostic DB **OFF par défaut**, opt-in, sanitisé et rétention existante de 14 jours.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester log hors page, logging OFF, date limite et absence de permission.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-28 — Rejets authority exploitables
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Réutiliser `AdminAuthorityPanel`/`authority_attempt_aggregates`, statut started/verified/rejected/expired, code de rejet, versions et période.
  - [x] Distinguer rejected/expired/pending/verified et erreur technique sans conclure à un abus joueur.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Mettre en évidence les erreurs serveur, les tentatives invalides et les incidents d'infrastructure sans accuser automatiquement le joueur.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester moteur unsupported, échec RPC, code absent et fenêtre d'agrégation vide.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-29 — Indicateurs de service
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Définir taux d'erreur, latences et disponibilité des flux de sauvegarde/vérification selon télémétrie réellement existante.
  - [x] Choisir des SLI réellement instrumentés plutôt que déduire disponibilité d'une courbe vide.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Relier les objectifs aux runbooks/`docs/observability.md` ; rendre les trous de données visibles.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester service sans signal, latence extrême, périodes manquantes et granularité.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-30 — Corrélations de diagnostic
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Lier des événements d'une même tentative avec identifiants de corrélation et contrôle des permissions.
  - [x] Spécifier correlation IDs et minimisation des informations dans chaque log/requête.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Ne jamais exposer JWT, secrets, adresse IP brute ou contenu de commande sensible aux exports non nécessaires.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester jeton/secret absent, changement de session et accès transverse refusé.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.

### ADM-31 — Alertes et incidents
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Réutiliser seuils `AUTHORITY_REJECTION_ALERT_POLICY`, anti-bruit, périodes et niveau de sévérité.
  - [x] Définir déclencheur, fenêtre, silence/retour normal et priorité depuis la politique authority existante.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Tester détection, suppression d'alerte redondante et lien vers procédure de remédiation ; ne pas promettre de notification en temps réel sans service opérationnel.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester pic de rejets, faux positif, alerte répétée et retour à l'état stable.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultat attendu et preuve de la PR sans activer de nouvelles actions en production.
**Gate ADM-S6 :** une panne est diagnostiquable sans surveillance indiscriminée ni fausse précision statistique.

**Clôture code ADM-S6 — 18 octobre 2026 :** ADM-27 à 31 implémentés dans 0.2.12. [Contrat](../admin-diagnostics.md) et [preuves](../admin-s6-validation-2026-10-18.md). Migration `20261018100541`, application distante et déploiement distincts ; logging DB toujours OFF par défaut, aucune notification automatique.

## ADM-S7 — UI, architecture et preuves (P2 ; ADM-32..36)

**Application 0.2.13 : ADM-32, 33, 35 et 36 réalisés en code et preuves locales.**
ADM-34 est couvert automatiquement ; le parcours humain demandé a été validé
par l’utilisateur sur la Preview le 21 octobre (voir le rapport de validation). [Contrat d’interface](../admin-interface.md) ·
[validation du 21 octobre](../admin-s7-validation-2026-10-21.md).
Le build candidat local passe ; la reconstruction indépendante finale, les
checks CI/Preview et le SHA livré sont à joindre à la PR vers `dev`. Aucune fusion, livraison distante, migration, activation ou
notification n’est implicite. ADM-20 reste dépendant de TREE-10.

### ADM-32 — Isoler le domaine administration
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Migrer les 97 modules historiques vers `src/features/administration` selon `ARCH-12`, sans refaire en parallèle un deuxième refactor.
  - [x] Définir frontière entre UI admin, hooks, DTO et repositories selon ARCH-12 sans deuxième système DI.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Séparer « queries/dto/état/panneaux », mutualiser erreurs/chargements et conserver `RepositoryContainer` ou interfaces de service existantes.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester import interdit de couche, action admin non autorisée et rendu existant.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultats locaux et modèle de preuve à joindre à la PR, sans activer de nouvelles actions en production.

### ADM-33 — Navigation et expériences
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Prévoir sous-onglets « Vue globale / Joueurs / Runs / Équilibrage / Modération / Surveillance », filtres visibles et états de chargement individuels.
  - [x] Concevoir navigation par URL/onglet, conservation de filtres et retour depuis fiche run.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Conserver l'URL et le contexte lors des navigations ; confirmations pour actions sensibles et export indiquant périmètre/période.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester rafraîchissement deep link, historique navigateur et interruption d'une requête.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultats locaux et modèle de preuve à joindre à la PR, sans activer de nouvelles actions en production.

### ADM-34 — Responsive et accessibilité
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Tester tables larges mobile, colonnes essentielles, vues détails et pagination à 320 px / zoom 200–400 %.
  - [x] Définir table responsive à colonnes essentielles, légendes, focus et alternatives aux icônes couleur.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Navigation clavier, focus, tableaux avec en-têtes, contrastes et messages FR/EN cohérents avec `P0-I18N-01` ; sémantique vérifiée automatiquement.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Automatisé : 320 px, zoom natif Chromium 200 %/400 %, clavier, focus, FR/EN et axe sans violation.
  - [x] Manuel : parcours lecteur d’écran demandé sur la Preview `7c157b4`, confirmé par l’utilisateur le 21 octobre : « la verification humaine est ok ». Retour déclaré ; outil, appareil et versions non renseignés, aucune exécution distincte des deux lecteurs attribuée à l’agent.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultats locaux et modèle de preuve à joindre à la PR, sans activer de nouvelles actions en production.

### ADM-35 — Couverture de tests et non-régression
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Contrats SQL/permissions, 0/100/101/1000/1001 lignes, imports de données incomplètes, agrégations, filtres, exports et actions de modération.
  - [x] Tests composants et Playwright connecté : rôle non-admin interdit, admin autorisé, refresh, pagination, erreurs et mobile.
  - [x] Établir matrice SQL/Auth/component/E2E et jeux de données volumineux déterministes.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Préserver tests et vues existants ; rapport de validation sur environnement local migré.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Tester RLS positive/négative, pagination 1001 lignes, retry réseau et export CSV.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultats locaux et modèle de preuve à joindre à la PR, sans activer de nouvelles actions en production.

### ADM-36 — Documentation et livraison progressive
- [x] **Définir les données, permissions et comportements attendus.**
  - [x] Mettre à jour `docs/administration.md`, dictionnaire métriques, modèles de rôles, runbooks incidents et release notes.
  - [x] Fixer modèle de preuves de PR, dictionnaire KPI, instructions de restauration et plan d'archivage.
  - [x] Spécifier rôles autorisés, périmètre et source de vérité des valeurs pour éviter tout total trompeur.
- [x] **Mettre en œuvre avec une source unique et des erreurs maîtrisées.**
  - [x] Diviser en PR logiques (fiabilité → pagination → analytics → modération → refactor) et enregistrer preuve SQL, UI et E2E pour chaque lot.
  - [x] Utiliser filtres/count/agrégats serveur quand requis plutôt que résultats tronqués côté navigateur.
  - [x] Prévoir chargement, erreur, état vide, rechargement et interdiction d'opération non autorisée.
- [x] **Vérifier données, sécurité et accessibilité avant clôture.**
  - [x] Documenter commandes CI, publication 18 FR/EN, liens des contrats et preuves ; garder CI/Preview finale et déploiement distincts de la validation locale.
  - [x] Tester les permissions `anon`/utilisateur/admin en base migrée dès qu'une donnée sensible est concernée.
  - [x] Documenter requêtes, jeux de données, résultats locaux et modèle de preuve à joindre à la PR, sans activer de nouvelles actions en production.
**Gate générale :** tous les indicateurs ont une définition et une population, nombres globaux indépendants des plafonds de pagination, sécurité PostgreSQL/RLS prouvée, aucun faux 0, aucune action administrative non auditée.

## Doublons délibérément évités

- `ADM-20` **consomme** les événements de `TREE-10` ; TREE garde la propriété du contrat des arbres et du ledger Candies.
- `ADM-17..21` **consomment** la simulation/les baselines de `P2-BAL-01`, sans redévelopper le moteur de balance.
- `ADM-32` suit la migration `ARCH-12` ; pas de double architecture `features/admin` et `features/administration`.
- `ADM-28/31` réutilisent l'observabilité authority existante ; ne pas dupliquer son pipeline.
- Les futures suggestions/boîte à idées réservées au rôle dev, si programmées, constituent une fonctionnalité distincte et ne doivent pas être confondues avec la modération de scores Daily.
