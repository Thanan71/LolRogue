# Décisions produit transverses — version 4

Ces décisions sont figées pour la bêta. Elles complètent les règles détaillées dans
`gameplay.md` et le contrat de persistance ; toute modification doit changer le
contrat `src/product/productDecisions.ts`, ses tests et les textes visibles concernés.

## Langue et identité

- **Langues : français et anglais.** Le français reste la langue par défaut,
  avec dictionnaires et catalogues FR/EN complets. L'audit humain avec lecteur
  d'écran reste requis avant clôture du P0 i18n.
- **Invité : progression locale et isolée.** Elle n'est jamais fusionnée, importée
  ou copiée automatiquement lors d'une connexion. Changer d'identité purge les
  caches privés de l'identité précédente.

Ce choix évite une fusion ambiguë entre une progression locale modifiable et une
progression authentifiée accordée par le serveur.

## Roster et Éclats — économie v1

Les Candies restent la maîtrise propre à chaque champion ; l'or reste propre à
la run. Aucune conversion entre ces monnaies n'existe. Les Éclats appartiennent
au compte et proviennent exclusivement du gameplay vérifié, sans argent réel,
publicité récompensée ni loot box. Les invités ne reçoivent pas d'Éclats.

Garen, Annie et Ashe sont gratuits en permanence. Une rotation commune de cinq
autres champions implémentés change le lundi à 00:00 UTC. Chaque achat permanent
coûte 400 Éclats dans le catalogue v1. La maîtrise survit aux changements de
rotation et à l'achat. Les comptes créés avant la première activation conservent
tous les champions disponibles, avec un unlock permanent `legacy_grant`.

Une run vérifiée ayant terminé une vague rapporte 25 Éclats, plus 10 par biome
terminé et 50 pour une victoire. Une première victoire rapporte aussi 50 par
champion de rotation présent dans l'équipe, une fois par compte/champion/période,
y compris si le champion a été acheté durant cette période. Une défaite ne
consomme pas ce bonus. Le barème de base n'est pas multiplié par la taille d'équipe.

Le Daily conserve son offre commune actuelle de six champions, indépendante des
achats et de la maîtrise. Cette exception préserve la comparabilité des départs.
Le serveur fige cette offre et la rotation dans chaque tentative. La période du
bonus est celle du démarrage ; finir après le changement de semaine ne modifie
pas le contrat. Les anciennes tentatives et celles démarrées avec le flag OFF
ne reçoivent pas rétroactivement des Éclats.

Le flag serveur `champion_economy_enabled` reste désactivé par défaut. Sa première
activation attribue les grants avant d'appliquer les restrictions. Le désactiver
rend tout le roster implémenté accessible et conserve wallets, ledger, achats
et maîtrise. Le rollout et les preuves sont décrits dans `champion-economy.md`.

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

- **PWA installable, en ligne uniquement.** Décision Sprint G : installation
  via le navigateur, sans shell hors ligne, cache applicatif ni service worker.
  La présence d'un service worker n'est pas requise pour l'installation
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)).
  Une nouvelle ouverture nécessite le réseau. Une partie déjà chargée conserve
  ses mécanismes de reprise existants ; l'installation n'ajoute aucun mode hors ligne.
- Les mises à jour arrivent à la prochaine navigation/recharge volontaire ;
  aucun worker ni rechargement automatique ne remplace les fichiers pendant
  une partie active. Le cache HTTP des assets hachés reste le cache web habituel.
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

## Dérive d'équilibrage

La décision `field-calibration-v1` est en `observation_only`. Les deux entrées de
politique de la baseline authority v21 sont les seules références de simulation
admises pour cette décision.
Un écart absolu de 5 points de victoire, 0,5 biome moyen ou 100 gold de solde moyen
ouvre une revue ; il ne modifie jamais le gameplay automatiquement.

Une revue compare uniquement des dimensions compatibles et publie la taille
d'échantillon ainsi que l'intervalle Wilson. Elle doit aussi consigner les écarts
victoire/biome/économie, le risque de composition, le ruleset cible et le rollback.
Tant que le terrain n'atteint pas `n >= 30` et que les playtests humains restent
`bloqués / non réalisés`, aucune bande cible ni dérive gameplay volontaire n'est
autorisée.
