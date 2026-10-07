# Politique d'observabilité

L'envoi des diagnostics client est désactivé par défaut. Il nécessite
`VITE_ENABLE_DB_LOGGING=true` et une session authentifiée. Les compteurs techniques
ci-dessous restent en mémoire dans l'onglet et ne sont jamais envoyés : aucune
pipeline de métriques navigateur globale ni notification automatique n'est activée.

## SLI et seuils

`src/observability/technicalMetrics.ts` définit les seuils et évalue les diagnostics
sur 15 tranches d'une minute (minute courante et 14 précédentes). Un ratio utilise
au moins 20 observations ; en dessous, `alert=null` signifie données insuffisantes.
Un dépassement de la capacité du buffer rend aussi l'évaluation inconnue jusqu'à
l'expiration des échantillons perdus. Une erreur de réhydratation alerte dès sa
première observation, sauf si le buffer a débordé.

| SLI | Calcul | Cible et seuil d'alerte |
| --- | --- | --- |
| Start réussi | réponses RPC start valides / appels start terminés | cible >= 99 % ; alerte si erreurs >= 5 % |
| Seal réussi | réponses RPC seal valides / appels seal terminés | cible >= 99 % ; alerte si erreurs >= 5 % |
| Auth | erreurs HTTP ou réseau / requêtes Auth, par endpoint | cible >= 99 % ; alerte si erreurs >= 5 % |
| Profil | erreurs HTTP ou réseau / requêtes PostgREST `players` | cible >= 99 % ; alerte si erreurs >= 5 % |
| PostgREST | erreurs HTTP ou réseau / requêtes, par endpoint | cible >= 99 % ; alerte si erreurs >= 5 % |
| Finalisation répétée | appels `endRun` avec snapshot déjà gelé / appels de finalisation | cible < 10 % ; alerte si retries >= 10 % |
| Assets cassés | résultats placeholder ou exceptions / résolutions ImageLoader | cible < 1 % ; alerte si erreurs >= 1 % |
| Réhydratation | quarantaines, stockage trop volumineux ou temporairement illisible | cible 0 ; alerte dès une erreur |
| Verification `verified/rejected/expired` | nombre dans chaque état / starts des 30 derniers jours, par moteur/ruleset | répartition diagnostique ; les attempts encore en cours restent au dénominateur |
| Délai start → verified | p95 de `verified_at - started_at`, pour starts vérifiés des 30 derniers jours | descriptif : comprend la durée de jeu, aucun seuil universel de disponibilité |
| Seal → terminal | seals atteignant `verified` ou `rejected` sous 120 s / tous seals éligibles | SLO >= 99 % sur 30 jours ; alerte en dessous |
| Backlog serveur | attempts `finished` ou `verifying` scellées depuis plus de 5 min | cible 0 ; alerte dès une attempt |

Start/seal mesure la réussite de l'opération technique : une réponse seal terminale
valide, y compris rejetée ou expirée, est une réponse RPC réussie. Le statut de
verification est mesuré séparément côté serveur. Le retry compte chaque reprise,
pas les runs uniques ; les finalisations locales invitées sont aussi observées.
ImageLoader compte une résolution partagée une seule fois ; un cache valide ou un
fallback CDN réussi est un succès, un placeholder est un échec.

Les ratios navigateur sont regroupés par **version du client**, afin que 95 starts
réussis avec une version authority connue et 5 erreurs sans réponse donnent bien
5 % d'erreurs. Les buckets conservent séparément la **version réelle de l'attempt**
pour diagnostiquer les reprises historiques ; une version indisponible reste
`unknown`/`null`, elle n'est jamais remplacée par la version du client. Ces ratios
locaux ne prouvent pas un SLO sur l'ensemble des joueurs.

## Rapport serveur et accès opérateur

`scripts/sql/technical-slo.sql` est un rapport SELECT exécutable depuis une connexion
PostgreSQL opérateur directe. Il ne crée ni table, ni vue, ni RPC exposée, et ne
change aucun privilège. Le rapport publie seulement versions, compteurs, ratios,
latence p95 et codes techniques normalisés ; aucun identifiant joueur, attempt,
commande, payload ou journal de gameplay ne figure dans ses sorties.

```sh
psql "$SUPABASE_DB_URL" --no-psqlrc --set ON_ERROR_STOP=1 \
  --single-transaction --file scripts/sql/technical-slo.sql
```

