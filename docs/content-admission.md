# Admission de contenu joueur

Chaque lot de champions, compétences, runes, augments, objets ou encounters
passe `npm run content:check` et `npm run balance:check` avant intégration.

Un contenu jouable exige un handler réel et des paramètres utilisables à tous
ses rangs. Les champions générés incomplets restent consultables comme catalogue
avec disponibilité explicitement annoncée ; ils ne deviennent pas jouables par
simple ajout de texte. Les améliorations classées indisponibles restent désactivées.
Les traductions FR/EN par identifiant sont obligatoires (`npm run i18n:check`).

La gate couvre les catalogues de règles, effets/conditions, rencontres,
références de champions et les contrats de parité avec l'autorité. Elle bloque
un nouveau contenu sans support, traduction ou version de replay correspondante.
Le lot Sprint G ajoute les contrôles de publication ; il ne modifie aucune
mécanique ni courbe du moteur v21.

## Replay et Daily

La gate recompile le moteur courant en mémoire avec la configuration du bundle
de référence et compare son SHA-256 au registre. Modifier une compétence, un
catalogue ou un handler sans publier un nouveau moteur/ruleset fait échouer
`check-current-authority-source.mjs`, même si les déclarations de version sont
restées inchangées. Les migrations de gameplay et de Daily, les capabilities,
les catalogues de traduction et les baselines doivent correspondre au registre.
Les notes de publication et changements d'interface seuls ne changent pas le moteur.

## Attempts ouvertes et archives

La gate vérifie les bundles de chaque version enregistrée, leur hash, leurs
migrations et leur vérificateur. Toute version encore rejouable doit être incluse
dans le déploiement `verify-run` ; un fichier absent, un hash altéré ou une version
non déclarée bloque le contrôle. Les versions v19 et v20 restent `replay-only` et
v21 reste courante pour ce lot. Les archives antérieures restent enregistrées
avec leur politique explicite `unsupported`.

Un futur archivage exige un relevé serveur des attempts encore ouvertes et leur
TTL maximum avant changement de statut ; les fichiers sont conservés pour les
preuves historiques. Cette tâche n'archive aucune version ni attempt supplémentaire.
