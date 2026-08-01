import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { playSFX, playUIClick } from '@/audio';
import { Button, PageShell, StateView } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { calculateRunCandyRewards } from '@/game/run/runRewards';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { plural } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { useAuthStore } from '@/stores/authStore';
import { useRunStore } from '@/stores/runStore';
import type { RunSummary } from '@/types/run';

export function GameOverPage() {
  const navigate = useAppNavigate();
  const location = useLocation();
  const routeSummary: RunSummary | undefined = (location.state as { summary?: RunSummary } | null)
    ?.summary;
  const saveStatus = useRunStore((state) => state.saveStatus);
  const saveError = useRunStore((state) => state.saveError);
  const saveFailureKind = useRunStore((state) => state.saveFailureKind);
  const activeRunId = useRunStore((state) => state.runId);
  const completedRunSnapshot = useRunStore((state) => state.completedRunSnapshot);
  const serverProgression = useRunStore((state) => state.serverProgression);
  const hasAuthenticatedAccount = useAuthStore((state) => state.user !== null);
  const [isErrorVisible, setIsErrorVisible] = useState(true);
  const summary = completedRunSnapshot?.summary ?? routeSummary;
  const rewards = useMemo(() => {
    if (!summary) return null;
    if (serverProgression) {
      const championIds = [
        ...new Set(
          (
            completedRunSnapshot?.teamMembers.map((member) => member.championId) ??
            summary.championStats.map((stats) => stats.championId)
          ).filter(Boolean),
        ),
      ];
      return {
        total: serverProgression.candiesEarned,
        byChampion: Object.fromEntries(
          championIds.map((championId) => [championId, serverProgression.candiesPerChampion]),
        ),
      };
    }
    // An authenticated account must never see a speculative local reward.
    return hasAuthenticatedAccount ? null : calculateRunCandyRewards(summary);
  }, [completedRunSnapshot, hasAuthenticatedAccount, serverProgression, summary]);

  useEffect(() => {
    if (summary) playSFX(summary.won ? 'victory' : 'defeat');
  }, [summary?.won]);

  function handleNewRun() {
    playUIClick();
    navigate(ROUTES.STARTER_SELECT);
  }

  function handleMenu() {
    playUIClick();
    navigate(ROUTES.MENU);
  }

  function handleRetrySave() {
    playUIClick();
    setIsErrorVisible(true);
    void useRunStore
      .getState()
      .endRun(summary?.won ?? false, completedRunSnapshot?.runId ?? activeRunId, summary);
  }

  const runLevel = summary?.runLevel ?? 1;
  const totalWavesCompleted = summary?.wavesCompleted ?? 0;
  const biomesCount = summary?.biomesVisited?.length ?? 0;
  const championCount =
    completedRunSnapshot?.teamMembers.length ?? summary?.championStats?.length ?? 0;
  const totalKills = summary?.totalKills ?? 0;
  const totalDamage = summary?.totalDamage ?? 0;
  const totalAssists = summary?.championStats.reduce((sum, stats) => sum + stats.assists, 0) ?? 0;
  const totalHealing =
    summary?.championStats.reduce((sum, stats) => sum + stats.healingDone, 0) ?? 0;
  const totalShielding =
    summary?.championStats.reduce((sum, stats) => sum + stats.shieldingDone, 0) ?? 0;
  const goldEarned = summary?.goldEarned ?? 0;
  const isBusy = saveStatus === 'saving' || saveStatus === 'retrying';
  const isRetryableSaveError = saveStatus === 'failed' && saveFailureKind !== 'terminal';

  if (!summary) {
    return (
      <PageShell width="narrow" centered>
        <StateView kind="empty" title={fr.gameOver.missingTitle}>
          {fr.gameOver.missingDetail}
        </StateView>
        <Button onClick={handleMenu}>{fr.gameOver.mainMenu}</Button>
      </PageShell>
    );
  }

  return (
    <main className="game-over-page" style={containerStyle}>
      <div className="game-over-card" style={cardStyle}>
        <h1
          className={summary?.won ? 'game-over-title--victory' : 'game-over-title--defeat'}
          style={{ fontSize: 36, marginBottom: 8 }}
        >
          {summary?.won ? fr.gameOver.victory : fr.gameOver.defeat}
        </h1>
        <p style={{ color: '#8b949e', marginBottom: 24, fontSize: 14 }}>{fr.gameOver.ended}</p>

        {isBusy && (
          <p role="status" style={savingStyle}>
            {saveStatus === 'retrying' ? fr.gameOver.retrying : fr.gameOver.saving}
          </p>
        )}
        {saveStatus === 'saved' && (
          <p role="status" style={successStyle}>
            {serverProgression ? fr.gameOver.verifiedSaved : fr.gameOver.saved}
          </p>
        )}
        {saveStatus === 'failed' && isErrorVisible && (
          <div role="alert" style={errorStyle}>
            <div>
              {saveFailureKind === 'terminal'
                ? `${fr.gameOver.rejected} : ${saveError}`
                : `${fr.gameOver.verificationPending} : ${saveError}`}
            </div>
            {isRetryableSaveError && (
              <button style={retryBtnStyle} onClick={handleRetrySave}>
                {fr.gameOver.retryVerification}
              </button>
            )}
            <button style={retryBtnStyle} onClick={() => setIsErrorVisible(false)}>
              {fr.common.close}
            </button>
          </div>
        )}

        <div className="game-over-stats" style={statsGridStyle}>
          <StatBlock label={fr.gameOver.levelReached} value={runLevel} />
          <StatBlock label={fr.gameOver.wavesCompleted} value={totalWavesCompleted} />
          <StatBlock label={fr.gameOver.biomesVisited} value={biomesCount} />
          <StatBlock label={fr.gameOver.teamSize} value={championCount} />
          <StatBlock label={fr.gameOver.totalKills} value={totalKills} />
          <StatBlock label={fr.gameOver.assists} value={totalAssists} />
          <StatBlock label={fr.gameOver.totalDamage} value={totalDamage} />
          <StatBlock label={fr.gameOver.healing} value={totalHealing} />
          <StatBlock label={fr.gameOver.shielding} value={totalShielding} />
          <StatBlock label={fr.gameOver.goldEarned} value={goldEarned} />
          <StatBlock label={fr.gameOver.goldSpent} value={summary?.goldSpent ?? 0} />
          <StatBlock label={fr.gameOver.goldBalance} value={summary?.goldBalance ?? 0} />
        </div>

        {summary?.championStats && summary.championStats.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                color: '#c8aa6e',
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              {fr.gameOver.championStats}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {summary.championStats.map((cs) => (
                <div
                  key={cs.championId}
                  className="game-over-champion-row"
                  style={championRowStyle}
                >
                  <span style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600 }}>
                    {cs.championId}
                  </span>
                  <span style={{ color: '#8b949e', fontSize: 12 }}>
                    K: {cs.kills} · A: {cs.assists} · Dmg: {cs.totalDamage} · Heal: {cs.healingDone}{' '}
                    · Shield: {cs.shieldingDone}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {rewards && (
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                color: '#c8aa6e',
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              {fr.gameOver.rewards}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 8 }}>
              <span style={{ color: '#fbbf24', fontSize: 16, fontWeight: 700 }}>
                🍬 {plural(rewards.total, 'bonbon')}
              </span>
            </div>
            {Object.keys(rewards.byChampion).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Object.entries(rewards.byChampion).map(
                  ([id, candies]) =>
                    candies > 0 && (
                      <div key={id} className="game-over-champion-row" style={championRowStyle}>
                        <span style={{ color: '#e6edf3', fontSize: 13 }}>{id}</span>
                        <span style={{ color: '#a78bfa', fontSize: 12 }}>
                          +{plural(candies, 'bonbon')}
                        </span>
                      </div>
                    ),
                )}
              </div>
            )}
            {serverProgression && (
              <div data-testid="server-progression" style={progressionMetadataStyle}>
                Progression v{serverProgression.progressionVersion} · {fr.gameOver.verified}
              </div>
            )}
          </div>
        )}

        <div className="game-over-actions" style={actionsStyle}>
          <button
            style={primaryBtnStyle}
            onClick={handleNewRun}
            disabled={isBusy || isRetryableSaveError}
          >
            {fr.gameOver.newRun}
          </button>
          <button style={secondaryBtnStyle} onClick={handleMenu} disabled={isBusy}>
            {fr.gameOver.mainMenu}
          </button>
        </div>
      </div>
    </main>
  );
}

