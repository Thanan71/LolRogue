import { useRunStore } from '@/stores/runStore';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';
import { RunMapScreen } from '@/components/RunMapScreen';

export function RunPage() {
  const isActive = useRunStore((s) => s.isActive);
  const navigate = useAppNavigate();

  if (!isActive) {
    return (
      <div style={containerStyle}>
        <div style={centerStyle}>
          <h2 style={{ color: '#c8aa6e', fontSize: 24, marginBottom: 16 }}>No Active Run</h2>
          <p style={{ color: '#8b949e', marginBottom: 24 }}>Start a new run to begin your adventure.</p>
          <button style={btnStyle} onClick={() => navigate(ROUTES.STARTER_SELECT)}>
            Start New Run
          </button>
        </div>
      </div>
    );
  }

  return <RunMapScreen />;
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
};

const centerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
};

const btnStyle: React.CSSProperties = {
  padding: '10px 24px',
  background: '#c8aa6e',
  color: '#0d1117',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};