Choisir explicitement la base et les droits de lecture opérateur nécessaires,
selon `docs/release-and-support.md`. Ne jamais placer cette connexion ou une clé
service-role dans une variable navigateur. Le rapport lit les données authority
protégées ; les rôles navigateur ne constituent pas un accès opérateur direct.

Le dénominateur Seal → terminal comprend **tous** les seals des 30 derniers jours
dont le délai de 120 s est écoulé, même encore en attente ou expirés. Une réponse
terminale tardive reste un échec du SLO. Un seal récent peut être compté même si son
start précède la fenêtre. Sans seal éligible, le ratio et l'alerte sont `NULL` ; sans
trafic, le rapport ne fabrique aucune ligne. Une cohorte serveur non vide est évaluée
sans minimum de 20 observations ; ce minimum concerne les ratios navigateur.
Le backlog encore ouvert reste visible même si son seal précède les 30 jours.

Les alertes authority existantes de `/admin` restent définies dans
`docs/operations.md` : fenêtre de 15 min par moteur/ruleset, code inconnu, 3 rejets
avec le même code, ou >= 20 % de rejets dès 5 attempts. Utiliser
`docs/incident-runbooks.md#rejets-authority-anormaux` pour l'investigation.

Pour une session de support avec le build diagnostic activé, la console de
l'onglet expose une copie des compteurs et évaluations :

```js
window.lolrogueTechnicalMetrics()
```

Cette fonction est disponible seulement avec `VITE_ENABLE_DB_LOGGING=true`. Elle
n'expose pas les stores de jeu et n'envoie pas les compteurs à la base. Sans ce flag,
les fonctions du module restent utilisables par les tests, sans export global.

## Minimisation, rétention et preuves

Les buckets navigateur contiennent uniquement minute, métrique, résultat, code
fermé, endpoint autorisé (les autres deviennent `other`), versions client/attempt
bornées et compteur. Les URL, paramètres, en-têtes, bodies, messages libres,
identifiants, seeds, équipes et commandes ne sont jamais retenus. Le wrapper fetch
préserve le Request, les options, le signal, la réponse et l'erreur d'origine ; il
ne lit ni ne clone le body et ignore le transport des logs pour éviter une boucle.

| Données | Rétention | Accès |
| --- | --- | --- |
| Compteurs et nombre d'échantillons perdus | 15 tranches minute ; purge à chaque écriture/lecture ; max. 1 024 séries ; mémoire effacée au rechargement/à la fermeture | code de l'onglet ; export console du build diagnostic |
| Rapport SLO serveur | résultat calculé sur 30 jours, aucune copie persistée par le rapport | connexion PostgreSQL opérateur autorisée |
| Données source authority | politique gameplay existante : vie du compte, suppression avec le compte | frontières authority et RLS existantes |
| Événements client nettoyés | max. 200 en mémoire, 20/type/min ; buffer d'envoi max. 100, deux retries ; logs DB purgés après 14 jours | session pour l'envoi ; administrateurs via RLS et vues Admin pour la lecture |
| Export manuel de diagnostic/SLO | au plus 14 jours, suppression manuelle par l'opérateur ; joindre seulement les agrégats utiles à un incident | espace opérateur privé, accès limité aux intervenants |

Les événements client existants acceptent `runId` et `commandId` nettoyés pour la
corrélation. Ces identifiants restent absents des nouveaux compteurs. Aucun email,
nom, token, contenu de commande ou état de run n'est accepté. La politique source
est décrite dans `docs/legal-and-privacy.md` ; une fenêtre d'analyse de 30 jours
n'est pas une purge des données de gameplay.

`tests/technicalMetrics.test.ts` vérifie burst sans échantillonnage, dénominateur
client, versions historiques, minimisation, capacité, expiration et transparence
fetch. Les tests des services/stores vérifient les compteurs réellement déclenchés.
`tests/technicalSlo.database.test.ts` exécute le rapport sur PostgreSQL en transaction
avec rollback et fixtures expirées/en attente/récentes : `npm run test:db` l'inclut
et exige `SUPABASE_DB_URL` avec `DB_TEST_REQUIRED=1`. Une URL absente ou inaccessible
fait échouer la gate DB ; aucune substitution silencieuse de base n'est utilisée.
