import { useRunStore } from '@/stores/runStore';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';
import { playSFX, playUIClick } from '@/audio';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { RunSummary } from '@/types/run';

export function GameOverPage() {
  const isActive = useRunStore((s) => s.isActive);
  const navigate = useAppNavigate();
  const location = useLocation();
  const summary: RunSummary | undefined = (location.state as { summary?: RunSummary } | null)?.summary;

  useEffect(() => {
    playSFX('defeat');
  }, []);

  function handleNewRun() {
    playUIClick();
    useRunStore.getState().endRun();
    navigate(ROUTES.STARTER_SELECT);
  }

  function handleMenu() {
    playUIClick();
    useRunStore.getState().endRun();
    navigate(ROUTES.MENU);
  }

  const runLevel = summary?.runLevel ?? 1;
  const totalWavesCompleted = summary?.wavesCompleted ?? 0;
  const biomesCount = summary?.biomesVisited?.length ?? 0;
  const championCount = summary?.championStats?.length ?? 0;
  const totalKills = summary?.totalKills ?? 0;
  const totalDamage = summary?.totalDamage ?? 0;
  const goldEarned = summary?.goldEarned ?? 0;

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ color: '#ef4444', fontSize: 36, marginBottom: 8 }}>
          {summary?.won ? 'Victory!' : 'Game Over'}
        </h1>
        <p style={{ color: '#8b949e', marginBottom: 24, fontSize: 14 }}>
          Your run has come to an end.
        </p>

        <div style={statsGridStyle}>
          <StatBlock label="Level Reached" value={runLevel} />
          <StatBlock label="Waves Completed" value={totalWavesCompleted} />
          <StatBlock label="Biomes Visited" value={biomesCount} />
          <StatBlock label="Team Size" value={championCount} />
          <StatBlock label="Total Kills" value={totalKills} />
          <StatBlock label="Total Damage" value={totalDamage} />
          <StatBlock label="Gold Earned" value={goldEarned} />
        </div>

        {summary?.championStats && summary.championStats.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ color: '#c8aa6e', fontSize: 13, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Champion Stats
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {summary.championStats.map((cs) => (
                <div key={cs.championId} style={championRowStyle}>
                  <span style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600 }}>{cs.championId}</span>
                  <span style={{ color: '#8b949e', fontSize: 12 }}>
                    Kills: {cs.kills} · Dmg: {cs.totalDamage}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={actionsStyle}>
          <button style={primaryBtnStyle} onClick={handleNewRun}>
            New Run
          </button>
          <button style={secondaryBtnStyle} onClick={handleMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
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
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
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

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  justifyContent: 'center',
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
