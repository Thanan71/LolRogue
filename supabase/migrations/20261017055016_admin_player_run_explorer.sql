-- ADM-S2: bounded, read-only administrative projections. No authority table grants change.
BEGIN;

CREATE FUNCTION private.admin_explorer_filters(p_filters JSONB, p_population TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v JSONB := COALESCE(p_filters, '{}'::JSONB);
  k TEXT;
  allowed TEXT[];
  n NUMERIC;
BEGIN
  IF jsonb_typeof(v) <> 'object' OR octet_length(v::TEXT) > 4096 THEN
    RAISE EXCEPTION 'admin_invalid_filters' USING ERRCODE = '22023';
  END IF;
  allowed := CASE p_population
    WHEN 'players' THEN ARRAY['search','registeredFrom','registeredTo','activeFrom','activeTo','verifiedRuns','accountState']
    WHEN 'runs' THEN ARRAY['playerId','from','to','difficulty','mode','result','verification','biome','minWaves','maxWaves','championId','engineVersion','gameplayVersion','progressionVersion','ledgerVersion','sortBy','sortOrder']
    WHEN 'attempts' THEN ARRAY['playerId','from','to','status','difficulty','mode','championId','engineVersion','gameplayVersion','progressionVersion']
    ELSE NULL END;
  IF allowed IS NULL OR EXISTS (SELECT 1 FROM jsonb_object_keys(v) AS fields(key) WHERE NOT key = ANY(allowed)) THEN
    RAISE EXCEPTION 'admin_invalid_filters' USING ERRCODE = '22023';
  END IF;
  v := jsonb_strip_nulls(v);
  FOR k IN SELECT jsonb_object_keys(v) LOOP
    IF k = ANY(ARRAY['minWaves','maxWaves','gameplayVersion','progressionVersion','ledgerVersion']) THEN
      IF jsonb_typeof(v->k) <> 'number' THEN RAISE EXCEPTION 'admin_invalid_filter_number' USING ERRCODE = '22023'; END IF;
      n := (v->>k)::NUMERIC;
      IF n <> trunc(n) OR n > 2147483647 OR n < (CASE WHEN k IN ('minWaves','maxWaves') THEN 0 ELSE 1 END) THEN
        RAISE EXCEPTION 'admin_invalid_filter_number' USING ERRCODE = '22023';
      END IF;
    ELSE
      IF jsonb_typeof(v->k) <> 'string' OR length(v->>k) > (CASE WHEN k='search' THEN 100 ELSE 128 END) THEN
        RAISE EXCEPTION 'admin_invalid_filter_text' USING ERRCODE = '22023';
      END IF;
      IF k = ANY(ARRAY['from','to','registeredFrom','registeredTo','activeFrom','activeTo']) THEN
        IF v->>k !~ '^\d{4}-\d{2}-\d{2}T' OR NOT isfinite((v->>k)::TIMESTAMPTZ) THEN
          RAISE EXCEPTION 'admin_invalid_filter_date' USING ERRCODE = '22023';
        END IF;
      ELSIF k = 'playerId' THEN PERFORM (v->>k)::UUID;
      ELSIF k='verifiedRuns' AND v->>k NOT IN ('all','none','some')
         OR k='accountState' AND v->>k NOT IN ('all','registered','guest')
         OR k='difficulty' AND v->>k NOT IN ('all','easy','normal','hard')
         OR k='mode' AND v->>k NOT IN ('all','normal','daily')
         OR k='result' AND v->>k NOT IN ('all','won','lost')
         OR k='verification' AND v->>k NOT IN ('all','verified','legacy')
         OR k='status' AND v->>k NOT IN ('all','started','finished','verified','rejected','expired')
         OR k='biome' AND v->>k NOT IN ('all','top_lane','jungle','mid_lane','bot_lane','river','base')
         OR k='sortBy' AND v->>k NOT IN ('completed_at','waves_completed','run_level')
         OR k='sortOrder' AND v->>k NOT IN ('asc','desc') THEN
        RAISE EXCEPTION 'admin_invalid_filter_enum' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  IF v ? 'minWaves' AND v ? 'maxWaves' AND (v->>'minWaves')::INTEGER > (v->>'maxWaves')::INTEGER THEN
    RAISE EXCEPTION 'admin_invalid_filter_range' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['','registered','active'] LOOP
    IF v ? (k||CASE WHEN k='' THEN 'from' ELSE 'From' END) AND v ? (k||CASE WHEN k='' THEN 'to' ELSE 'To' END)
      AND (v->>(k||CASE WHEN k='' THEN 'from' ELSE 'From' END))::TIMESTAMPTZ >= (v->>(k||CASE WHEN k='' THEN 'to' ELSE 'To' END))::TIMESTAMPTZ THEN
      RAISE EXCEPTION 'admin_invalid_filter_range' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN v;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'admin_invalid_filters' USING ERRCODE = '22023';
END $$;

CREATE FUNCTION private.admin_run_item(r public.runs, p public.players, a public.run_attempts)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT jsonb_build_object(
  'id',r.id,'runUuid',r.run_uuid,'seed',r.seed::TEXT,'playerId',r.player_id,'username',p.username,'displayName',p.display_name,
  'won',r.won,'runLevel',r.run_level,'wavesCompleted',r.waves_completed,'biomesVisited',r.biomes_visited,
  'goldEarned',r.gold_earned,'totalKills',r.total_kills,'totalDamageDealt',r.total_damage_dealt::TEXT,'candiesEarned',r.candies_earned,
  'totalGoldSpent',r.total_gold_spent,'totalHealingDone',r.total_healing_done::TEXT,'totalHealingReceived',r.total_healing_received::TEXT,
  'totalDamageReceived',r.total_damage_received::TEXT,'nodesCompleted',r.nodes_completed,'combatsWon',r.combats_won,
  'combatsLost',r.combats_lost,'eliteKills',r.elite_kills,'bossKills',r.boss_kills,'championsRecruited',r.champions_recruited,
  'itemsPurchased',r.items_purchased,'startedAt',r.started_at,'completedAt',r.completed_at,'durationSeconds',r.duration_seconds,
  'progressionSource',r.progression_source,'verificationStatus',CASE WHEN r.progression_source='verified' THEN 'verified' ELSE 'legacy' END,
  'engineVersion',a.engine_version,'gameplayVersion',a.gameplay_ruleset_version,'progressionVersion',r.progression_version,
  'ledgerVersion',r.ledger_version,'mode',a.mode,'difficulty',a.difficulty,'runeIds',r.rune_ids,'augmentIds',r.augment_ids)
$$;

CREATE FUNCTION private.admin_team_item(m public.run_team_members)
RETURNS JSONB LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT jsonb_build_object('championId',m.champion_id,'finalLevel',m.final_level,'finalHp',m.final_hp,'survived',m.survived,
 'kills',m.kills,'damageDealt',m.damage_dealt::TEXT,'itemsCollected',m.items_collected,'damageReceived',m.damage_received::TEXT,
 'healingDone',m.healing_done::TEXT,'healingReceived',m.healing_received::TEXT,'timeAliveSeconds',m.time_alive_seconds,
 'crowdControlDuration',m.crowd_control_duration,'goldEarned',m.gold_earned,'csScore',m.cs_score,
 'wavesParticipated',m.waves_participated,'biomesParticipated',m.biomes_participated)
$$;

CREATE FUNCTION private.admin_attempt_item(a public.run_attempts, p public.players)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT jsonb_build_object('id',a.id,'playerId',a.player_id,'username',p.username,'displayName',p.display_name,'status',a.status,
 'mode',a.mode,'difficulty',a.difficulty,'engineVersion',a.engine_version,'gameplayVersion',a.gameplay_ruleset_version,
 'progressionVersion',a.ruleset_version,'commandSchemaVersion',a.command_schema_version,'economyVersion',a.economy_version,
 'startedAt',a.started_at,'finishedAt',a.finished_at,'verifiedAt',a.verified_at,'rejectedAt',a.rejected_at,'expiredAt',a.expired_at,
 'rejectionCode',a.rejection_code,'resultRunId',a.result_run_id,'lastSequence',a.last_sequence,'initialTeam',a.initial_team)
$$;

-- Filter/count/page/export share these exact predicates. Projections never SELECT row_to_json(authority).
CREATE FUNCTION private.admin_filtered_runs(f JSONB, stamp TIMESTAMPTZ)
RETURNS TABLE(id UUID, completed_at TIMESTAMPTZ, waves_completed INTEGER, run_level INTEGER, item JSONB)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT r.id,r.completed_at,r.waves_completed,r.run_level,private.admin_run_item(r,p,a)
 FROM public.runs r JOIN public.players p ON p.id=r.player_id LEFT JOIN public.run_attempts a ON a.id=r.run_attempt_id
 WHERE r.created_at<=stamp
 AND (NOT f?'playerId' OR r.player_id=(f->>'playerId')::UUID)
 AND (NOT f?'from' OR r.completed_at>=(f->>'from')::TIMESTAMPTZ) AND (NOT f?'to' OR r.completed_at<(f->>'to')::TIMESTAMPTZ)
 AND (COALESCE(f->>'difficulty','all')='all' OR a.difficulty=f->>'difficulty')
 AND (COALESCE(f->>'mode','all')='all' OR a.mode=f->>'mode')
 AND (COALESCE(f->>'result','all')='all' OR r.won=(f->>'result'='won'))
 AND (COALESCE(f->>'verification','all')='all' OR (r.progression_source='verified')=(f->>'verification'='verified'))
 AND (COALESCE(f->>'biome','all')='all' OR f->>'biome'=ANY(r.biomes_visited))
 AND (NOT f?'minWaves' OR r.waves_completed>=(f->>'minWaves')::INTEGER)
 AND (NOT f?'maxWaves' OR r.waves_completed<=(f->>'maxWaves')::INTEGER)
 AND (NOT f?'championId' OR EXISTS(SELECT 1 FROM public.run_team_members m WHERE m.run_id=r.id AND m.champion_id=f->>'championId'))
 AND (NOT f?'engineVersion' OR a.engine_version=f->>'engineVersion')
 AND (NOT f?'gameplayVersion' OR a.gameplay_ruleset_version=(f->>'gameplayVersion')::INTEGER)
 AND (NOT f?'progressionVersion' OR r.progression_version=(f->>'progressionVersion')::INTEGER)
 AND (NOT f?'ledgerVersion' OR r.ledger_version=(f->>'ledgerVersion')::INTEGER)
$$;

CREATE FUNCTION private.admin_filtered_attempts(f JSONB, stamp TIMESTAMPTZ)
RETURNS TABLE(id UUID, completed_at TIMESTAMPTZ, waves_completed INTEGER, run_level INTEGER, item JSONB)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT a.id,a.started_at,NULL::INTEGER,NULL::INTEGER,private.admin_attempt_item(a,p)
 FROM public.run_attempts a JOIN public.players p ON p.id=a.player_id
 WHERE a.created_at<=stamp
 AND (NOT f?'playerId' OR a.player_id=(f->>'playerId')::UUID)
 AND (NOT f?'from' OR a.started_at>=(f->>'from')::TIMESTAMPTZ) AND (NOT f?'to' OR a.started_at<(f->>'to')::TIMESTAMPTZ)
 AND (COALESCE(f->>'status','all')='all' OR a.status=f->>'status')
 AND (COALESCE(f->>'difficulty','all')='all' OR a.difficulty=f->>'difficulty')
 AND (COALESCE(f->>'mode','all')='all' OR a.mode=f->>'mode')
 AND (NOT f?'championId' OR f->>'championId'=ANY(a.initial_team))
 AND (NOT f?'engineVersion' OR a.engine_version=f->>'engineVersion')
 AND (NOT f?'gameplayVersion' OR a.gameplay_ruleset_version=(f->>'gameplayVersion')::INTEGER)
 AND (NOT f?'progressionVersion' OR a.ruleset_version=(f->>'progressionVersion')::INTEGER)
$$;

CREATE FUNCTION private.admin_filtered_players(f JSONB, stamp TIMESTAMPTZ)
RETURNS TABLE(id UUID, completed_at TIMESTAMPTZ, waves_completed INTEGER, run_level INTEGER, item JSONB)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 WITH verified AS (
   SELECT r.player_id,COUNT(*) AS runs,COUNT(*) FILTER(WHERE r.won) AS wins
   FROM public.runs r WHERE r.created_at<=stamp AND r.progression_source='verified' GROUP BY r.player_id
 )
 SELECT p.id,p.created_at,NULL::INTEGER,NULL::INTEGER,jsonb_build_object(
 'id',p.id,'username',p.username,'displayName',p.display_name,'level',p.level,'createdAt',p.created_at,'lastLoginAt',p.last_login_at,
 'verifiedRuns',COALESCE(v.runs,0),'verifiedWins',COALESCE(v.wins,0),'candiesBalance',p.total_candies::TEXT)
 FROM public.players p LEFT JOIN verified v ON v.player_id=p.id
 WHERE p.created_at<=stamp AND COALESCE(f->>'accountState','all')<>'guest'
 AND (COALESCE(f->>'search','')='' OR strpos(lower(normalize(p.username,NFC)),lower(normalize(f->>'search',NFC)))>0
   OR strpos(lower(normalize(COALESCE(p.display_name,''),NFC)),lower(normalize(f->>'search',NFC)))>0
   OR strpos(p.id::TEXT,lower(f->>'search'))>0)
 AND (NOT f?'registeredFrom' OR p.created_at>=(f->>'registeredFrom')::TIMESTAMPTZ)
 AND (NOT f?'registeredTo' OR p.created_at<(f->>'registeredTo')::TIMESTAMPTZ)
 AND (NOT f?'activeFrom' OR p.last_login_at>=(f->>'activeFrom')::TIMESTAMPTZ)
 AND (NOT f?'activeTo' OR p.last_login_at<(f->>'activeTo')::TIMESTAMPTZ)
 AND (COALESCE(f->>'verifiedRuns','all')='all' OR (COALESCE(v.runs,0)>0)=(f->>'verifiedRuns'='some'))
$$;

CREATE FUNCTION private.admin_explorer_page(population TEXT, p_filters JSONB, p_cursor JSONB, p_snapshot TIMESTAMPTZ, p_page_size INTEGER, is_export BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 f JSONB; stamp TIMESTAMPTZ := COALESCE(p_snapshot,statement_timestamp()); source TEXT; direction TEXT; primary_sort TEXT;
 ordering TEXT; predicate TEXT := 'TRUE'; result JSONB; cursor_key TEXT; total_rows BIGINT;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'admin_access_denied' USING ERRCODE='42501'; END IF;
 IF NOT isfinite(stamp) OR stamp>statement_timestamp() OR p_page_size IS NULL OR p_page_size<1 OR p_page_size>(CASE WHEN is_export THEN 5000 ELSE 100 END) THEN
   RAISE EXCEPTION 'admin_invalid_page' USING ERRCODE='22023'; END IF;
 f:=private.admin_explorer_filters(p_filters,population);
 source:=CASE population WHEN 'players' THEN 'admin_filtered_players' WHEN 'runs' THEN 'admin_filtered_runs' WHEN 'attempts' THEN 'admin_filtered_attempts' END;
 primary_sort:=CASE WHEN population='runs' THEN COALESCE(f->>'sortBy','completed_at') ELSE 'completed_at' END;
 direction:=CASE WHEN population='runs' THEN COALESCE(f->>'sortOrder','desc') ELSE 'desc' END;
 cursor_key:=md5(population||':'||f::TEXT);
 ordering:=format('%I %s%s, id %s',primary_sort,direction,CASE WHEN primary_sort<>'completed_at' THEN ', completed_at '||direction ELSE '' END,direction);
 IF p_cursor IS NOT NULL THEN
   IF is_export OR jsonb_typeof(p_cursor)<>'object' OR octet_length(p_cursor::TEXT)>4096
      OR p_cursor->>'scope' IS DISTINCT FROM population OR p_cursor->>'filterKey' IS DISTINCT FROM cursor_key
      OR (p_cursor->>'snapshotAt')::TIMESTAMPTZ IS DISTINCT FROM stamp
      OR p_cursor->>'sortBy' IS DISTINCT FROM primary_sort OR p_cursor->>'sortOrder' IS DISTINCT FROM direction
      OR NOT p_cursor ?& ARRAY['id','completedAt','value','snapshotAt','sortBy','sortOrder','scope','filterKey']
      OR EXISTS(SELECT 1 FROM jsonb_each(p_cursor) AS e WHERE jsonb_typeof(e.value) IN ('array','object','null'))
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_cursor) AS k WHERE k NOT IN ('id','completedAt','value','snapshotAt','sortBy','sortOrder','scope','filterKey')) THEN
     RAISE EXCEPTION 'admin_invalid_cursor' USING ERRCODE='22023'; END IF;
   PERFORM (p_cursor->>'id')::UUID,(p_cursor->>'completedAt')::TIMESTAMPTZ;
   predicate:=CASE WHEN primary_sort='completed_at'
     THEN format('(completed_at,id) %s (($4->>''completedAt'')::timestamptz,($4->>''id'')::uuid)',CASE WHEN direction='asc' THEN '>' ELSE '<' END)
     ELSE format('(%I,completed_at,id) %s (($4->>''value'')::integer,($4->>''completedAt'')::timestamptz,($4->>''id'')::uuid)',primary_sort,CASE WHEN direction='asc' THEN '>' ELSE '<' END) END;
 END IF;
 IF is_export THEN
   EXECUTE format('SELECT count(*) FROM private.%I($1,$2)',source) INTO total_rows USING f,stamp;
   IF total_rows>p_page_size THEN RAISE EXCEPTION 'admin_export_limit_exceeded' USING ERRCODE='22023'; END IF;
 END IF;
 -- Only the selected page joins members, once as a set; count is independent of cursor.
 EXECUTE format($query$
 WITH filtered AS MATERIALIZED(SELECT * FROM private.%I($1,$2)),
 candidates AS MATERIALIZED(SELECT * FROM filtered WHERE %s ORDER BY %s LIMIT ($3+1)),
 visible AS MATERIALIZED(SELECT * FROM candidates ORDER BY %s LIMIT $3),
 teams AS (SELECT m.run_id,jsonb_agg(private.admin_team_item(m) ORDER BY m.champion_id,m.id) AS team
   FROM public.run_team_members m JOIN visible v ON v.id=m.run_id WHERE $5='runs' GROUP BY m.run_id),
 entries AS (SELECT v.*,CASE WHEN $5='runs' THEN v.item||jsonb_build_object('team',COALESCE(t.team,'[]'::jsonb)) ELSE v.item END AS projected FROM visible v LEFT JOIN teams t ON t.run_id=v.id)
 SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(projected ORDER BY %s) FROM entries),'[]'::jsonb),
 'total',(SELECT count(*) FROM filtered),'hasMore',(SELECT count(*) FROM candidates)>$3,
 'nextCursor',CASE WHEN (SELECT count(*) FROM candidates)>$3 THEN (SELECT jsonb_build_object(
 'scope',$5,'filterKey',$6,'snapshotAt',$2,'sortBy',$7,'sortOrder',$8,'id',id,'completedAt',completed_at,'value',to_jsonb(%I))
 FROM visible ORDER BY %s LIMIT 1) ELSE NULL END,'snapshotAt',$2)
 $query$,source,predicate,ordering,ordering,ordering,primary_sort,
 format('%I %s%s, id %s',primary_sort,CASE WHEN direction='asc' THEN 'desc' ELSE 'asc' END,
 CASE WHEN primary_sort<>'completed_at' THEN ', completed_at '||CASE WHEN direction='asc' THEN 'desc' ELSE 'asc' END ELSE '' END,
 CASE WHEN direction='asc' THEN 'desc' ELSE 'asc' END))
 INTO result USING f,stamp,p_page_size,p_cursor,population,cursor_key,primary_sort,direction;
 IF is_export THEN RETURN result-'hasMore'-'nextCursor'; END IF;
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'admin_invalid_cursor' USING ERRCODE='22023';
END $$;

