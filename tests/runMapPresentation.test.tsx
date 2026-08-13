// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RunMapCanvas } from '@/components/RunMapCanvas';
import { type MapNode, type NodeMap, NodeType } from '@/game/map/types';

function node(
  id: string,
  type: NodeType,
  column: number,
  row: number,
  nextNodeIds: string[],
  prevNodeIds: string[],
): MapNode {
  return {
    id,
    type,
    column,
    row,
    nextNodeIds,
    prevNodeIds,
    biome: 'jungle',
    completed: id === 'start',
    accessible: false,
    encounter: null,
    metadata: { title: id, description: id, icon: '?' },
  };
}

const map: NodeMap = {
  biome: 'jungle',
  startNodeId: 'start',
  exitNodeId: 'shop',
  columns: 3,
  rows: 2,
  nodes: [
    node('start', NodeType.Start, 0, 0, ['fight', 'closed'], []),
    node('fight', NodeType.Combat, 1, 0, ['shop'], ['start']),
    node('closed', NodeType.Event, 1, 1, ['shop'], ['start']),
    node('shop', NodeType.Shop, 2, 0, [], ['fight', 'closed']),
  ],
};

describe('run map presentation', () => {
  it('distinguishes the travelled path, available route and closed branch', () => {
    const view = render(
      <RunMapCanvas
        map={map}
        currentNodeId="fight"
        frontierNodeIds={['shop']}
        chosenPathNodeIds={['start', 'fight']}
        completedNodeIds={['start']}
        hasPendingChoice={false}
        reducedMotion={false}
        onNodeClick={vi.fn()}
      />,
    );

    expect(view.container.querySelectorAll('.run-map-edge--traversed')).toHaveLength(1);
    expect(view.container.querySelectorAll('.run-map-edge--available')).toHaveLength(1);
    expect(view.container.querySelectorAll('.run-map-edge--abandoned')).toHaveLength(1);
    expect(view.getByRole('img', { name: /Combat.*position actuelle/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(view.getByRole('img', { name: /Événement.*branche fermée/ })).toHaveClass(
      'run-map-node--abandoned',
    );
  });

  it('keeps the 56px visual target keyboard/click contract for an accessible node', () => {
    const onNodeClick = vi.fn();
    const view = render(
      <RunMapCanvas
        map={map}
        currentNodeId="fight"
        frontierNodeIds={['shop']}
        chosenPathNodeIds={['start', 'fight']}
        completedNodeIds={['start']}
        hasPendingChoice={false}
        reducedMotion
        onNodeClick={onNodeClick}
      />,
    );
    const choice = view.getByRole('button', { name: /Boutique.*accessible/ });
    const hitArea = choice.querySelector('.run-map-node__hit-area');
    expect(hitArea).toHaveAttribute('r', '31');

    fireEvent.keyDown(choice, { key: 'Enter' });
    expect(onNodeClick).toHaveBeenCalledWith('shop');
  });

  it('does not render animated route classes when reduced motion is requested', () => {
    const view = render(
      <RunMapCanvas
        map={map}
        currentNodeId="fight"
        frontierNodeIds={['shop']}
        hasPendingChoice={false}
        reducedMotion
        onNodeClick={vi.fn()}
      />,
    );
    expect(view.container.querySelector('.run-map-map')).toHaveClass('run-map-map--reduced-motion');
  });
});
