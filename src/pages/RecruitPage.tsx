import { useCallback, useMemo, useState } from 'react';
import { playUIClick } from '@/audio';
import { EncounterLayout } from '@/components/EncounterLayout';
import { ROUTES } from '@/config/routes';
import { championDB } from '@/data/championDatabase';
import { getNodeEncounter } from '@/game/map/mapUtils';
import { resolveRecruitAttempt } from '@/game/run/runEncounterRules';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { fr } from '@/i18n/fr';
import { useRunStore } from '@/stores/runStore';

export function RecruitPage() {
  const isActive = useRunStore((s) => s.isActive);
  const gold = useRunStore((s) => s.gold);
  const team = useRunStore((s) => s.team);
  const currentNodeId = useRunStore((s) => s.currentNodeId);
  const wasClaimed = useRunStore(
    (s) => currentNodeId !== null && (s.claimedEncounterNodeIds ?? []).includes(currentNodeId),
  );
  const navigate = useAppNavigate();
  const getCurrentNode = useRunStore((s) => s.getCurrentNode);
  const spendGold = useRunStore((s) => s.spendGold);
  const addChampion = useRunStore((s) => s.addChampion);
  const [result, setResult] = useState<'success' | 'fail' | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);

  const encounter = useMemo(() => {
    return getNodeEncounter(getCurrentNode(), 'recruit');
  }, [getCurrentNode]);

  const champ = encounter ? championDB.getById(encounter.championId) : null;
  const teamFull = team.length >= 5;
  const alreadyOnTeam = team.some((m) => m.championId === encounter?.championId);
  const canAfford = encounter ? gold >= encounter.cost : false;
  const disabled =
    !encounter || teamFull || alreadyOnTeam || !canAfford || result !== null || wasClaimed;

  const handleRecruit = useCallback(() => {
    if (disabled || !encounter) return;
    playUIClick();
    const previous = useRunStore.getState();
    if (!previous.currentNodeId || !previous.claimCurrentEncounter()) {
      setCommandError(fr.encounter.commandFailed);
      return;
    }
    const attempt = resolveRecruitAttempt(previous.seed ?? 0, encounter);
    const { success, goldCost: cost } = attempt;
    if (success) {
      const spendSucceeded =
        cost === 0 ||
        spendGold(cost, {
          source: 'recruit',
          nodeId: previous.currentNodeId,
          wave: previous.currentWave,
        }).success;
      const recruitResult = spendSucceeded
        ? addChampion(encounter.championId, encounter.statMultiplier)
        : null;
      if (!spendSucceeded || !recruitResult?.success) {
        useRunStore.setState({
          team: previous.team,
          gold: previous.gold,
          ledger: previous.ledger,
          claimedEncounterNodeIds: previous.claimedEncounterNodeIds,
        });
        setCommandError(fr.encounter.commandFailed);
        return;
      }
    }
    if (
      !useRunStore
        .getState()
        .recordRunCommand(
          { kind: 'recruit', nodeId: previous.currentNodeId },
          `recruit:${previous.currentBiomeIndex}:${previous.currentNodeId}`,
        )
    ) {
      useRunStore.setState({
        team: previous.team,
        gold: previous.gold,
        ledger: previous.ledger,
        claimedEncounterNodeIds: previous.claimedEncounterNodeIds,
      });
      setCommandError(fr.encounter.commandFailed);
      return;
    }
    setCommandError(null);
    setResult(success ? 'success' : 'fail');
  }, [disabled, encounter, spendGold, addChampion]);

  const handleLeave = useCallback(() => {
    playUIClick();
    if (useRunStore.getState().resolveEncounter()) {
      navigate(ROUTES.RUN);
    }
  }, [navigate]);

  if (!isActive) return null;

  let label: string = fr.encounter.recruitAction;
  if (alreadyOnTeam) label = fr.encounter.alreadyOnTeam;
  else if (teamFull) label = fr.encounter.teamFull;
  else if (!canAfford) label = fr.encounter.notEnoughGold;
  else if (result === 'success') label = fr.encounter.recruited;
  else if (result === 'fail') label = fr.encounter.recruitFailed;
  else if (wasClaimed) label = fr.encounter.attemptUsed;
  else label = `${fr.encounter.recruitAction} — ${encounter?.cost ?? 0} ${fr.common.gold}`;

  const pct = Math.round((encounter?.successChance ?? 0.75) * 100);
  const clr = pct >= 80 ? '#22c55e' : pct >= 60 ? '#facc15' : '#ef4444';

  return (
    <EncounterLayout
      title={`${fr.encounter.recruit} — ${encounter?.name ?? fr.encounter.wildChampion}`}
      gold={gold}
      tone="cyan"
      contentClassName="encounter-layout__content--centered"
    >
      <div style={contentStyle}>
        {commandError && (
          <div role="alert" style={{ color: '#fca5a5', marginBottom: 12 }}>
            {commandError}
            <button type="button" onClick={() => setCommandError(null)}>
              {fr.common.close}
            </button>
          </div>
        )}
        {!result ? (
          <>
            <div style={previewCardStyle}>
              <img
                src={champ?.iconUrl ?? ''}
                alt={champ?.name ?? '???'}
                width={120}
                height={120}
                decoding="async"
                style={iconStyle}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#e6edf3', marginBottom: 4 }}>
                  {champ?.name ?? encounter?.championId ?? '???'}
                </div>
                <div style={{ fontSize: 14, color: '#8b949e', marginBottom: 8 }}>
                  {champ?.title ?? 'Champion'}
                </div>
                <div
                  style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 12 }}
                >
                  {champ?.tags.map((tag) => (
                    <span key={tag} style={tagStyle}>
                      {tag}
                    </span>
                  ))}
                </div>
                {champ && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 6,
                      fontSize: 12,
                      color: '#8b949e',
                    }}
                  >
                    <div>
                      PV : <span style={{ color: '#22c55e' }}>{Math.round(champ.stats.hp)}</span>
                    </div>
                    <div>
                      AD:{' '}
                      <span style={{ color: '#ef4444' }}>
                        {Math.round(champ.stats.attackDamage)}
                      </span>
                    </div>
                    <div>
                      Armor:{' '}
                      <span style={{ color: '#3b82f6' }}>{Math.round(champ.stats.armor)}</span>
                    </div>
                    <div>
                      MR:{' '}
                      <span style={{ color: '#a855f7' }}>
                        {Math.round(champ.stats.magicResist)}
                      </span>
                    </div>
                    <div>
                      AS:{' '}
                      <span style={{ color: '#facc15' }}>{champ.stats.attackSpeed.toFixed(2)}</span>
                    </div>
                    <div>
                      CRIT:{' '}
                      <span style={{ color: '#f97316' }}>{Math.round(champ.stats.crit)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div
              style={{
                fontSize: 14,
                color: '#c8aa6e',
                marginBottom: 8,
                textAlign: 'center',
                maxWidth: 400,
              }}
            >
              {encounter?.description ?? 'A wild champion appears!'}
            </div>
            <div style={{ fontSize: 16, color: '#ffd700', marginBottom: 12, fontWeight: 700 }}>
              Cost: {encounter?.cost ?? 0}g
            </div>
            <div style={{ fontSize: 13, color: clr, marginBottom: 20 }}>
              Success chance: {pct}%{pct < 70 ? ' (may flee!)' : ''}
              <div style={{ color: '#8b949e', marginTop: 6 }}>
                Gold is charged only when recruitment succeeds.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <button
                style={{
                  ...recruitBtnStyle,
                  opacity: disabled ? 0.4 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
                onClick={handleRecruit}
                disabled={disabled}
              >
                {label}
              </button>
              <button style={leaveBtnStyle} onClick={handleLeave}>
                Pass
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>
              {result === 'success' ? '🎉' : '🚫'}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                marginBottom: 12,
                color: result === 'success' ? '#22c55e' : '#ef4444',
              }}
            >
              {result === 'success'
                ? (champ?.name ?? 'Champion') + ' joined your team!'
                : (champ?.name ?? 'Champion') + ' fled!'}
            </div>
            <div
              style={{
                fontSize: 14,
                color: '#c8aa6e',
                marginBottom: 24,
                textAlign: 'center',
                maxWidth: 400,
              }}
            >
              {result === 'success'
                ? 'Spent ' + (encounter?.cost ?? 0) + 'g.'
                : 'The champion ran away. You keep your gold.'}
            </div>
            <button style={continueBtnStyle} onClick={handleLeave}>
              Continue
            </button>
          </>
        )}
      </div>
    </EncounterLayout>
  );
}
const contentStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 40,
};
const previewCardStyle: React.CSSProperties = {
  background: '#161b22',
  border: '1px solid #2d333b',
  borderRadius: 12,
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  marginBottom: 16,
  width: 'min(100%, 26rem)',
};
const iconStyle: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 8,
  background: '#1e2a3a',
};
const tagStyle: React.CSSProperties = {
  padding: '2px 10px',
  background: '#1e2a3a',
  border: '1px solid #2d333b',
  borderRadius: 12,
  fontSize: 11,
  color: '#7dd3fc',
};
const recruitBtnStyle: React.CSSProperties = {
  padding: '14px 36px',
  background: '#06b6d4',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
};
const leaveBtnStyle: React.CSSProperties = {
  padding: '14px 36px',
  background: '#21262d',
  color: '#c8aa6e',
  border: '1px solid #c8aa6e',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
};
const continueBtnStyle: React.CSSProperties = {
  padding: '14px 40px',
  background: '#21262d',
  color: '#c8aa6e',
  border: '1px solid #c8aa6e',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
};
