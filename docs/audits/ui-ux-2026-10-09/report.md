# Audit UI et UX — LoL Rogue

Date : 9 octobre 2026. Référence : branche `dev`, commit `f2a05034ad3acbc8538db26fecbed8e5e01bd723`.

## Avis général

L'identité visuelle est cohérente : palette sombre, accents or et turquoise, portraits de champions, surfaces et boutons reconnaissables. La navigation, les tutoriels et les états de sauvegarde disposent déjà d'une base solide. La priorité est de rendre les décisions de jeu plus fiables et l'interface mobile plus facile à parcourir.

Les principaux problèmes sont une confirmation de combat trompeuse, une préparation d'équipe très longue, une transition invité → compte qui peut bloquer l'écran, et plusieurs informations difficiles à consulter au clavier ou avec du texte agrandi. Aucun blocage général de l'application n'a été observé dans les parcours testés.

Ces appréciations sont issues d'une inspection experte et de reproductions techniques. Elles ne mesurent pas les réactions de joueurs lors d'un test utilisateur.

## Périmètre et preuves

- Exploration ciblée par Graphify, Serena et recherches dans les composants, styles et tests.
- Captures Chromium à **1440 × 900** et **390 × 844** : connexion, inscription, menu, catalogue, réglages, préparation, carte, tutoriels, combat et défaite.
- Tests existants complétant les vues à **320, 375, 390 et 1280 px**, le clavier, la réduction des mouvements, les couleurs forcées et le reflow à 640 px.
- Partie locale invitée avec Annie et Ashe; quelques états créés en mémoire pour inspecter les sorts indisponibles et une fin de partie. Les images empaquetées du dépôt sont servies au navigateur, comme dans les tests existants, car Vite désactive `publicDir`.
- La connexion pendant une partie invitée est reproduite avec un fournisseur simulé et les requêtes externes bloquées. Aucun compte réel n'a été utilisé.
- Le recrutement et les achats en boutique sont examinés dans le code; leurs observations sont identifiées comme telles.
- La production, Safari, Firefox, un lecteur d'écran réel, un compte connecté réel et une partie complète ne sont pas validés par cet audit.

Preuves conservées : [mesures navigateur](browser-evidence.json), [tests originaux](e2e-original.log), [tests avec fixtures adaptées](e2e-adapted.log), [transition de connexion simulée](guest-login-evidence.json). Les captures se trouvent localement dans ce dossier et sont exclues de Git; leurs liens sont consultables dans ce workspace.

## Points à conserver

| Axe | Observation positive |
| --- | --- |
| Identité visuelle | Palette, typographie de titre et illustrations constituent un univers reconnaissable. Les actions principales se distinguent des surfaces secondaires. |
| Navigation | Titres de page, focus après navigation, contrôles natifs et onglets accessibles au clavier. Aucun débordement horizontal sur les vues principales capturées. |
| Apprentissage | Tutoriels carte/combat réouvrables, étapes courtes, gestion du focus et fermeture avec Échap. Guide avec recherche et catégories. |
| Confort | Réglages de taille du texte, vitesse, particules et son; réduction des animations et couleurs forcées. |
| Confiance | Mode invité et sauvegarde locale explicités; confirmation d'abandon au menu; écran de fin distinguant sauvegarde, erreur récupérable et rejet. |
| Décisions | Aperçu des soins au repos; détails des champions accessibles depuis la préparation. |

## Problèmes prioritaires

P1 signifie une correction prioritaire d'un parcours ou d'une information essentielle. P2 signifie une amélioration de compréhension ou de confort. La priorité ne préjuge pas de l'effort de développement.

| ID | Priorité | Problème | Niveau de preuve |
| --- | --- | --- | --- |
| UX-01 | P1 | La « confirmation » du combat ne valide pas la commande choisie | Navigateur + code |
| UX-02 | P1 | Préparation d'équipe trop longue, confirmation éloignée | Mesures + captures + tests |
| UX-03 | P1 | Connexion depuis le profil bloquée pendant une partie invitée | Navigateur avec fournisseur simulé + code |
| UI-04 | P1 | Focus invisible sur les interrupteurs des réglages | Styles calculés + code |
| UI-05 | P1 | Détails des sorts indisponibles inaccessibles au clavier | Navigateur avec état simulé + code |
| UI-06 | P2 | Textes de décision trop petits sur mobile | Styles calculés + captures |
| UI-07 | P2 | Infobulles hors écran avec texte agrandi, défilement mal prévu | Débordement reproduit; défilement examiné dans le code |
| UI-08 | P2 | Contraste insuffisant des compteurs d'inventaire sélectionnés | Couleurs calculées + code |
| UX-09 | P2 | Informations insuffisantes ou trompeuses avant recrutement | Code |
| UX-10 | P2 | Récupération de mot de passe absente | Interface + recherche du parcours |
| UX-11 | P2 | Informations secondaires avant « Jouer » au premier accès | Capture + mesure |

