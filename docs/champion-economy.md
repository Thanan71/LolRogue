# Économie des champions — P3-ECO-01

## Contrat v1

Le contrat produit est figé dans `src/product/productDecisions.ts` et détaillé
dans `product-decisions.md`. L'économie est indépendante du ruleset de combat
v21 : elle ne change ni les Candies, ni la maîtrise, ni l'or, ni les replays.

Le catalogue v1 comprend les dix champions implémentés et autorisés par v21.
Les sept non gratuits sont triés par identifiant. Pour chaque lundi UTC, un
offset égal au nombre de semaines depuis le 5 janvier 2026 modulo la taille du
pool choisit cinq champions consécutifs, avec retour au début du pool. Deux
semaines voisines ont des offres distinctes tant que le pool dépasse cinq.
Les semaines ISO, dont la semaine 53, déterminent l'identifiant de période.
La première résolution côté serveur matérialise l'offre ; une modification
du catalogue en cours de semaine ne réécrit jamais une période déjà créée.

Les accès standard suivent la priorité gratuit permanent, possédé, rotation,
verrouillé. Les acquisitions et récompenses sont des transactions serveur
idempotentes. Les compteurs de récompense viennent du replay : vagues gagnées
et index des biomes réellement terminés, plutôt que biomes simplement visités.

## Livraison et activation

La migration append-only `20261008171535_champion_economy_ledger_and_access.sql`
laisse le flag serveur OFF. Les comptes authentifiés disposent d'une wallet
initialisée à zéro ; aucun historique de Candies n'est converti. Lors de la
première activation, une transaction accorde tous les champions du catalogue
aux comptes préexistants avec la source `legacy_grant`, avant d'ouvrir les locks.
Réactiver après un arrêt conserve la date de coupure initiale : les nouveaux
comptes ne deviennent pas rétroactivement des comptes legacy.

Les preuves et leurs périmètres sont consignés dans
[la validation du 8 octobre](champion-economy-validation-2026-10-08.md).
Un parcours local connecté et une preview de production locale ne constituent
pas une migration distante ni une activation de production. La PR ne les déclenche
pas.

## Récompenses et accès

Garen, Annie et Ashe restent gratuits. Une nouvelle identité voit ces trois
champions et cinq de rotation ; les deux autres restent visibles et coûtent
400 Éclats chacun. Les achats n'altèrent ni le total de Candies, ni les niveaux,
ni les unlocks de maîtrise. Les données de maîtrise restent présentes lorsque
le champion est verrouillé, puis sont retrouvées à l'achat.

Le barème v1 vaut zéro sans vague gagnée, sinon `25 + 10 × biomes terminés`,
avec 50 supplémentaires en cas de victoire. Le serveur ajoute 50 par champion
de rotation présent dans l'équipe victorieuse finale dont le bonus de cette
période n'a pas encore été attribué. Un champion acheté pendant sa rotation
reste éligible. Une défaite n'épuise pas le bonus. Le montant de base est au plus
135 ; chaque bonus est exactement 50. L'abandon après une vague peut recevoir
la base, l'abandon initial reçoit zéro.

Le replay authority calcule les faits de récompense ; le serveur vérifie leur
cohérence et écrit wallet, ledger, maîtrise et résultat dans la même transaction.
Une finalisation répétée ne crédite jamais deux fois. Les attempts anciennes ou
créées avec le flag OFF ne gagnent pas rétroactivement d'Éclats.

Le démarrage standard relit l'accès côté serveur. Une expiration retourne
`champion_access_expired`, puis l'UI recharge le roster. Le snapshot d'accès de
l'attempt est immuable : passer lundi n'invalide pas une run déjà créée.
Le Daily conserve son offre canonique de six champions, identique entre comptes
et indépendante de la propriété ; offre et rotation sont figées au démarrage.
Le chargement de l'économie ne bloque pas ce parcours Daily.

