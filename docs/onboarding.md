# Onboarding et règles

## Parcours livré

- Le menu présente la boucle complète avant la première partie et ouvre `/rules`.
- Le guide central est recherchable et filtrable par Boucle, Combat, Progression et
  Modes. Son contenu décrit uniquement des mécaniques reliées au moteur actuel.
- La première carte ouvre un tutoriel en quatre étapes. Il est mémorisé localement et
  reste disponible avec « Tutoriel carte ».
- Le premier combat ouvre un tutoriel en cinq étapes couvrant ordre, action/cible,
  coût/recharge, statuts/journal et autoplay. Il reste réouvrable.
- Runes, objets, augments, sorts et améliorations montrent leur description ou leur
  aperçu chiffré avant l'action irréversible.
- Normal, Daily et invité indiquent leurs règles de graine, difficulté, classement et
  persistance.

## Confidentialité

Les clés `lolrogue:tutorial:map:v1` et `lolrogue:tutorial:combat:v1` enregistrent
uniquement, dans `localStorage`, que l'aide a déjà été vue. Elles ne contiennent ni
identité, ni durée, ni événement comportemental et ne sont pas envoyées au serveur.

Le temps jusqu'au premier combat et le taux d'abandon ne sont volontairement pas
mesurés. Leur activation exige au préalable une politique de télémétrie définissant
finalité, consentement, minimisation, durée de conservation, accès et suppression.

## Preuves automatisées

`e2e/onboarding.spec.ts` vérifie la boucle visible, le filtrage du guide, les règles
Normal/Daily et le cycle automatique/réouverture des tutoriels carte et combat.
`e2e/accessibility.spec.ts` contrôle aussi la route du guide avec Axe.
