import React, {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { formatSpellImpactAmount } from '@/game/presentation/spellPreview';
import { combatCopy } from '@/i18n/combatContent';
import { formatNumber } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import type { SpellInfo } from '../../stores/battleStore';
import { scaleFontSize, useSettingsStore } from '../../stores/settingsStore';

interface Props {
  spell: SpellInfo;
  children: React.ReactElement;
  unavailable?: boolean;
  open?: boolean;
  pinned?: boolean;
  onOpenChange?: (open: boolean, pinned: boolean) => void;
  dismissBoundaryRef?: React.RefObject<HTMLElement | null>;
}

/** Bound the rendered panel, including text scaling, to the available viewport. */
export function spellTooltipPosition(
  target: Pick<DOMRect, 'left' | 'top' | 'bottom' | 'width'>,
  panel: Pick<DOMRect, 'width' | 'height'>,
  viewportWidth: number,
  viewportHeight: number,
) {
  const margin = 8;
  const width = Math.min(panel.width, Math.max(1, viewportWidth - margin * 2));
  const spaceAbove = Math.max(0, Math.min(viewportHeight - margin * 2, target.top - margin * 2));
  const spaceBelow = Math.max(
    0,
    Math.min(viewportHeight - margin * 2, viewportHeight - target.bottom - margin * 2),
  );
  const above = spaceAbove >= panel.height || spaceAbove > spaceBelow;
  const maxHeight = Math.max(1, above ? spaceAbove : spaceBelow);
  const height = Math.min(panel.height, maxHeight);
  return {
    x: Math.max(
      margin,
      Math.min(viewportWidth - margin - width, target.left + target.width / 2 - width / 2),
    ),
    y: Math.max(
      margin,
      Math.min(
        viewportHeight - margin - height,
        above ? target.top - margin - height : target.bottom + margin,
      ),
    ),
    maxHeight,
  };
}

export const SpellTooltip: React.FC<Props> = ({
  spell,
  children,
  unavailable = !spell.isReady,
  open: controlledOpen,
  pinned: controlledPinned,
  onOpenChange,
  dismissBoundaryRef,
}) => {
  const [localVisible, setLocalVisible] = useState(false);
  const [localPinned, setLocalPinned] = useState(false);
  const visible = controlledOpen ?? localVisible;
  const pinned = controlledPinned ?? localPinned;
  const [position, setPosition] = useState<{
    x: number;
    y: number;
    maxHeight: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inspectRef = useRef<HTMLButtonElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const tooltipId = useId();
  const textSize = useSettingsStore((s) => s.textSize);

  const updatePosition = useCallback((target: HTMLElement) => {
    const panel = panelRef.current;
    if (!panel) return;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const rect = target.getBoundingClientRect();
    const next = spellTooltipPosition(
      rect,
      panel.getBoundingClientRect(),
      viewportWidth,
      viewportHeight,
    );
    setPosition((previous) =>
      previous?.x === next.x && previous.y === next.y && previous.maxHeight === next.maxHeight
        ? previous
        : next,
    );
  }, []);

  const show = useCallback(
    (target: HTMLElement, pin = false) => {
      targetRef.current = target;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setLocalVisible(true);
      setLocalPinned((current) => pin || current);
      onOpenChange?.(true, pin);
    },
    [onOpenChange],
  );

  const handleMouseEnter = (e: React.MouseEvent) => show(e.currentTarget as HTMLElement);

  const hide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
    setLocalVisible(false);
    setLocalPinned(false);
    onOpenChange?.(false, false);
    setPosition(null);
    targetRef.current = null;
  }, [onOpenChange]);

  useLayoutEffect(() => {
    if (visible && targetRef.current) updatePosition(targetRef.current);
  }, [visible, pinned, textSize, updatePosition]);

  useEffect(() => {
    if (!visible) return;
    const reposition = () => {
      if (targetRef.current) updatePosition(targetRef.current);
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
    if (panelRef.current) observer?.observe(panelRef.current);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      observer?.disconnect();
    };
  }, [visible, updatePosition]);

  useEffect(() => {
    if (!pinned) return;
    const outside = (event: PointerEvent) => {
      const boundary = dismissBoundaryRef?.current ?? containerRef.current;
      if (event.target instanceof Node && !boundary?.contains(event.target)) hide();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [dismissBoundaryRef, hide, pinned]);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  const smallFontSize = `${Math.max(12, scaleFontSize(12, textSize)) / 16}rem`;
  const titleFontSize = `${Math.max(14, scaleFontSize(14, textSize)) / 16}rem`;

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => {
        if (!pinned) hideTimerRef.current = setTimeout(hide, 160);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === 'touch') {
          show(event.currentTarget, true);
        }
      }}
      onFocus={(event) => show(event.currentTarget)}
      onBlur={(event) => {
        if (!pinned && !event.currentTarget.contains(event.relatedTarget)) hide();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && visible) {
          event.preventDefault();
          event.stopPropagation();
          hide();
          if (pinned) inspectRef.current?.focus();
        }
      }}
      className="combat-spell-trigger"
    >
      {React.cloneElement(children, {
        'aria-describedby': visible && !pinned ? tooltipId : undefined,
      } as React.HTMLAttributes<HTMLElement>)}
      <button
        ref={inspectRef}
        type="button"
        className="combat-spell-inspect"
        aria-label={combatCopy.tooltip.inspect(spell.name)}
        aria-haspopup="dialog"
        aria-expanded={pinned}
        aria-controls={pinned ? tooltipId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          show(containerRef.current!, true);
        }}
      >
        ⓘ
      </button>
      {visible && (
        <div
          ref={panelRef}
          id={tooltipId}
          role={pinned ? 'dialog' : 'tooltip'}
          aria-label={pinned ? combatCopy.tooltip.inspect(spell.name) : undefined}
          className="combat-spell-tooltip"
          style={
            {
              '--combat-tooltip-x': `${position?.x ?? 8}px`,
              '--combat-tooltip-y': `${position?.y ?? 8}px`,
              '--combat-tooltip-max-height': position
                ? `${position.maxHeight}px`
                : 'calc(100dvh - 16px)',
              '--combat-tooltip-small-size': smallFontSize,
              '--combat-tooltip-title-size': titleFontSize,
            } as CSSProperties
          }
        >
          {pinned && (
            <button
              type="button"
              className="combat-spell-tooltip__close"
              onClick={(event) => {
                event.stopPropagation();
                hide();
                inspectRef.current?.focus();
              }}
            >
              {combatCopy.tooltip.close}
            </button>
          )}
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
              <span className="combat-spell-tooltip__mana">{combatCopy.tooltip.mana}</span>{' '}
              {formatNumber(spell.cost)}
            </div>
            <div className="combat-spell-tooltip__stat">
              <span className="combat-spell-tooltip__cooldown">{fr.combat.cooldown} :</span>{' '}
              {combatCopy.tooltip.cooldownTurnCount(spell.cooldownMax)}
            </div>
          </div>

          {spell.impacts && spell.impacts.length > 0 ? (
            <div
              className="combat-spell-tooltip__impacts"
              aria-label={combatCopy.tooltip.estimatedEffects}
            >
              {spell.impacts.map((impact) => (
                <div
                  key={impact.id}
                  className={`combat-spell-tooltip__impact combat-spell-tooltip__impact--${impact.tone}`}
                >
                  <span>{impact.label}</span>
                  <strong>
                    {impact.amount !== undefined ? formatSpellImpactAmount(impact) : null}
                    {impact.amount !== undefined && impact.suffix ? ' · ' : null}
                    {impact.suffix}
                  </strong>
                </div>
              ))}
              <small>{combatCopy.tooltip.estimateNote}</small>
            </div>
          ) : null}

          {/* Status */}
          {spell.cooldownCurrent > 0 && (
            <div className="combat-spell-tooltip__status combat-spell-tooltip__status--cooldown">
              {combatCopy.tooltip.cooldownStatus(spell.cooldownCurrent)}
            </div>
          )}
          {unavailable && spell.cooldownCurrent === 0 && (
            <div className="combat-spell-tooltip__status combat-spell-tooltip__status--cooldown">
              {combatCopy.tooltip.unavailable}
            </div>
          )}
          {!unavailable && (
            <div className="combat-spell-tooltip__status combat-spell-tooltip__status--ready">
              {combatCopy.tooltip.ready}
            </div>
          )}

          {/* Keybind hint */}
          <div className="combat-spell-tooltip__hint">
            {combatCopy.tooltip.press} <kbd className="combat-spell-tooltip__key">{spell.slot}</kbd>{' '}
            {combatCopy.tooltip.toCast}
          </div>
        </div>
      )}
    </div>
  );
};
