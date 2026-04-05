-- Solution pour inscription AVEC confirmation email activée
-- Ce script configure le système pour qu'il fonctionne même avec email confirmation

-- ─── 1. Vérifier la configuration actuelle ──────────────────────────────────────

-- Voir si des utilisateurs non confirmés existent
SELECT 
    id,
    email,
    email_confirmed_at,
    created_at,
    CASE 
        WHEN email_confirmed_at IS NULL THEN '⏳ PENDING CONFIRMATION'
        ELSE '✅ CONFIRMED'
    END as confirmation_status
FROM auth.users 
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- ─── 2. Recréer la fonction handle_new_user pour gérer les deux cas ─────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_username TEXT;
    v_display_name TEXT;
    v_safe_username TEXT;
    v_user_metadata JSONB;
BEGIN
    -- Récupérer les métadonnées utilisateur
    v_user_metadata := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
    
    -- Extraire le username et display_name
    v_username := COALESCE(
        NULLIF(v_user_metadata->>'username', ''),
        'Player_' || substr(NEW.id::text, 1, 8)
    );
    
    v_display_name := COALESCE(
        NULLIF(v_user_metadata->>'display_name', ''),
        v_username
    );
    
    -- Nettoyer le username (enlever les caractères spéciaux)
    v_username := regexp_replace(v_username, '[^a-zA-Z0-9_]', '', 'g');
    
    -- S'assurer que le username est unique
    v_safe_username := v_username;
    
    -- Vérifier si le username existe déjà et ajuster
    FOR i IN 1..10 LOOP
        BEGIN
            INSERT INTO public.players (
                user_id,
                username,
                display_name,
                level,
                total_candies,
                total_runs_completed,
                total_wins,
                total_waves_completed,
                is_admin,
                created_at,
                updated_at,
                last_login_at
            ) VALUES (
                NEW.id,
                v_safe_username,
                v_display_name,
                1,
                0,
                0,
                0,
                0,
                FALSE,
                NOW(),
                NOW(),
                NOW()
            );
            EXIT;
        EXCEPTION 
            WHEN unique_violation THEN
                v_safe_username := v_username || '_' || substr(NEW.id::text, 1, 4);
                IF i = 10 THEN
                    v_safe_username := 'Player_' || replace(NEW.id::text, '-', '');
                    INSERT INTO public.players (
                        user_id, username, display_name, level, total_candies,
                        total_runs_completed, total_wins, total_waves_completed,
                        is_admin, created_at, updated_at, last_login_at
                    ) VALUES (
                        NEW.id, v_safe_username, v_display_name, 1, 0, 0, 0, 0,
                        FALSE, NOW(), NOW(), NOW()
                    );
                END IF;
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Erreur lors de la création du player pour user_id %: %', NEW.id, SQLERRM;
        END;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 3. S'assurer que le trigger est à jour ─────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ─── 4. Créer une fonction pour créer manuellement un player ────────────────────
-- Utile si un utilisateur a confirmé son email mais que le player n'a pas été créé

CREATE OR REPLACE FUNCTION public.create_missing_player(
    p_user_id UUID,
    p_username TEXT DEFAULT NULL,
    p_display_name TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_username TEXT;
    v_display_name TEXT;
    v_user_record RECORD;
BEGIN
    -- Vérifier si le player existe déjà
    IF EXISTS (SELECT 1 FROM public.players WHERE user_id = p_user_id) THEN
        RETURN TRUE; -- Déjà créé
    END IF;
    
    -- Récupérer les informations de l'utilisateur
    SELECT 
        au.email,
        au.raw_user_meta_data
    INTO v_user_record
    FROM auth.users au
    WHERE au.id = p_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Utilisateur non trouvé';
    END IF;
    
    -- Déterminer le username
    IF p_username IS NOT NULL THEN
        v_username := p_username;
    ELSIF v_user_record.raw_user_meta_data IS NOT NULL THEN
        v_username := COALESCE(
            v_user_record.raw_user_meta_data->>'username',
            'Player_' || substr(p_user_id::text, 1, 8)
        );
    ELSE
        v_username := 'Player_' || substr(p_user_id::text, 1, 8);
    END IF;
    
    -- Déterminer le display_name
    IF p_display_name IS NOT NULL THEN
        v_display_name := p_display_name;
    ELSIF v_user_record.raw_user_meta_data IS NOT NULL THEN
        v_display_name := COALESCE(
            v_user_record.raw_user_meta_data->>'display_name',
            v_username
        );
    ELSE
        v_display_name := v_username;
    END IF;
    
    -- Nettoyer le username
    v_username := regexp_replace(v_username, '[^a-zA-Z0-9_]', '', 'g');
    
    -- Créer le player
    INSERT INTO public.players (
        user_id,
        username,
        display_name,
        level,
        total_candies,
        total_runs_completed,
        total_wins,
        total_waves_completed,
        is_admin,
        created_at,
        updated_at,
        last_login_at
    ) VALUES (
        p_user_id,
        v_username,
        v_display_name,
        1,
        0,
        0,
        0,
        0,
        FALSE,
        NOW(),
        NOW(),
        NOW()
    );
    
    RETURN TRUE;
EXCEPTION
    WHEN unique_violation THEN
        -- Si le username existe, on utilise un username basé sur l'ID
        v_username := 'Player_' || replace(p_user_id::text, '-', '');
        
        INSERT INTO public.players (
            user_id, username, display_name, level, total_candies,
            total_runs_completed, total_wins, total_waves_completed,
            is_admin, created_at, updated_at, last_login_at
        ) VALUES (
            p_user_id, v_username, v_display_name, 1, 0, 0, 0, 0,
            FALSE, NOW(), NOW(), NOW()
        );
        
        RETURN TRUE;
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 5. Accorder les permissions pour la fonction manuelle ──────────────────────

GRANT EXECUTE ON FUNCTION public.create_missing_player(UUID, TEXT, TEXT) TO authenticated;

-- ─── 6. Corriger les politiques RLS ─────────────────────────────────────────────

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own player data" ON public.players;
DROP POLICY IF EXISTS "Users can update their own player data" ON public.players;
DROP POLICY IF EXISTS "Enable insert for new users" ON public.players;

-- Politique de sélection
CREATE POLICY "Users can view their own player data"
    ON public.players FOR SELECT
    USING (auth.uid() = user_id);

-- Politique de mise à jour
CREATE POLICY "Users can update their own player data"
    ON public.players FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Politique d'insertion (pour le trigger)
CREATE POLICY "Enable insert for new users"
    ON public.players FOR INSERT
    WITH CHECK (true);

-- ─── 7. Vérification ────────────────────────────────────────────────────────────

SELECT '✅ Configuration mise à jour pour email confirmation' as result;