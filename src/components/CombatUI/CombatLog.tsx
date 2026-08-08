import type React from 'react';
import { useEffect, useRef } from 'react';
import { fr } from '@/i18n/fr';
import { useBattleStore } from '../../stores/battleStore';

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
    endRef.current?.scrollIntoView?.({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [log.length]);

  const recent = log.slice(-12);

  return (
    <div className="combat-log">
      <div className="combat-log__title">{fr.combat.log}</div>
      <div
        role="log"
        aria-label={fr.combat.log}
        aria-live="polite"
        aria-relevant="additions text"
        className="combat-log__entries"
      >
        {recent.length === 0 ? (
          <div className="combat-log__empty">{fr.combat.notStarted}</div>
        ) : (
          recent.map((e) => (
            <div key={e.id} className={`combat-log__entry combat-log__entry--${e.type}`}>
              <span aria-hidden="true" className="combat-log__icon">
                {icons[e.type] || '\u2022'}
              </span>
              {e.message}
              {e.isCrit && <span className="combat-log__critical">{fr.combat.critical}</span>}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
};
