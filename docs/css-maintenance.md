# Contrat de maintenance CSS

Inventaire ARCH-17 du 13 octobre 2026, CSS de départ `70b0a614`.
Le périmètre est la présentation : aucun changement du moteur, des données de
champions, du parcours, des composants React ou des identifiants de classes.

## Sources et cascade

`src/main.tsx` importe `src/index.css`. Celui-ci importe, dans cet ordre,
`styles/ui.css` puis `styles/game-mobile.css`, avant les directives Tailwind
`base`, `components`, `utilities`. `index.css` possède les tokens `:root`, la
base, le focus global et les protections reduced-motion/forced-colors.
`ui.css` est la feuille des primitives existantes de `src/shared/ui` : shell,
header, panel, contrôles, tabs et feedback. Aucun deuxième système UI n'est
introduit.

Les autres feuilles sont des imports à effet de bord de routes ou de composants.
Elles restent globales après leur chargement ; ce ne sont pas des CSS Modules.
La cascade dépend donc aussi des routes précédemment ouvertes. Les règles
hors couche ont priorité sur les couches Tailwind ; déplacer un bloc dans une
couche ou changer son ordre d'import peut modifier le rendu sans changer sa
spécificité.

Le Starter importe `starter-select.css` et `database.css`, et consomme
`champion-economy.css` via le composant économie. Les sélecteurs préfixés
`.starter-select` et `.database-page` protègent notamment les grilles de stats.
`EncounterLayout` fournit la base commune aux pages de rencontre, puis leurs
feuilles spécialisent l'atmosphère et les cartes. Les panneaux de run importent
leurs feuilles à travers leurs propres composants.

## Inventaire complet avant rationalisation

26 feuilles sous `src/styles`, plus `index.css` : **15 601 lignes, 2 245 règles
AST, 8 205 déclarations, 69 déclarations `!important`**. Les blocs de keyframes
comptent dans les règles AST. Les maxima de spécificité suivent `(ID, classe /
attribut / pseudo-classe, élément / pseudo-élément)`, avec les règles de
`:where`, `:is` et `:not` prises en compte.

Les nombres décrivent le point de départ ; ce ne sont pas des budgets imposés.
Les familles de media queries sont détaillées pour conserver leurs seuils
propres, plutôt que forcer un breakpoint unique.

| Feuille | Importateur | Règles | Max. spécificité | `!important` | Media queries |
| --- | --- | ---: | --- | ---: | --- |
| `ui.css` | `index.css`, primitives `shared/ui` | 129 | (0,3,2) | 2 | largeur 42rem ; mouvement réduit |
| `game-mobile.css` | `index.css`, adaptations transverses | 75 | (0,1,1) | 34 | largeurs 22/48/40rem ; pointer coarse |
| `admin.css` | `AdminPage` | 154 | (0,3,1) | 3 | largeurs 46rem, 768/480px |
| `auth.css` | `AuthPage` | 123 | (0,3,1) | 0 | largeurs 56/42rem ; hauteurs 30/44rem ; forced-colors |
| `champion-economy.css` | `ChampionEconomy` | 44 | (0,4,0) | 0 | largeur 560px ; mouvement réduit |
| `combat-ui.css` | `features/combat/ui/CombatScreen` | 339 | (0,4,0) | 2 | largeur 40rem ; mouvement réduit |
| `daily-run.css` | `features/daily/ui/DailyRunScreen` | 54 | (0,2,2) | 1 | largeur 38rem |
| `database.css` | `DatabasePage`, `StarterSelectScreen` | 116 | (0,2,1) | 0 | largeurs 48/32rem |
| `encounter.css` | `EncounterLayout` | 24 | (0,2,1) | 0 | largeur 32rem ; mouvement réduit |
| `event.css` | `EventPage` | 62 | (0,2,0) | 0 | mouvement réduit |
| `game-over.css` | `GameOverPage` | 105 | (0,2,0) | 0 | mouvement réduit |
| `legal-credits.css` | `LegalPage`, `CreditsPage` | 52 | (0,3,0) | 0 | largeurs 48/34rem ; forced-colors |
| `main-menu.css` | `MenuPage` | 121 | (0,3,0) | 0 | hover ; largeurs 52/37.5/35/25rem ; hauteur 40rem ; forced-colors |
| `patch-notes.css` | `PatchNotesPage`, `PatchNotesSummary` | 14 | (0,2,1) | 0 | largeur 420px ; mouvement réduit |
| `recruit.css` | `RecruitPage` | 69 | (0,2,0) | 0 | largeur 30rem ; mouvement réduit |
| `rest.css` | `RestPage` | 41 | (0,3,0) | 0 | mouvement réduit |
| `run-empty.css` | `RunPage` | 16 | (0,2,0) | 0 | largeur 30rem ; mouvement réduit |
| `run-history.css` | `history/RunHistoryFilters` | 4 | (0,1,1) | 0 | aucune |
| `run-inventory.css` | `RunInventoryPanel` | 68 | (0,2,1) | 0 | largeur 30rem ; mouvement réduit |
| `run-map.css` | `RunMapScreen` | 173 | (0,3,0) | 5 | pointer coarse ; largeurs 64/42/22rem ; mouvement réduit ; forced-colors |
| `run-progress.css` | `RunProgressCounters` | 15 | (0,2,1) | 0 | aucune |
| `run-team-stats.css` | `RunTeamStatsPanel` | 50 | (0,2,0) | 0 | largeur 22rem ; pointer coarse ; mouvement réduit |
| `shop.css` | `ShopPage` | 54 | (0,3,0) | 0 | largeur 32rem ; mouvement réduit |
| `spell-upgrade.css` | `SpellUpgradePanel` | 66 | (0,3,0) | 0 | largeur 34rem ; mouvement réduit ; forced-colors |
| `starter-select.css` | `features/champions/ui/StarterSelectScreen` | 133 | (0,4,0) | 0 | largeurs 360/1200/850/550px ; forced-colors |
| `treasure.css` | `TreasurePage` | 60 | (0,3,0) | 0 | largeur 32rem ; mouvement réduit |
| `index.css` | `main.tsx` | 84 | (1,0,0) | 22 | pointer coarse ; largeur 42rem ; mouvement réduit ; forced-colors |

