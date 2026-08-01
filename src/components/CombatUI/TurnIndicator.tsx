import type React from 'react';
import { fr } from '@/i18n/fr';
import type { CombatantInfo } from '../../stores/battleStore';

interface Props {
  champion: CombatantInfo | undefined;
  side: 'player' | 'enemy' | null;
}

export const TurnIndicator: React.FC<Props> = ({ champion, side }) => {
  if (!champion || !side) {
    return (
      <div
        style={{
          padding: '5px 14px',
          background: 'rgba(26,26,46,0.9)',
          borderRadius: 7,
          border: '1px solid #333355',
          fontSize: 12,
          color: '#aaa',
        }}
      >
        {fr.combat.waiting}
      </div>
    );
  }

  const color = side === 'player' ? '#3b82f6' : '#ef4444';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 14px',
        background: 'rgba(26,26,46,0.9)',
        borderRadius: 7,
        border: `1px solid ${color}55`,
        boxShadow: `0 0 12px ${color}33`,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}`,
        }}
      />
      <div>
        <div style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>
          {side === 'player' ? fr.combat.yourTurn : fr.combat.enemy}
        </div>
        <div style={{ fontSize: 13, fontWeight: 'bold', color }}>{champion.name}</div>
      </div>
    </div>
  );
};
