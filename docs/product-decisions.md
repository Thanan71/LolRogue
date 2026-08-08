# Décisions produit transverses — version 1

Ces décisions sont figées pour la bêta. Elles complètent les règles détaillées dans
`gameplay.md` et le contrat de persistance ; toute modification doit changer le
contrat `src/product/productDecisions.ts`, ses tests et les textes visibles concernés.

## Langue et identité

- **Langue de lancement : français.** L'anglais viendra comme second dictionnaire
  i18n complet. Une page ne doit pas mélanger les deux langues entre-temps.
- **Invité : progression locale et isolée.** Elle n'est jamais fusionnée, importée
  ou copiée automatiquement lors d'une connexion. Changer d'identité purge les
  caches privés de l'identité précédente.

Ce choix évite une fusion ambiguë entre une progression locale modifiable et une
progression authentifiée accordée par le serveur.

## Run et combat

- **Daily :** journée UTC, seed et difficulté figées par le serveur, une tentative
  officielle par compte et par jour. La tentative est créée au démarrage ; un
  abandon la consomme mais ne publie aucun score.
- **Autoplay :** désactivé par défaut, activable et désactivable par le joueur. Il
  s'arrête lorsqu'une décision du joueur est requise.
- **Carte :** choisir une branche ferme définitivement ses branches sœurs dans le
  biome courant.
- **Défaite et abandon :** aucune candy sans vague terminée. Après au moins une
  vague, les candies déjà calculées sont conservées en défaite ou en abandon, sans
  bonus de victoire. L'or et les objets restent propres à la run ; la maîtrise et
  le ledger validés persistent après finalisation.
- **XP :** un combat gagné accorde son XP à chaque membre de l'équipe, y compris les
  champions KO. Un kill n'accorde pas d'XP séparée. Cette règle limite l'effet
  boule de neige et doit rester annoncée dans le résumé du combat.

## Inventaire plein

La capacité reste une contrainte dure :

- un achat en boutique est refusé avant la dépense ;
- un objet gratuit de combat, trésor ou événement est laissé sur place ;
- l'interface doit toujours annoncer explicitement que l'objet n'a pas été ajouté.

Le remplacement ou la vente automatique n'est pas retenu pour la bêta : cela
ajouterait une décision et une commande autoritaire à chaque récompense. Une perte
silencieuse est en revanche interdite.

## Réseau et hors-ligne

- Une run invitée est officiellement locale, uniquement pour la progression
  invitée du navigateur.
- Une run authentifiée exige l'autorité en ligne pour démarrer et être vérifiée.
- Une coupure temporaire conserve l'état local et le snapshot final afin de réessayer
  la commande ou la finalisation. Elle ne transforme pas la run en run hors-ligne
  validée et ne la fusionne pas avec une identité invitée.

L'interface doit donc proposer une erreur bloquante avec réessai quand l'autorité
est indispensable, tout en préservant la reprise locale en cas d'interruption.

## Télémétrie et diagnostics

Les analytics comportementales sont désactivées. Les diagnostics en base sont eux
aussi désactivés par défaut ; lorsqu'ils sont explicitement activés pour
l'exploitation, ils sont nettoyés, bornés et conservés au maximum 14 jours.

Avant toute activation d'analytics produit, il faut documenter la finalité et les
données exactes, choisir une base légale, ajouter l'information et le consentement
si requis, ainsi qu'un refus et un retrait accessibles. Aucun journal de commandes,
email ou identifiant public ne doit être collecté comme métrique produit.