## Tokens et doublons

Avant ce lot, `index.css` définit 58 tokens : palette de marque et couleurs
sémantiques, polices et tailles, espaces, rayons, gradient, ombres et durées.
L'ensemble CSS possède 171 déclarations de variables pour 70 noms distincts ;
les répétitions correspondent notamment aux variantes des effets de combat.
80 noms sont référencés dans les CSS : certaines valeurs sont fournies par les
composants à travers les styles dynamiques CSP, par exemple l'accent de rencontre
et les proportions des jauges. Une absence de déclaration CSS ne prouve donc
pas une variable manquante.

`--lol-dark-light`, `--lol-dark-lighter`, `--lol-teal-dark`, `--color-accent` et
`--color-damage` n'ont pas de référence dans les seules feuilles CSS examinées.
Ils sont conservés : une suppression demande une recherche des consommateurs
TypeScript, des styles dynamiques et des variantes, pas seulement un grep CSS.
Les palettes locales Combat, Event, Rest et Shop restent locales ; leurs valeurs
portent un sens visuel différent de la palette générale.

Les doublons repérés comprennent le shell plein écran Combat/Database, les
valeurs des contrôles, les safe areas Auth/Menu et certaines grilles ou couleurs
de statut. Les blocs de grille à des breakpoints différents, les safe areas et
les couleurs de statut spécialisées restent à leur emplacement : leur simple
égalité textuelle ne prouve pas une dépendance commune.

## Rationalisation ciblée

Le shell commun Combat/Database conserve ses deux sélecteurs historiques et sa
spécificité `(0,1,0)` dans `ui.css`, hors couche. Ses neuf déclarations communes
sont mutualisées. `overflow: hidden` reste dans chaque feuille de feature :
le déplacer avant `game-mobile.css` changerait la priorité de ses adaptations
`overflow-y`. Les media queries de ces features restent à leur place.

Les valeurs communes de hauteur minimale des contrôles, opacité disabled,
largeur/décalage du focus et texte sur le bouton secondaire sont nommées dans
les tokens existants de `index.css`. Leurs valeurs sont exactement celles du
point de départ. Les contrôles plus compacts, offsets spécifiques et règles
forced-colors ne sont pas uniformisés artificiellement. Aucun sélecteur public,
import ou couche CSS n'est retiré.