function StatBlock({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={statBlockStyle}>
      <div style={{ color: '#8b949e', fontSize: 11, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: '#c8aa6e', fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  minHeight: '100dvh',
  background: '#0d1117',
  color: '#e6edf3',
  fontFamily: 'sans-serif',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const cardStyle: React.CSSProperties = {
  background: '#161b22',
  border: '1px solid #1e2a3a',
  borderRadius: 12,
  padding: 40,
  textAlign: 'center',
  maxWidth: 520,
  width: '90%',
};

const statsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 16,
  marginBottom: 32,
};

const statBlockStyle: React.CSSProperties = {
  background: '#0d1117',
  borderRadius: 8,
  padding: 12,
};

const championRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: '#0d1117',
  borderRadius: 6,
  padding: '6px 12px',
};

const progressionMetadataStyle: React.CSSProperties = {
  color: '#8b949e',
  fontSize: 11,
  marginTop: 10,
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  justifyContent: 'center',
};

const savingStyle: React.CSSProperties = {
  color: '#c8aa6e',
  marginBottom: 20,
};

const successStyle: React.CSSProperties = {
  color: '#4ade80',
  marginBottom: 20,
};

const errorStyle: React.CSSProperties = {
  color: '#fca5a5',
  background: '#3f1518',
  border: '1px solid #7f1d1d',
  borderRadius: 8,
  padding: 12,
  marginBottom: 20,
};

const retryBtnStyle: React.CSSProperties = {
  marginTop: 10,
  padding: '8px 16px',
  background: '#ef4444',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '12px 32px',
  background: '#c8aa6e',
  color: '#0d1117',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '12px 32px',
  background: '#21262d',
  color: '#e6edf3',
  border: '1px solid #30363d',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
