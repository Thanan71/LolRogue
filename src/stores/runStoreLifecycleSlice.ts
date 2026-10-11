import type { StoreApi } from 'zustand';
import type {
  RunLifecycleActions,
  RunLifecycleDependencies,
  RunLifecycleStatePort,
} from '@/services/runLifecycle/contracts';
import { createRunAuthorityJournal } from '@/services/runLifecycle/runAuthorityJournal';
import { createRunFinalizationOrchestrator } from '@/services/runLifecycle/runFinalization';
import { createRunStartOrchestrator } from '@/services/runLifecycle/runStart';
import type { RunStore } from '@/types/run';
import { runLifecycleDependencies } from './runLifecycleDependencies';

/** Zustand adapter: one state publication port and the existing public action signatures. */
export function createRunLifecycleSlice(
  set: StoreApi<RunStore>['setState'],
  get: StoreApi<RunStore>['getState'],
  dependencies: RunLifecycleDependencies = runLifecycleDependencies,
): RunLifecycleActions {
  const context: RunLifecycleStatePort = { read: get, update: (patch) => set(patch) };
  return {
    startRun: createRunStartOrchestrator(context, dependencies),
    endRun: createRunFinalizationOrchestrator(context, dependencies),
    ...createRunAuthorityJournal(context, dependencies),
  };
}