Une exception visuelle intentionnelle corrige le contraste du petit libellé
« Cible » dans le combat : `--color-text-secondary` remplace le texte atténué
uniquement dans `.combat-command__target .combat-command__step-label`.
Le point de départ était **4,2:1**, sous le minimum **4,5:1** ; la valeur corrigée
atteint **7,09:1** sur le même fond. Les autres libellés et les couleurs de statut
ne changent pas.

## Protocole de preuve

`e2e/css-maintenance.spec.ts` couvre Auth, Menu, Settings, Starter (runes
dépliées), Database et Combat. La capture Combat attend une phase joueur stable.
L'horloge est fixée au 02/02/2026, la run utilise la seed 20260801, le catalogue
public utilise une rotation valide et les patch notes sont marquées lues via
leur frontière de stockage pour conserver le même état Menu. Les réseaux
externes sont bloqués ; le RPC public de catalogue est la seule réponse simulée.
Les assets Riot sont de vrais fichiers locaux et leur `naturalWidth` est vérifié.
La présence des portraits Annie/Warwick et d'une icône de sort est obligatoire.

Les polices et images sont attendues avant capture, les images lazy sont chargées
explicitement, les animations sont figées pour les PNG et le mode mouvement
réduit reste activé. Chaque surface vérifie le focus visible et le reflow.
Les trois tailles sont desktop **1280×900**, mobile **390×844**, et **320×225**.
Cette dernière taille prouve le reflow équivalent à un viewport desktop 1280×900
à **400 %** ; ce n'est pas une commande de zoom de l'interface Chromium.
Un `deviceScaleFactor` ou un zoom de page CDP seul ne prouverait pas ce reflow.
La preuve n'inclut pas une session manuelle du zoom navigateur ni un lecteur
d'écran ; elle vérifie le layout à 320px, les contrôles et leur focus réel.

En palette normale, axe `color-contrast` doit signaler zéro violation après ce
lot. Seul le défaut connu « Cible » est autorisé dans la capture **before**, pour
enregistrer sa preuve ; cette exception ne s'applique ni à **after** ni à la CI.
En forced-colors, axe compare ici certaines couleurs d'auteur à un fond système
et retourne des ratios trompeurs. La vérification utilise les couleurs réellement
calculées `CanvasText`, `ButtonText`, `ButtonFace`, le texte, les bordures et le
focus, ainsi que les captures. Elle ne prétend pas que le rapport axe sous
forced-colors est une mesure correcte de la palette effectivement peinte.

Sans option, les PNG et JSON sont dans
`test-results/css-maintenance/{before,after}`, déjà ignoré. Playwright nettoie
ce dossier lors d'autres suites : une campagne de comparaison doit donc fixer
`CSS_AUDIT_OUTPUT` hors de ce dossier, comme dans les commandes ci-dessous.
Les preuves de ce lot sont conservées sous
`/tmp/lolrogue-s5-css-final-proof/{before,after}`. Aucun screenshot ne doit être
stagé ou commité. Les logs, inventaires détaillés et comparaisons temporaires
restent sous `/tmp`.

```sh
CSS_AUDIT_PHASE=before CSS_AUDIT_OUTPUT=/tmp/lolrogue-css-proof CI=1 \
  npx playwright test e2e/css-maintenance.spec.ts \
  --workers=1 --retries=0 --output=/tmp/lolrogue-css-before
# Appliquer seulement le changement CSS à examiner.
CSS_AUDIT_PHASE=after CSS_AUDIT_OUTPUT=/tmp/lolrogue-css-proof CI=1 \
  npx playwright test e2e/css-maintenance.spec.ts \
  --workers=1 --retries=0 --output=/tmp/lolrogue-css-after
npm run typecheck:e2e
npx biome check src/index.css src/styles/ui.css src/styles/database.css \
  src/styles/combat-ui.css e2e/css-maintenance.spec.ts
```

Les dimensions et styles calculés des surfaces stables sont comparés avec les
mêmes fixtures ; les descendants d'un `details` fermé sont exclus du relevé,
car ils ne sont pas peints même si Chromium leur fournit parfois un rectangle.
Chaque parcours de six routes possède un délai de test de 90 secondes ; les
assertions, attentes de visibilité et budgets globaux restent inchangés.
La comparaison pixel doit limiter les changements de présentation à la boîte
du libellé Combat corrigé ; une égalité globale des hashes n'est pas attendue
pour cette exception. Un résidu de rasterisation doit être conservé et vérifié
par une répétition avec les mêmes CSS, plutôt qu'être attribué sans preuve à la
rationalisation. Le passage de ces tests n'autorise ni un déploiement ni la
clôture des autres tâches ARCH-S5.

