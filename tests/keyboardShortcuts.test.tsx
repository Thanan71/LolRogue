// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BattleSpeedControl } from '@/components/CombatUI/BattleSpeedControl';
import { CombatantPortrait } from '@/components/CombatUI/CombatantPortrait';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useSettingsStore } from '@/stores/settingsStore';

function ShortcutHarness({
  onCastQ,
  onNextTurn,
  onConfirm,
  enabled = true,
}: {
  onCastQ?: () => void;
  onNextTurn?: () => void;
  onConfirm?: () => void;
  enabled?: boolean;
}) {
  useKeyboardShortcuts({ onCastQ, onNextTurn, onConfirm, enabled });
  return (
    <div>
      <button type="button">
        <span>Native button</span>
      </button>
      <a href="/target">Link</a>
      <div role="button" tabIndex={0}>
        ARIA control
      </div>
      <div contentEditable suppressContentEditableWarning>
        Editable
      </div>
    </div>
  );
}

describe('combat keyboard shortcuts', () => {
  afterEach(() => {
    useSettingsStore.setState({ battleSpeed: 1, keyboardShortcutsEnabled: true });
  });

  it('executes one callback per supported key and ignores repeats and modifiers', () => {
    const onCastQ = vi.fn();
    const onNextTurn = vi.fn();
    const onConfirm = vi.fn();
    render(<ShortcutHarness onCastQ={onCastQ} onNextTurn={onNextTurn} onConfirm={onConfirm} />);

    const qEvent = new KeyboardEvent('keydown', {
      key: 'q',
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(qEvent);
    fireEvent.keyDown(document.body, { key: 'q', repeat: true });
    fireEvent.keyDown(document.body, { key: 'q', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(qEvent.defaultPrevented).toBe(true);
    expect(onCastQ).toHaveBeenCalledTimes(1);
    expect(onNextTurn).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not intercept native, ARIA, link or editable controls', () => {
    const onCastQ = vi.fn();
    const onNextTurn = vi.fn();
    const view = render(<ShortcutHarness onCastQ={onCastQ} onNextTurn={onNextTurn} />);

    fireEvent.keyDown(view.getByText('Native button'), { key: ' ' });
    fireEvent.keyDown(view.getByRole('link'), { key: 'q' });
    fireEvent.keyDown(view.getByRole('button', { name: 'ARIA control' }), { key: ' ' });
    fireEvent.keyDown(view.getByText('Editable'), { key: 'q' });

    expect(onCastQ).not.toHaveBeenCalled();
    expect(onNextTurn).not.toHaveBeenCalled();
  });

  it('lets a focused speed button handle Space without advancing the turn', async () => {
    const onNextTurn = vi.fn();
    const user = userEvent.setup();

    function SpeedHarness() {
      useKeyboardShortcuts({ onNextTurn });
      return <BattleSpeedControl />;
    }

    const view = render(<SpeedHarness />);
    const speed2 = view.getByRole('radio', { name: 'Speed 2x' });
    speed2.focus();
    await user.keyboard(' ');

    expect(useSettingsStore.getState().battleSpeed).toBe(2);
    expect(onNextTurn).not.toHaveBeenCalled();
  });

  it('activates an ARIA combat target once and prevents the Space default', () => {
    const onSelect = vi.fn();
    const view = render(
      <CombatantPortrait
        combatant={{
          targetId: 'enemy:Garen:0',
          id: 'Garen',
          name: 'Garen',
          level: 1,
          currentHp: 100,
          maxHp: 100,
          currentMp: 0,
          maxMp: 0,
          iconUrl: '',
          isDefeated: false,
          side: 'enemy',
          spells: [],
        }}
        isActive={false}
        onSelect={onSelect}
      />,
    );
    const target = view.getByRole('button', { name: 'Cibler Garen' });
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });

    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
