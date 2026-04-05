Account created but player profile could not be initialized. Please try logging in# 🚨 Correction complète du problème d'inscription

## Problème identifié

L'inscription retourne un statut 200 OK mais aucun enregistrement n'est créé dans la table `players`. De plus, une erreur **406 Not Acceptable** se produit lors de la tentative de récupération du player.

## Causes racines

1. **Le trigger `handle_new_user` ne fonctionne pas correctement** - Il ne crée pas le player après l'inscription
2. **Erreur 406 Not Acceptable** - La requête `.single()` échoue quand aucun player n'est trouvé
3. **Politiques RLS trop restrictives** - Empêchent la lecture du player même par son propriétaire

## Solution complète

### Étape 1 : Exécuter le script SQL de correction

1. Va sur le [dashboard Supabase](https://curffughsmpukeprryaq.supabase.co)
2. Navigue vers **SQL Editor**
3. Clique sur **New query**
4. Copie-colle le contenu de `supabase/fix_signup_complete.sql`
5. Clique sur **Run**

Ce script va :
- ✅ Vérifier l'état actuel des utilisateurs et players
- ✅ Recréer la fonction `handle_new_user()` avec une gestion d'erreurs robuste
- ✅ Gérer les conflits de username automatiquement
- ✅ Corriger les permissions de la fonction
- ✅ Recréer le trigger correctement
- ✅ Corriger les politiques RLS pour permettre la lecture
- ✅ Vérifier que tout est en place

### Étape 2 : Les corrections frontend sont déjà appliquées

Les fichiers suivants ont été modifiés automatiquement :

#### `src/services/repositories/SupabasePlayerRepository.ts`
- Utilisation de `.maybeSingle()` au lieu de `.single()` pour éviter l'erreur 406
- Gestion correcte de l'erreur PGRST116 (aucune ligne trouvée)

#### `src/stores/authStore.ts`
- Système de retries amélioré (10 tentatives de 300ms au lieu de 5x200ms)
- Meilleure gestion des erreurs
- Messages d'erreur plus explicites

### Étape 3 : Tester l'inscription

1. **Nettoie le cache de ton navigateur** (Ctrl+Shift+Suppr)
2. **Redémarre ton serveur de développement** si nécessaire
3. **Essaie une nouvelle inscription** avec :
   - Email valide (différent des précédents tests)
   - Mot de passe (min 6 caractères)
   - Username
   - Display name (optionnel)

4. **Vérifie le succès** :
   - Tu devrais être redirigé vers le menu
   - Aucune erreur ne devrait apparaître

### Étape 4 : Vérifier dans la base de données

1. Dans le dashboard Supabase, va dans **Table Editor**
2. Sélectionne la table `players`
3. Tu devrais voir le nouvel utilisateur avec toutes ses données

## Vérification du trigger

Pour vérifier que le trigger fonctionne correctement, exécute cette requête dans le SQL Editor :

```sql
-- Vérifier les utilisateurs récents et leurs players
SELECT 
    au.id as auth_user_id,
    au.email,
    au.created_at as auth_created,
    p.id as player_id,
    p.username,
    p.display_name,
    p.created_at as player_created,
    CASE 
        WHEN p.id IS NULL THEN '❌ MISSING PLAYER'
        WHEN p.created_at > au.created_at + INTERVAL '1 second' THEN '⚠️ DELAYED CREATION'
        ELSE '✅ OK'
    END as status
FROM auth.users au
LEFT JOIN public.players p ON p.user_id = au.id
WHERE au.created_at > NOW() - INTERVAL '24 hours'
ORDER BY au.created_at DESC;
```

## Si le problème persiste

### 1. Vérifier les logs Supabase

1. Va dans **Logs** (menu de gauche)
2. Filtre par `postgres` ou `auth`
3. Cherche des erreurs autour du moment de l'inscription
4. Recherche spécifiquement :
   - Erreurs de trigger
   - Erreurs de permissions
   - Erreurs de contrainte unique

### 2. Vérifier manuellement le trigger

Exécute cette requête pour voir si le trigger existe et est actif :

```sql
SELECT 
    tgname as trigger_name,
    tgrelid::regclass as table_name,
    tgenabled as enabled,
    prosrc as function_code
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgname = 'on_auth_user_created';
```

### 3. Tester manuellement le trigger

Tu peux tester le trigger manuellement en créant un utilisateur directement dans `auth.users` :

```sql
-- Attention : cette opération est délicate, à faire avec précaution
-- Il est préférable de tester via l'interface d'inscription normale

-- Vérifier la fonction seule
SELECT public.handle_new_user();
```

### 4. Erreurs courantes et solutions

#### Erreur : "Account created but player profile could not be initialized"
- **Cause** : Le trigger ne s'exécute pas ou échoue
- **Solution** : Réexécute le script SQL `fix_signup_complete.sql`

#### Erreur : "duplicate key value violates unique constraint"
- **Cause** : Le username existe déjà
- **Solution** : Utilise un username différent ou laisse le système générer un username automatique

#### Erreur : "permission denied"
- **Cause** : Problème de permissions RLS
- **Solution** : Le script SQL devrait avoir corrigé ça, vérifie les logs

#### Erreur 406 persistante
- **Cause** : La requête utilise `.single()` au lieu de `.maybeSingle()`
- **Solution** : Vérifie que `SupabasePlayerRepository.ts` a bien été modifié

## Explication technique des corrections

### 1. Correction du trigger SQL

```sql
-- Avant : gestion d'erreur basique
INSERT INTO public.players (user_id, username, display_name)
VALUES (NEW.id, NEW.raw_user_meta_data->>'username', ...);

-- Après : gestion robuste avec boucle et gestion des conflits
FOR i IN 1..10 LOOP
    BEGIN
        INSERT INTO public.players (...) VALUES (...);
        EXIT;
    EXCEPTION 
        WHEN unique_violation THEN
            v_safe_username := v_username || '_' || substr(NEW.id::text, 1, 4);
            -- Réessaie avec un username modifié
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Erreur: %', SQLERRM;
    END;
END LOOP;
```

### 2. Correction du repository

```typescript
// Avant : utilisait .single() qui lance une erreur si aucun résultat
const { data, error } = await this.supabase
    .from('players')
    .select('*')
    .eq('user_id', userId)
    .single(); // ❌ Erreur 406 si pas de player

// Après : utilise .maybeSingle() qui retourne null si aucun résultat
const { data, error } = await this.supabase
    .from('players')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle(); // ✅ Retourne null proprement
```

### 3. Correction de l'authStore

```typescript
// Avant : délai fixe de 500ms
await new Promise(resolve => setTimeout(resolve, 500));

// Après : retries intelligents avec feedback
for (let attempt = 0; attempt < maxRetries; attempt++) {
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    const { data, error } = await playerRepository.getPlayer(result.user.id);
    if (data) {
        playerData = data;
        break;
    }
    // Log des erreurs pour débogage
    if (error && error.message !== 'No rows found') {
        console.warn(`Attempt ${attempt + 1}/${maxRetries}: Error:`, error.message);
    }
}
```

## Fichiers modifiés

- `supabase/fix_signup_complete.sql` - Script SQL complet de correction
- `src/services/repositories/SupabasePlayerRepository.ts` - Utilisation de `.maybeSingle()`
- `src/stores/authStore.ts` - Système de retries amélioré

## Prochaines étapes

Après avoir corrigé ce problème :

1. **Configurer la confirmation email** (optionnel mais recommandé)
   - Supabase → Authentication → Settings
   - Active "Enable email confirmations"

2. **Ajouter du monitoring**
   - Considère d'ajouter une table de logs pour suivre les inscriptions

3. **Tester les cas limites**
   - Inscription avec email déjà utilisé
   - Inscription avec username déjà utilisé
   - Inscription sans display_name
   - Inscription avec des caractères spéciaux dans le username

4. **Nettoyer les utilisateurs de test**
   - Supprime les utilisateurs créés pendant les tests qui n'ont pas de player

## Support

Si tu rencontres toujours des problèmes après avoir suivi ces étapes :

1. Vérifie les logs Supabase en détail
2. Exécute les requêtes de vérification fournies
3. Partage les erreurs exactes que tu vois dans la console
4. Vérifie que toutes les étapes ont été suivies dans l'ordre