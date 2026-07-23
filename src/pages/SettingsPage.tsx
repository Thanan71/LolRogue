import { playUIClick } from '@/audio';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useAudioStore } from '@/stores/audioStore';
import { ROUTES } from '@/stores/routerStore';
import {
  type BattleSpeed,
  type Difficulty,
  type TextSize,
  useSettingsStore,
} from '@/stores/settingsStore';
import '@/styles/main-menu.css';

export function SettingsPage() {
  const navigate = useAppNavigate();
  const sfxVolume = useAudioStore((s) => s.sfxVolume);
  const setSfxVolume = useAudioStore((s) => s.setSfxVolume);
  const sfxMuted = useAudioStore((s) => s.sfxMuted);
  const toggleSfxMute = useAudioStore((s) => s.toggleSfxMute);
  const {
    difficulty,
    particlesEnabled,
    textSize,
    battleSpeed,
    setDifficulty,
    setParticlesEnabled,
    setTextSize,
    setBattleSpeed,
  } = useSettingsStore();

  return (
    <div className="main-menu">
      <div className="main-menu__logo-section">
        <h1 className="main-menu__title" style={{ fontSize: '2.5rem' }}>
          Settings
        </h1>
        <p className="main-menu__subtitle">Game configuration</p>
      </div>

      <div className="main-menu__divider" />

      <div style={{ position: 'relative', zIndex: 2, width: 360, maxWidth: '90%' }}>
        <div style={settingRowStyle}>
          <label htmlFor="sfx-volume" style={labelStyle}>
            SFX Volume
          </label>
          <input
            id="sfx-volume"
            type="range"
            min="0"
            max="100"
            value={sfxVolume}
            onChange={(e) => setSfxVolume(Number(e.target.value))}
            style={sliderStyle}
            aria-valuetext={`${sfxVolume}%`}
          />
          <button style={muteButtonStyle} onClick={toggleSfxMute} aria-pressed={sfxMuted}>
            {sfxMuted ? 'Unmute' : 'Mute'}
          </button>
        </div>

        <div style={settingRowStyle}>
          <label htmlFor="difficulty" style={labelStyle}>
            Difficulty
          </label>
          <select
            id="difficulty"
            style={selectStyle}
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as Difficulty)}
          >
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <div style={settingRowStyle}>
          <span id="particles-label" style={labelStyle}>
            Particles
          </span>
          <label style={toggleLabelStyle}>
            <input
              type="checkbox"
              checked={particlesEnabled}
              onChange={(event) => setParticlesEnabled(event.target.checked)}
              style={checkboxStyle}
              aria-labelledby="particles-label"
            />
            <span
              style={{
                ...toggleTrackStyle,
                background: particlesEnabled ? '#3a664f' : '#1a2a42',
              }}
            >
              <span
                style={{
                  ...toggleThumbStyle,
                  left: particlesEnabled ? 22 : 2,
                }}
              />
            </span>
          </label>
        </div>

        <div style={settingRowStyle}>
          <label htmlFor="text-size" style={labelStyle}>
            Text Size
          </label>
          <select
            id="text-size"
            style={selectStyle}
            value={textSize}
            onChange={(event) => setTextSize(event.target.value as TextSize)}
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </div>

        <div style={settingRowStyle}>
          <label htmlFor="battle-speed" style={labelStyle}>
            Battle Speed
          </label>
          <select
            id="battle-speed"
            style={selectStyle}
            value={battleSpeed}
            onChange={(event) => setBattleSpeed(Number(event.target.value) as BattleSpeed)}
          >
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={3}>3×</option>
          </select>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 2, marginTop: '2rem' }}>
        <button
          className="main-menu__btn main-menu__btn--ghost"
          onClick={() => {
            playUIClick();
            navigate(ROUTES.MENU);
          }}
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

const muteButtonStyle: React.CSSProperties = {
  ...selectStyle,
  minWidth: 76,
};
