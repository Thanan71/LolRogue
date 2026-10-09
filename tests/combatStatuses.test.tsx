// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CombatantPortrait } from '@/components/CombatUI/CombatantPortrait';
import { CombatStage } from '@/components/CombatUI/CombatStage';
import { CCEffect } from '@/game/effects/CCEffect';
import { EffectManager } from '@/game/effects/EffectManager';
import { ShieldEffect } from '@/game/effects/ShieldEffect';
import { CCType } from '@/game/effects/types';
import { combatantConditions, snapshotCombatStatuses } from '@/game/presentation/combatStatuses';
import type { CombatantInfo } from '@/stores/battleStore';

const combatant: CombatantInfo = {
  targetId: 'player:Annie:0',
  id: 'Annie',
  name: 'Annie',
  side: 'player',
  level: 1,
  currentHp: 100,
  maxHp: 500,
  currentMp: 80,
  maxMp: 200,
  isDefeated: false,
  iconUrl: '',
  spells: [],
};

describe('actual engine status presentation', () => {
  it.each(Object.values(CCType))(
    'snapshots %s duration from the effect model and removes expired effects',
    (ccType) => {
      const manager = new EffectManager(combatant.targetId);
      const effect = new CCEffect({
        sourceId: 'enemy',
        targetId: combatant.targetId,
        ccType,
        duration: 3,
      });
      manager.apply(effect);
      const first = snapshotCombatStatuses(manager);
      expect(first).toEqual([{ id: effect.id, kind: ccType, turnsRemaining: 3 }]);
      manager.tickAll();
      expect(snapshotCombatStatuses(manager)).toEqual([
        { id: effect.id, kind: ccType, turnsRemaining: 2 },
      ]);
      expect(first[0].turnsRemaining).toBe(3);
      manager.tickAll();
      manager.tickAll();
      expect(snapshotCombatStatuses(manager)).toEqual([]);
    },
  );

  it('uses remaining shield HP rather than original magnitude and removes depleted shields', () => {
    const manager = new EffectManager(combatant.targetId);
    const shield = new ShieldEffect({
      sourceId: 'ally',
      targetId: combatant.targetId,
      magnitude: 100,
      duration: 2,
    });
    manager.apply(shield);
    shield.absorbDamage(40);
    expect(snapshotCombatStatuses(manager)).toEqual([
      { id: shield.id, kind: 'shield', turnsRemaining: 2, amount: 60 },
    ]);
    shield.absorbDamage(100);
    expect(snapshotCombatStatuses(manager)).toEqual([]);
  });

  it('distinguishes silence/root/slow from inability to act and ignores effects on defeated champions', () => {
    const statuses = [CCType.Silence, CCType.Snare, CCType.Slow].map((kind) => ({
      id: kind,
      kind,
      turnsRemaining: 2,
    }));
    expect(combatantConditions({ ...combatant, statuses })).toMatchObject({
      incapacitated: false,
      silenced: true,
      lowHealth: true,
    });
    expect(
      combatantConditions({
        ...combatant,
        statuses: [{ id: 'stun', kind: CCType.Stun, turnsRemaining: 1 }],
      }).incapacitated,
    ).toBe(true);
    expect(combatantConditions({ ...combatant, isDefeated: true, statuses })).toMatchObject({
      statuses: [],
      incapacitated: false,
      lowHealth: false,
    });
  });

  it('shows readable statuses and durations on both teams and the main stage with accessible target state', () => {
    const ally = { ...combatant, statuses: [{ id: 'stun', kind: CCType.Stun, turnsRemaining: 2 }] };
    const enemy: CombatantInfo = {
      ...combatant,
      targetId: 'enemy:Ashe:0',
      id: 'Ashe',
      name: 'Ashe',
      side: 'enemy',
      currentHp: 400,
      statuses: [{ id: 'silence', kind: CCType.Silence, turnsRemaining: 1 }],
    };
    render(
      <>
        <CombatantPortrait combatant={ally} isActive onSelect={() => {}} />
        <CombatantPortrait combatant={enemy} isActive={false} />
        <CombatStage
          round={1}
          currentTurnChampionId={ally.targetId}
          currentTurnSide="player"
          playerTeam={[ally]}
          enemyTeam={[enemy]}
          selectedTarget={enemy}
          visualEvent={null}
          status="Mode manuel"
        />
      </>,
    );
    expect(
      screen.getByRole('button', { name: 'Cibler Annie, PV faibles, Étourdi · 2 tours' }),
    ).toHaveClass('combatant-portrait--incapacitated');
    const allyLists = screen.getAllByRole('list', { name: 'États de Annie' });
    expect(allyLists).toHaveLength(2);
    for (const list of allyLists)
      expect(within(list).getByText(/Étourdi/)).toHaveTextContent('2 tours');
    const enemyLists = screen.getAllByRole('list', { name: 'États de Ashe' });
    expect(enemyLists).toHaveLength(2);
    for (const list of enemyLists)
      expect(within(list).getByText(/Silence/)).toHaveTextContent('1 tour');
  });
});
