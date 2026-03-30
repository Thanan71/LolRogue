import { useCallback } from 'react';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';
import { useRunStore } from '@/stores/runStore';
import { playUIClick } from '@/audio';

export function EventPage() {
  const isActive = useRunStore(s => s.isActive);
  const navigate = useAppNavigate();

  const handleContinue = useCallback(() => {
    playUIClick();
    useRunStore.getState().resolveEncounter();
    navigate(ROUTES.RUN);
  }, [navigate]);

  if (!isActive) return null;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ color: '#f97316', fontWeight: 700, fontSize: 20 }}>Event</span>
      </div>
      <div style={contentStyle}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>?</div>
        <div style={{ fontSize: 18, color: '#c8aa6e', marginBottom: 8 }}>A mysterious encounter...</div>
        <div style={{ color: '#8b949e', marginBottom: 24 }}>
          You stumble upon something unexpected on your path. The outcome is uncertain.
        </div>
        <button style={btnStyle} onClick={handleContinue}>Continue</button>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: '#0d1117', color: '#e6edf3',
  fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '12px 24px', background: '#161b22', borderBottom: '1px solid #1e2a3a',
};

const contentStyle: React.CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', padding: 40,
};

const btnStyle: React.CSSProperties = {
  padding: '12px 32px', background: '#f97316', color: '#fff',
  border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer',
};