### UX-01 — Le combat exécute avant la confirmation annoncée

**Observation.** Le tutoriel annonce « action → cible → Exécuter le tour ». L'interface présente aussi « 3 · Confirmation ». Pourtant, choisir une action puis sa cible exécute immédiatement cette action. Le bouton « Exécuter le tour » appelle une résolution automatique du tour courant.

**Reproduction.** Combat manuel Annie/Ashe contre Warwick : cliquer « Attaque de base », puis « Cibler Warwick ». Sans cliquer sur la confirmation, le journal ajoute `Annie → Warwick: 42 dégâts`, et le champion actif passe d'Annie à Ashe. Résultat identique sur ordinateur et mobile.

**Impact.** Un joueur peut consommer son action en croyant préparer une commande. Appuyer ensuite sur la « confirmation » peut agir sur le champion suivant. L'apprentissage fourni est incompatible avec le fonctionnement réel.

**Correction.** Choisir un modèle cohérent. La préférence UX est de conserver action et cible en attente jusqu'à une validation affichant la commande complète. Si l'exécution immédiate est voulue, retirer l'étape de confirmation et expliquer précisément le rôle du bouton d'action automatique.

**Acceptation.** Le tutoriel et les commandes décrivent le même comportement. Une action ne se déclenche qu'au geste annoncé; clavier et tactile suivent le même contrat.

Sources : `src/i18n/combatContent.ts:428`, `src/pages/CombatPage.tsx:408`, `:436`, `:883`, `src/game/battle/BattleManager.ts:381`, `:439`. [Capture mobile](mobile-combat.png).

### UX-02 — La préparation exige trop de défilement

**Observation.** À 390 × 844, le parcours sans rune de test mesure **3 588 px**, et « Confirmer le choix » commence à **3 520 px**. Il faut traverser le catalogue, les accès, les actions de détail/achat et les runes pour atteindre la confirmation. Les tests avec la rune E2E mesurent **3 702 px** à 390 × 844 et **3 824 px** à 320 × 568; leur budget de 2 200 px échoue.

**Impact.** Après avoir choisi des champions situés en haut, le joueur doit parcourir plusieurs écrans pour continuer. La sélection et son action de validation sont éloignées. Les champions verrouillés et les actions d'achat allongent un parcours dont l'objectif immédiat est de démarrer une partie.

**Correction.** Ajouter un résumé persistant « 2 champions choisis » avec validation, sans recouvrir les contenus ni les zones de sécurité mobiles. Séparer visuellement l'équipe, les runes facultatives et le lancement. Afficher d'abord les champions jouables, avec un accès explicite au catalogue complet. Garder les détails dans leur dialogue existant.

**Acceptation.** La sélection et le bouton de poursuite restent accessibles à 320 et 390 px, au clavier et au tactile; aucune superposition. Le joueur peut démarrer sans traverser les offres verrouillées. Revoir ensuite le budget de hauteur pour qu'il traduise ce parcours.

Sources : `src/pages/StarterSelectPage.tsx:67`, `:351`, `:430`, `e2e/starter-select-responsive.spec.ts:105`. [Capture](mobile-starter.png).

### UX-03 — La connexion peut laisser un chargement permanent

**Observation.** Partie invitée active → menu → profil → « Se connecter pour synchroniser ». Le profil ouvre Auth sans passer par la confirmation d'abandon du menu. Lors d'un succès du fournisseur, `establishSession` refuse la transition à cause de la partie active, mais ne remet pas l'état de chargement à zéro et n'affiche pas l'erreur retournée.

