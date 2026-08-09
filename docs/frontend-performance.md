# Performance frontend

Dernière mesure : **9 août 2026**, Node 24, build Vite de production local.

## Référence avant P2-PERF-01

Le plafond global reste celui choisi pour le projet : **398 000 octets gzip**. La
mesure initiale atteint **398 321 octets**, soit un dépassement de 321 octets et
aucune marge exploitable. La cible de travail est fixée à au moins 10 % sous ce
plafond, donc **358 200 octets gzip maximum**, sans modification de l'interface.

| Périmètre | Gzip | Part du total |
| --- | ---: | ---: |
| données champions complètes | 101,52 kB | 25,5 % |
| React 19, React DOM, Router et Zustand | 73,59 kB | 18,5 % |
| client Supabase | 53,90 kB | 13,5 % |
| entrée applicative | 45,99 kB | 11,5 % |
| page Admin | 8,23 kB | 2,1 % |
| page légale | 2,59 kB | 0,7 % |

La route initiale mesure 172 445 octets gzip et `/auth` 176 826 octets. React et
Supabase sont donc des coûts initiaux structurants. Admin et légal sont déjà des
chunks de route séparés et ne justifient pas de retirer des fonctions ou du contenu.

## Diagnostic

Toutes les pages sont déjà chargées avec `React.lazy`. Le principal gisement ne se
trouve donc pas dans un nouveau découpage visuel des routes, mais dans le catalogue
`champions-parsed.json` de 945 048 octets bruts : il contient les descriptions,
tableaux de cooldown/coût/portée et effets de tous les champions, alors que le combat
n'en supporte actuellement que dix.

La segmentation retenue doit préserver :

- les noms, titres, rôles, ressources, statistiques et icônes de tous les champions ;
- les noms et le statut de disponibilité des sorts affichés dans Database ;
- les données complètes des dix champions jouables ;
- le catalogue complet comme source auditée pour les assets et contrats serveur.

Elle peut sortir du JavaScript client les tableaux et descriptions qui ne sont jamais
affichés pour un sort indisponible, sans modifier le rendu ni les règles de combat.