Les invités voient les gratuits et la rotation lorsque le système est activé,
et conservent leur maîtrise locale. Ils n'ont aucune wallet ni acquisition
persistante. Inscription et connexion ne fusionnent pas leur progression locale
avec une balance serveur. Le flag OFF conserve la sélection historique et les
rerolls ; il ouvre tous les champions implémentés et suspend les nouveaux achats,
sans effacer les données déjà acquises.

## Déploiement contrôlé

1. Vérifier le projet cible, le SHA candidat et le ruleset actif. Exécuter
   `npm run check`, `npm run db:validate`, la matrice E2E et le parcours connecté
   `e2e/champion-economy-connected.spec.ts` en environnement isolé. Ce dernier
   simule le temps exclusivement sur un Supabase local et restaure cette horloge.
2. Après sauvegarde, appliquer les migrations avec la procédure normale de
   [release](release-and-support.md). Déployer `verify-run` et l'application du
   même candidat avant l'activation ; aucune ancienne fonction de vérification
   ne doit être utilisée pour une attempt économique. Vérifier migration liée,
   types, grants, RLS et advisors. Le flag reste OFF pendant ces contrôles.
3. Activer sur la cible dev/preview autorisée, créer un compte **après** activation,
   puis vérifier 3 + 5, un crédit authority, un achat unique à 400, la conservation
   de la maîtrise et une reconnexion. Vérifier aussi les accès legacy et le Daily.
4. Relancer `npm run economy:audit -- --linked`, examiner les refus et les compteurs
   agrégés. N'autoriser la production qu'après le smoke du SHA effectivement
   déployé. Toute incompatibilité catalogue/ruleset bloque l'activation côté serveur.

L'activation et le kill-switch utilisent uniquement le RPC réservé `service_role`.
Les credentials restent dans l'environnement d'administration, jamais dans une
variable `VITE_*`, un fichier versionné, le navigateur ou un rapport. Exemple dans
un terminal serveur disposant de `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` :

```js
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await admin.rpc('set_champion_economy_enabled', { p_enabled: true });
if (error) throw error;
console.log(data); // état/version/date de coupure, sans credential
```

Pour le kill-switch, appeler le même RPC avec `p_enabled: false`, puis vérifier
la sélection historique et l'audit. Ne pas supprimer de table, de ledger ou
d'unlock. Une run démarrée avant l'arrêt garde son contrat économique figé ; les
nouvelles attempts OFF n'ont pas de récompense. Le retour à ON réutilise la coupure
initiale et les données existantes.

## Audit, réconciliation et confidentialité

`npm run economy:audit` utilise la base locale ; `--linked` demande explicitement
la base liée. Le script n'exécute qu'un SELECT de l'audit agrégé. Il échoue si
wallet et somme du ledger divergent ou si un gain suspect est détecté. Aucune
correction automatique n'existe. La fonction expose gains/dépenses, soldes
médian/p95, nombre d'achats par champion, temps médian jusqu'au premier achat et
taux d'utilisation de la rotation, sans identifiant de compte dans le rapport.

Les refus SQL journalisent uniquement un code métier, sans email, UUID, commande
ni payload. Les contrôles détectent les gains d'une attempt non verified, les
versions incompatibles, une base supérieure à 135 ou un bonus différent de 50.
Cet audit ne recalcule pas intégralement la récompense de chaque replay.
Les achats concurrents et
les bonus ont leurs clés d'unicité ; la wallet est verrouillée en transaction.

En cas d'anomalie : désactiver les nouveaux achats/récompenses via le kill-switch,
conserver les preuves privées, vérifier l'attempt et le ledger, puis reproduire en
copie isolée. Un ajustement autorisé utilise `adjust_champion_shards(userId,
amount, commandId)` : UUID de commande stable pour les retries, montant signé,
refus de solde négatif et nouvelle transaction `admin_adjustment`.
Il ne réécrit jamais l'historique. Relancer l'audit ensuite. Export et suppression
de compte suivent [release-and-support.md](release-and-support.md).
