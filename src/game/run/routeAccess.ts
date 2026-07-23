import type { NodeType } from '@/types/run';

const ENCOUNTER_ROUTES: Record<NodeType, string> = {
  combat: '/combat',
  elite: '/combat',
  boss: '/combat',
  shop: '/shop',
  rest: '/rest',
  event: '/event',
  recruit: '/recruit',
  treasure: '/treasure',
};

export function getPendingEncounterRoute(nodeType: NodeType): string {
  return ENCOUNTER_ROUTES[nodeType];
}

export function isEncounterRouteAllowed(input: {
  isActive: boolean;
  currentNodeId: string | null;
  pendingEncounter: { nodeId: string; nodeType: NodeType } | null;
  expectedTypes: readonly NodeType[];
}): boolean {
  return Boolean(
    input.isActive &&
      input.pendingEncounter &&
      input.currentNodeId === input.pendingEncounter.nodeId &&
      input.expectedTypes.includes(input.pendingEncounter.nodeType),
  );
}

export function canLeaveActiveCombat(phase: string): boolean {
  return phase === 'finished';
}
