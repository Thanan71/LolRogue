import React, { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from 'react';
import { fr } from '@/i18n/fr';
import type { SpellInfo } from '../../stores/battleStore';
import { scaleFontSize, useSettingsStore } from '../../stores/settingsStore';

interface Props {
  spell: SpellInfo;
  children: React.ReactElement;
}

export const SpellTooltip: React.FC<Props> = ({ spell, children }) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{
    x: number;
    y: number;
    placement: 'above' | 'below';
    maxHeight: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const tooltipId = useId();
  const textSize = useSettingsStore((s) => s.textSize);

  const updatePosition = useCallback((target: HTMLElement) => {
    const margin = 8;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    setVisible(true);
    const rect = target.getBoundingClientRect();
    const tooltipWidth = Math.min(260, Math.max(0, viewportWidth - margin * 2));
    const spaceAbove = Math.max(0, rect.top - margin);
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - margin);
    const placement = spaceAbove >= Math.min(180, spaceBelow) ? 'above' : 'below';
    setPosition({
      x: Math.max(
        margin + tooltipWidth / 2,
        Math.min(viewportWidth - margin - tooltipWidth / 2, rect.left + rect.width / 2),
      ),
      y: placement === 'above' ? rect.top - margin : rect.bottom + margin,
      placement,
      maxHeight: Math.max(1, placement === 'above' ? spaceAbove : spaceBelow),
    });
  }, []);

  const show = useCallback(
    (target: HTMLElement) => {
      targetRef.current = target;
      updatePosition(target);
    },
    [updatePosition],
  );

  const handleMouseEnter = (e: React.MouseEvent) => show(e.currentTarget as HTMLElement);

  const handleMouseLeave = () => {
    setVisible(false);
    setPosition(null);
    targetRef.current = null;
  };

  useEffect(() => {
    if (!visible) return;
    const reposition = () => {
      if (targetRef.current) updatePosition(targetRef.current);
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [visible, updatePosition]);

  const smallFontSize = `${Math.max(12, scaleFontSize(12, textSize)) / 16}rem`;
  const titleFontSize = `${Math.max(14, scaleFontSize(14, textSize)) / 16}rem`;

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={(event) => show(event.currentTarget)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) handleMouseLeave();
      }}
      onClick={(event) => {
        if (visible) handleMouseLeave();
        else show(event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') handleMouseLeave();
      }}
      className="combat-spell-trigger"
    >
      {React.cloneElement(children, {
        'aria-describedby': visible ? tooltipId : undefined,
      } as React.HTMLAttributes<HTMLElement>)}
      {visible && position && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`combat-spell-tooltip combat-spell-tooltip--${position.placement}`}
          style={
            {
              '--combat-tooltip-x': `${position.x}px`,
              '--combat-tooltip-y': `${position.y}px`,
              '--combat-tooltip-max-height': `${position.maxHeight}px`,
              '--combat-tooltip-small-size': smallFontSize,
              '--combat-tooltip-title-size': titleFontSize,
            } as CSSProperties
          }
        >
          {/* Spell name */}
          <div
            className={`combat-spell-tooltip__title${
              spell.slot === 'R' ? ' combat-spell-tooltip__title--ultimate' : ''
            }`}
          >
            {spell.name}
            <span className="combat-spell-tooltip__slot">[{spell.slot}]</span>
          </div>

          {/* Stats */}
          <div className="combat-spell-tooltip__stats">
            <div className="combat-spell-tooltip__stat">
              <span className="combat-spell-tooltip__mana">PM :</span> {spell.cost}
            </div>
            <div className="combat-spell-tooltip__stat">
              <span className="combat-spell-tooltip__cooldown">{fr.combat.cooldown} :</span>{' '}
              {spell.cooldownMax} {fr.combat.cooldownTurns}
            </div>
          </div>

          {spell.impacts && spell.impacts.length > 0 ? (
            <div className="combat-spell-tooltip__impacts" aria-label="Effets estimés">
              {spell.impacts.map((impact) => (
                <div
                  key={impact.id}
                  className={`combat-spell-tooltip__impact combat-spell-tooltip__impact--${impact.tone}`}
                >
                  <span>{impact.label}</span>
                  <strong>
                    {impact.amount !== undefined ? impact.amount : null}
                    {impact.amount !== undefined && impact.suffix ? ' · ' : null}
                    {impact.suffix}
                  </strong>
                </div>
              ))}
              <small>Les dégâts sont estimés avant l’armure et la résistance de la cible.</small>
            </div>
          ) : null}

          {/* Status */}
          {!spell.isReady && (
            <div className="combat-spell-tooltip__status combat-spell-tooltip__status--cooldown">
              ⏳ Recharge : {spell.cooldownCurrent} {fr.combat.cooldownTurns} restante
            </div>
          )}
          {spell.isReady && (
            <div className="combat-spell-tooltip__status combat-spell-tooltip__status--ready">
              ✅ Prêt à lancer
            </div>
          )}

          {/* Keybind hint */}
          <div className="combat-spell-tooltip__hint">
            Appuyez sur <kbd className="combat-spell-tooltip__key">{spell.slot}</kbd> pour lancer
          </div>
        </div>
      )}
    </div>
  );
};
