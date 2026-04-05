import React from 'react';
import type { CombatantInfo } from '../../stores/battleStore';

interface Props {
  combatant: CombatantInfo;
  isActive: boolean;
  enhancementBonuses?: string[];
}

export const CombatantPortrait: React.FC<Props> = ({ combatant, isActive, enhancementBonuses }) => {
  const { name, level, currentHp, maxHp, currentMp, maxMp, iconUrl, isDefeated, side } = combatant;
  const hpPct = maxHp > 0 ? (currentHp / maxHp) * 100 : 0;
  const mpPct = maxMp > 0 ? (currentMp / maxMp) * 100 : 0;
  const hpColor = side === 'player' ? '#22c55e' : '#ef4444';
  const borderCol = side === 'player' ? '#3b82f6' : '#ef4444';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      opacity: isDefeated ? 0.3 : 1,
      transform: isActive ? 'scale(1.05)' : 'scale(1)',
      transition: 'transform 0.2s, opacity 0.3s',
      padding: 4, borderRadius: 8,
      background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
    }}>
      <div style={{
        position: 'relative', width: 44, height: 44, borderRadius: 6,
        overflow: 'hidden', border: `2px solid ${isActive ? '#ffd700' : borderCol}`,
        boxShadow: isActive ? '0 0 8px rgba(255,215,0,0.4)' : 'none', flexShrink: 0,
      }}>
        {iconUrl ? (
          <img src={iconUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${borderCol}44, ${borderCol}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 'bold', color: '#fff' }}>{name.substring(0, 2).toUpperCase()}</div>
        )}
        <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'rgba(0,0,0,0.8)', color: '#ffd700', fontSize: 8, fontWeight: 'bold', padding: '1px 3px', borderRadius: '3px 0 0 0' }}>{level}</div>
        {isDefeated && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', fontSize: 20, color: '#f00', fontWeight: 'bold' }}>&#10005;</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110 }}>
        <div style={{ fontSize: 11, fontWeight: 'bold', color: isActive ? '#ffd700' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{name}</div>
        <div style={{ position: 'relative' }}>
          <div style={{ width: 110, height: 7, background: '#1a1a2e', borderRadius: 3, overflow: 'hidden', border: '1px solid #333355' }}>
            <div style={{ width: `${hpPct}%`, height: '100%', background: hpColor, borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 'bold', color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{Math.round(currentHp)} / {Math.round(maxHp)}</div>
        </div>
        {maxMp > 0 && (
          <div style={{ position: 'relative' }}>
            <div style={{ width: 110, height: 4, background: '#1a1a2e', borderRadius: 2, overflow: 'hidden', border: '1px solid #333355' }}>
              <div style={{ width: `${mpPct}%`, height: '100%', background: '#3b82f6', borderRadius: 1, transition: 'width 0.3s' }} />
            </div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 'bold', color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{Math.round(currentMp)} / {Math.round(maxMp)}</div>
          </div>
        )}
        {enhancementBonuses && enhancementBonuses.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
            {enhancementBonuses.slice(0, 3).map((bonus, i) => (
              <span key={i} style={{
                fontSize: 7,
                padding: '1px 3px',
                background: 'rgba(200,170,110,0.2)',
                color: '#c8aa6e',
                borderRadius: 2,
                border: '1px solid rgba(200,170,110,0.3)',
              }}>
                {bonus}
              </span>
            ))}
            {enhancementBonuses.length > 3 && (
              <span style={{ fontSize: 7, color: '#888' }}>+{enhancementBonuses.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
