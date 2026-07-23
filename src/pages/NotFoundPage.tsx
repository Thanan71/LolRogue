import { playUIClick } from '@/audio';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useAuthStore } from '@/stores/authStore';
import { ROUTES } from '@/stores/routerStore';

export function NotFoundPage() {
  const navigate = useAppNavigate();
  const canEnterGame = useAuthStore((state) => state.isAuthenticated || state.isGuest);

  return (
    <main style={containerStyle}>
      <div style={codeStyle}>404</div>
      <h1 style={titleStyle}>Route not found</h1>
      <p style={messageStyle}>This path does not lead to any known corner of the Rift.</p>
      <button
        style={buttonStyle}
        onClick={() => {
          playUIClick();
          navigate(canEnterGame ? ROUTES.MENU : ROUTES.AUTH);
        }}
      >
        {canEnterGame ? 'Return to menu' : 'Go to login'}
      </button>
    </main>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  textAlign: 'center',
  background: 'radial-gradient(circle at top, #17243a, #07111f 60%)',
  color: '#e6edf3',
};

const codeStyle: React.CSSProperties = {
  color: '#c8aa6e',
  fontSize: 'clamp(5rem, 18vw, 10rem)',
  fontWeight: 800,
  lineHeight: 0.9,
};

const titleStyle: React.CSSProperties = { margin: '1.5rem 0 0.5rem' };
const messageStyle: React.CSSProperties = { color: '#8b949e', marginBottom: '1.5rem' };
const buttonStyle: React.CSSProperties = {
  border: '1px solid #c8aa6e',
  borderRadius: 6,
  padding: '0.75rem 1.25rem',
  background: '#c8aa6e',
  color: '#07111f',
  fontWeight: 700,
  cursor: 'pointer',
};
