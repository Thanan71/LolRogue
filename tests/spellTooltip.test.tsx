// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AbilityBar } from '@/components/CombatUI/AbilityBar';
import { SpellTooltip, spellTooltipPosition } from '@/components/CombatUI/SpellTooltip';
import type { CombatantInfo } from '@/stores/battleStore';
import { TargetingType } from '@/types/champion';

describe('combat spell tooltip', () => {
  it.each([320, 390])('bounds a measured large-text panel inside a %spx viewport', (width) => {
    const panel = { width: 312, height: 420 };
    const position = spellTooltipPosition(
      { left: width - 56, width: 48, top: 190, bottom: 238 },
      panel,
      width,
      568,
    );
    expect(position.x).toBeGreaterThanOrEqual(8);
    expect(position.x + Math.min(panel.width, width - 16)).toBeLessThanOrEqual(width - 8);
    expect(position.y).toBeGreaterThanOrEqual(8);
    expect(position.y + Math.min(panel.height, position.maxHeight)).toBeLessThanOrEqual(560);
  });

  it('keeps pinned long descriptions bounded when their trigger has scrolled above the viewport', () => {
    const position = spellTooltipPosition(
      { left: 300, width: 48, top: -600, bottom: -552 },
      { width: 312, height: 900 },
      390,
      360,
    );
    expect(position.x + 312).toBeLessThanOrEqual(382);
    expect(position.y).toBe(8);
    expect(position.maxHeight).toBe(344);
  });

  it('keeps unavailable spell inspection focusable and persistent without selecting a command', async () => {
    const user = userEvent.setup();
    const onCast = vi.fn();
    const champion: CombatantInfo = {
      targetId: 'player:Lux:0',
      id: 'Lux',
      name: 'Lux',
      level: 1,
      currentHp: 500,
      maxHp: 500,
      currentMp: 0,
      maxMp: 300,
      iconUrl: '',
      isDefeated: false,
      side: 'player',
      spells: [
        {
          slot: 'Q',
          name: 'Entrave de lumière',
          cooldownMax: 3,
          cooldownCurrent: 2,
          cost: 60,
          isReady: false,
          targeting: TargetingType.Enemy,
        },
      ],
    };
    render(<AbilityBar champion={champion} onCast={onCast} />);
    const spell = screen.getByRole('button', { name: /^Sort Q/ });
    await user.tab();
    expect(spell).toHaveFocus();
    expect(spell).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('tooltip')).toHaveTextContent('2 tours');
    await user.click(spell);
    expect(onCast).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Détails du sort Entrave de lumière' }));
    const details = screen.getByRole('dialog', { name: 'Détails du sort Entrave de lumière' });
    fireEvent.mouseLeave(details.parentElement!);
    expect(details).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Fermer les détails du sort' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onCast).not.toHaveBeenCalled();
  });

  it('keeps one pinned detail panel until another spell is explicitly inspected', async () => {
    const user = userEvent.setup();
    const onCast = vi.fn();
    const champion: CombatantInfo = {
      targetId: 'player:Lux:0',
      id: 'Lux',
      name: 'Lux',
      level: 1,
      currentHp: 500,
      maxHp: 500,
      currentMp: 300,
      maxMp: 300,
      iconUrl: '',
      isDefeated: false,
      side: 'player',
      spells: [
        {
          slot: 'Q',
          name: 'Entrave de lumière',
          cooldownMax: 3,
          cooldownCurrent: 0,
          cost: 60,
          isReady: true,
          targeting: TargetingType.Enemy,
        },
        {
          slot: 'W',
          name: 'Barrière prismatique',
          cooldownMax: 4,
          cooldownCurrent: 0,
          cost: 60,
          isReady: true,
          targeting: TargetingType.Allies,
        },
      ],
    };
    render(<AbilityBar champion={champion} onCast={onCast} />);
    const q = screen.getByRole('button', { name: /^Sort Q/ });
    const w = screen.getByRole('button', { name: /^Sort W/ });
    await user.hover(q);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Entrave de lumière');
    await user.hover(w);
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Barrière prismatique');

    await user.click(screen.getByRole('button', { name: 'Détails du sort Entrave de lumière' }));
    const qDetails = screen.getByRole('dialog', { name: 'Détails du sort Entrave de lumière' });
    await user.hover(w);
    expect(qDetails).toBeVisible();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.tab();
    await user.tab();
    expect(w).toHaveFocus();
    expect(qDetails).toBeVisible();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Détails du sort Entrave de lumière' }),
    ).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Détails du sort Entrave de lumière' }));

    await user.click(screen.getByRole('button', { name: 'Détails du sort Barrière prismatique' }));
    expect(screen.queryByRole('dialog', { name: 'Détails du sort Entrave de lumière' })).toBeNull();
    expect(
      screen.getByRole('dialog', { name: 'Détails du sort Barrière prismatique' }),
    ).toBeVisible();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(onCast).not.toHaveBeenCalled();
  });

  it('reveals damage type and estimated amount on hover and keyboard focus', () => {
    render(
      <SpellTooltip
        spell={{
          slot: 'Q',
          name: 'Entrave de lumière',
          cooldownMax: 1280,
          cooldownCurrent: 0,
          cost: 1280,
          isReady: true,
          targeting: TargetingType.Enemy,
          impacts: [
            {
              id: 'lux-q-damage',
              label: 'Dégâts magiques',
              tone: 'magical',
              amount: 1280,
              suffix: 'avant défenses',
            },
          ],
        }}
      >
        <button type="button">Q</button>
      </SpellTooltip>,
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Q' }).parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Dégâts magiques');
    expect(screen.getByRole('tooltip')).toHaveTextContent('1 280 · avant défenses');
    expect(screen.getByRole('tooltip')).toHaveTextContent('PM : 1 280');
    expect(screen.getByRole('tooltip')).toHaveTextContent('recharge : 1 280 tours');

    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Q' }).parentElement!);
    fireEvent.focus(screen.getByRole('button', { name: 'Q' }));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });
});
