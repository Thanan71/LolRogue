import { useCallback } from 'react';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';
import { useRunStore } from '@/stores/runStore';
import { playUIClick } from '@/audio';

export function ShopPage() {
  const isActive = useRunStore(s => s.isActive);
  const gold = useRunStore(s => s.gold);
  const navigate = useAppNavigate();

  const handleLeave = useCallback(() => {
    playUIClick();
    useRunStore.getState().resolveEncounter();
    navigate(ROUTES.RUN);
  }, [navigate]);

  if (!isActive) return null;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ color: '#facc15', fontWeight: 700, fontSize: 20 }}>Shop</span>
        <span style={{ color: '#ffd700', fontWeight: 700 }}>Gold: {gold}</span>
      </div>
      <div style={contentStyle}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>Shop</div>
        <div style={{ fontSize: 18, color: '#c8aa6e', marginBottom: 8 }}>Welcome to the Shop!</div>
        <div style={{ color: '#8b949e', marginBottom: 24 }}>
          The shopkeeper is preparing their wares. For now, you may rest here and continue your journey.
        </div>
        <button style={btnStyle} onClick={handleLeave}>Leave Shop</button>
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
  padding: '12px 32px', background: '#facc15', color: '#0d1117',
  border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer',
};
