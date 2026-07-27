# Livraison et mise à jour des assets Riot

Le build ne télécharge aucun asset. Le dépôt contient un paquet minimal et
reproductible sous :

```text
public/assets/riot/16.6.1/
├── champions/  172 portraits du catalogue serveur
└── items/      15 icônes du catalogue d'objets
```

Les données d'abilities importées par TypeScript sont dans
`src/data/generated/champions-parsed.json`. Les données brutes téléchargées sous
`public/lol/data/` ne sont qu'un cache de génération ignoré par Git et ne doivent
jamais être nécessaires au build.

## Source de vérité et intégrité

Les versions sont épinglées dans `scripts/ddragon-version.json` :

- Data Dragon : `16.6.1` ;
- Community Dragon : `16.6`.

L'allowlist se trouve dans `scripts/riot-asset-catalog.mjs`. Le manifest
`src/data/generated/riot-assets-manifest.json` enregistre :

- les versions et la locale ;
- les 172 champions livrés, les 10 actuellement jouables et les 15 objets ;
- l'URL source, la taille et le SHA-256 de chaque PNG ;
- le SHA-256 du catalogue de champions importé par l'application.

`npm run assets:verify` contrôle le manifest avant chaque build.
`npm run assets:verify:dist` contrôle les mêmes fichiers après copie dans `dist`.
Une absence, un octet modifié, un fichier non PNG ou une divergence de version
fait échouer le build.

Tous les chemins applicatifs commencent par `/assets/riot/...` : ils restent donc
corrects depuis `/run`, `/database` ou toute autre route SPA profonde. Les splash
arts optionnels viennent du CDN Data Dragon et retombent sur le portrait local
épinglé ; le chargeur générique dispose ensuite d'un placeholder SVG local.

## Procédure de mise à jour

1. Modifier les versions dans `scripts/ddragon-version.json`.
2. Adapter l'allowlist dans `scripts/riot-asset-catalog.mjs` si le contenu jouable
   change.
3. Exécuter `npm run assets:update`.
4. Examiner le diff du manifest, du catalogue généré et des PNG.
5. Exécuter `npm run check` et l'E2E avant publication.

`assets:update` télécharge les données brutes épinglées, régénère les champions,
extrait uniquement les 187 assets nécessaires et recalcule leurs empreintes. Les
688 icônes du catalogue Data Dragon des objets ne sont notamment pas embarquées.
Il ne faut jamais utiliser un endpoint `latest`.

## Test de clone propre et CSP

`npm run test:assets-clean` recrée un projet temporaire à partir des seuls fichiers
Git non ignorés, exclut explicitement `public/lol/data/`, lance le build complet et
vérifie les URLs critiques dans `dist`. Il est inclus dans `npm run check`.

La CSP autorise les images locales, `data:`, `blob:` et le seul fallback
`https://ddragon.leagueoflegends.com`. Les données Community Dragon servent
uniquement aux scripts hors navigateur. Aucune police distante n'est chargée ;
`font-src 'self' data:` suffit.

Les assets League of Legends appartiennent à Riot Games. Leur présence ne signifie
pas que Riot Games sponsorise ou approuve LolRogue.
