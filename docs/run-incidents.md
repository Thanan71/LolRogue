# Registre des incidents de run

Registre versionné des faits techniques connus, sans identité ni trace de jeu.
Les dossiers individuels et décisions de compensation restent dans le canal
support privé décrit par la [procédure](run-incident-policy.md).

## Incidents connus

| Incident | Moteur / code | Fenêtre UTC affectée | Preuve et état | Compensation |
| --- | --- | --- | --- | --- |
| `INC-RUN-V13-PENDING-CHOICE` | `run-engine-v13` / `pending_choice` ; ruleset exact à confirmer | Bornes exactes inconnues. Le réaudit du 8 août 2026 rapporte 4 rejets sur les 7 jours précédents ; ce constat ne définit pas une fenêtre d'éligibilité. | Incident historique documenté dans `TODO.md`, sections constats live et `P1-RUN-01`. Bug client corrigé selon ce réaudit ; déploiement exact et fin d'impact à reconstituer depuis les archives opérateur. | Aucune attribution enregistrée dans ce registre ; aucune population éligible validée. |

Les données de ce premier incident proviennent de l'audit historique du dépôt,
pas d'une nouvelle interrogation de production. Ne pas inventer les dates de
début/fin manquantes ni traiter tout rejet `pending_choice` comme cet incident.
L'absence d'une entrée ne prouve pas l'absence d'incident.

## Ouvrir et mettre à jour une entrée

Attribuer un identifiant stable et consigner :

- moteur et ruleset exacts, code fermé et environnements affectés ;
- début inclusif et fin exclusive au format UTC ISO 8601, ou explicitement
  « inconnu » tant que la borne n'est pas établie ;
- statut `suspecté`, `confirmé`, `corrigé` ou `clos` et date de chaque transition ;
- preuve de reproduction, commit correctif, déploiement concerné et référence
  d'un relevé opérateur privé ;
- compteurs agrégés et méthode de sélection, sans identifiants d'utilisateurs ou
  d'attempts dans ce fichier public ;
- décision produit globale sur un éventuel geste et référence privée de l'audit.

Confirmer les bornes depuis les déploiements et observations serveur. Pour une
fenêtre encore ouverte, noter `fin inconnue` et maintenir la surveillance.
L'appartenance à une version ou à un code ne suffit pas à démontrer l'impact
individuel. Ne clore qu'après le smoke test et la période sans nouvelle erreur
du runbook. Chaque changement d'état passe par une revue Git ; corriger une
observation sans effacer son contexte historique.
