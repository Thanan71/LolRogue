import { useRunStore } from '@/stores/runStore';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';

export function GameOverPage() {
  const isActive = useRunStore((s) => s.isActive);
  const team = useRunStore((s) => s.team);
  const biomesVisited = useRunStore((s) => s.biomesVisited);
  const totalWavesCompleted = useRunStore((s) => s.totalWavesCompleted);
  const gold = useRunStore((s) => s.gold);
  const runLevel = useRunStore((s) => s.runLevel);
  const endRun = useRunStore((s) => s.endRun);
  const navigate = useAppNavigate();

  function handleNewRun() {
    endRun();
    navigate(ROUTES.STARTER_SELECT);
  }

  function handleMenu() {
    endRun();
    navigate(ROUTES.MENU);
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ color: '#ef4444', fontSize: 36, marginBottom: 8 }}>
          {isActive ? 'Game Over' : 'Run Ended'}
        </h1>
        <p style={{ color: '#8b949e', marginBottom: 24, fontSize: 14 }}>
          Your run has come to an end.
        </p>

        <div style={statsGridStyle}>
          <StatBlock label="Level Reached" value={runLevel} />
          <StatBlock label="Waves Completed" value={totalWavesCompleted} />
          <StatBlock label="Biomes Visited" value={biomesVisited.length} />
          <StatBlock label="Team Size" value={team.length} />
          <StatBlock label="Gold Earned" value={gold} />
        </div>

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
  maxWidth: 480,
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
