# Modules UI par fonctionnalité — ARCH-12

Le pilote est **Daily**. Avant déplacement, l’AST de `dev` (`e313c6f6`)
trouve un consommateur de `DailyRunPage` (`App`, import lazy), un de
`DailyLeaderboard` (la page), et dix consommateurs du point de composition
`applicationRepositories`. Le graphe complet contient 388 fichiers, 1 885 imports,
1 706 imports internes et 426 imports de types. Les tests sont recensés séparément :
`dailyPages`, les contrats i18n/formatage, la configuration des chunks et les parcours
Daily connectés et invités.

## Entrées et responsabilités

| Module | Entrées publiques explicites | Entrées et préconditions | Responsabilité |
| --- | --- | --- | --- |
| Daily | `features/daily/application/dailyRunApplication.ts`, `hooks/useDailyRunController.ts`, `hooks/useDailyLeaderboard.ts`, `ui/DailyRunScreen.tsx` | Contrat `IDailyRunRepository`, compte prêt ou invité, métadonnées Daily existantes | Défi officiel, classement filtré, signalement, préférences de visibilité ; ignore les réponses obsolètes |
| Combat | `features/combat/ui/CombatScreen.tsx`, `hooks/useCombatController.ts`, `hooks/useBattleManager.ts` | Encounter/run compatible, binding du moteur et ports UI | Ciblage, auto, clavier, délais et présentation ; validation et calcul dans `game` |
| Champions | `features/champions/ui/StarterSelectScreen.tsx`, `hooks/useStarterSelection.ts`, `application/starterPreparation.ts`, `application/starterCatalog.ts` | Mode demandé, roster officiel/local, accès économique, équipe/runes | Préparation et filtres ; `runStore.startRun` reste l’unique démarrage canonique |
| Accès champions | `features/champion-economy/application/championAccessView.ts` | Snapshot d’accès et champion | Ordre, filtre et tri d’affichage purs ; aucun achat ou calcul de récompense |
| UI partagée | `shared/ui/{Controls,Feedback,PageShell,Surface}.tsx` | Props React et callbacks | Composants existants, DOM/classes/ARIA et contrats de focus conservés |
| Portée du compte | `shared/hooks/useAccountScope.ts` | Compte/session du store auth existant | Garde immédiat commun à Daily et sélection des champions ; invalide les réponses après transition, StrictMode ou démontage |
| Infrastructure | `infrastructure/repositories/applicationRepositories.ts` | Client Supabase existant | Unique composition du conteneur existant, aucun second client ni cache |

Les contrôleurs Daily injectent l’interface existante. Le point d’application adapte
ce port sans état ni second conteneur. Le classement lit le défi avant ses scores
pour conserver la date UTC officielle. Le mode invité utilise uniquement le store
Daily local. Chargements absents/rejetés, changement de compte/session (y compris
A → B → A), filtres concurrents, signalements doubles et démontage sont couverts.
Le compteur de portée appartient au hook partagé `useAccountScope` et ne duplique
pas les données du compte. Daily et la sélection des champions capturent ce garde
au début des lectures et confirmations asynchrones ; A → B → A avec les mêmes
objets de compte/session invalide aussi une réponse avant le prochain rendu React.

## Migration et compatibilité

Les routes historiques restent des façades : `App` conserve ses imports lazy et
les URLs, contrôles d’accès et noms de chunks. Les anciens chemins de composants,
hook combat et helpers réexportent une seule implémentation. Les nouveaux modules
importent directement leurs implémentations, les composants partagés et les ports
publics des autres fonctionnalités. Aucun barrel global `features/index.ts`.

`SettingsPage` passe par le port public Daily pour la visibilité du classement.
Les autres consommateurs du conteneur gardent leur entrée compatible. Les bridges
UI non migrés (`ContextTutorial`, `RunProgressCounters`, `ChampionEconomy`,
`DatabaseChampionDetail`, hooks communs) restent explicites dans les contrats combat
et sélection. Les stores, la persistance et les règles ne sont pas copiés.

`progression`, `runs`, `inventory`, `authentication` et `administration` restent dans
leurs emplacements actuels jusqu’à une tranche fonctionnelle autorisée. Leur point
d’intégration actuel est respectivement les stores de progression, les routes/store
run, l’inventaire, les routes/authStore et les pages administration. Il n’existe aucun
répertoire vide ni wrapper spéculatif pour simuler leur migration. `i18n`, styles,
assets, utils, client Supabase, persistence et observability ne sont pas déplacés
car cette tranche réutilise leurs entrées existantes ; UI, portée de compte et
composition repositories nécessitent une implantation partagée.

## Contrôles

Le checker AST bloque les retours des nouvelles features vers les façades migrées,
les dépendances `game → features/shared/infrastructure`, les imports de repositories
concrets hors conteneur, les appels au barrel services et les nouveaux cycles valeur.
Les exceptions pures historiques restent nommées ; le SCC des six stores est conservé.
Les tests d’injection vérifient ces interdictions, dont UI déplacée et composition.

Les tests des fichiers de présentation et les listes i18n/coverage suivent maintenant
les implémentations ; les imports publics historiques sont encore exercés par les
tests et routes. Les seuils de couverture et les contrôles de build sont conservés.
Le plafond global JavaScript passe à 700 000 octets avec la même marge obligatoire
de 10 % ; les autres plafonds restent identiques. Le motif et les mesures figurent
dans [frontend-performance.md](frontend-performance.md). Les preuves finales sont dans
[architecture-s4-validation-2026-10-13.md](architecture-s4-validation-2026-10-13.md).
