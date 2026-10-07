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
