import { useEffect, useRef } from 'react';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';
import { useRunStore } from '@/stores/runStore';

export function CombatPage() {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const isActive = useRunStore((s) => s.isActive);
  const navigate = useAppNavigate();

  useEffect(() => {
    // If no active run, redirect to starter select
    if (!isActive) {
      navigate(ROUTES.STARTER_SELECT);
    }
  }, [isActive, navigate]);

  if (!isActive) {
    return null;
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <button style={backBtnStyle} onClick={() => navigate(ROUTES.RUN)}>
          ← Back to Map
        </button>
        <span style={{ color: '#c8aa6e', fontWeight: 700 }}>Combat</span>
      </div>
      <div ref={gameContainerRef} style={gameAreaStyle}>
        <div style={placeholderStyle}>
          <h2 style={{ color: '#c8aa6e', marginBottom: 16 }}>Combat Zone</h2>
          <p style={{ color: '#8b949e' }}>Phaser combat will render here.</p>
        </div>
      </div>
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
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '8px 16px',
  background: '#161b22',
  borderBottom: '1px solid #1e2a3a',
  flexShrink: 0,
};

const backBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: '#21262d',
  color: '#e6edf3',
  border: '1px solid #30363d',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
};

const gameAreaStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const placeholderStyle: React.CSSProperties = {
  textAlign: 'center',
};
