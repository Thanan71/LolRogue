import type React from 'react';
import { useRef, useState } from 'react';
import type { SpellInfo } from '../../stores/battleStore';
import { scaleFontSize, useSettingsStore } from '../../stores/settingsStore';

interface Props {
  spell: SpellInfo;
  children: React.ReactNode;
}

export const SpellTooltip: React.FC<Props> = ({ spell, children }) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textSize = useSettingsStore((s) => s.textSize);

  const handleMouseEnter = (e: React.MouseEvent) => {
    setVisible(true);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  const handleMouseLeave = () => {
    setVisible(false);
    setPosition(null);
  };

  const smallFontSize = scaleFontSize(10, textSize);
  const titleFontSize = scaleFontSize(13, textSize);

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {children}
      {visible && position && (
        <div
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y - 8,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
            background: 'linear-gradient(180deg, #1a1a2e 0%, #0d0d1a 100%)',
            border: '1px solid #c8aa6e',
            borderRadius: 8,
            padding: '10px 14px',
            minWidth: 180,
            maxWidth: 260,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6), 0 0 12px rgba(200,170,110,0.15)',
            pointerEvents: 'none',
            fontFamily: "'Segoe UI', sans-serif",
          }}
        >
          {/* Spell name */}
          <div
            style={{
              fontSize: titleFontSize,
              fontWeight: 'bold',
              color: spell.slot === 'R' ? '#ffd700' : '#e6edf3',
              marginBottom: 6,
              borderBottom: '1px solid #333355',
              paddingBottom: 4,
            }}
          >
            {spell.name}
            <span
              style={{
                marginLeft: 6,
                fontSize: smallFontSize,
                color: '#888',
                fontWeight: 'normal',
              }}
            >
              [{spell.slot}]
            </span>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
            <div style={{ fontSize: smallFontSize, color: '#aaa' }}>
              <span style={{ color: '#3b82f6' }}>Mana:</span> {spell.cost}
            </div>
            <div style={{ fontSize: smallFontSize, color: '#aaa' }}>
              <span style={{ color: '#f59e0b' }}>CD:</span> {spell.cooldownMax}s
            </div>
          </div>

          {/* Status */}
          {!spell.isReady && (
            <div style={{ fontSize: smallFontSize, color: '#ef4444', marginTop: 4 }}>
              ⏳ Cooldown: {spell.cooldownCurrent}s restant(s)
            </div>
          )}
          {spell.isReady && (
            <div style={{ fontSize: smallFontSize, color: '#22c55e', marginTop: 4 }}>
              ✅ Prêt à lancer
            </div>
          )}

          {/* Keybind hint */}
          <div
            style={{
              marginTop: 6,
              paddingTop: 4,
              borderTop: '1px solid #222244',
              fontSize: scaleFontSize(9, textSize),
              color: '#555',
              textAlign: 'center',
            }}
          >
            Appuyez sur <kbd style={{ color: '#ffd700', fontWeight: 'bold' }}>{spell.slot}</kbd>{' '}
            pour lancer
          </div>
        </div>
      )}
    </div>
  );
};
