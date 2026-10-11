import { appendRunAuthorityCommand } from '@/game/run/runAuthorityJournal';
import { setTechnicalCorrelation } from '@/utils/observability';
import type {
  RunLifecycleActions,
  RunLifecycleDependencies,
  RunLifecycleStatePort,
} from './contracts';

export function createRunAuthorityJournal(
  context: RunLifecycleStatePort,
  dependencies: RunLifecycleDependencies,
): Pick<RunLifecycleActions, 'recordRunCommand' | 'markCombatStarted'> {
  const { read: get, update: set } = context;
  return {
    recordRunCommand: (command, explicitDedupeKey) => {
      const state = get();
      const appended = appendRunAuthorityCommand(
        state,
        dependencies.readAuthentication().user?.id ?? null,
        command,
        explicitDedupeKey,
      );
      if (!appended.success) return false;
      if (appended.authorityAttempt !== state.authorityAttempt) {
        set({ authorityAttempt: appended.authorityAttempt });
        setTechnicalCorrelation({
          runId: state.runId,
          commandId:
            appended.authorityAttempt?.commands[appended.authorityAttempt.commands.length - 1]
              ?.commandId,
        });
      }
      return true;
    },
    markCombatStarted: (nodeId) => {
      const state = get();
      if (
        state.pendingEncounter?.nodeId === nodeId &&
        ['combat', 'elite', 'boss'].includes(state.pendingEncounter.nodeType)
      ) {
        set({ combatCheckpointNodeId: nodeId });
      }
    },
  };
}