**Reproduction isolée.** Le fournisseur renvoie un succès simulé. L'action retourne « Termine ou abandonne… », tandis que le store conserve `isLoading: true`, `isInitialized: false`, `authStatus: 'bootstrapping'`, `error: null`. Le formulaire disparaît et `/auth` ne montre plus que « Connexion / Chargement… ».

**Impact.** Le joueur perd l'accès au formulaire et ne reçoit pas l'explication du refus. La transition vers un compte paraît cassée.

**Correction.** Réutiliser la même politique de transition depuis tous les points d'entrée. Un refus doit rétablir un écran utilisable, montrer l'erreur et proposer de reprendre ou d'abandonner explicitement la partie.

**Acceptation.** Succès, refus et erreur rétablissent un état stable. La partie n'est jamais abandonnée implicitement. La connexion depuis le menu et le profil a le même comportement.

Sources : `src/pages/ProfilePage.tsx:130`, `src/stores/authStore.ts:187`, `:274`. [Capture du fournisseur simulé](guest-login-loading.png).

### UI-04 — Les interrupteurs n'affichent pas le focus

**Observation.** Le champ reçoit effectivement le focus. Son contour de 3 px est appliqué à un input de **1 px**, masqué par le CSS. Le rail visible utilise `--color-focus-ring`, un token absent; son style calculé reste `outline-style: none`.

**Impact.** Un utilisateur au clavier ne voit pas quel réglage il modifie.

**Correction.** Utiliser le token existant `--color-focus` sur le rail visible. Ajouter une vérification ciblée pour chaque famille de contrôle masqué. Le focus doit être perceptible sur le contrôle affiché. [Référence W3C : Focus visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html).

**Acceptation.** Tab atteint chaque interrupteur avec un indicateur visible; Espace le change; le résultat reste visible en couleurs forcées.

Sources : `src/styles/ui.css:476`, `:523`, `src/index.css:38`.

### UI-05 — Un sort indisponible ne peut pas être inspecté au clavier

**Observation.** Les sorts en recharge ou sans mana sont des boutons natifs `disabled`; leur wrapper n'est pas focalisable. L'infobulle sait gérer le focus, mais aucun élément ne peut le recevoir dans cet état.

**Reproduction isolée.** Avec mana à zéro et recharge à deux tours dans l'état d'affichage, `.focus()` n'atteint pas le bouton (`focused: false`, wrapper `tabIndex: -1`), alors que le survol ouvre bien l'infobulle.

**Impact.** Le joueur au clavier ne peut pas consulter les effets et contraintes au moment où il doit comprendre pourquoi le sort est indisponible.

**Correction.** Séparer « inspecter » et « lancer », ou maintenir un élément focalisable avec `aria-disabled` et une garde empêchant toute exécution. Prévoir aussi l'inspection tactile sans lancement accidentel.

**Acceptation.** Tous les sorts peuvent être inspectés au clavier, même indisponibles. Une inspection ne consomme jamais une action.

Sources : `src/components/CombatUI/AbilityBar.tsx:56`, `src/components/CombatUI/SpellTooltip.tsx:81`.

### UI-06 — Certaines informations utiles sont minuscules

**Observation.** Styles calculés à taille normale : noms des sorts et rôles dans l'arène à **7,68 px**, tags de champions à **8,8 px**, statistiques de préparation à **9,6 px**, santé dans l'arène à **9,28 px**. Les noms des sorts sont également tronqués sur leurs icônes.

**Impact.** La présentation paraît compacte, mais les informations nécessaires aux décisions demandent un effort de lecture. Le réglage « grand » améliore la taille sans résoudre seul la densité.

**Correction.** Viser 12–14 px pour les libellés et valeurs utiles, selon leur rôle. Retirer les métadonnées secondaires de la vue compacte et afficher le nom complet du sort sélectionné à proximité des commandes. Cette cible est une recommandation de lisibilité de cet audit, pas une taille minimale imposée par WCAG.

**Acceptation.** Les PV, coûts, recharges, rôles et actions se lisent à 390 px sans agrandissement; un nom complet reste consultable; le mode grand ne coupe aucun détail.

Sources : `src/styles/combat-ui.css:1424`, `:2169`, `src/styles/starter-select.css:1162`, `:1171`. [Combat](mobile-combat.png).

### UI-07 — Les infobulles ne résistent pas au texte agrandi

