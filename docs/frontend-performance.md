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

## Résultat P2-PERF-01

Le catalogue client conserve les champs réellement affichés pour les 172 champions et
les données complètes des dix champions jouables. Le catalogue complet reste la source
auditée des assets et du bundle d'autorité. Cette segmentation ramène le chunk
`champion-data` de 101,52 kB à 52,92 kB gzip.

La mesure finale locale atteint **349 961 octets gzip**, soit **12,07 % de marge** sous
le plafond inchangé de 398 000 octets. Les cinq chunks les plus lourds possèdent aussi
un plafond individuel :

| Chunk | Mesure gzip | Budget |
| --- | ---: | ---: |
| React | 72 751 octets | 76 000 octets |
| Supabase | 53 495 octets | 56 000 octets |
| champion-data | 52 915 octets | 55 000 octets |
| entrée applicative | 45 806 octets | 48 000 octets |
| runStore | 29 774 octets | 32 000 octets |

Le rapport exhaustif par chunk est généré dans
`performance-report/bundle-report.json`. Le build conserve toutes les pages en imports
dynamiques et le contrôle du manifeste interdit à `/auth` de dépendre statiquement de
Database, Admin, légal ou des catalogues champions.

La mesure Chromium sur une vraie instance `vite preview` a révélé que la région de
notifications globale déclenchait malgré tout `runStore` sur `/auth`. Elle est désormais
différée sur les routes publiques. La mesure finale de `/auth` charge dix ressources
JavaScript pour **184 308 octets transférés**, sans requête vers `champion-data`,
`DatabasePage`, `AdminPage` ou `LegalPage`. Le détail est écrit dans
`performance-report/preview-report.json` par `npm run test:performance-preview`.

## Audit Web Vitals avant P2-PERF-02

La matrice de production observe déjà LCP, CLS et les entrées `event` utilisées pour
approcher INP sur son projet `mobile-chromium-production`. Elle compare ces valeurs à
`config/performance-budgets.json`. Le job GitHub Actions `e2e` exécute
`npm run test:e2e:production` sans `continue-on-error` : ce contrôle est donc
techniquement bloquant.

Ce contrôle ne constitue toutefois pas encore une gate de laboratoire stable :

- il ne produit aucun rapport Web Vitals archivable ;
- il repose sur un seul chargement non bridé du runner ;
- il accepte `INP = 0` lorsqu'aucune entrée d'interaction n'est observée ;
- il mélange la mesure Chromium mobile au smoke test fonctionnel de six projets ;
- il ne permet pas de suivre une distribution ou une tendance entre exécutions.

P2-PERF-02 conserve la matrice pour la compatibilité navigateur, mais déplace la
décision de budget dans une preview Chromium mobile dédiée, sous réseau et CPU
contrôlés, avec plusieurs échantillons et un rapport JSON uploadé par la CI.

## Résultat P2-PERF-02

La mesure dédiée utilise un warm-up non décisionnel, puis cinq contextes Pixel 5 sans
cache partagé sous 1,6 Mbit/s descendant, 750 kbit/s montant, 150 ms de latence et un
CPU ralenti ×4. Elle mesure `/auth`, exige une interaction Event Timing réelle lors du
passage en invité et calcule le p75 des cinq échantillons.

Mesure locale du **13 août 2026** :

| Vital | p75 | Budget laboratoire |
| --- | ---: | ---: |
| LCP | 1 396 ms | 2 500 ms |
| CLS | 0 | 0,1 |
| INP | 104 ms | 300 ms |

Le rapport `performance-report/web-vitals-report.json` conserve le warm-up, chaque
échantillon, le profil, les budgets et le SHA. Le job CI `validate` exécute la gate
après le build et archive le dossier complet pendant 30 jours. Speed Insights reste
une source terrain distincte, non bloquante et soumise à la revue confidentialité.
