# Système d'interface

Le shell partagé vit dans `src/components/ui` et ses règles visuelles dans
`src/styles/ui.css`. Les nouvelles pages doivent composer ces primitives avant
d'ajouter une classe propre au domaine.

## Direction visuelle

L'interface utilise une base slate sombre, une typographie système sans-serif et
l'or uniquement comme accent de hiérarchie et d'action. Aucune police distante
n'est chargée : `--font-ui` et `--font-display` partagent une pile système rapide,
compatible avec la CSP et disponible hors ligne.

Les tokens globaux couvrent espacements, rayons, tailles de texte, surfaces,
bordures, focus, succès, avertissement, danger, transitions et ombres. Une page ne
doit pas recopier leurs valeurs hexadécimales pour recréer un composant existant.

## Primitives

- `PageShell`, `PageHeader`, `PageFooter` possèdent hauteur, safe areas, largeur,
  scroll vertical et reflow du header.
- `Panel` et `Stack` structurent le contenu sans positionnement absolu.
- `Button`, `Field`, `TextInput`, `Tabs` et `Tab` portent les interactions et leur
  focus visible.
- `StateView` expose les états loading, empty et error avec les rôles adaptés.
- `Dialog` possède backdrop, surface scrollable, actions flexibles et sémantique
  modale. La gestion avancée du focus relève de P1-A11Y-01.

Les breakpoints répondent au contenu (`42rem` pour le header et `38rem` pour le
challenge Daily), pas à un modèle d'appareil. `100dvh`, `env(safe-area-inset-*)`,
`minmax(0, 1fr)`, les largeurs fluides et `overflow-x: clip` empêchent les actions
principales de sortir du viewport. `position: fixed` est réservé au backdrop de
dialogue, où il exprime une vraie couche modale.

Settings, Credits, Profil, Daily, Rules, 404 et les états de chargement/erreur des
routes utilisent ce shell. Les rencontres spécialisées composent `EncounterLayout`
et conservent ainsi un titre, un solde, des safe areas et une zone de feedback
cohérents.

## Écrans de jeu mobiles

`EncounterLayout` est propriétaire du header, de l'or affiché, des safe areas et
du scroll pour Event, Shop, Rest, Treasure et Recruit. Ces pages montrent les
portraits ou objets concernés et annoncent leur résultat avec `role="status"` ou
`role="alert"`.

Combat passe en grille sous `40rem` : l'arène et les commandes occupent toute la
largeur, puis les deux équipes restent comparables. La scène indique explicitement
l'attaquant, la ou les cibles, le sort et son montant. Les quatre icônes de sort des
dix champions maintenus sont des fichiers Data Dragon épinglés et locaux. Les VFX
CSS varient par champion et compétence, n'emploient que transform/opacité et sont
supprimés avec `prefers-reduced-motion` sans masquer le résultat textuel.

La carte utilise des chemins courbes et différencie trajet parcouru, choix actuel,
branche fermée et futur verrouillé. Elle se recentre sur la progression, garde une
cible tactile de 62 px et propose une action Recentrer. Game Over commence en haut,
scrolle, montre les portraits, le MVP et les contributions. Database devient une
navigation liste → fiche sous `48rem`, avec retour et restauration du focus.

Le leaderboard Daily ne possède plus de largeur minimale. Sous `40rem`, chaque
ligne devient une carte mais conserve rang, joueur, score, vagues et niveau. Les
contenus plus riches gardent un scroll explicite.

`e2e/game-screens-responsive.spec.ts`, `e2e/database-mobile-navigation.spec.ts`,
`e2e/starter-select-responsive.spec.ts` et le scénario Combat/Carte vérifient le
focus, les cibles tactiles, les icônes chargées, l'absence de débordement et les
états de présentation sur les viewports mobiles et desktop maintenus.
