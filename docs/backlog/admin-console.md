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
- [ ] Examiner la définition de `active_today` dans les vues SQL, l'actualisation et la lecture `admin_stats` ; distinguer métrique absente, valeur nulle et zéro légitime.
- [ ] Choisir activité vérifiable (dernière activité ou action validée) avec fenêtre UTC/date métier explicite, déduplication de comptes et exclusion bots/tests si applicable.
- [ ] Afficher « indisponible »/« données insuffisantes » à la place de `0` en cas de clé absente/erreur ; documenter le calcul.
- [ ] Ajouter test SQL + test composant pour aucun actif, actif réel, métrique absente, erreur et fuseau.

### ADM-02 — Distinguer Candies en circulation/gagnés/dépensés
- [ ] Définir clairement *gagnés à vie*, *dépensés*, *remboursés* et *solde en circulation*, avec conservation des montants ; distinguer la maîtrise des Candies.
- [ ] Auditer tables de progression, achats et ledger actuellement disponibles ; si nécessaire ajouter une migration **append-only** avec événements atomiques/idempotents (pas d'inférence fragile depuis le solde).
- [ ] Réconcilier par compte les soldes avant/après, refunds `TREE-07`, anciennes récompenses et cas historique non renseigné ; exposer valeur inconnue quand non calculable.
- [ ] Tester achat répété, deux écritures concurrentes, reward retry, run rejetée, RLS et migration de comptes existants.

### ADM-03 — Définir le dictionnaire des indicateurs
- [ ] Pour chaque carte, écrire formule, source, période, timezone, population incluse/exclue, filtre `verified` et stratégie d'agrégation.
- [ ] Garder les mesures « runs » / « attempts » / « Daily » / « comptes » distinctes ; pas de comparaisons trompeuses.
- [ ] Associer contract test à chaque clef de `admin_stats` et documentation visible dans un tooltip admin.

### ADM-04 — Distinguer totaux réels et lignes affichées
- [ ] Utiliser requêtes `count: exact`/agrégats serveur pour total joueurs/runs/victoires ; ne jamais sommer les 100/1000 premières lignes.
- [ ] Indiquer nombre affiché, total correspondant aux filtres, chargement/erreur et période ; éviter statistiques calculées depuis un échantillon tronqué.
- [ ] Tester 0, 101, 1001 lignes, pages vides, filtre changé et incohérence de count.

### ADM-05 — Vérifier les accès aux nouvelles métriques
- [ ] Tester toutes les nouvelles vues et RPC en `anon`, `authenticated` non-admin, admin et service role dans un environnement isolé.
- [ ] Garder `security_invoker`/RLS réels, aucune fuite de PII, désactivation du write client sur les colonnes admin.
- [ ] Ne pas élargir les privilèges existants simplement pour satisfaire le dashboard.

### ADM-06 — États de chargement et erreurs fiables
- [ ] Vérifier états indépendants stats/joueurs/runs/logs/authority/modération ; aucune panne d'une section ne doit faire disparaître les autres.
- [ ] Ajouter retry par onglet, données périmées indiquées, annulation des requêtes obsolètes, état vide et messages FR/EN.
- [ ] Tester déconnexion, session expirée, réseau hors ligne et course entre deux recherches.

**Gate ADM-S1 :** les chiffres affichés ont une définition et une source testées ; clé absente ≠ zéro ; aucune fuite RLS.

## ADM-S2 — Fiches joueurs et historiques de runs (P1/P2 ; ADM-07..11)

### ADM-07 — Pagination réelle côté serveur
- [ ] Remplacer `.limit(100)` joueurs et limite bornée des runs par une pagination serveur par curseur ou `range` + count.
- [ ] Garantir ordre stable (date + ID), filtres/sort persistants et récupération des membres d'équipe par pages.
- [ ] Éviter `N+1` et requêtes `.in(...)` démesurées ; tester pagination concurrente avec insertions.

### ADM-08 — Recherche et filtres joueurs
- [ ] Rechercher par identifiant/nom/pseudo selon permissions ; filtres inscription, activité, runs vérifiées et état du compte.
- [ ] Faire rechercher côté serveur, protéger chaînes utilisateur, valider limites et prévoir debounce contrôlé.
- [ ] Résultats complets paginés, jamais recherche uniquement parmi les 100 lignes locales.

### ADM-09 — Fiche joueur opérationnelle
- [ ] Afficher profil minimal utile, dates, activité, statistiques vérifiées, maîtrise, arbres et soldes Candies/Éclats séparés.
- [ ] Rendre visible provenance des données, valeurs absentes, historique d'achats et raisons des écarts de ledger.
- [ ] Mettre données sensibles derrière permission explicite, masquer emails/identifiants non nécessaires.

### ADM-10 — Explorateur de runs
- [ ] Étendre filtres existants : joueur, date, difficulté, mode, résultat, biome, longueur, champion et moteur/versions.
- [ ] Utiliser filtrage/count serveur ; distinguer `runs` persistées et `attempts` authority non finalisés.
- [ ] Préserver les filtres après détail/retour et fournir lien permanent seulement si politique de confidentialité l'autorise.

### ADM-11 — Détail run et exports exacts
- [ ] Afficher timeline et journal sûr : composition, builds, actions, progression, gains vérifiés, codes de rejet et version de moteur.
- [ ] Conserver les exports CSV existants et leur anti-injection formule ; proposer export **de tous les résultats filtrés** par pagination serveur ou export borné annoncé.
- [ ] Tester UTF-8, tri, nombre total, idempotence, anonymisation et gros volumes ; aucune élévation de droits.

**Gate ADM-S2 :** au-delà de 100 joueurs/1000 runs les comptes et exports restent exacts ; chaque fiche est accessible uniquement selon permissions.

## ADM-S3 — Analytics temporels et rétention (P2 ; ADM-12..16)

### ADM-12 — Courbes temporelles
- [ ] Ajouter acquisitions, activité, démarrages, fins vérifiées, victoires et Daily par jour/semaine sur plage choisie.
- [ ] Agréger côté PostgreSQL, fuseau explicite, périodes sans données, limites de requêtes et tests de bornes de date.

### ADM-13 — Rétention
- [ ] Définir D1/D7/D30 et dénominateurs de cohorte de création, sans confondre connexion, action de jeu et victoire.
- [ ] Écarter les cohortes trop récentes/incomplètes ; afficher N, date et éventuelle incertitude.

### ADM-14 — Funnel de jeu
- [ ] Instrumenter, à partir d'événements autorisés, inscription → début run → premier combat → fin run → retour.
- [ ] Éviter double comptage à cause des retries et distinguer invités des comptes connectés.

### ADM-15 — Filtres comparables
- [ ] Segmenter difficulté, mode, période, appareil si mesure autorisée, jeu nouveau/ancien et version de moteur.
- [ ] Ne pas comparer deux règles autoritaires différentes comme une seule population ; indiquer changements de version et effectif.

### ADM-16 — Qualité statistique
- [ ] Afficher tailles d'échantillon, taux et intervalles (Wilson si pertinent) ; état « données insuffisantes ».
- [ ] Tester données vides, dates invalides, valeurs manquantes, agrégats partiels et changements de filtre.

**Gate ADM-S3 :** aucun chiffre analytique déduit du seul ensemble des lignes chargées ; cohortes et périodes explicites.

## ADM-S4 — Équilibrage séparé de l'exploitation (P2 ; ADM-17..21)

### ADM-17 — Espace « Équilibrage »
- [ ] Séparer écrans d'équilibrage et monitoring technique, tout en réutilisant `AdminFieldCalibrationPanel` et métriques existantes.
- [ ] Lier baseline de cohorte, version, seed, profil et date ; n'exposer que résultats vérifiables.

### ADM-18 — Performance par champion
- [ ] Afficher pick-rate, survivabilité, DPS/heal/CC réellement supportés, win-rate et incertitudes par difficulté/version.
- [ ] Permettre comparaison des champions **à composition et version comparables** ; pas de classement sur 2 runs.

### ADM-19 — Builds, items, runes et augments
- [ ] Explorer combinaisons et effets majeurs avec métriques de fréquence et performance ; éviter biais d'exposition des items.
- [ ] Renvoyer vers `P2-BAL-01` pour validation humaine des conclusions.

### ADM-20 — Arbres Candies et spécialisations
- [ ] Réutiliser **TREE-10** comme source des événements/agrégats : achats, nœuds bloqués, spécialisations et victoire par build.
- [ ] Ne pas créer un second ledger, second achat ou second dashboard économique indépendant.

### ADM-21 — Politique de calibration et flags
- [ ] Afficher statut des versions et flags avec autorisation **lecture** par défaut ; aucune mutation de règles d'authority depuis le navigateur.
- [ ] Traçabilité décision tuning, protocole A/B éventuel et rollback côté procédures de déploiement, pas bypass RLS.

**Gate ADM-S4 :** analyses balisées par version, N et preuve ; aucune édition silencieuse des paramètres de production.

## ADM-S5 — Modération auditée (P1/P2 ; ADM-22..26)

### ADM-22 — File de modération complète
- [ ] Étendre `AdminModerationPanel` et `daily_score_reports` : pagination réelle, motifs, date, statut et historique.
- [ ] Séparer signalements en attente, traités et rejetés ; ne pas masquer anciens dossiers sans justification.

### ADM-23 — Flux d'action sûr
- [ ] Confirmer motif, portée, conséquences et action définitive avant `invalidate_daily_score`.
- [ ] Tester refus d'accès, action concurrente, réessai, doublon, déjà invalidé, score d'une autre période.

### ADM-24 — Traçabilité des décisions
- [ ] Définir audit append-only de `qui/quand/quoi/pourquoi`, action idempotente et intégrité des preuves.
- [ ] Ne jamais réécrire une run autoritaire ou son résultat historique pour masquer un incident.

### ADM-25 — Permissions et séparation des rôles
- [ ] Contrôler permissions admin réelles dans PostgreSQL ; tout ajout éventuel de rôle supérieur `dev` suit une initiative **distincte** et une migration auditable.
- [ ] Prévoir droits lecture versus action de modération sans auto-promotion client ; tests `anon`/joueur/admin.

### ADM-26 — Anti-abus et limites
- [ ] Limiter les opérations sensibles et auditer rejet/abus, sans exposer de données privées inutiles.
- [ ] Réviser la politique de conservation, RGPD et suppression effective des journaux concernés.

**Gate ADM-S5 :** chaque action a une justification, une trace et une vérification d'autorisation serveur.

## ADM-S6 — Surveillance technique et diagnostics (P2 ; ADM-27..31)

### ADM-27 — Explorer les logs utiles
- [ ] Ajouter recherche/filtres d'opération, niveau, période, correlation ID et curseur serveur ; pas de recherche uniquement dans un échantillon chargé.
- [ ] Garder diagnostic DB **OFF par défaut**, opt-in, sanitisé et rétention existante de 14 jours.

### ADM-28 — Rejets authority exploitables
- [ ] Réutiliser `AdminAuthorityPanel`/`authority_attempt_aggregates`, statut started/verified/rejected/expired, code de rejet, versions et période.
- [ ] Mettre en évidence les erreurs serveur, les tentatives invalides et les incidents d'infrastructure sans accuser automatiquement le joueur.

### ADM-29 — Indicateurs de service
- [ ] Définir taux d'erreur, latences et disponibilité des flux de sauvegarde/vérification selon télémétrie réellement existante.
- [ ] Relier les objectifs aux runbooks/`docs/observability.md` ; rendre les trous de données visibles.

### ADM-30 — Corrélations de diagnostic
- [ ] Lier des événements d'une même tentative avec identifiants de corrélation et contrôle des permissions.
- [ ] Ne jamais exposer JWT, secrets, adresse IP brute ou contenu de commande sensible aux exports non nécessaires.

### ADM-31 — Alertes et incidents
- [ ] Réutiliser seuils `AUTHORITY_REJECTION_ALERT_POLICY`, anti-bruit, périodes et niveau de sévérité.
- [ ] Tester détection, suppression d'alerte redondante et lien vers procédure de remédiation ; ne pas promettre de notification en temps réel sans service opérationnel.

**Gate ADM-S6 :** une panne est diagnostiquable sans surveillance indiscriminée ni fausse précision statistique.

## ADM-S7 — UI, architecture et preuves (P2 ; ADM-32..36)

### ADM-32 — Isoler le domaine administration
- [ ] Migrer progressivement `src/pages/admin/` et `useAdminData.ts` vers `src/features/administration` selon `ARCH-12`, sans refaire en parallèle un deuxième refactor.
- [ ] Séparer « queries/dto/état/panneaux », mutualiser erreurs/chargements et conserver `RepositoryContainer` ou interfaces de service existantes.

### ADM-33 — Navigation et expériences
- [ ] Prévoir sous-onglets « Vue globale / Joueurs / Runs / Équilibrage / Modération / Surveillance », filtres visibles et états de chargement individuels.
- [ ] Conserver l'URL et le contexte lors des navigations ; confirmations pour actions sensibles et export indiquant périmètre/période.

### ADM-34 — Responsive et accessibilité
- [ ] Tester tables larges mobile, colonnes essentielles, vues détails et pagination à 320 px / zoom 200–400 %.
- [ ] Navigation clavier, focus, tableaux avec en-têtes, lecteur d'écran, contrastes et messages FR/EN cohérents avec `P0-I18N-01`.

### ADM-35 — Couverture de tests et non-régression
- [ ] Contrats SQL/permissions, 0/100/101/1000/1001 lignes, imports de données incomplètes, agrégations, filtres, exports et actions de modération.
- [ ] Tests composants et Playwright connecté : rôle non-admin interdit, admin autorisé, refresh, pagination, erreurs et mobile.
- [ ] Préserver tests et vues existants ; rapport de validation sur environnement local migré.

### ADM-36 — Documentation et livraison progressive
- [ ] Mettre à jour `docs/administration.md`, dictionnaire métriques, modèles de rôles, runbooks incidents et release notes.
- [ ] Diviser en PR logiques (fiabilité → pagination → analytics → modération → refactor) et enregistrer preuve SQL, UI et E2E pour chaque lot.

**Gate générale :** tous les indicateurs ont une définition et une population, nombres globaux indépendants des plafonds de pagination, sécurité PostgreSQL/RLS prouvée, aucun faux 0, aucune action administrative non auditée.

## Doublons délibérément évités

- `ADM-20` **consomme** les événements de `TREE-10` ; TREE garde la propriété du contrat des arbres et du ledger Candies.
- `ADM-17..21` **consomment** la simulation/les baselines de `P2-BAL-01`, sans redévelopper le moteur de balance.
- `ADM-32` suit la migration `ARCH-12` ; pas de double architecture `features/admin` et `features/administration`.
- `ADM-28/31` réutilisent l'observabilité authority existante ; ne pas dupliquer son pipeline.
- Les futures suggestions/boîte à idées réservées au rôle dev, si programmées, constituent une fonctionnalité distincte et ne doivent pas être confondues avec la modération de scores Daily.