CREATE FUNCTION private.admin_player_detail(p_player_id UUID, p_snapshot TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 p public.players%ROWTYPE; account public.candy_accounts%ROWTYPE; wallet public.account_wallets%ROWTYPE;
 stamp TIMESTAMPTZ:=COALESCE(p_snapshot,statement_timestamp()); profile JSONB; stats JSONB; mastery JSONB; enhancements JSONB;
 candy_history JSONB; shard_history JSONB; purchases JSONB; earned BIGINT; spent BIGINT; refunded BIGINT; unattributed BIGINT; ledger_balance BIGINT; shard_ledger BIGINT;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'admin_access_denied' USING ERRCODE='42501'; END IF;
 IF NOT isfinite(stamp) OR stamp>statement_timestamp() THEN RAISE EXCEPTION 'admin_invalid_snapshot' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND created_at<=stamp;
 IF NOT FOUND THEN RAISE EXCEPTION 'admin_player_not_found' USING ERRCODE='P0002'; END IF;
 SELECT item INTO profile FROM private.admin_filtered_players('{}',stamp) WHERE id=p.id;
 SELECT jsonb_build_object('runs',COUNT(*),'wins',COUNT(*) FILTER(WHERE won),'waves',COALESCE(SUM(waves_completed),0),
 'candiesEarned',COALESCE(SUM(candies_earned),0)::TEXT,'lastCompletedAt',MAX(completed_at)) INTO stats
 FROM public.runs WHERE player_id=p.id AND progression_source='verified' AND created_at<=stamp;
 WITH entries AS MATERIALIZED(SELECT * FROM public.champion_mastery WHERE player_id=p.id AND created_at<=stamp),
 bounded AS (SELECT * FROM entries ORDER BY champion_id LIMIT 200)
 SELECT jsonb_build_object('items',COALESCE(jsonb_agg(jsonb_build_object('championId',champion_id,'masteryLevel',mastery_level,
 'totalCandies',total_candies,'currentLevelCandies',current_level_candies,'gamesPlayed',games_played,'gamesWon',games_won) ORDER BY champion_id),'[]'),
 'total',(SELECT COUNT(*) FROM entries),'hasMore',(SELECT COUNT(*) FROM entries)>200) INTO mastery FROM bounded;
 WITH entries AS MATERIALIZED(SELECT * FROM public.champion_enhancements WHERE user_id=p.user_id AND created_at<=stamp),
 bounded AS (SELECT * FROM entries ORDER BY champion_id LIMIT 200)
 SELECT jsonb_build_object('items',COALESCE(jsonb_agg(jsonb_build_object('championId',b.champion_id,'totalCandiesSpent',b.total_candies_spent,
 'unlockedNodes',COALESCE((SELECT jsonb_object_agg(e.key,e.value) FROM jsonb_each(CASE WHEN jsonb_typeof(b.unlocked_nodes)='object' THEN b.unlocked_nodes ELSE '{}' END) e
 WHERE e.key ~ '^[A-Za-z0-9_:-]{1,100}$' AND CASE WHEN jsonb_typeof(e.value)='number' THEN (e.value#>>'{}')::NUMERIC BETWEEN 0 AND 100 ELSE FALSE END),'{}')) ORDER BY b.champion_id),'[]'),
 'total',(SELECT COUNT(*) FROM entries),'hasMore',(SELECT COUNT(*) FROM entries)>200) INTO enhancements FROM bounded b;
 SELECT * INTO account FROM public.candy_accounts WHERE player_id=p.id;
 SELECT COALESCE(SUM(amount) FILTER(WHERE kind='earned'),0),-COALESCE(SUM(amount) FILTER(WHERE kind='spent'),0),
 COALESCE(SUM(amount) FILTER(WHERE kind='refunded'),0),COALESCE(SUM(amount) FILTER(WHERE kind='unattributed'),0),COALESCE(SUM(amount),0)
 INTO earned,spent,refunded,unattributed,ledger_balance FROM public.candy_transactions WHERE player_id=p.id;
 WITH entries AS MATERIALIZED(SELECT * FROM public.candy_transactions WHERE player_id=p.id AND created_at<=stamp),
 bounded AS (SELECT * FROM entries ORDER BY created_at DESC,id DESC LIMIT 50)
 SELECT jsonb_build_object('items',COALESCE(jsonb_agg(jsonb_build_object('id',id::TEXT,'kind',kind,'amount',amount::TEXT,'createdAt',created_at) ORDER BY created_at DESC,id DESC),'[]'),
 'total',(SELECT COUNT(*) FROM entries),'hasMore',(SELECT COUNT(*) FROM entries)>50) INTO candy_history FROM bounded;
 SELECT * INTO wallet FROM public.account_wallets WHERE user_id=p.user_id;
 SELECT COALESCE(SUM(amount),0) INTO shard_ledger FROM public.shard_transactions WHERE user_id=p.user_id;
 WITH entries AS MATERIALIZED(SELECT * FROM public.shard_transactions WHERE user_id=p.user_id AND created_at<=stamp),
 bounded AS (SELECT * FROM entries ORDER BY created_at DESC,id DESC LIMIT 50)
 SELECT jsonb_build_object('items',COALESCE(jsonb_agg(jsonb_build_object('id',id,'amount',amount::TEXT,'balanceAfter',balance_after::TEXT,
 'reason',reason,'championId',champion_id,'createdAt',created_at) ORDER BY created_at DESC,id DESC),'[]'),
 'total',(SELECT COUNT(*) FROM entries),'hasMore',(SELECT COUNT(*) FROM entries)>50) INTO shard_history FROM bounded;
 WITH entries AS MATERIALIZED(SELECT * FROM public.account_champion_unlocks WHERE user_id=p.user_id AND unlocked_at<=stamp),
 bounded AS (SELECT * FROM entries ORDER BY unlocked_at DESC,champion_id DESC LIMIT 50)
 SELECT jsonb_build_object('items',COALESCE(jsonb_agg(jsonb_build_object('championId',champion_id,'unlockedAt',unlocked_at,
 'source',source,'pricePaid',price_paid::TEXT) ORDER BY unlocked_at DESC,champion_id DESC),'[]'),
 'total',(SELECT COUNT(*) FROM entries),'hasMore',(SELECT COUNT(*) FROM entries)>50) INTO purchases FROM bounded;
 RETURN jsonb_build_object('profile',profile,'verifiedStats',stats,'mastery',mastery,'enhancements',enhancements,
 'candies',jsonb_build_object('balance',p.total_candies::TEXT,'openingBalance',account.opening_balance::TEXT,
 'historyComplete',account.history_complete,'reconciled',CASE WHEN account.player_id IS NULL THEN NULL ELSE account.opening_balance+ledger_balance=p.total_candies END,
 'earnedSinceLedger',earned::TEXT,'spentSinceLedger',spent::TEXT,'refundedSinceLedger',refunded::TEXT,'unattributedSinceLedger',unattributed::TEXT,
 'ledgerStartedAt',(SELECT started_at FROM public.candy_ledger_settings WHERE singleton),'transactions',candy_history),
 'shards',jsonb_build_object('balance',wallet.shards_balance::TEXT,'lifetimeEarned',wallet.lifetime_shards_earned::TEXT,
 'lifetimeSpent',wallet.lifetime_shards_spent::TEXT,'ledgerBalance',shard_ledger::TEXT,
 'reconciled',CASE WHEN wallet.user_id IS NULL THEN NULL ELSE wallet.shards_balance=shard_ledger END,'transactions',shard_history),
 'purchases',purchases,'snapshotAt',stamp);
END $$;

CREATE FUNCTION private.admin_action_item(c public.run_attempt_commands)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT jsonb_build_object('sequence',c.sequence,'receivedAt',c.received_at,
 'kind',CASE WHEN c.kind=ANY(ARRAY['move_node','resolve_combat','shop_buy_item','shop_recruit','rest','recruit','event','treasure','resolve_node','equip_item','unequip_item','sell_item','choose_augment','upgrade_spell','abandon_run']) THEN c.kind ELSE 'unsupported' END,
 'nodeId',CASE WHEN c.kind=ANY(ARRAY['move_node','resolve_combat','shop_buy_item','shop_recruit','rest','recruit','event','treasure','resolve_node']) AND c.payload->>'node_id' ~ '^[A-Za-z0-9_:.-]{1,128}$' THEN c.payload->>'node_id' END,
 'championId',CASE WHEN c.kind=ANY(ARRAY['shop_recruit','equip_item','upgrade_spell']) AND c.payload->>'champion_id' ~ '^[A-Za-z0-9_:-]{1,100}$' THEN c.payload->>'champion_id' END,
 'itemId',CASE WHEN c.kind='shop_buy_item' AND c.payload->>'item_id' ~ '^[A-Za-z0-9_:-]{1,100}$' THEN c.payload->>'item_id' END,
 'instanceId',CASE WHEN c.kind=ANY(ARRAY['equip_item','unequip_item','sell_item']) AND c.payload->>'instance_id' ~ '^[A-Za-z0-9_:.-]{1,128}$' THEN c.payload->>'instance_id' END,
 'augmentId',CASE WHEN c.kind='choose_augment' AND c.payload->>'augment_id' ~ '^[A-Za-z0-9_:-]{1,100}$' THEN c.payload->>'augment_id' END,
 'slot',CASE WHEN c.kind='upgrade_spell' AND c.payload->>'slot' IN ('Q','W','E','R') THEN c.payload->>'slot' END,
 'combatMode',CASE WHEN c.kind='resolve_combat' THEN CASE WHEN COALESCE(c.payload->>'actions_json','auto')='auto' THEN 'auto' ELSE 'manual' END END)
$$;

CREATE FUNCTION private.admin_run_detail(p_entity_id UUID, p_kind TEXT, p_cursor JSONB, p_snapshot TIMESTAMPTZ, p_page_size INTEGER)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 r public.runs%ROWTYPE; a public.run_attempts%ROWTYPE; p public.players%ROWTYPE;
 stamp TIMESTAMPTZ:=COALESCE(p_snapshot,statement_timestamp()); run_item JSONB; attempt_item JSONB; timeline JSONB;
 actions JSONB; after_sequence INTEGER:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'admin_access_denied' USING ERRCODE='42501'; END IF;
 IF p_kind NOT IN ('run','attempt') OR NOT isfinite(stamp) OR stamp>statement_timestamp() OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
 RAISE EXCEPTION 'admin_invalid_page' USING ERRCODE='22023'; END IF;
 IF p_kind='run' THEN
  SELECT * INTO r FROM public.runs WHERE id=p_entity_id AND created_at<=stamp;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin_run_not_found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO a FROM public.run_attempts WHERE id=r.run_attempt_id AND created_at<=stamp;
 ELSE
  SELECT * INTO a FROM public.run_attempts WHERE id=p_entity_id AND created_at<=stamp;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin_attempt_not_found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO r FROM public.runs WHERE id=a.result_run_id AND created_at<=stamp;
 END IF;
 SELECT * INTO p FROM public.players WHERE id=COALESCE(r.player_id,a.player_id);
 IF r.id IS NOT NULL THEN
   run_item:=private.admin_run_item(r,p,a)||jsonb_build_object('team',COALESCE((SELECT jsonb_agg(private.admin_team_item(m) ORDER BY m.champion_id,m.id) FROM public.run_team_members m WHERE m.run_id=r.id),'[]'));
 END IF;
 IF a.id IS NOT NULL THEN attempt_item:=private.admin_attempt_item(a,p); END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',milestone,'at',at,'code',code) ORDER BY at,position),'[]') INTO timeline
 FROM (VALUES ('started',COALESCE(a.started_at,r.started_at),NULL::TEXT,1),('finished',a.finished_at,NULL::TEXT,2),
 ('verified',a.verified_at,NULL::TEXT,3),('rejected',a.rejected_at,a.rejection_code,4),('expired',a.expired_at,NULL::TEXT,5),
 ('completed',r.completed_at,NULL::TEXT,6)) AS events(milestone,at,code,position) WHERE at IS NOT NULL;
 IF p_cursor IS NOT NULL THEN
  IF jsonb_typeof(p_cursor)<>'object' OR p_cursor->>'scope' IS DISTINCT FROM 'actions'
   OR p_cursor->>'entityId' IS DISTINCT FROM p_entity_id::TEXT OR p_cursor->>'entityKind' IS DISTINCT FROM p_kind
   OR (p_cursor->>'snapshotAt')::TIMESTAMPTZ IS DISTINCT FROM stamp
   OR NOT p_cursor ?& ARRAY['scope','entityId','entityKind','snapshotAt','sequence']
   OR EXISTS(SELECT 1 FROM jsonb_each(p_cursor) e WHERE jsonb_typeof(e.value) NOT IN ('string','number'))
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_cursor) k WHERE k NOT IN ('scope','entityId','entityKind','snapshotAt','sequence')) THEN
   RAISE EXCEPTION 'admin_invalid_cursor' USING ERRCODE='22023'; END IF;
  after_sequence:=(p_cursor->>'sequence')::INTEGER;
  IF after_sequence<1 THEN RAISE EXCEPTION 'admin_invalid_cursor' USING ERRCODE='22023'; END IF;
 END IF;
 WITH entries AS MATERIALIZED(SELECT * FROM public.run_attempt_commands WHERE attempt_id=a.id AND received_at<=stamp),
 candidates AS MATERIALIZED(SELECT * FROM entries WHERE sequence>after_sequence ORDER BY sequence LIMIT p_page_size+1),
 visible AS MATERIALIZED(SELECT * FROM candidates ORDER BY sequence LIMIT p_page_size)
 SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(private.admin_action_item(v) ORDER BY sequence) FROM visible v),'[]'),
 'total',(SELECT COUNT(*) FROM entries),'hasMore',(SELECT COUNT(*) FROM candidates)>p_page_size,
 'nextCursor',CASE WHEN (SELECT COUNT(*) FROM candidates)>p_page_size THEN jsonb_build_object('scope','actions','entityId',p_entity_id,
 'entityKind',p_kind,'snapshotAt',stamp,'sequence',(SELECT MAX(sequence) FROM visible)) ELSE NULL END) INTO actions;
 RETURN jsonb_build_object('run',run_item,'attempt',attempt_item,'timeline',timeline,'snapshotAt',stamp)||actions;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'admin_invalid_cursor' USING ERRCODE='22023';
END $$;

-- All exposed functions retain invoker rights. Private entrypoints have narrowly granted
-- EXECUTE and perform the same live admin check even when called directly from SQL.
CREATE FUNCTION public.admin_search_players(p_filters JSONB DEFAULT '{}',p_cursor JSONB DEFAULT NULL,p_snapshot TIMESTAMPTZ DEFAULT NULL,p_page_size INTEGER DEFAULT 50)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT private.admin_explorer_page('players',p_filters,p_cursor,p_snapshot,p_page_size) $$;
CREATE FUNCTION public.admin_search_runs(p_filters JSONB DEFAULT '{}',p_cursor JSONB DEFAULT NULL,p_snapshot TIMESTAMPTZ DEFAULT NULL,p_page_size INTEGER DEFAULT 50)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT private.admin_explorer_page('runs',p_filters,p_cursor,p_snapshot,p_page_size) $$;
CREATE FUNCTION public.admin_search_attempts(p_filters JSONB DEFAULT '{}',p_cursor JSONB DEFAULT NULL,p_snapshot TIMESTAMPTZ DEFAULT NULL,p_page_size INTEGER DEFAULT 50)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT private.admin_explorer_page('attempts',p_filters,p_cursor,p_snapshot,p_page_size) $$;
CREATE FUNCTION public.admin_export_runs(p_filters JSONB DEFAULT '{}',p_snapshot TIMESTAMPTZ DEFAULT NULL,p_max_rows INTEGER DEFAULT 5000,p_population TEXT DEFAULT 'runs')
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'admin_access_denied' USING ERRCODE='42501'; END IF;
 IF p_population IS NULL OR p_population NOT IN ('runs','attempts') THEN RAISE EXCEPTION 'admin_invalid_population' USING ERRCODE='22023'; END IF;
 RETURN private.admin_explorer_page(p_population,p_filters,NULL,p_snapshot,p_max_rows,TRUE);
END $$;
CREATE FUNCTION public.admin_get_player_detail(p_player_id UUID,p_snapshot TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT private.admin_player_detail(p_player_id,p_snapshot) $$;
CREATE FUNCTION public.admin_get_run_detail(p_run_id UUID,p_cursor JSONB DEFAULT NULL,p_snapshot TIMESTAMPTZ DEFAULT NULL,p_page_size INTEGER DEFAULT 50)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT private.admin_run_detail(p_run_id,'run',p_cursor,p_snapshot,p_page_size) $$;
CREATE FUNCTION public.admin_get_attempt_detail(p_attempt_id UUID,p_cursor JSONB DEFAULT NULL,p_snapshot TIMESTAMPTZ DEFAULT NULL,p_page_size INTEGER DEFAULT 50)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT private.admin_run_detail(p_attempt_id,'attempt',p_cursor,p_snapshot,p_page_size) $$;

REVOKE ALL ON FUNCTION private.admin_explorer_filters(JSONB,TEXT),private.admin_run_item(public.runs,public.players,public.run_attempts),
 private.admin_team_item(public.run_team_members),private.admin_attempt_item(public.run_attempts,public.players),
 private.admin_filtered_runs(JSONB,TIMESTAMPTZ),private.admin_filtered_attempts(JSONB,TIMESTAMPTZ),private.admin_filtered_players(JSONB,TIMESTAMPTZ),
 private.admin_action_item(public.run_attempt_commands),private.admin_explorer_page(TEXT,JSONB,JSONB,TIMESTAMPTZ,INTEGER,BOOLEAN),
 private.admin_player_detail(UUID,TIMESTAMPTZ),private.admin_run_detail(UUID,TEXT,JSONB,TIMESTAMPTZ,INTEGER)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.admin_explorer_page(TEXT,JSONB,JSONB,TIMESTAMPTZ,INTEGER,BOOLEAN),
 private.admin_player_detail(UUID,TIMESTAMPTZ),private.admin_run_detail(UUID,TEXT,JSONB,TIMESTAMPTZ,INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_search_players(JSONB,JSONB,TIMESTAMPTZ,INTEGER),public.admin_search_runs(JSONB,JSONB,TIMESTAMPTZ,INTEGER),
 public.admin_search_attempts(JSONB,JSONB,TIMESTAMPTZ,INTEGER),public.admin_export_runs(JSONB,TIMESTAMPTZ,INTEGER,TEXT),
 public.admin_get_player_detail(UUID,TIMESTAMPTZ),public.admin_get_run_detail(UUID,JSONB,TIMESTAMPTZ,INTEGER),public.admin_get_attempt_detail(UUID,JSONB,TIMESTAMPTZ,INTEGER)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_search_players(JSONB,JSONB,TIMESTAMPTZ,INTEGER),public.admin_search_runs(JSONB,JSONB,TIMESTAMPTZ,INTEGER),
 public.admin_search_attempts(JSONB,JSONB,TIMESTAMPTZ,INTEGER),public.admin_export_runs(JSONB,TIMESTAMPTZ,INTEGER,TEXT),
 public.admin_get_player_detail(UUID,TIMESTAMPTZ),public.admin_get_run_detail(UUID,JSONB,TIMESTAMPTZ,INTEGER),public.admin_get_attempt_detail(UUID,JSONB,TIMESTAMPTZ,INTEGER) TO authenticated;

COMMIT;
