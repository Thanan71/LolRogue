# Inventaire CSP des styles inline

Relevé du 12 août 2026, reproductible avec :

```sh
rg -n "style=\\{" src --glob '*.tsx'
```

La baseline contient 45 attributs React `style` dans 12 fichiers, ainsi que sept
écritures directes via l'API `HTMLElement.style` et un nettoyage `removeProperty`.

| Catégorie | Occurrences | Décision |
| --- | ---: | --- |
| `EnhancementTree` statique ou mixte | 30 | Migrer vers les classes déjà amorcées dans `database.css` ; représenter états et thèmes par classes. |
| Styles statiques hors arbre | 6 | Migrer notification, canvas, curseur de carte et couleurs de logs vers des classes. |
| Custom properties dynamiques déjà contrôlées | 7 | Conserver : dimensions du combat, jauges PV/PM, tooltip, taille des libellés et barres Event/Rest. |
| Largeurs dynamiques directes PV/XP | 2 | Remplacer `width` par une custom property numérique bornée entre 0 et 100 %. |
| Écritures `HTMLElement.style` | 7 | Remplacer les fallbacks image par `hidden`, le verrou de scroll par une classe et la taille de texte par un attribut d'état discret. |

Les six styles statiques hors arbre sont répartis entre `AdminPage` (1),
`NotificationRegion` (1), `ParticleBackground` (1) et `RunMapCanvas` (3). Les neuf
valeurs réellement dynamiques correspondent aux barres de progression et au
positionnement ou dimensionnement calculé ; elles ne peuvent pas devenir un jeu fini
de classes sans perdre de précision.

Les écritures DOM sont inventoriées avec :

```sh
rg -n "\\.style\\.|setAttribute\\(['\"]style|cssText" src --glob '*.{ts,tsx,js,jsx}'
```

## Cible de durcissement

- aucun attribut `style` ne doit contenir une propriété CSS standard ;
- les attributs restants ne peuvent définir que des custom properties préfixées par
  le composant qui les consomme ;
- les pourcentages, pixels et tailles de texte sont bornés avant interpolation ;
- `style-src-elem 'self'` protège les feuilles et balises de style séparément ;
- `style-src-attr 'unsafe-inline'` reste temporairement limité aux custom properties
  dynamiques, sous surveillance d'une politique Report-Only plus stricte.

Le retrait total de `style-src-attr 'unsafe-inline'` exige ensuite une stratégie de
nonce/hash ou un mécanisme CSP-compatible pour les valeurs continues. Cette étape ne
doit pas sacrifier les barres PV/XP ni les positions de tooltip et de carte.
