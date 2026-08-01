import type { CSSProperties } from 'react';

export const containerStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  minHeight: '100dvh',
  height: '100dvh',
  background: '#0d1117',
  color: '#e6edf3',
  fontFamily: 'sans-serif',
  display: 'flex',
  flexDirection: 'column',
};

export const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '8px 16px',
  background: '#161b22',
  borderBottom: '1px solid #1e2a3a',
  flexShrink: 0,
};

export const backBtnStyle: CSSProperties = {
  padding: '6px 12px',
  background: '#21262d',
  color: '#e6edf3',
  border: '1px solid #30363d',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
};

export const mainStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  gap: 8,
  padding: 8,
  overflow: 'hidden',
};

export const leftPanelStyle: CSSProperties = {
  width: 220,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  background: '#161b22',
  borderRadius: 8,
  border: '1px solid #30363d',
  padding: 8,
  overflow: 'auto',
};

export const rightPanelStyle: CSSProperties = { ...leftPanelStyle };

export const centerStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
};

export const teamTitleStyle = (color: string): CSSProperties => ({
  fontSize: 11,
  fontWeight: 'bold',
  color,
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginBottom: 4,
  paddingBottom: 4,
  borderBottom: '1px solid #30363d',
});

export const emptyStyle: CSSProperties = {
  fontSize: 12,
  color: '#555',
  textAlign: 'center',
  padding: 20,
};

export const arenaPlaceholderStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#161b22',
  borderRadius: 8,
  border: '1px solid #30363d',
};

export const nextTurnBtnStyle: CSSProperties = {
  padding: '8px 20px',
  background: '#c89033',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 'bold',
  cursor: 'pointer',
};

export const nextBtnStyle: CSSProperties = {
  padding: '10px 24px',
  background: '#22c55e',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 'bold',
  cursor: 'pointer',
};

export const backBtnStyle2: CSSProperties = {
  padding: '10px 24px',
  background: '#21262d',
  color: '#e6edf3',
  border: '1px solid #30363d',
  borderRadius: 6,
  fontSize: 14,
  cursor: 'pointer',
};

export const bottomStyle: CSSProperties = {
  height: 220,
  display: 'flex',
  flexDirection: 'column',
  padding: '0 8px 8px',
  flexShrink: 0,
};
