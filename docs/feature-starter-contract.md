# Contrat de préparation de run — ARCH-14

La route historique `src/pages/StarterSelectPage.tsx` réexporte le module champions. Elle reste compatible avec les imports d'App, des tests et des routes déjà déployées. La façade `src/pages/starter/catalogView.ts` conserve aussi les trois exports de pagination et de recherche.

## Entrées explicites

| Entrée                                                     | Responsabilité                                                                                    | Entrées et préconditions                                                                                     | Sortie et erreurs                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `features/champions/ui/StarterSelectScreen`                | Composer le parcours, le catalogue, l'équipe, le pied de page et le dialogue de détail.           | Route React et contrôleur de sélection.                                                                      | Même DOM, classes, noms accessibles et textes FR/EN du parcours existant.                                                   |
| `features/champions/hooks/useStarterSelection`             | État d'écran, choix des champions/runes, offre Daily ou standard, accès économique et navigation. | Stores existants et port Daily injectable `Pick<IDailyRunRepository, 'getDailyChallenge'>`.                  | Modèle de présentation et actions ; messages issus des catalogues i18n.                                                     |
| `features/champions/application/starterPreparation`        | Orchestrer une confirmation et récupérer une offre Daily périmée.                                 | Équipe ordonnée, runes, mode, seeds, statut Daily ; `startRun`, port Daily et prédicat `isCurrent` injectés. | Union discriminée `started`, `blocked`, `daily_offer_changed`, `stale`. Les erreurs de transport deviennent un code stable. |
| `features/champions/application/starterCatalog`            | Recherche, rôle, filtre d'accès, tri et pagination de la présentation.                            | Champions, fonctions de localisation et d'accès, filtres et locale.                                          | Nouveau tableau sans mutation des choix ; 12 cartes par page, page bornée.                                                  |
| `features/champion-economy/application/championAccessView` | Types de filtres, ordre et correspondance des accès à afficher.                                   | Accès canonique déjà calculé.                                                                                | Déclarations uniques, réexportées par le composant historique d'économie.                                                   |

`StarterTeamPanel`, `StarterCatalog`, `StarterSelectionFooter` et `ChampionCard` portent le JSX extrait. Ils reçoivent le contrôleur existant ; ils ne construisent aucun repository ni client Supabase.

Le dialogue conserve provisoirement `pages/database/DatabaseChampionDetail`, une vue de détail existante réutilisée telle quelle. Ce pont UI est admis dans la migration progressive ; le module champions ne dépend pas d'une page de route pour ses décisions ou ses services.

## Sources métier et composition

- `startRun` reste la seule entrée canonique de démarrage : validation de taille/identifiants, accès, authority, versions et idempotence demeurent dans les services et le moteur existants.
- Le nombre de starters vient toujours de `getRequiredStarterCount`. L'offre standard utilise les données de champions, la personnalisation mastery et le même RNG/seed qu'avant extraction.
- La sélection Daily connectée utilise le seed, la difficulté et les identifiants du défi officiel. Un démarrage déjà persisté et appartenant au compte impose son mode, son équipe et ses runes ; une offre officielle devenue incompatible annule uniquement ce démarrage préparé.
- Le Daily invité reste local. Il ne lit pas le port Daily et marque la tentative après la réussite du démarrage.
- Le port par défaut est l'unique `dailyRunApplication`, composé avec le container de repositories existant. Le hook et l'orchestration acceptent une autre implémentation pour les tests ; aucune deuxième instance de repository n'est ajoutée.
- Les états gratuit, acheté et rotation proviennent du store d'économie et de son horloge serveur. Les filtres de présentation ne peuvent pas accorder un accès. Une rotation expirée retire le choix devenu verrouillé et demande une actualisation avant un nouveau démarrage.
- La persistance des runs et des démarrages préparés reste dans les stores et adaptateurs existants. La sélection transitoire conserve son comportement historique : elle traverse recherche et pagination pendant la visite, sans nouveau schéma localStorage.

## Erreurs et concurrence

La lecture Daily possède un indicateur de chargement, traite les réponses vides, les erreurs retournées et les promesses rejetées. Après un échec, un bouton utilisant `fr.common.retry` relance cette même lecture. Le parcours normal conserve son rendu.

Chaque lecture Daily vérifie la référence du compte et de la session, ainsi que l'annulation de l'effet, avant toute hydratation. Une réponse reçue après un changement de compte, un remplacement de la même identité, un changement de mode ou un démontage est ignorée. L'offre affichée est vidée pendant le chargement de la nouvelle portée.

Une référence de confirmation empêche deux appels dans le même tick, avant que React puisse désactiver le bouton. Après chaque attente, l'orchestration vérifie sa portée ; elle ne rafraîchit pas une offre obsolète et le hook ne navigue pas pour une ancienne identité. Les promesses de démarrage rejetées rendent le même choix réessayable, avec un message i18n stable. La validation canonique n'est jamais dupliquée dans les composants.

## Preuves et contrôles

Le contrôle ciblé regroupe `starterPreparation`, `starterSelectionController`, `starterCatalog`, `starterSelectI18n`, `championEconomyUi` et `pages`. Il couvre les contrats injectés, les erreurs réseau/réessais, les réponses tardives et le démontage, le Daily invité/connecté, les doubles clics, l'accès gratuit/acheté/rotation, le catalogue de 180 champions, les choix conservés entre pages/recherches, l'ordre envoyé à `startRun`, le focus après retrait et les textes FR/EN. Le scan des textes bruts suit la façade, le hook et les cinq composants extraits.

Le 13 octobre 2026, ces **66 tests dans 6 fichiers** passent avec Node 24.19.0 ; `tsc --noEmit`, Biome sur les chemins de cette tranche et `git diff --check` passent aussi. Les logs ciblés sont `/tmp/lolrogue-arch-s4-starter-regression.log`, `/tmp/lolrogue-arch-s4-starter-tsc.log` et `/tmp/lolrogue-arch-s4-starter-format.log`.

Avant extraction, la page regroupait 789 lignes. Après extraction, l'entrée de route comporte 2 lignes et l'écran de composition 84 lignes ; l'orchestration, le filtrage et les sous-vues disposent de leurs propres contrats. Ces chiffres décrivent la séparation des responsabilités ; ils ne constituent pas un plafond artificiel de taille.

Les preuves navigateur, l'accès aux anciennes sauvegardes, le build et le budget de bundle sont vérifiés lors de la validation intégrée d'ARCH-S4. Cette tranche ne change ni règles de combat, ni versions d'authority, ni migrations.
