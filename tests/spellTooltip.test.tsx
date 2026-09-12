// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpellTooltip } from '@/components/CombatUI/SpellTooltip';
import { TargetingType } from '@/types/champion';

describe('combat spell tooltip', () => {
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
