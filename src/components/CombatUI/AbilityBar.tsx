import React from 'react';
import type { CombatantInfo } from '../../stores/battleStore';
import { useSettingsStore, scaleFontSize } from '../../stores/settingsStore';
import { SpellTooltip } from './SpellTooltip';

interface Props {
  champion: CombatantInfo;
  onCast?: (slot: 'Q' | 'W' | 'E' | 'R') => void;
}

const SLOTS: Array<'Q' | 'W' | 'E' | 'R'> = ['Q', 'W', 'E', 'R'];

export const AbilityBar: React.FC<Props> = ({ champion, onCast }) => {
  const textSize = useSettingsStore(s => s.textSize);

  const handleClick = (slot: 'Q' | 'W' | 'E' | 'R') => {
    const spell = champion.spells.find(s => s.slot === slot);
    if (!spell || !spell.isReady) return;
    onCast?.(slot);
  };

  const slotLabelSize = scaleFontSize(9, textSize);
  const costLabelSize = scaleFontSize(7, textSize);
  const cdLabelSize = scaleFontSize(18, textSize);
  const nameSize = scaleFontSize(11, textSize);

  return (
    <div
      role="toolbar"
      aria-label="Spell abilities"
      style={{
        display: 'flex',
        gap: 10,
        padding: '10px 14px',
        background: 'rgba(10,10,26,0.92)',
        borderRadius: 10,
        border: '1px solid #333355',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}
    >
      {SLOTS.map(slot => {
        const spell = champion.spells.find(s => s.slot === slot);
        const cd = spell?.cooldownCurrent ?? 0;
        const onCooldown = cd > 0;
        const disabled = !spell || onCooldown;
        const isUlt = slot === 'R';

        const slotButton = (
          <button
            key={slot}
            onClick={() => handleClick(slot)}
            disabled={disabled}
            aria-label={`Spell ${slot}${spell ? `: ${spell.name}` : ''}${onCooldown ? ` (${cd}s cooldown)` : ''}${spell && !spell.isReady ? ' on cooldown' : ' ready'}`}
            aria-keyshortcuts={slot}
            style={{
              position: 'relative',
              width: 52,
              height: 52,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.45 : 1,
              background: 'none',
              border: 'none',
              padding: 0,
              outline: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -8,
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#1a1a2e',
                color: '#ffd700',
                fontSize: slotLabelSize,
                fontWeight: 'bold',
                padding: '1px 5px',
                borderRadius: 3,
                border: '1px solid #333355',
                zIndex: 3,
              }}
            >
              {slot}
            </div>
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 7,
                overflow: 'hidden',
                border: `2px solid ${disabled ? '#333' : isUlt ? '#ffd700' : '#555'}`,
                boxShadow: isUlt && !disabled ? '0 0 8px rgba(255,215,0,0.3)' : 'none',
                background: isUlt ? 'linear-gradient(135deg,#4a3728,#2a1f18)' : 'linear-gradient(135deg,#1a2a3a,#0f1520)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: nameSize,
                color: '#aaa',
              }}
            >
              {spell ? spell.name.substring(0, 3) : '-'}
            </div>
            {onCooldown && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.7)',
                  borderRadius: 7,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: cdLabelSize,
                  fontWeight: 'bold',
                  color: '#fff',
                  zIndex: 2,
                }}
              >
                {cd}
              </div>
            )}
            {spell && spell.cost > 0 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 1,
                  right: 2,
                  fontSize: costLabelSize,
                  color: '#3b82f6',
                  fontWeight: 'bold',
                  textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                  zIndex: 2,
                }}
              >
                {spell.cost}
              </div>
            )}
          </button>
        );

        if (spell) {
          return (
            <SpellTooltip key={slot} spell={spell}>
              {slotButton}
            </SpellTooltip>
          );
        }
        return slotButton;
      })}
    </div>
  );
};