## Résultats du lot

La comparaison finale utilise un clone du point de départ `70b0a614`, avec le
même middleware de service des assets Riot et le même harness pour les deux
phases. Les quatre feuilles CSS sont identiques au HEAD lors de la phase AVANT ;
seules ces quatre feuilles sont remplacées par leur version finale pour APRÈS.
Les 42 PNG et 42 JSON, les empreintes des sources et les rapports sont conservés
dans `/tmp/lolrogue-s5-css-final-proof`, hors du nettoyage Playwright.

Les deux matrices passent sans retry : **3/3 AVANT (environ 60 s), 3/3 APRÈS
(58 s)**. La répétition desktop passe également **1/1 (21,8 s)**. Tous les
assets Riot rendus sont chargés, les 21 relevés de dimensions/styles/fixtures
sont identiques, le focus est présent, le débordement horizontal reste inférieur
ou égal à 1px et la préférence reduced-motion est active. Les contrôles relevés
sont `main`, titres et contrôles visibles, pas l'ensemble des nœuds du document.

| Viewport | PNG strictement identiques dans la matrice | Écart observé |
| --- | ---: | --- |
| Desktop 1280×900 | 5/7 | 362 pixels sur le libellé Cible ; 4 pixels de rasterisation Database |
| Mobile 390×844 | 6/7 | 362 pixels sur le libellé Cible |
| Reflow 400 % équivalent 320×225 | 6/7 | 362 pixels sur le libellé Cible |

Les **1 086 pixels de changement intentionnel** sont tous dans les boîtes du
libellé Cible. Le résidu Database est limité à quatre pixels du coin arrondi
du contrôle de tri « Nom », avec un delta maximal de **1/255 par canal** : une
répétition APRÈS sans aucune
modification CSS reproduit ces quatre différences et donne une capture Database
pixel-identique à AVANT. Les captures et le rapport de répétition restent
conservés ; la matrice principale n'est pas remplacée pour masquer ce bruit.

En palette normale, le défaut Cible est la seule violation AVANT et il disparaît
APRÈS dans les trois viewports. Le contrôle des couleurs système forced-colors
passe pour le paragraphe et le bouton sondés, avec leur bordure et focus. Il ne
constitue pas une mesure exhaustive de tous les contrôles en contraste forcé.
La vérification des durées CSS et des consommateurs canvas/SVG reste couverte
par le scénario existant `e2e/accessibility-display.spec.ts` ; le présent harness
atteste le rendu et la préférence, sans prétendre remplacer ce scénario.

| Inventaire CSS | Avant | Après |
| --- | ---: | ---: |
| Feuilles (`src/styles` + `index.css`) | 27 | 27 |
| Lignes | 15 601 | 15 609 |
| Règles AST | 2 245 | 2 247 |
| Déclarations | 8 205 | 8 202 |
| `!important` | 69 | 69 |
| Tokens `:root` | 58 | 63 |

Les maxima de spécificité, imports, couches et media queries restent inchangés.
Biome sur les quatre feuilles et le harness, `npm run typecheck:e2e` et
`git diff --check` passent. Aucun PNG ni JSON de capture n'est ajouté au dépôt.

Le scénario tactile à 320px a également révélé une course dans son locator de
test : le catalogue public peut remplacer l'offre initiale pendant que `tap()`
attend l'activation d'une carte. Cette carte conserve son identité, mais
`nth(0)` désigne ensuite un autre champion. Une reproduction avec la vraie
réponse RPC publique retardée d'une seconde a enregistré un premier tap sur
Darius puis un deuxième sur Ashe, tandis que le premier locator désignait
désormais Annie, non sélectionnée. Le scénario initial échoue **2/10** sans
trace ; le scénario corrigé attend les deux cartes activables, fige leurs IDs
et vérifie le feedback après chaque tap, puis passe **10/10 sans retry ni trace**.
Les deux choix tactiles, l'erreur de démarrage et les assertions de géométrie à
320px restent vérifiés. Aucun composant, store, CSS ni délai de test n'est
modifié pour cette correction ; les typages E2E et Biome ciblé passent.
