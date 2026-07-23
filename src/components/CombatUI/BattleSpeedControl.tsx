import type React from 'react';
import { type BattleSpeed, useSettingsStore } from '../../stores/settingsStore';

export const BattleSpeedControl: React.FC = () => {
  const speed = useSettingsStore((s) => s.battleSpeed);
  const setSpeed = useSettingsStore((s) => s.setBattleSpeed);

  const speeds: BattleSpeed[] = [1, 2, 3];

  return (
    <div
      role="radiogroup"
      aria-label="Battle speed"
      style={{
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        background: 'rgba(10,10,26,0.8)',
        borderRadius: 6,
        padding: '3px 6px',
        border: '1px solid #333355',
      }}
    >
      <span style={{ fontSize: 10, color: '#888', marginRight: 4, fontWeight: 'bold' }}>⚡</span>
      {speeds.map((s) => (
        <button
          key={s}
          onClick={() => setSpeed(s)}
          role="radio"
          aria-checked={speed === s}
          aria-label={`Speed ${s}x`}
          style={{
            padding: '2px 8px',
            background: speed === s ? '#c89033' : 'transparent',
            color: speed === s ? '#fff' : '#888',
            border: speed === s ? '1px solid #ffd700' : '1px solid transparent',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: speed === s ? 'bold' : 'normal',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {s}x
        </button>
      ))}
    </div>
  );
};
