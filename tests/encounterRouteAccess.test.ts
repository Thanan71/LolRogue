import { describe, expect, it } from 'vitest';
import {
  canLeaveActiveCombat,
  getPendingEncounterRoute,
  isEncounterRouteAllowed,
} from '../src/game/run/routeAccess';

describe('encounter route access', () => {
  it('maps every encounter node to its canonical page', () => {
    expect(getPendingEncounterRoute('combat')).toBe('/combat');
    expect(getPendingEncounterRoute('elite')).toBe('/combat');
    expect(getPendingEncounterRoute('boss')).toBe('/combat');
    expect(getPendingEncounterRoute('shop')).toBe('/shop');
    expect(getPendingEncounterRoute('rest')).toBe('/rest');
    expect(getPendingEncounterRoute('event')).toBe('/event');
    expect(getPendingEncounterRoute('recruit')).toBe('/recruit');
    expect(getPendingEncounterRoute('treasure')).toBe('/treasure');
  });

  it('allows only the page matching the current pending encounter', () => {
    const base = {
      isActive: true,
      currentNodeId: 'node-2',
      pendingEncounter: { nodeId: 'node-2', nodeType: 'elite' as const },
      actualNodeType: 'elite' as const,
      nodeCompleted: false,
    };

    expect(isEncounterRouteAllowed({ ...base, expectedTypes: ['combat', 'elite', 'boss'] })).toBe(
      true,
    );
    expect(isEncounterRouteAllowed({ ...base, expectedTypes: ['shop'] })).toBe(false);
  });

  it('rejects stale, missing and inactive encounters', () => {
    expect(
      isEncounterRouteAllowed({
        isActive: true,
        currentNodeId: 'node-3',
        pendingEncounter: { nodeId: 'node-2', nodeType: 'event' },
        actualNodeType: 'event',
        nodeCompleted: false,
        expectedTypes: ['event'],
      }),
    ).toBe(false);
    expect(
      isEncounterRouteAllowed({
        isActive: false,
        currentNodeId: 'node-2',
        pendingEncounter: { nodeId: 'node-2', nodeType: 'event' },
        actualNodeType: 'event',
        nodeCompleted: false,
        expectedTypes: ['event'],
      }),
    ).toBe(false);
    expect(
      isEncounterRouteAllowed({
        isActive: true,
        currentNodeId: 'node-2',
        pendingEncounter: { nodeId: 'node-2', nodeType: 'event' },
        actualNodeType: 'shop',
        nodeCompleted: false,
        expectedTypes: ['event'],
      }),
    ).toBe(false);
  });

  it('keeps the map locked until combat is finished', () => {
    expect(canLeaveActiveCombat('starting')).toBe(false);
    expect(canLeaveActiveCombat('turn_active')).toBe(false);
    expect(canLeaveActiveCombat('turn_transition')).toBe(false);
    expect(canLeaveActiveCombat('finished')).toBe(true);
  });
});
