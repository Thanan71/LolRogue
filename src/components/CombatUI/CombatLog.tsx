import type React from 'react';
import { useEffect, useRef } from 'react';
import { useBattleStore } from '../../stores/battleStore';

const colors: Record<string, string> = {
  damage: '#ff4444',
  defeat: '#ff0000',
  turn_start: '#ffd700',
  round_start: '#c8aa6e',
  battle_end: '#22c55e',
  action: '#8b949e',
  info: '#aaa',
  heal: '#22c55e',
  shield: '#60a5fa',
  revive: '#a78bfa',
};

const icons: Record<string, string> = {
  damage: '\u2694',
  defeat: '\u2716',
  turn_start: '\u25B6',
  round_start: '\u2605',
  battle_end: '\u2605',
  action: '\u2022',
  info: '\u2022',
  heal: '\u2764',
  shield: '\uD83D\uDEE1',
  revive: '\u2728',
};

export const CombatLog: React.FC = () => {
  const log = useBattleStore((s) => s.log);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  const recent = log.slice(-12);

  return (
    <div
      style={{
        background: 'rgba(10,10,26,0.92)',
        borderRadius: 7,
        border: '1px solid #333355',
        padding: 6,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 'bold',
          color: '#ffd700',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 3,
          paddingLeft: 4,
        }}
      >
        Combat Log
      </div>
      <div style={{ flex: 1, overflowY: 'auto', fontSize: 10, lineHeight: 1.4 }}>
        {recent.length === 0 ? (
          <div style={{ color: '#555', fontStyle: 'italic', padding: 3 }}>
            Le combat n'a pas encore commenc&eacute;...
          </div>
        ) : (
          recent.map((e) => (
            <div
              key={e.id}
              style={{
                padding: '1px 3px',
                color: colors[e.type] || '#fff',
                borderLeft: `2px solid ${colors[e.type] || '#fff'}33`,
                paddingLeft: 6,
                marginBottom: 1,
              }}
            >
              <span style={{ marginRight: 5, opacity: 0.6 }}>{icons[e.type] || '\u2022'}</span>
              {e.message}
              {e.isCrit && (
                <span style={{ color: '#ff6b6b', fontWeight: 'bold', marginLeft: 3, fontSize: 9 }}>
                  CRIT!
                </span>
              )}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
};
