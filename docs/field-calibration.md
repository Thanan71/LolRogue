# Calibration simulation, playtests et terrain

Version du protocole : 25 août 2026. Ce protocole ne constitue pas une preuve de
playtest humain. À cette date, la collecte humaine reste à organiser et bloque la
fermeture de `P2-BAL-01`.

## État des preuves

| Source | État | Usage autorisé |
| --- | --- | --- |
| Cohortes authority | disponible | hypothèse reproductible, stratifiée par politique |
| Runs vérifiées du service | disponible après seuil | signal terrain agrégé, jamais causal à lui seul |
| Playtests humains | **bloqué / non réalisé** | requis avant de fixer les bandes Easy/Normal/Hard |
| Télémétrie comportementale optionnelle | **désactivée** | aucune collecte avant opt-in livré et audité |

La baseline `authority-field-calibration-baseline-v1.json` rejoue 30 seeds appariées
pour chaque difficulté et pour `safety-first@1` et `economy-first@1`. Elle reste liée
au moteur, au hash de contenu, au modèle et au manifeste de politique v17 ; elle ne
crée pas un nouveau ruleset gameplay.

## Signal terrain minimisé

Une run peut entrer dans le signal terrain uniquement si son attempt porte le statut
`verified`, référence la run persistée par le vérificateur et partage son ruleset.
Les agrégats sont séparés par :

- date UTC, ruleset gameplay, version moteur et hash de contenu ;
- difficulté et mode ;
- taille initiale, hash SHA-256 de la composition initiale triée et niveau de
  maîtrise maximal de cette composition.

Une cellule n'est visible qu'à partir de 30 runs. Elle publie la taille
d'échantillon, le taux de victoire et son intervalle Wilson à 95 %, progression,
économie et distribution du biome de mort. Les signaux champion et augment restent
conditionnels à leurs dimensions et indiquent séparément dénominateur, participation
et intervalle. Deux rulesets ne sont jamais moyennés ensemble.

Les vues ne publient ni identifiant utilisateur/joueur/run/attempt, ni seed, dates
précises, journal, commandes, payload, texte libre ou snapshot brut. Elles sont
`security_invoker`, réservées aux administrateurs authentifiés et ne matérialisent
aucune copie supplémentaire.

## Collecte optionnelle : inactive par défaut

Les runs vérifiées, leur résultat et leur ledger sont nécessaires à la vérification
et à la progression existantes. Leur agrégation ne permet pas d'ajouter silencieusement
des événements comportementaux.

Les mesures non nécessaires — offre vue/refusée ou raison structurée d'abandon —
restent interdites tant que les quatre conditions suivantes ne sont pas toutes
livrées et testées :

1. opt-in distinct, préalable, libre et désactivé par défaut ;
2. écran indiquant finalité, liste exacte des événements et durée ;
3. refus et retrait aussi accessibles que l'acceptation, sans dégrader le jeu ;
4. purge automatique au plus tard 30 jours après collecte ou immédiatement après
   retrait lorsque la suppression reste techniquement rattachable.

Même après activation, seuls des codes fermés sont admis. Sont interdits : texte
libre, e-mail, identifiants publics, user/player/run/attempt ID, seed, adresse IP,
journal ou séquence de commandes. Tant qu'une migration, une UI et leurs tests ne
respectent pas ce contrat, aucune table d'événements de calibration ne doit exister.

## Protocole de playtest humain à exécuter

Le responsable de test prépare à l'avance une matrice difficulté × taille d'équipe
× expérience déclarée (`nouveau`, `familier`, `expert`). Chaque cellule publiée vise
au moins 30 runs terminées ou abandonnées ; en dessous, le résultat porte la mention
`exploratoire` et ne fixe aucune bande de victoire.

Pour chaque session consentie, le relevé minimal contient uniquement : identifiant
aléatoire de session non réutilisé, cellule, ruleset/hash, résultat, biome de mort,
vagues, économie finale, composition et augments. Aucun compte de jeu, contact,
seed ni journal de commandes n'entre dans le fichier d'analyse. Les raisons
d'abandon utilisent une liste fermée et facultative.

Le compte rendu doit fournir nombre d'invitations, refus, retraits, runs valides,
Wilson 95 % et limites connues. La feuille brute est supprimée au plus tard 30 jours
après validation du compte rendu agrégé. La preuve agrégée versionnée conserve la
taille d'échantillon, l'intervalle et la date, pas les sessions individuelles.

## Décision de tuning

Une décision volontaire de dérive référence obligatoirement :

- la clé exacte d'une baseline authority et sa politique ;
- une cellule terrain ou playtest compatible, avec `n` et intervalle affichés ;
- les dimensions identiques et les écarts victoire, biome de mort et économie ;
- l'hypothèse, le risque compositionnel, le ruleset cible et la décision de rollback.

Un écart sans signal compatible, une cellule sous 30 ou une comparaison entre
rulesets reste informatif. Il ne justifie pas un tuning ni la fermeture du sprint.
