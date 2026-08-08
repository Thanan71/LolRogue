import type React from 'react';
import type { CSSProperties } from 'react';
import { fr } from '@/i18n/fr';
import type { CombatantInfo } from '../../stores/battleStore';
import { scaleFontSize, useSettingsStore } from '../../stores/settingsStore';
import { SpellTooltip } from './SpellTooltip';

interface Props {
  champion: CombatantInfo;
  onCast?: (slot: 'Q' | 'W' | 'E' | 'R') => void;
}

const SLOTS: Array<'Q' | 'W' | 'E' | 'R'> = ['Q', 'W', 'E', 'R'];

export const AbilityBar: React.FC<Props> = ({ champion, onCast }) => {
  const textSize = useSettingsStore((s) => s.textSize);

  const handleClick = (slot: 'Q' | 'W' | 'E' | 'R') => {
    const spell = champion.spells.find((s) => s.slot === slot);
    if (!spell || !spell.isReady || champion.currentMp < spell.cost) return;
    onCast?.(slot);
  };

  const labelSize = `${Math.max(12, scaleFontSize(12, textSize)) / 16}rem`;
  const cdLabelSize = `${Math.max(18, scaleFontSize(18, textSize)) / 16}rem`;

  return (
    <div
      role="toolbar"
      aria-label={fr.combat.spellAbilities}
      className="combat-ability-bar"
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
        const disabled = !spell || !spell.isReady || onCooldown || lacksMana;
        const isUlt = slot === 'R';

        const slotButton = (
          <button
            key={slot}
            type="button"
            onClick={() => handleClick(slot)}
            disabled={disabled}
            aria-label={`${fr.combat.spell} ${slot}${spell ? ` : ${spell.name}` : ''}${onCooldown ? ` (${cd} s, ${fr.combat.cooldown})` : ''}${lacksMana ? `, ${fr.combat.insufficientMana}` : spell && !spell.isReady ? `, ${fr.combat.cooldown}` : `, ${fr.combat.ready}`}`}
            aria-keyshortcuts={slot}
            className={`combat-ability${isUlt ? ' combat-ability--ultimate' : ''}`}
          >
            <div className="combat-ability__slot">{slot}</div>
            <div className="combat-ability__face">{spell ? spell.name.substring(0, 3) : '-'}</div>
            {onCooldown && <div className="combat-ability__cooldown">{cd}</div>}
            {spell && spell.cost > 0 && <div className="combat-ability__cost">{spell.cost}</div>}
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
