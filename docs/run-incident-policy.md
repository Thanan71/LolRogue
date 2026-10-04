# Attempts affectées par un incident client

Décision produit du 4 octobre 2026 (`P1-RUN-03`). Cette procédure complète les
[runbooks](incident-runbooks.md#rejets-authority-anormaux) ; elle ne confère aucun
droit d'écriture supplémentaire aux clients ou au support.

## Résultats et récompenses

Aucune récompense rétroactive n'est attribuée sans preuve serveur suffisante.
Un screenshot, un état local, une déclaration du joueur ou une simulation après
correction ne prouvent pas le résultat de l'attempt d'origine.

| État serveur | Traitement support |
| --- | --- |
| `verified`, réponse perdue côté client | Relire le résultat canonique de la même attempt par le parcours de récupération existant. Aucun second crédit. |
| `started` / `finished`, erreur temporaire | Conserver l'identifiant et les commandes ; réessayer le parcours normal avec les mêmes identifiants. Ne pas reconstruire le journal. |
| `rejected` / `expired` | Expliquer le caractère terminal et l'absence de récompenses. Un retry ne modifie pas ce résultat. Ouvrir un dossier d'incident si le bug est confirmé. |
| Données absentes ou versions non supportées | Conserver le dossier comme non démontré. Ne pas déduire victoire, score, maîtrise ou candies du client. |

La preuve suffisante est le résultat canonique déjà validé et persisté par le
serveur. Pour une attempt encore admissible, seul le vérificateur normal de sa
version immuable et la transaction `complete_run_verification` peuvent produire
ce résultat. Un correctif d'un nouveau moteur n'autorise pas à rejouer une
ancienne attempt sous des règles différentes. Si une récupération exceptionnelle
est nécessaire, elle exige un mécanisme serveur distinct, revu et testé avant
toute utilisation ; cette politique n'en active aucun.

## Intégrité de la trace

Ne jamais réparer une trace rejetée en insérant un résultat supposé, en ajoutant
un choix manquant, en modifiant une commande, le hash, le seed, le ruleset ou le
statut terminal. Ne pas créer une ligne `runs` ni appeler une fonction privilégiée
avec un payload reconstruit depuis le navigateur. Le correctif s'applique aux
nouvelles attempts et conserve les anciens résultats pour l'audit.

Preuves exécutables des invariants existants :

```sh
npm run test -- tests/runSaveRecovery.test.ts tests/runAttemptService.test.ts
npm run db:validate
```

La seconde commande valide les migrations et les tests réels, notamment
`verifiedRunAttempts.database.test.ts` et `mapEconomyProgression.database.test.ts`.
Elle s'exécute uniquement sur la base locale jetable. Une validation locale ne
prouve pas que la production utilise déjà le même code.