**Observation reproduite.** Sur mobile 390 px, taille « grand », le détail du sort R d'Ashe mesure **312 px** et s'étend de `x=96` à `right=408`, soit **18 px hors écran**. Le positionnement JavaScript borne une largeur de 260 px, alors que le CSS utilise `16.25rem`, agrandi avec le texte.

**Autre fragilité constatée dans le code.** Le panneau prévoit `max-height` et `overflow-y: auto`, mais aussi `pointer-events: none`, et il ferme lorsque le pointeur quitte le déclencheur. Le défilement prévu pour des descriptions trop longues n'est donc pas utilisable directement au pointeur. Ce cas vertical n'a pas été reproduit au navigateur.

**Correction.** Positionner à partir de la largeur réellement rendue. Autoriser le maintien du survol et le défilement; prévoir un panneau persistant pour le tactile ou les descriptions longues. Les contenus au survol/focus doivent pouvoir être consultés sans disparaître pendant leur lecture. [Référence W3C](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html).

**Acceptation.** À 320 et 390 px, en taille normale et grande, tous les bords restent visibles et toute la description est accessible. Vérifier aussi le paysage; Échap ferme le panneau sans lancer de sort.

Sources : `src/components/CombatUI/SpellTooltip.tsx:33`, `:84`, `src/styles/combat-ui.css:1925`, `:1930`. [Capture du débordement](mobile-tooltip-large.png).

### UI-08 — Le texte secondaire manque de contraste sur certaines surfaces

