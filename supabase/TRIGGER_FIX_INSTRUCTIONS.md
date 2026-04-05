# Correction du problème d'inscription

## Problème identifié

L'inscription retourne un statut 200 OK (succès) mais aucun enregistrement n'est créé dans la table `players`. Cela signifie que le trigger `handle_new_user` qui devrait créer automatiquement un player après l'inscription ne fonctionne pas correctement.

## Solution en 2 étapes

### Étape 1 : Exécuter le script SQL de correction

1. Va sur le [dashboard Supabase](https://curffughsmpukeprryaq.supabase.co)
2. Navigue vers **SQL Editor** (dans le menu de gauche)
3. Clique sur **New query**
4. Copie-colle le contenu du fichier `supabase/fix_signup_trigger.sql`
5. Clique sur **Run** pour exécuter le script

Ce script va :
- Vérifier si le trigger existe
- Recréer la fonction `handle_new_user()` avec une meilleure gestion d'erreurs
- Gérer les conflits de username (unique_violation)
- Supprimer et recréer le trigger proprement
- Vérifier les permissions
- S'assurer que les politiques RLS sont correctes

### Étape 2 : Tester l'inscription

Après avoir exécuté le script SQL :

1. Retourne sur ton application
2. Essaie de créer un nouveau compte avec :
   - Email valide
   - Mot de passe (min 6 caractères)
   - Username
   - Display name (optionnel)
3. Vérifie que :
   - L'inscription réussit
   - Tu es redirigé vers le menu
   - Un enregistrement apparaît dans la table `players`

### Étape 3 : Vérifier dans la base de données

Pour confirmer que tout fonctionne :

1. Dans le dashboard Supabase, va dans **Table Editor**
2. Sélectionne la table `players`
3. Tu devrais voir le nouvel utilisateur avec :
   - `user_id` correspondant à l'UUID dans `auth.users`
   - `username` celui que tu as entré
   - `display_name` celui que tu as entré (ou username par défaut)

## Si le problème persiste

### Vérifier les logs Supabase

1. Va dans **Logs** (menu de gauche)
2. Filtre par `auth` ou `postgres`
3. Cherche des erreurs autour du moment de l'inscription

### Erreurs courantes

1. **"Player profile initialization failed"**
   - Le trigger ne crée toujours pas le player
   - Vérifie les logs pour voir l'erreur exacte

2. **"duplicate key value violates unique constraint"**
   - Le username existe déjà
   - La nouvelle version du trigger devrait gérer ça automatiquement

3. **"permission denied"**
   - Problème de permissions RLS
   - Le script devrait avoir corrigé ça

## Explication technique

### Ancien comportement
```typescript
// Avant : délai arbitraire de 500ms
await new Promise(resolve => setTimeout(resolve, 500));
const { data: playerData } = await playerRepository.getPlayer(result.user.id);
```

### Nouveau comportement
```typescript
// Maintenant : retries intelligents avec délai court
const maxRetries = 5;
const retryDelay = 200; // 200ms entre chaque tentative

for (let attempt = 0; attempt < maxRetries; attempt++) {
  await new Promise(resolve => setTimeout(resolve, retryDelay));
  const { data, error } = await playerRepository.getPlayer(result.user.id);
  if (data) {
    playerData = data;
    break;
  }
  // Si échec après 5 tentatives, on retourne une erreur explicite
}
```

### Améliorations du trigger SQL

1. **Gestion des conflits de username** : Si le username existe déjà, utilise un fallback basé sur l'ID
2. **Gestion d'erreurs** : Capture et loggue les erreurs au lieu de les supprimer
3. **Valeurs par défaut** : Initialise correctement tous les champs du player
4. **Permissions** : S'assure que la fonction a les bonnes permissions

## Fichiers modifiés

- `src/stores/authStore.ts` : Amélioration de la logique de retry
- `supabase/fix_signup_trigger.sql` : Nouveau script de correction du trigger

## Prochaines étapes

Après avoir corrigé ce problème, pense à :

1. **Configurer la confirmation email** (optionnel mais recommandé)
   - Dans Supabase → Authentication → Settings
   - Active "Enable email confirmations" si tu veux vérifier les emails

2. **Ajouter du monitoring**
   - Considère d'ajouter des logs dans une table dédiée pour suivre les inscriptions

3. **Tester les cas limites**
   - Inscription avec email déjà utilisé
   - Inscription avec username déjà utilisé
   - Inscription sans display_name