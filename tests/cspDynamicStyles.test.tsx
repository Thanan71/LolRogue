// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CombatantPortrait } from '@/components/CombatUI/CombatantPortrait';
import { RunMapCanvas } from '@/components/RunMapCanvas';
import { TeamPanel } from '@/components/RunMapPanels';
import { type NodeMap, NodeType } from '@/game/map/types';

describe('CSP dynamic style contracts', () => {
  it('keeps HP and XP bars precise through allowlisted custom properties', () => {
    const view = render(
      <TeamPanel
        team={[{ championId: 'Garen', currentHp: 0, currentXp: 50, level: 1 }]}
        inventory={[]}
      />,
    );

    const hp = view.getByRole('progressbar', { name: 'PV de Garen' });
    const xp = view.getByRole('progressbar', { name: 'Expérience de Garen' });
    expect((hp.firstElementChild as HTMLElement).style.getPropertyValue('--run-map-progress')).toBe(
      '0%',
    );
    expect((xp.firstElementChild as HTMLElement).style.getPropertyValue('--run-map-progress')).toBe(
      '50%',
    );
  });

  it('clamps combat meters before exposing their custom property', () => {
    const view = render(
      <CombatantPortrait
        combatant={{
          targetId: 'player:Garen:0',
          id: 'Garen',
          name: 'Garen',
          level: 1,
          currentHp: 900,
          maxHp: 600,
          currentMp: -20,
          maxMp: 100,
          iconUrl: '',
          isDefeated: false,
          side: 'player',
          spells: [],
        }}
        isActive
      />,
    );

    const hp = view.getByRole('progressbar', { name: 'PV de Garen' });
    const mp = view.getByRole('progressbar', { name: 'PM de Garen' });
    expect(
      (hp.firstElementChild as HTMLElement).style.getPropertyValue('--combat-meter-value'),
    ).toBe('100%');
    expect(
      (mp.firstElementChild as HTMLElement).style.getPropertyValue('--combat-meter-value'),
    ).toBe('0%');
  });

  it('preserves map coordinates and interaction without a style attribute', () => {
    const onNodeClick = vi.fn();
    const map: NodeMap = {
      biome: 'top_lane',
      startNodeId: 'fight',
      exitNodeId: 'exit',
      columns: 2,
      rows: 1,
      nodes: [
        {
          id: 'fight',
          type: NodeType.Combat,
          column: 0,
          row: 0,
          nextNodeIds: ['exit'],
          prevNodeIds: [],
          biome: 'top_lane',
          completed: false,
          accessible: true,
          encounter: null,
          metadata: { title: 'Combat', description: 'Combat', icon: '⚔' },
        },
        {
          id: 'exit',
          type: NodeType.Exit,
          column: 1,
          row: 0,
          nextNodeIds: [],
          prevNodeIds: ['fight'],
          biome: 'top_lane',
          completed: false,
          accessible: false,
          encounter: null,
          metadata: { title: 'Sortie', description: 'Sortie', icon: '■' },
        },
      ],
    };

    const view = render(
      <RunMapCanvas
        map={map}
        currentNodeId={null}
        frontierNodeIds={['fight']}
        hasPendingChoice={false}
        reducedMotion
        onNodeClick={onNodeClick}
      />,
    );
    const node = view.getByRole('button', { name: /Combat, colonne 1, ligne 1/ });
    const edge = view.container.querySelector('line');
    expect(node).toHaveClass('run-map-node--selectable');
    expect(node).not.toHaveAttribute('style');
    expect(edge).toHaveAttribute('x1', '75');
    expect(edge).toHaveAttribute('x2', '185');

    fireEvent.click(node);
    expect(onNodeClick).toHaveBeenCalledWith('fight');
  });
});
