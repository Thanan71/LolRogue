# Corrections de l’audit UI/UX — 9 octobre 2026

Les observations du [rapport initial](report.md) sont conservées comme état avant correction. Cette livraison locale applique les onze corrections et ajoute les états visuels de combat ainsi qu’un catalogue de sélection adapté à davantage de champions.

## Changements vérifiés

| Observation | Correction |
| --- | --- |
| UX-01 — confirmation de combat ambiguë | Action et cible restent en attente jusqu’à la confirmation, par bouton, Entrée ou Espace. Les tours empêchés avancent via un adaptateur de présentation; l’IA ne choisit pas une commande à la place du joueur manuel. |
| UX-02 — préparation trop longue | Recherche par nom/rôle, filtre d’accès « Disponibles » par défaut, tri et pagination de 12 champions. L’équipe choisie survit aux recherches et aux changements de page. Runes facultatives dans un panneau dépliable et confirmation fixe sur mobile. |
| UX-03 — connexion depuis une partie invitée | Refus avant appel au fournisseur, chargement terminé et erreur visible. Le profil utilise la confirmation d’abandon existante. L’entrée invitée attend aussi la fin de l’initialisation. |
| UI-04 — focus des réglages | Utilisation du jeton de focus existant sur la piste de l’interrupteur. |
| UI-05 — sorts indisponibles inaccessibles | Sorts focalisables avec `aria-disabled`, informations persistantes et bouton de fermeture. Une inspection ouverte reste prioritaire sur les aperçus de survol. |
| UI-06 — petits textes | Textes utiles du combat et du catalogue relevés à au moins 12 px. |
| UI-07 — infobulle hors écran | Position calculée selon la taille réellement rendue; largeur et hauteur bornées, défilement possible et accès au panneau depuis son déclencheur. La largeur minimale du document ne grandit plus avec la taille du texte. |
| UI-08 — contraste inventaire | Compteurs et métadonnées utilisent le texte secondaire plus contrasté. |
| UX-09 — statistiques du recrutement | Niveau d’arrivée et huit statistiques issus du constructeur de l’équipe utilisé en combat, avec multiplicateur, maîtrise, améliorations et augments applicables. Compétences et passif consultables en boutique avant achat. |
| UX-10 — récupération du mot de passe | Demande, réception d’une session de récupération, confirmation du nouveau mot de passe et gestion du lien expiré en français et en anglais. |
| UX-11 — accès à Jouer | Actions de partie placées avant les nouveautés et les informations de monnaie sur le menu. |

Les états proviennent des effets actifs du moteur : étourdissement, immobilisation, silence, ralentissement, projection, peur, charme, bouclier et effets persistants. Les portraits et la scène affichent leurs libellés, icônes, durées restantes et valeurs utiles. Les PV faibles et les champions hors combat ont aussi un indicateur. Les noms accessibles des cibles incluent leurs états.

Les notes de mise à jour **2026.10.09 / publication 2** couvrent ces changements en français et en anglais. La publication précédente reste intacte; son acquittement ne masque pas la nouvelle publication.

## Validation locale

- Suite unitaire complète exécutée : 2 300 tests réussis au premier passage, avec deux contrats de traduction à actualiser et trois suites ayant atteint leur délai sous charge. Les cinq suites concernées et les nouveaux tests ont ensuite repassé, sans changer les limites de la simulation de 900 parties. Les dernières retouches passent aussi 93 tests ciblés. Les scénarios nécessitant un environnement externe restent ignorés conformément à leur configuration.
- Catalogue synthétique de **180 champions** : 12 cartes montées par page, recherche, choix sur plusieurs pages, ordre de l’équipe et restauration du focus après retrait.
- **52 scénarios E2E distincts** validés : préparation, achats et notes simulés, clavier/tactile, états et détails des sorts à 320/390 px, inventaire, profils, carte, fin de partie, réhydratation et récupération d’erreurs, plus une défaite réelle et une victoire à travers les six biomes. Le grand parcours axe a repassé isolément après un délai dépassé sous charge.
- **8 vérifications navigateur supplémentaires** pour l’authentification simulée : annulation, refus avant fournisseur, liens expirés FR/EN, demande en cours/succès et confirmation du nouveau mot de passe.
- TypeScript application/scripts/E2E, Biome, CSP, contenu, build et vérification du build de production.
- Moteur `run-engine-v21`, registre et bundle d’autorité identiques à l’état initial; contrôles des 21 versions réussis. Graphify rafraîchi avec extraction incrémentale sans LLM.

Les anciens tests utilisant Lux comme starter gratuit ont reçu des fixtures légales ou des équipes explicitement réservées à la présentation. Le serveur de test a été redémarré après les modifications pour éviter que les imports de fixtures et les composants utilisent des versions différentes des stores après HMR.

## Captures et mesures après correction

Les captures sont conservées localement et exclues de Git. Les liens d’images ci-dessous sont consultables dans ce workspace; les mesures et comptes rendus textuels sont versionnés.

- [Sélection à 390 px](after/mobile-selection.png), [320 px](after/small-selection.png) et [1440 px](after/desktop-selection.png).
- [Menu à 390 px](after/mobile-menu.png) : accès à Jouer avant les informations secondaires.
- [Combat avec immobilisation réelle](after/combat-root-390.png).
- [États simultanés et détails de sort à 320 px, grand texte](after/combat-states-tooltip-large-320.png) : les états multiples sont une fixture de présentation; leur extraction du moteur et leur expiration sont couvertes par les tests unitaires.
- [Erreur de connexion visible](after/lolrogue-auth-fixed-login.png), [lien expiré FR](after/lolrogue-auth-expired-fr-FR.png), [lien expiré EN](after/lolrogue-auth-expired-en-US.png), [preuves d’authentification simulée](after/auth-browser-evidence.json).

La préparation repliée mesure **2 176 px à 390 px** et **2 181 px à 320 px**, contre environ 3 588 px lors de l’audit initial. La confirmation est entièrement visible dans les deux fenêtres mobiles et aucun débordement horizontal n’est observé. Les descriptions des runes dépliées gardent au moins 180 px de largeur à 320 px, sans troncature.

## Limites et configuration distante

Les tests de comptes, achats, envoi d’e-mail et RPC simulent le fournisseur. Aucun compte réel, base distante, réglage SMTP, déploiement ou migration n’a été modifié. Avant publication, vérifier l’autorisation du retour `/auth?mode=recovery` et l’envoi d’e-mail selon [la documentation de récupération](../../auth-password-recovery.md). Les règles et tarifs des champions n’ont pas changé.
