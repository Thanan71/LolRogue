import type { MasteryActions } from '@/types/mastery';
import { logger } from '@/utils/logger';

export interface RunProgressionDependencies {
  readCurrentUserId: () => string | null;
  refreshPlayer: () => Promise<unknown>;
  loadMasteries: (
    userId: string,
  ) => Promise<Parameters<MasteryActions['hydrateFromDatabase']>[0] | null>;
  hydrateMasteries: MasteryActions['hydrateFromDatabase'];
}

/** A durable receipt completes the run; account hydration remains best effort. */
export async function synchronizeVerifiedRunProgression(
  userId: string,
  dependencies: RunProgressionDependencies,
): Promise<void> {
  const isCurrent = () => dependencies.readCurrentUserId() === userId;
  if (!isCurrent()) return;
  try {
    await dependencies.refreshPlayer();
    if (!isCurrent()) return;
    const masteries = await dependencies.loadMasteries(userId);
    if (isCurrent() && masteries) dependencies.hydrateMasteries(masteries);
  } catch (error) {
    if (isCurrent()) {
      logger.warn('[RunLifecycleService] Progression saved, but account refresh failed:', error);
    }
  }
}
