# Mise à jour des assets Riot

Les téléchargements ne font pas partie du build normal. L’application utilise les fichiers déjà présents sous `public/lol/data`.

Les versions reproductibles sont déclarées dans `scripts/ddragon-version.json` :

- Data Dragon : `16.6.1`
- Community Dragon : `16.6`

## Procédure de mise à jour

1. Modifier les deux versions dans `scripts/ddragon-version.json`.
2. Vérifier que les endpoints Riot correspondant à ces versions existent.
3. Exécuter `npm run assets:update`.
4. Vérifier `public/lol/data/metadata.json` et lancer `npm run check`.
5. Tester au minimum la sélection des champions, les sorts et les objets avant de publier.

`npm run ddragon:download` télécharge les données et images de la version épinglée. `npm run ddragon:parse` régénère ensuite `champions-parsed.json` avec la version Community Dragon correspondante.

Il ne faut pas remplacer les versions par `latest` : cela rendrait deux installations du même commit potentiellement différentes.
