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

Les pages migrées dans P1-UX-01 sont Settings, Credits, Profil, Daily, 404 et les
états de chargement/erreur des routes. Les écrans de gameplay spécialisés seront
migrés vers `EncounterLayout` pendant P1-UX-02.

## Écrans de jeu mobiles

P1-UX-02 ajoute `EncounterLayout`, propriétaire du header, de l'or affiché, des
safe areas et du scroll pour Event, Shop, Rest, Treasure et Recruit. Combat passe
en grille sous `40rem` : l'arène et les commandes occupent toute la largeur,
puis les deux équipes restent comparables côte à côte. Son header accepte le
retour à la ligne et garde Auto et la vitesse accessibles. Game Over commence en
haut, scrolle et adapte statistiques, champions et actions. Database empile liste
et détail sous `48rem`; la carte réduit son header et empile ses panneaux.

Le leaderboard Daily ne possède plus de largeur minimale. Sous `40rem`, les
colonnes Waves et Level sont masquées afin de conserver rang, joueur et score sans
scroll horizontal. Les contenus plus riches gardent un scroll explicite.

`e2e/game-screens-responsive.spec.ts` vérifie l'absence de débordement, la
visibilité des actions et attache des captures Database, Game Over et carte pour
320×568, 375×667, 390×844, 768×1024, 1280×720 et 1440×900.