**Observation.** Le compteur du filtre d'inventaire sélectionné utilise `rgb(127, 142, 156)` sur `rgb(26, 45, 61)`, à **11,52 px**. Le contraste calculé est d'environ **4,205:1**, inférieur au seuil de 4,5:1 pour du texte courant. [Référence W3C : contraste minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

**Correction.** Éclaircir le texte secondaire sur les surfaces élevées, en contrôlant aussi les variantes actives et survolées. Éviter de modifier globalement le token sans vérifier les autres fonds.

**Acceptation.** Toutes les paires de texte informatif atteignent leur contraste requis dans les états réellement affichés. La mesure porte sur le premier compteur de l'inventaire; elle ne permet pas de conclure sur tous les écrans.

Sources : `src/styles/run-inventory.css:80`, `:88`, `:95`. Couleurs réelles dans `browser-evidence.json`.

### UX-09 — Le recrutement doit montrer ce que le joueur obtient

**Constat dans le code.** La page de recrutement affiche les valeurs de `champ.stats`, alors que le champion obtenu possède un niveau calculé et un multiplicateur d'offre pouvant varier de **0,80 à 1,20**. Le niveau et ce multiplicateur ne sont pas présentés dans l'aperçu. Dans la boutique, les recrues exposent portrait, nom, titre et prix, sans détails sur leurs sorts ou leurs statistiques.

**Impact.** Le joueur compare une puissance de base plutôt que la puissance reçue et dépense de l'or sans toutes les informations utiles.

**Correction.** Montrer niveau et statistiques projetés, ou identifier explicitement les valeurs comme « statistiques de base ». Réutiliser le détail de champion déjà accessible dans la préparation avant les achats en boutique. La préparation possède bien un bouton de détails : cette absence ne concerne pas ce parcours.

**Acceptation.** L'aperçu et le résultat du recrutement correspondent, pour les différents niveaux et multiplicateurs. Consulter les détails ne dépense pas d'or.

Sources : `src/pages/RecruitPage.tsx:226`, `src/stores/runStoreDomainSlice.ts:83`, `src/game/recruitment/RecruitmentService.ts:255`, `src/game/ChampionInstance.ts:129`, `src/pages/ShopPage.tsx:105`.

### UX-10 — Aucun chemin de récupération du compte

**Observation.** Connexion, inscription et mode invité sont présents, sans « Mot de passe oublié ». Aucun parcours de réinitialisation correspondant n'a été trouvé dans `src`.

**Impact.** Un joueur qui oublie son mot de passe ne dispose pas d'une action pour retrouver sa progression.

**Correction.** Ajouter la demande de lien, le changement de mot de passe et un retour clair vers la connexion. Traiter les liens expirés et les états de chargement/erreur.

**Acceptation.** Le parcours est découvrable depuis Auth et utilisable au clavier et sur mobile. Les réponses ne révèlent pas si une adresse possède un compte.

Source : `src/pages/AuthPage.tsx:301` et recherche ciblée des actions/routes de récupération. [Écran actuel](mobile-auth.png).

### UX-11 — L'entrée dans le jeu passe après les annonces

**Observation.** Sur un premier accès invité à 390 × 844, les nouveautés et le panneau d'économie précèdent la zone de lancement. Une fois ces contenus chargés, « Jouer » commence à **y=850**, juste sous la première vue. Le message « depuis ta dernière visite » est aussi présenté à ce nouvel invité.

**Impact.** Le premier écran traite l'actualité et les monnaies avant l'action principale. Un nouveau joueur rencontre plusieurs concepts avant de commencer.

**Correction.** Mettre Jouer/Continuer et l'aide de première partie en tête. Résumer les nouveautés dans une entrée compacte. Développer les monnaies lorsqu'elles sont utiles, et adapter le texte des nouveautés au premier accès.

**Acceptation.** L'action de lancement est visible dès la première vue à 390 × 844 et reste clairement prioritaire à 320 × 568. La reprise d'une partie est prioritaire lorsqu'une partie existe.

Sources : `src/pages/MenuPage.tsx:140`, `:141`, `:174`. [Capture](mobile-menu.png).

## Validation effectuée

| Exécution | Résultat | Interprétation |
| --- | --- | --- |
| 8 fichiers E2E existants, 25 tests | **15 réussis, 10 échoués, 0 ignoré** | 8 échecs de fixtures de champions verrouillés; 2 échecs de hauteur mobile |
| 3 fichiers copiés dans `/tmp`, paire Annie/Ashe autorisée, 8 tests | **8 réussis, 0 échoué, 0 ignoré** | Restaure la couverture de carte/combat/tutoriels sans modifier les tests du projet |
| Axe sur les routes principales dans le second groupe | **0 violation détectée** pour les tags A/AA configurés | États testés en Chromium; ne couvre pas tous les focus, survols, tailles et parcours |
| Reproductions ciblées | Confirmation immédiate, focus invisible, sort indisponible, infobulle agrandie, connexion simulée | Défauts qui complètent les contrôles automatisés |

Les huit erreurs initiales viennent de la paire Garen/Lux utilisée par d'anciens tests, alors que Lux est verrouillée pour un invité neuf dans le catalogue observé. Ces erreurs surviennent avant les assertions de carte/combat. Elles ne constituent pas huit bugs du jeu; elles laissent cependant des protections de régression inopérantes.

Le test de « zoom 200 % » utilise un viewport de 640 px : c'est une simulation de reflow, pas une manipulation du zoom réel du navigateur. Les couleurs forcées sont également émulées. Aucun résultat ci-dessus n'est une certification WCAG ni une validation de la production.

## Ordre de correction recommandé

1. **Fiabilité des décisions et transitions** : UX-01, UX-03. Corriger l'exécution du combat et la sortie du chargement d'authentification. Vérifier les deux parcours avant toute refonte visuelle.
2. **Accès aux actions essentielles** : UX-02, UI-04, UI-05, UI-07. Validation de préparation accessible, focus visible, inspection indépendante du lancement, détails intégralement consultables.
3. **Compréhension et lisibilité** : UI-06, UI-08, UX-09, UX-10, UX-11. Agrandir les informations utiles, fiabiliser les aperçus, récupérer un compte, placer le jeu avant les annonces.
4. **Réparer les fixtures existantes** : choisir des champions autorisés dans les tests et restaurer la couverture de présentation et d'équipement. Adapter les assertions à la nouvelle conception du parcours, sans simplement relever la limite de hauteur.

Après correction, organiser un test avec de nouveaux joueurs : démarrer une partie sans aide, expliquer les monnaies et la sauvegarde invitée, effectuer une attaque volontaire, comprendre un sort indisponible et comparer deux recrutements. Mesurer les erreurs et demandes d'aide plutôt que déduire la facilité du parcours des seules captures.

## État de livraison lors de l’audit initial

Rapport, captures et preuves ajoutés localement. Aucun composant applicatif, test existant ou schéma de base de données modifié. Aucun commit, push, PR ou déploiement réalisé.

## Corrections livrées

Les corrections et les captures après modification sont documentées dans le [suivi de mise en œuvre](implementation.md). Les observations ci-dessus décrivent l’état initial audité.
