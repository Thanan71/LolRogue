-- Extend the late-run level adapter to the v6 authority engine without
-- changing the already-versioned progression economy.

BEGIN;

DO $$
DECLARE
  v_definition TEXT;
  v_previous_contract CONSTANT TEXT :=
    'v_attempt.engine_version IN (''run-engine-v4'', ''run-engine-v5'')';
  v_current_contract CONSTANT TEXT :=
    'v_attempt.engine_version IN ('
      || CHR(10) || '      ''run-engine-v4'','
      || CHR(10) || '      ''run-engine-v5'','
      || CHR(10) || '      ''run-engine-v6'''
      || CHR(10) || '    )';
BEGIN
  v_definition := PG_GET_FUNCTIONDEF(
    'public.complete_run_verification(uuid,uuid,jsonb,text)'::REGPROCEDURE
  );

  IF POSITION('''run-engine-v6''' IN v_definition) = 0 THEN
    IF POSITION(v_previous_contract IN v_definition) = 0 THEN
      RAISE EXCEPTION 'complete_run_verification_v6_upgrade_contract_mismatch';
    END IF;
    v_definition := REPLACE(
      v_definition,
      v_previous_contract,
      v_current_contract
    );
    EXECUTE v_definition;
  END IF;

  v_definition := PG_GET_FUNCTIONDEF(
    'public.complete_run_verification(uuid,uuid,jsonb,text)'::REGPROCEDURE
  );
  IF POSITION('''run-engine-v6''' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'complete_run_verification_v6_upgrade_failed';
  END IF;
END
$$;

COMMIT;
