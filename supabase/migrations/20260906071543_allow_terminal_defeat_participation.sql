-- A terminal defeat records the lost combat as participation even though the
-- run's completed-wave counter only contains victorious combats. Accept that
-- single terminal encounter in the v20/v21 participation contracts without
-- letting it increase the candy weight.

BEGIN;

DO $$
DECLARE
  v_definition TEXT;
  v_target RECORD;
  v_previous_member_bound CONSTANT TEXT :=
    '      v_waves_completed,'
      || CHR(10) || '      ''waves_participated''';
  v_current_member_bound CONSTANT TEXT :=
    '      v_waves_completed + CASE'
      || CHR(10) || '        WHEN (p_result ->> ''won'')::BOOLEAN THEN 0'
      || CHR(10) || '        ELSE 1'
      || CHR(10) || '      END,'
      || CHR(10) || '      ''waves_participated''';
  v_previous_ledger_bound CONSTANT TEXT :=
    '        v_waves_completed,'
      || CHR(10) || '        ''ledger.waves_participated''';
  v_current_ledger_bound CONSTANT TEXT :=
    '        v_waves_completed + CASE'
      || CHR(10) || '          WHEN (p_result ->> ''won'')::BOOLEAN THEN 0'
      || CHR(10) || '          ELSE 1'
      || CHR(10) || '        END,'
      || CHR(10) || '        ''ledger.waves_participated''';
  v_previous_weight CONSTANT TEXT :=
    '      (member.value ->> ''waves_participated'')::INTEGER'
      || CHR(10) || '        * v_ruleset.candies_per_wave';
  v_current_weight CONSTANT TEXT :=
    '      LEAST('
      || CHR(10) || '        (member.value ->> ''waves_participated'')::INTEGER,'
      || CHR(10) || '        v_waves_completed'
      || CHR(10) || '      ) * v_ruleset.candies_per_wave';
BEGIN
  FOR v_target IN
    SELECT *
    FROM (VALUES
      (
        'public.complete_run_verification(uuid,uuid,jsonb,text)',
        'run-engine-v21'
      ),
      (
        'public.complete_run_verification_v20_contract(uuid,uuid,jsonb,text)',
        'run-engine-v20'
      )
    ) AS target(signature, engine_version)
  LOOP
    v_definition := PG_GET_FUNCTIONDEF(v_target.signature::REGPROCEDURE);

    IF POSITION(QUOTE_LITERAL(v_target.engine_version) IN v_definition) = 0 THEN
      RAISE EXCEPTION 'terminal_defeat_participation_engine_mismatch:%',
        v_target.signature;
    END IF;

    IF POSITION(v_current_member_bound IN v_definition) = 0
      OR POSITION(v_current_ledger_bound IN v_definition) = 0
      OR POSITION(v_current_weight IN v_definition) = 0
    THEN
      IF POSITION(v_previous_member_bound IN v_definition) = 0
        OR POSITION(v_previous_ledger_bound IN v_definition) = 0
        OR POSITION(v_previous_weight IN v_definition) = 0
      THEN
        RAISE EXCEPTION 'terminal_defeat_participation_contract_mismatch:%',
          v_target.signature;
      END IF;

      v_definition := REPLACE(
        v_definition,
        v_previous_member_bound,
        v_current_member_bound
      );
      v_definition := REPLACE(
        v_definition,
        v_previous_ledger_bound,
        v_current_ledger_bound
      );
      v_definition := REPLACE(
        v_definition,
        v_previous_weight,
        v_current_weight
      );
      EXECUTE v_definition;
    END IF;

    v_definition := PG_GET_FUNCTIONDEF(v_target.signature::REGPROCEDURE);
    IF POSITION(v_current_member_bound IN v_definition) = 0
      OR POSITION(v_current_ledger_bound IN v_definition) = 0
      OR POSITION(v_current_weight IN v_definition) = 0
    THEN
      RAISE EXCEPTION 'terminal_defeat_participation_upgrade_failed:%',
        v_target.signature;
    END IF;
  END LOOP;
END
$$;

COMMIT;
