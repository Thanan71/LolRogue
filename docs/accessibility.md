# Accessibilité — contrat de la bêta

## Référentiel

LolRogue vise WCAG 2.2 niveau AA pour les parcours Auth → Starter → Carte →
Rencontre/Combat → Game Over. Les tests automatisés ne remplacent pas une
validation humaine avec plusieurs lecteurs d'écran, mais bloquent les régressions
détectables de sémantique, contraste, clavier, reflow et mouvement.

## Garanties automatisées

- `e2e/accessibility.spec.ts` exécute axe, contraste inclus, sur Auth, Menu,
  Database, Réglages, Crédits, Daily, Starter, Carte, Combat et Game Over. Toute
  violation `serious` ou `critical` échoue.
- Le même test pilote les onglets Auth/Database et la sélection de champion au
  clavier, vérifie le titre et le focus de route, puis traverse Starter, Carte et
  Combat jusqu'au résultat.
- `e2e/accessibility-display.spec.ts` simule un viewport CSS `640×360`, équivalent
  au zoom 200 % d'une fenêtre `1280×720`, et refuse tout débordement horizontal sur
  les routes documentaires principales.
- Le mode `prefers-reduced-motion: reduce` neutralise animations et transitions
  CSS, supprime le canvas de particules, les animations SMIL de carte et
  l'animation de combat.
- Le mode Chromium `forced-colors: active` vérifie bordures, focus visible et
  activation clavier. Un instantané ARIA contrôle les noms du bouton invité et du
  titre du menu.
- Les tests de réglages vérifient la taille racine, le volume, la vitesse de combat
  et l'activation des particules jusque dans leurs stores/consommateurs.

## Information et alternatives

La couleur et le son restent décoratifs ou redondants : états de nœud, résultat,
tour, erreur, récompense, disponibilité et sélection ont tous un texte, une icône
ou un nom accessible. Les barres PV/XP exposent leurs valeurs numériques. Le son
peut être coupé sans retirer une information nécessaire.

## Validation humaine de livraison

Avant une version publique majeure, vérifier au minimum NVDA + Firefox sous
Windows et VoiceOver + Safari sous macOS/iOS : ordre de lecture, annonces live,
prononciation des termes de jeu et confort du parcours complet. Cette vérification
matérielle est complémentaire aux instantanés ARIA automatisés.
