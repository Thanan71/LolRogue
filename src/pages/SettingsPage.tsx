import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';
import { useAudioStore } from '@/stores/audioStore';
import { playUIClick } from '@/audio';
import '@/styles/main-menu.css';

export function SettingsPage() {
  const navigate = useAppNavigate();
  const sfxVolume = useAudioStore((s) => s.sfxVolume);
  const musicVolume = useAudioStore((s) => s.musicVolume);
  const setSfxVolume = useAudioStore((s) => s.setSfxVolume);
  const setMusicVolume = useAudioStore((s) => s.setMusicVolume);

  return (
    <div className="main-menu">
      <div className="main-menu__logo-section">
        <h1 className="main-menu__title" style={{ fontSize: '2.5rem' }}>Settings</h1>
        <p className="main-menu__subtitle">Game configuration</p>
      </div>

      <div className="main-menu__divider" />

      <div style={{ position: 'relative', zIndex: 2, width: 360, maxWidth: '90%' }}>
        <div style={settingRowStyle}>
          <span style={labelStyle}>Music Volume</span>
          <input
            type="range"
            min="0"
            max="100"
            value={musicVolume}
            onChange={(e) => setMusicVolume(Number(e.target.value))}
            style={sliderStyle}
          />
        </div>

        <div style={settingRowStyle}>
          <span style={labelStyle}>SFX Volume</span>
          <input
            type="range"
            min="0"
            max="100"
            value={sfxVolume}
            onChange={(e) => setSfxVolume(Number(e.target.value))}
            style={sliderStyle}
          />
        </div>

        <div style={settingRowStyle}>
          <span style={labelStyle}>Difficulty</span>
          <select style={selectStyle} defaultValue="normal">
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <div style={settingRowStyle}>
          <span style={labelStyle}>Particles</span>
          <label style={toggleLabelStyle}>
            <input type="checkbox" defaultChecked style={checkboxStyle} />
            <span style={toggleTrackStyle}>
              <span style={toggleThumbStyle} />
            </span>
          </label>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 2, marginTop: '2rem' }}>
        <button
          className="main-menu__btn main-menu__btn--ghost"
          onClick={() => { playUIClick(); navigate(ROUTES.MENU); }}
          style={{ width: 200 }}
        >
          Back to Menu
        </button>
      </div>
    </div>
  );
}

/* Inline styles for settings controls */
const settingRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '1rem 0',
  borderBottom: '1px solid rgba(200,170,110,0.1)',
};

const labelStyle: React.CSSProperties = {
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: '0.9rem',
  color: '#c8aa6e',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};

const sliderStyle: React.CSSProperties = {
  width: 140,
  accentColor: '#c8aa6e',
  cursor: 'pointer',
};

const selectStyle: React.CSSProperties = {
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: '0.85rem',
  background: '#0f1a2e',
  color: '#c8aa6e',
  border: '1px solid #c8aa6e33',
  borderRadius: 4,
  padding: '0.4rem 0.8rem',
  cursor: 'pointer',
  outline: 'none',
};

const toggleLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
};

const checkboxStyle: React.CSSProperties = {
  display: 'none',
};

const toggleTrackStyle: React.CSSProperties = {
  width: 44,
  height: 24,
  borderRadius: 12,
  background: '#1a2a42',
  position: 'relative',
  transition: 'background 0.3s',
};

const toggleThumbStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: '50%',
  background: '#c8aa6e',
  position: 'absolute',
  top: 2,
  left: 2,
  transition: 'left 0.3s',
};
