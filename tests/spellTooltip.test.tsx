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
          cooldownMax: 11,
          cooldownCurrent: 0,
          cost: 50,
          isReady: true,
          targeting: TargetingType.Enemy,
          impacts: [
            {
              id: 'lux-q-damage',
              label: 'Dégâts magiques',
              tone: 'magical',
              amount: 128,
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
    expect(screen.getByRole('tooltip')).toHaveTextContent('128 · avant défenses');

    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Q' }).parentElement!);
    fireEvent.focus(screen.getByRole('button', { name: 'Q' }));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });
});
