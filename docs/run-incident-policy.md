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

## Compensation indépendante du résultat

Règle retenue : aucune compensation automatique. Un geste indépendant du
résultat peut être étudié manuellement pour un incident confirmé ; il n'est ni
promis au joueur ni crédité par cette procédure. Il ne remplace jamais une run
rejetée par une victoire et ne modifie ni score Daily, ni classement, ni historique
de résultats vérifiés.

Toute proposition précise l'incident, la fenêtre UTC confirmée, la population
affectée prouvée côté serveur, la nature et le montant forfaitaire du geste, ses
limites et l'approbateur produit. Elle ne dépend pas des gains déclarés par le
joueur. Sans ces éléments, la décision est « refusée » ou « en attente », jamais
« exécutée ». Le même utilisateur ne reçoit pas plusieurs gestes pour le même
incident.

Il n'existe pas de voie d'attribution exceptionnelle dédiée dans cette livraison.
Avant toute compensation effective, livrer et faire revoir un mécanisme serveur
avec contrôle opérateur, plafond, transaction et clé d'idempotence
`(incident_id, user_id, compensation_kind)`, puis le tester sur une base isolée.
Une modification manuelle de `players`, du ledger ou d'une attempt ne constitue
pas ce mécanisme. L'approbation produit du geste et la disponibilité du mécanisme
sont deux conditions séparées.

## Parcours support et audit

1. Recueillir par le canal privé l'`attemptId`, la date UTC, la version et le code
   depuis les détails copiables. Ne demander ni token, mot de passe, capture de
   stockage, journal complet ou état joueur. Vérifier l'identité du demandeur par
   le canal authentifié avant de communiquer des données de son compte.
2. Consulter le statut serveur en lecture seule avec l'accès opérateur. Distinguer
   rejet terminal, expiration, résultat déjà crédité et panne temporaire. Donner
   au joueur l'explication correspondante, sans promettre de remboursement.
3. Rattacher le dossier à une entrée du [registre](run-incidents.md), ou ouvrir une
   suspicion. Comparer version, ruleset et fenêtre UTC ; conserver explicitement
   les inconnues. Ne pas déclarer le joueur affecté sur la seule base du code.
4. Reproduire avec une attempt de test isolée. Faire confirmer l'incident et ses
   bornes par l'opérateur ; publier le correctif pour les nouvelles attempts.
5. Appliquer le parcours normal de récupération seulement si le statut serveur
   l'autorise. Pour une compensation indépendante, faire consigner l'approbation
   produit et la revue technique du mécanisme avant exécution. Sinon, clore avec
   un refus motivé ou laisser le dossier en attente de preuves.
6. Vérifier le résultat durable et l'absence de double crédit, informer le joueur
   puis clôturer. Pour une tentative interrompue, relire l'opération idempotente
   avant tout retry ; ne jamais envoyer une nouvelle attribution à l'aveugle.

Le dossier d'audit privé garde : identifiant d'incident et de dossier, opérateur,
horodatages UTC, référence du compte et de l'attempt, statut serveur constaté,
preuve minimale d'éligibilité, décision et justification, approbateur, éventuel
montant/type, clé idempotente, version du mécanisme et référence du résultat
transactionnel. Séparer `proposé`, `approuvé`, `exécuté`, `refusé` et `échec` ; une
approbation seule ne prouve jamais le crédit. Consigner aussi les refus.

Accès réservé au support et à l'opérateur habilités, sans dépôt public ni alerte
externe. Purger les références individuelles au plus tard 90 jours après clôture,
sauf conservation exceptionnelle motivée et datée dans le dossier ; garder dans
Git seulement le bilan technique anonymisé. Inclure ces dossiers dans les
procédures d'export/suppression de compte. Le canal privé et sa purge doivent être
opérationnels avant de recevoir ces dossiers ; la gate de canal support reste
bloquante dans `config/beta-release.json` tant que sa preuve manque.
