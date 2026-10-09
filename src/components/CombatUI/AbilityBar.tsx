import type React from 'react';
import { type CSSProperties, useCallback, useRef, useState } from 'react';
import { actionTypeForSlot, getCombatVisualProfile } from '@/game/presentation/combatVisuals';
import { combatCopy } from '@/i18n/combatContent';
import { formatNumber } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import type { CombatantInfo } from '../../stores/battleStore';
import { scaleFontSize, useSettingsStore } from '../../stores/settingsStore';
import { SpellTooltip } from './SpellTooltip';

interface Props {
  champion: CombatantInfo;
  onCast?: (slot: 'Q' | 'W' | 'E' | 'R') => void;
  selectedSlot?: 'Q' | 'W' | 'E' | 'R';
  availableSlots?: Array<'Q' | 'W' | 'E' | 'R'>;
}

const SLOTS: Array<'Q' | 'W' | 'E' | 'R'> = ['Q', 'W', 'E', 'R'];

export const AbilityBar: React.FC<Props> = ({ champion, onCast, selectedSlot, availableSlots }) => {
  const textSize = useSettingsStore((s) => s.textSize);
  const barRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<{
    combatantId: string;
    slot: 'Q' | 'W' | 'E' | 'R';
    pinned: boolean;
  } | null>(null);
  const activePanel = panel?.combatantId === champion.targetId ? panel : null;
  const changePanel = useCallback(
    (slot: 'Q' | 'W' | 'E' | 'R', open: boolean, pinned: boolean) => {
      setPanel((current) => {
        const active = current?.combatantId === champion.targetId ? current : null;
        if (!open) return active?.slot === slot ? null : current;
        if (active?.pinned && active.slot !== slot && !pinned) return current;
        const nextPinned = pinned || (active?.slot === slot && active.pinned);
        if (active?.slot === slot && active.pinned === nextPinned) return current;
        return { combatantId: champion.targetId, slot, pinned: nextPinned };
      });
    },
    [champion.targetId],
  );

  const handleClick = (slot: 'Q' | 'W' | 'E' | 'R') => {
    const spell = champion.spells.find((s) => s.slot === slot);
    if (
      !spell ||
      !spell.isReady ||
      champion.currentMp < spell.cost ||
      (availableSlots && !availableSlots.includes(slot))
    )
      return;
    onCast?.(slot);
  };

  const labelSize = `${Math.max(12, scaleFontSize(12, textSize)) / 16}rem`;
  const cdLabelSize = `${Math.max(18, scaleFontSize(18, textSize)) / 16}rem`;

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={fr.combat.spellAbilities}
      className="combat-ability-bar"
      onKeyDownCapture={(event) => {
        if (event.key !== 'Escape' || !activePanel) return;
        event.preventDefault();
        event.stopPropagation();
        const inspectButton = barRef.current?.querySelector<HTMLButtonElement>(
          '[aria-haspopup="dialog"][aria-expanded="true"]',
        );
        setPanel(null);
        if (activePanel.pinned) inspectButton?.focus();
      }}
      style={
        {
          '--combat-ability-label-size': labelSize,
          '--combat-ability-cooldown-size': cdLabelSize,
        } as CSSProperties
      }
    >
      {SLOTS.map((slot) => {
        const spell = champion.spells.find((s) => s.slot === slot);
        const cd = spell?.cooldownCurrent ?? 0;
        const onCooldown = cd > 0;
        const lacksMana = Boolean(spell && champion.currentMp < spell.cost);
        const disabled =
          !spell ||
          !spell.isReady ||
          onCooldown ||
          lacksMana ||
          Boolean(availableSlots && !availableSlots.includes(slot));
        const isUlt = slot === 'R';
        const visualProfile = getCombatVisualProfile(champion.id, actionTypeForSlot(slot));

        const slotButton = (
          <button
            key={slot}
            type="button"
            onClick={() => handleClick(slot)}
            disabled={!spell}
            aria-disabled={spell ? disabled : undefined}
            aria-pressed={spell ? selectedSlot === slot : undefined}
            aria-label={`${fr.combat.spell} ${slot}${spell ? ` : ${spell.name}` : ''}${onCooldown ? ` (${combatCopy.tooltip.cooldownTurnCount(cd)}, ${fr.combat.cooldown})` : ''}${lacksMana ? `, ${fr.combat.insufficientMana}` : disabled ? `, ${combatCopy.tooltip.unavailable}` : `, ${fr.combat.ready}`}`}
            aria-keyshortcuts={slot}
            className={`combat-ability combat-ability--${visualProfile.tone} combat-ability--${visualProfile.shape}${isUlt ? ' combat-ability--ultimate' : ''}`}
          >
            <div className="combat-ability__slot">{slot}</div>
            <div className="combat-ability__face">
              {spell?.iconUrl ? (
                <img
                  src={spell.iconUrl}
                  alt=""
                  width={52}
                  height={52}
                  decoding="async"
                  className="combat-ability__image"
                />
              ) : (
                <span className="combat-ability__glyph" aria-hidden="true">
                  {spell ? visualProfile.glyph : '–'}
                </span>
              )}
              <span className="combat-ability__name" aria-hidden="true">
                {spell?.name ?? slot}
              </span>
            </div>
            {onCooldown && <div className="combat-ability__cooldown">{formatNumber(cd)}</div>}
            {spell && spell.cost > 0 && (
              <div className="combat-ability__cost">{formatNumber(spell.cost)}</div>
            )}
          </button>
        );

        if (spell) {
          return (
            <SpellTooltip
              key={slot}
              spell={spell}
              unavailable={disabled}
              open={activePanel?.slot === slot}
              pinned={activePanel?.slot === slot && activePanel.pinned}
              onOpenChange={(open, pinned) => changePanel(slot, open, pinned)}
              dismissBoundaryRef={barRef}
            >
              {slotButton}
            </SpellTooltip>
          );
        }
        return slotButton;
      })}
    </div>
  );
};
