# FR/EN — Sprint G

Le parcours automatique FR → EN couvre maintenant deux tailles d'écran : desktop
(1280 × 800) et mobile (390 × 844), avec reduced motion. Il vérifie le texte visible,
les attributs accessibles, les titres et les pseudo-éléments sur Auth, Menu,
sélection, carte, combat, inventaire, encounter et résultat.

Commandes reproductibles : `npm run i18n:check` et
`npx playwright test e2e/i18n-english-journey.spec.ts --project=chromium --workers=1`.
Les contrats découvrent les modules i18n et les sources utilisateur afin qu'un
nouveau catalogue ou une nouvelle page ne puisse contourner les contrôles.

Ces contrôles passent localement le 7 octobre 2026. Ils ne remplacent pas l'audit
humain exigé par P0-I18N-01 : sur la preview du SHA candidat, parcourir FR et EN
sur desktop et mobile avec un lecteur d'écran, vérifier noms accessibles,
annonces, focus et textes dynamiques, puis consigner appareil, lecteur d'écran,
SHA, date et anomalies. Le P0 reste ouvert jusqu'à cette preuve humaine.
