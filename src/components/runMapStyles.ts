import type { CSSProperties } from 'react';

export const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: '#0d1117',
  color: '#e6edf3',
  fontFamily: 'sans-serif',
  overflow: 'hidden',
};
export const layoutStyle: CSSProperties = {
  display: 'flex',
  height: '100%',
  gap: 16,
  padding: 16,
  boxSizing: 'border-box',
};
export const sidebarStyle: CSSProperties = {
  width: 220,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  flexShrink: 0,
};
export const mainStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  overflowY: 'auto',
};
export const headerStyle: CSSProperties = {
  display: 'flex',
  gap: 20,
  alignItems: 'center',
  padding: '8px 16px',
  background: '#161b22',
  borderRadius: 8,
  marginBottom: 8,
  fontSize: 14,
  flexShrink: 0,
};
export const mapContainerStyle: CSSProperties = {
  flex: 1,
  minHeight: 320,
  overflow: 'auto',
  background: '#0d1117',
  borderRadius: 8,
  border: '1px solid #1e2a3a',
};
export const panelStyle: CSSProperties = {
  background: '#161b22',
  borderRadius: 8,
  border: '1px solid #1e2a3a',
  padding: 8,
  overflow: 'auto',
};
export const panelTitle: CSSProperties = {
  color: '#c8aa6e',
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 8,
  padding: '0 4px',
};
export const teamMemberStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  padding: 6,
  borderRadius: 6,
  background: '#0d1117',
  marginBottom: 4,
};
export const hpBarBg: CSSProperties = {
  width: '100%',
  height: 6,
  background: '#21262d',
  borderRadius: 3,
  marginTop: 2,
  marginBottom: 1,
};
export const hpBarFill: CSSProperties = {
  height: '100%',
  background: '#22c55e',
  borderRadius: 3,
  transition: 'width 0.3s',
};
export const inventoryItemStyle: CSSProperties = {
  padding: '4px 8px',
  background: '#0d1117',
  borderRadius: 4,
  marginBottom: 3,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};
export const btnStyle: CSSProperties = {
  padding: '10px 24px',
  background: '#c8aa6e',
  color: '#0d1117',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};
export const tooltipStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  background: '#1e2a3a',
  border: '1px solid #c8aa6e',
  borderRadius: 8,
  padding: 10,
  minWidth: 160,
  maxWidth: 220,
  zIndex: 100,
  boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
};
