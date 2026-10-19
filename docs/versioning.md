# Versions du jeu et des règles

Les nouvelles versions publiques utilisent `major.minor.patch`. La date de
publication reste un champ séparé : elle ne remplace ni le numéro de version ni
l'ordre des notes de mise à jour.

Avant la version 1.0, une nouvelle fonctionnalité incrémente `minor` et remet
`patch` à zéro, par exemple `0.1.0` → `0.2.0`. Une correction incrémente `patch`,
par exemple `0.2.0` → `0.2.1`. Le passage à `1.0.0` constitue une décision de
stabilisation du contrat public ; après ce passage, une incompatibilité de ce
contrat incrémente `major`. Un numéro publié n'est jamais réutilisé pour un autre
contenu.

## Publication 0.2.0

| Élément | Identifiant public |
| --- | --- |
| Jeu et package | `0.2.0` |
| Note de mise à jour | `0.2.0`, date distincte `2026-10-11` |
| Moteur autoritaire | `run-engine-0.2.0` |
| Code des règles de gameplay | `0.2.0` |
| Défi quotidien | `daily-0.2.0` |

La version 0.2.0 ajoute les points du passif de Veigar sur les assistances
attribuées. Le numéro affiché dans le menu provient de la version du build.
Les notes utilisent un identifiant de publication sémantique et une date lisible.
Leur séquence numérique détermine l'ordre et l'état lu/non lu, même lorsque les
anciennes notes portent un identifiant daté tel que `2026.10.10`.

## Compatibilité et clés techniques

La maintenance de l'outillage ARCH-S1 publie le jeu et sa note en `0.2.1`.
Elle conserve `run-engine-0.2.0`, le code gameplay `0.2.0` et leurs hashes :
le comportement des runs ne change pas. Les versions du jeu et du contrat
autoritaire évoluent donc indépendamment lorsqu'une publication ne modifie
pas les règles déterministes.

Les anciennes versions `run-engine-v22`, les codes historiques et les anciens
identifiants de notes restent inchangés. Leurs bundles, hashes et artefacts de
balance demeurent figés. Les nouvelles versions ne réécrivent pas l'histoire
d'une partie déjà commencée : sa reprise et son replay utilisent le moteur et
les règles enregistrés lors de son démarrage.

Les colonnes SQL numériques restent des clés techniques de compatibilité.
L'ordinal gameplay 23 identifie la publication `0.2.0` ; il ne s'affiche pas comme
une version 23 du jeu. Le registre relie explicitement ce nombre au moteur,
au code des règles et à leurs capacités. Les versions de schéma des commandes,
du ledger ou des données persistées gardent aussi leurs propres nombres.

Les noms de migrations Supabase conservent leur préfixe horodaté, conformément à
l'ordre de migration du CLI. Ces timestamps servent à appliquer les migrations,
et ne constituent pas des numéros de version du jeu.

Une correction qui change le comportement d'un replay exige un nouveau contrat
autoritaire avec son propre identifiant, hash et ordinal. Modifier uniquement la
présentation ne justifie pas de réécrire un moteur publié. Edge et client doivent
connaître le nouveau contrat avant son activation SQL ; une modification locale
du code n'applique ni migration ni déploiement distant.
